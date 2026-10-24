/**
 * Fight - an attack as the old engine plays it (Actions.resolveAttack and finishAttack, Map.attackUnit),
 * each unit firing on another split into resolve, which reads the state and draws the dice, and
 * apply, which changes it
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 *
 * The draws on the game stream keep today's order (#126): the support fire shots one by one, then
 * the attack; in each, the attacker's dice, the defender's, then the attacker's leader roll and the
 * defender's (Leaders.generateLeaderWithChance draws even when the unit gains no level). The
 * estimate before the attack, which decides an overrun, draws nothing.
 */

import { scoreGains, UNIT_MAX_EXPERIENCE, unitClass } from "../prototypes";
import { nextRandom, type RngStream } from "../rng";
import { attackableUnit, supportFireUnits } from "./attack";
import { attackResult, isLossOverRetreatThreshold, shouldDefenderRetreat } from "./combat";
import { addScore, beginDraft, changeUnit, emit, finishDraft, playerAt, removeUnit, spotOff, spotOn, writeUnit } from "./draft";
import type { Fighter, FighterState } from "./events";
import { directionTo } from "./geometry";
import { isBridgeForSide, retreatPosition } from "./movement";
import { moveUnit } from "./moves";
import type { AttackStart, CombatResult, Contribution, Draft, Position, UnitId, UnitState, World } from "./types";
import { isAir } from "./units";
import { currentEqid, hexIndex, sideOf, unitById } from "./world";

//A unit that gained an experience level gets a leader when its roll (its level to 10) is above this
const LEADER_CHANCE_THRESHOLD = 8;

//One unit firing on another, resolved: the dice's result (an overrun's kills are the defender's
//strength, no return fire), what each step contributed, whether the defender gets off its transport
//first, and the leaders the two win (-1: none)
export interface FightResolution {
	attacker: UnitId;
	defender: UnitId;
	support: boolean;
	overrun: boolean;
	result: CombatResult;
	record: Contribution[];
	dismount: boolean;
	atkLeader: number;
	defLeader: number;
}

//Resolves atk firing on def, drawing from rng: support, a support fire shot (it doesn't count as
//the unit's attack, no return fire); overrun, the defender destroyed without a shot back. Reads only
export function resolveFight(w: World, atk: UnitState, def: UnitState, rng: RngStream, support: boolean,
	overrun: boolean): FightResolution {
	const record: Contribution[] = [];
	const result = attackResult(w, atk, def, rng, record);
	//Mounted infantry gets off its transport when attacked, unless it was surprised moving
	const dismount = def.isMounted && !def.isSurprised && w.equipment[def.eqid].uclass === unitClass.infantry;
	if (overrun) {
		record.push({ name: "overrun", side: "attacker", field: "kills", before: result.kills, after: def.strength });
		result.kills = def.strength;
		result.isOverrun = true;
		result.defcanfire = false;
	}
	const atkLeader = leaderRoll(w, atk, currentEqid(atk), result.atkExpGained, rng);
	const defLeader = leaderRoll(w, def, currentEqid(dismount ? { ...def, isMounted: false } : def), result.defExpGained, rng);
	result.atkLeaderGain = atkLeader !== -1;
	result.defLeaderGain = defLeader !== -1;
	return { attacker: atk.id, defender: def.id, support, overrun, result, record, dismount, atkLeader, defLeader };
}

//Leaders.generateLeaderWithChance after the fight: a unit with no leader rolls (always, it draws),
//at the experience cap it gets one, otherwise only when it went up a level and the roll is high
function leaderRoll(w: World, u: UnitState, eqid: number, expGained: number, rng: RngStream): number {
	if (u.leader !== -1) return -1;
	const exp = Math.round(u.experience + +expGained);
	const level = (exp / 100) >> 0;
	const prevLevel = ((exp - expGained) / 100) >> 0;
	const roll = Math.floor(nextRandom(rng) * (10 - level + 1)) + level;
	const uclass = w.equipment[eqid].uclass;
	if (exp >= UNIT_MAX_EXPERIENCE) return newLeader(w, uclass, rng);
	if (level - prevLevel <= 0) return -1;
	return roll > LEADER_CHANCE_THRESHOLD ? newLeader(w, uclass, rng) : -1;
}

//A leader of the class (Leaders.generateLeader): kept bug #78, the roll's range is the list less 3,
//so the last two never come up and a class of 2 can roll its class leader
export function newLeader(w: World, uclass: number, rng: RngStream): number {
	const list = w.rules.leaders[uclass];
	if (list.length < 2) return -1;
	return list[Math.floor(nextRandom(rng) * (list.length - 1 - 2)) + 1];
}

const fighterState = (u: UnitState): FighterState =>
	({ strength: u.strength, experience: u.experience, entrenchment: u.entrenchment, ammo: u.ammo });

function fighter(w: World, u: UnitState): Fighter {
	return { unit: u.id, eqid: u.eqid, side: sideOf(w, u), row: u.row, col: u.col, isMounted: u.isMounted,
		isSurprised: u.isSurprised, before: fighterState(u), after: null };
}

//Losses: strength, a hit this turn, a point of entrenchment (Unit.hit)
function hit(u: UnitState, losses: number) {
	u.strength -= losses;
	u.hits++;
	if (u.entrenchment > 0) u.entrenchment--;
}

//Fires: it shows on the map from now on even in fog, uses a round of its own ammo; its own attack
//(not a support or return shot, not an overrun) ends its firing for the turn (Unit.fire)
function fire(u: UnitState, attacking: boolean) {
	u.tempSpotted = true;
	u.ammo--;
	if (attacking) {
		u.hasFired = true;
		u.hasOverstrength = true;
	}
}

//Applies a resolved fight (Map.attackUnit): the undo is gone, the two face each other, the defender
//dismounts, the experience, ammo and losses, the score, the leaders
export function applyFight(d: Draft, f: FightResolution) {
	d.state.turn.undoable = null;
	const atk = writeUnit(d, f.attacker), def = writeUnit(d, f.defender), cr = f.result;
	const attacker = fighter(d, atk), defender = fighter(d, def);
	face(d, atk, def);
	face(d, def, atk);
	if (f.dismount) {
		spotOff(d, def);
		def.isMounted = false;
		spotOn(d, def);
		emit(d, { type: "dismounted", unit: def.id });
	}
	if (f.overrun) {
		if (atk.moveLeft > 0) atk.hasMoved = false;
		atk.moveLeft += 1;
	}
	atk.experience = Math.round(atk.experience + +cr.atkExpGained);
	def.experience = Math.round(def.experience + +cr.defExpGained);
	fire(atk, !f.support && !f.overrun);
	hit(def, cr.kills);
	if (cr.defcanfire && !f.support) {
		fire(def, false);
		hit(atk, cr.losses);
	}
	score(d, atk, def, cr);
	attacker.after = fighterState(atk);
	defender.after = fighterState(def);
	emit(d, { type: "fight", support: f.support, attacker, defender, result: cr, record: f.record });
	gainLeader(d, f.attacker, f.atkLeader);
	gainLeader(d, f.defender, f.defLeader);
}

//A unit turns to face the other, unless it stands on a bridge of its side
function face(d: Draft, u: UnitState, other: UnitState) {
	if (!isBridgeForSide(d, hexIndex(d, u.row, u.col), sideOf(d, u))) u.facing = directionTo(u.row, u.col, other.row, other.col);
}

//Each player scores the strength it destroyed and loses for the strength it lost (more for core units)
function score(d: Draft, atk: UnitState, def: UnitState, cr: CombatResult) {
	const a = playerAt(d, atk.owner).id, b = playerAt(d, def.owner).id;
	addScore(d, a, scoreGains.damage, cr.kills);
	addScore(d, a, atk.isCore ? scoreGains.casualtyCore : scoreGains.casualty, cr.losses);
	addScore(d, b, scoreGains.damage, cr.losses);
	addScore(d, b, def.isCore ? scoreGains.casualtyCore : scoreGains.casualty, cr.kills);
}

//A new leader can widen the unit's spotting: the old engine kept its counters (#73)
function gainLeader(d: Draft, id: UnitId, leader: number) {
	if (leader === -1) return;
	changeUnit(d, id, (u) => { u.leader = leader; });
	emit(d, { type: "leader", unit: id, leader });
}

function fight(d: Draft, atk: UnitId, def: UnitId, support: boolean, overrun: boolean) {
	applyFight(d, resolveFight(d, unitById(d, atk), unitById(d, def), d.rng, support, overrun));
}

//Actions.resolveAttack: the support fire on the attacker unless it was surprised or will overrun
//(the estimate says so), then the attack unless the attacker is destroyed or its losses stopped it
export function resolveAttack(d: Draft, attacker: UnitId, defender: UnitId): AttackStart {
	const atk = unitById(d, attacker), def = unitById(d, defender);
	const start: AttackStart = { attacker, defender, atkStrength: atk.strength, defStrength: def.strength };
	const estimate = attackResult(d, atk, def, null);
	if (!atk.isSurprised && !estimate.isOverrun)
		for (const s of supportFireUnits(d, atk, def).map((u) => u.id)) {
			if (unitById(d, attacker).strength <= 0) break;
			fight(d, s, attacker, true, false);
		}
	const strength = unitById(d, attacker).strength;
	const stopped = isLossOverRetreatThreshold(strength, start.atkStrength);
	if (strength > 0 && !stopped) fight(d, attacker, defender, false, estimate.isOverrun);
	if (stopped) {
		writeUnit(d, attacker).hasFired = true;
		emit(d, { type: "attackStopped", unit: attacker });
	}
	return start;
}

//Actions.finishAttack is cleanUpAttack, then endAttack: a screen shows the state in between. First the
//destroyed units off the map (the unit list's cleanup after the attack): the attacker, the defender,
//then any other the screen's animations left (an attack finished later, #58). The attacker as it was,
//for the retreat's rule (it reads what the attacker is, even destroyed)
export function cleanUpAttack(d: Draft, start: AttackStart): UnitState {
	const atk = unitById(d, start.attacker), def = unitById(d, start.defender);
	for (const u of [atk, def, ...d.state.units.filter((x) => x !== atk && x !== def)])
		if (u !== null && u.strength <= 0) destroy(d, u);
	return atk;
}

//A loaded game without the units on the map that have no strength left (#290): a save written while an
//attack's animation ran (the original's race, ours until #58) holds them, and nothing else takes them off,
//so one stood on its hex for good. Taken off as the attack's cleanup would have, a loss in a campaign's
//dossier; the world as it is when there is none
export function withoutDestroyed(w: World): World {
	if (!w.state.units.some((u) => u.strength <= 0)) return w;
	const d = beginDraft(w);
	for (const u of d.state.units.filter((x) => x.strength <= 0)) destroy(d, u);
	return finishDraft(d);
}

//After the cleanup: the defender retreats on big losses or surrenders with nowhere to go, a side with
//no unit left loses. When both have none the game ends once, as outcome() says: the axis checked first,
//the allies win (#92: the old game told a victory for each side, and a campaign ended the scenario twice)
export function endAttack(d: Draft, start: AttackStart, atk: UnitState | null) {
	const def = unitById(d, start.defender);
	if (atk !== null && def !== null && shouldDefenderRetreat(d, atk, def, start.defStrength)) {
		const to = retreatPosition(d, def);
		if (to !== null) {
			retreatTo(d, def.id, to);
		} else {
			removeUnit(d, def.id, true);
			emit(d, { type: "surrendered", unit: def.id, at: { row: def.row, col: def.col } });
		}
	}
	const side = [0, 1].find((x) => !d.state.units.some((u) => sideOf(d, u) === x));
	if (side !== undefined) emit(d, { type: "victory", side: ~side & 1, kind: "elimination" });
}

function destroy(d: Draft, u: UnitState) {
	removeUnit(d, u.id, true);
	emit(d, { type: "destroyed", unit: u.id, at: { row: u.row, col: u.col } });
}

//Map.retreatUnit: a move to the hex without the cost of a move (its moves and overstrength stay),
//the rest of a move as it is: the fuel, a capture. It leaves nothing to undo (#171: the old engine let
//the attacker's player undo the enemy's retreat)
function retreatTo(d: Draft, id: UnitId, to: Position) {
	const { moveLeft, hasMoved, hasOverstrength } = unitById(d, id);
	//(the hex is a plain cell, no cost: the move's cost comes to NaN, which counts as 0)
	moveUnit(d, id, to, [{ row: to.row, col: to.col, cost: NaN }], true);
	const u = writeUnit(d, id);
	u.moveLeft = moveLeft;
	u.hasMoved = hasMoved;
	u.hasOverstrength = hasOverstrength;
}

//The surprise attack at the end of a move (Actions.finishMove): on the unit of the hex the mover
//can attack, the one of its kind first, which stopped it (the old game picked by the person's air
//mode toggle, for the AI's moves too, #77), then the mover is no longer surprised; the attack's
//finish is the caller's, after the move's victory
export function surpriseAttack(d: Draft, id: UnitId, at: Position): AttackStart | null {
	const mover = unitById(d, id);
	const target = attackableUnit(d, mover, hexIndex(d, at.row, at.col), isAir(d, mover));
	const start = target === null ? null : resolveAttack(d, id, target.id);
	writeUnit(d, id).isSurprised = false;
	return start;
}
