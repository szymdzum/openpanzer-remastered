/**
 * The remastered AI's air doctrine (#619): air superiority first, strikes scored with the support fire they meet
 * (#259), the bombers on the assault's target before the armour, and each aircraft's way back to an airfield.
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

import { isTargetFrom, unitAttackRange } from "../attack";
import { attackResult } from "../combat";
import type { Command } from "../command";
import { costPerStrength } from "../costs";
import { startsAirAttacks } from "../equipment";
import { estimateAttack } from "../estimate";
import { distance } from "../geometry";
import { moveRange, unitMoveRange } from "../movement";
import { seesUnit } from "../sight";
import { check } from "../step";
import { canReinforce, canResupply, canSupplyHere } from "../supply";
import { terrainType, unitClass } from "../tables";
import type { MoveCell, Position, UnitId, UnitState, World } from "../types";
import { isAir, isGround, unitUsesFuel } from "../units";
import { ammoOf, fuelOf, sideOf, unitData } from "../world";
import type { Analysis, AnalysisCache } from "./analysis";
import { classOf, coveringGuns, hexOf, samePosition, standing } from "./assault";
import { eachNeighbour, stepField, UNREACHED } from "./fields";
import type { Sighting, SideView } from "./perception";
import type { Operation } from "./staff";

//The aircraft the staff flies; air transports keep the classic plan
const FLOWN: readonly number[] = [unitClass.fighter, unitClass.tacticalBomber, unitClass.levelBomber];
const BOMBERS: readonly number[] = [unitClass.tacticalBomber, unitClass.levelBomber];
//The enemy units whose support fire meets an aircraft's attack (attack.ts supportFireUnits)
const AIR_SUPPORT: readonly number[] = [unitClass.flak, unitClass.airDefence, unitClass.fighter];

//A loss counts this much against a kill (the scripted general's LOSS_WEIGHT)
const LOSS_WEIGHT = 0.7;
//A strike worth flying kills at least this much
const MIN_KILLS = 1;
//An aircraft that would lose this share of its strength or more doesn't strike: it is rebuilt only on an airfield,
//turns away from the fight
const MAX_LOSS_SHARE = 0.3;
//At a third of its fuel or ammunition or less an aircraft is short: resupplied on its airfield, it strikes only from
//where it stands (the general's resupply rule)
const SHORT_SHARE = 1 / 3;
//Worn down to this strength an aircraft strikes no more: it is rebuilt on its airfield
const WORN = 4;

const isBomber = (w: World, u: UnitState) => BOMBERS.includes(classOf(w, u));
const isFighter = (w: World, u: UnitState) => classOf(w, u) === unitClass.fighter;

/** Whether the staff flies the unit: a fighter or a bomber in the air. */
export const isFlown = (w: World, u: UnitState): boolean => isAir(w, u) && FLOWN.includes(classOf(w, u));

/** What the air orders read: the world, what the side knows of it, the assault, the units the operations hold. */
export interface Sky {
	w: World;
	a: Analysis;
	view: SideView;
	cache: AnalysisCache;
	player: number;
	assault: Operation | undefined;
	held: ReadonlySet<UnitId>;
}

//The world and the maps an order reads once: the aircraft (the player's that no operation holds), the steps home, the
//move ranges
interface Flight extends Sky {
	side: number;
	aircraft: UnitState[];
	home: Uint16Array;
	cells: (u: UnitState) => readonly MoveCell[];
}

function flightOf(s: Sky): Flight {
	const aircraft = s.w.state.units.filter((u) => u.owner === s.player && u.row >= 0 && isFlown(s.w, u) && !s.held.has(u.id));
	const made = new Map<UnitId, MoveCell[]>();
	const cells = (u: UnitState) => {
		let c = made.get(u.id);
		if (c === undefined) made.set(u.id, c = moveRange(s.w, u).filter((x) => x.canMove));
		return c;
	};
	return { ...s, side: s.a.side, aircraft, home: homeField(s.w, s.cache, s.player), cells };
}

//The hexes from each hex to one where the player's aircraft resupply: its country's airfields and the hexes beside
//them, its carriers (supply.ts)
function homeField(w: World, cache: AnalysisCache, player: number): Uint16Array {
	const p = w.state.players[player], { rows, cols } = w.state.map, sources = new Set<number>();
	w.state.map.hexes.forEach((h, i) => {
		if (w.data.hexes[i].terrain !== terrainType.Airfield || h.flag !== p.country) return;
		sources.add(i);
		eachNeighbour(rows, cols, i, (n) => sources.add(n));
	});
	for (const u of w.state.units) if (u.owner === player && u.row >= 0 && classOf(w, u) === unitClass.carrier) sources.add(hexOf(w, u));
	const key = `air home ${[...sources].join()}`;
	let field = cache.get(key) as Uint16Array | undefined;
	if (field === undefined) cache.set(key, field = stepField(w, [...sources]));
	return field;
}

//Whether an aircraft can still get home from the hex with the fuel it has left there: the fuel pays for the steps (a
//move a turn bound kept the aircraft from the front on the large maps, in the arena). An aircraft that burns no fuel,
//or whose side has no airfield, keeps no such rule
function comesBack(f: Flight, u: UnitState, c: Position): boolean {
	if (!unitUsesFuel(f.w, u) || f.home[hexOf(f.w, u)] === UNREACHED) return true;
	return f.home[hexOf(f.w, c)] <= fuelOf(u) - distance(u.row, u.col, c.row, c.col);
}

//Short of fuel or ammunition: a third left or less
function isShort(w: World, u: UnitState): boolean {
	const own = unitData(w, u, true);
	if (own.ammo > 0 && u.ammo <= own.ammo * SHORT_SHARE) return true;
	return unitUsesFuel(w, u) && own.fuel > 0 && u.fuel <= own.fuel * SHORT_SHARE;
}

//Spent: short, worn down, or too far from an airfield to come back; it flies to no strike
const isSpent = (f: Flight, u: UnitState) => isShort(f.w, u) || u.strength <= WORN || !comesBack(f, u, u);

/** Each fighter and bomber of the player's, whether it is spent, whether the enemy's air defence reaches it. */
export function airState(s: Sky): { unit: UnitId; spent: boolean; exposed: boolean }[] {
	const f = flightOf(s);
	return f.aircraft.map((u) => ({ unit: u.id, spent: isSpent(f, u), exposed: isExposed(f, u) }));
}

const canStrike = (u: UnitState) => !u.hasFired && ammoOf(u) > 0 && u.strength > WORN;

//The enemy's air defence can strike an aircraft on the hex next turn
const isExposed = (f: Flight, c: Position) => f.a.threat.airDefence[hexOf(f.w, c)] > 0;

//An attack's estimate with the support fire it meets, the seen guns' and fighters' (estimate.ts) and those the side
//remembers near the hex it strikes from, and when it stays on that hex, the air defence's attack on it next turn;
//`defence`, the enemies that cost it those losses
interface Strike {
	unit: UnitState;
	target: UnitState;
	from: Position | null;
	kills: number;
	losses: number;
	defence: UnitId[];
}

const gainOf = (s: Strike) => s.kills - LOSS_WEIGHT * s.losses;

//Worth flying: it kills, more than it loses, and doesn't cost a large share of the aircraft
const isWorth = (s: Strike) => s.kills >= MIN_KILLS && gainOf(s) > 0 && s.losses < MAX_LOSS_SHARE * s.unit.strength;

function strikeFrom(f: Flight, u: UnitState, t: UnitState, from: Position | null): Strike | null {
	const at = from === null ? u : standing(u, from);
	if (!isTargetFrom(f.w, at, t)) return null;
	const e = estimateAttack(f.w, at, t);
	const kills = e.stopped ? 0 : e.result.kills, left = { ...at, strength: Math.max(1, at.strength - e.result.losses) };
	const stays = from !== null || u.hasMoved, next = stays ? nextTurnDefence(f, left) : [];
	const losses = e.result.losses + e.support.reduce((n, x) => n + x.losses, 0) + rememberedSupport(f, at)
		+ next.reduce((n, x) => n + x.losses, 0);
	return { unit: u, target: t, from, kills, losses, defence: [...e.support.map((x) => x.unit), ...next.map((x) => x.unit)] };
}

//The air defence on the ground that can attack the aircraft on its hex next turn, seen or remembered, and what each
//would cost it
function nextTurnDefence(f: Flight, at: UnitState): { unit: UnitId; losses: number }[] {
	const out: { unit: UnitId; losses: number }[] = [];
	for (const s of f.view.enemies) {
		const e = f.w.equipment[s.eqid];
		if (!isGroundAirDefence(e) || distance(s.row, s.col, at.row, at.col) > f.w.equipment[s.moving].movpoints + Math.max(1, e.gunrange))
			continue;
		const seen = s.confidence >= 1 ? f.w.state.units.find((x) => x.id === s.id) : undefined;
		out.push({ unit: s.id, losses: attackResult(f.w, seen ?? ghostOf(f, s), at, null).kills * s.confidence });
	}
	return out;
}

const isGroundAirDefence = (e: EquipmentEntry) => e.uclass <= unitClass.airDefence && e.airatk > 0 && startsAirAttacks(e);

//The losses the support fire of the enemies the side remembers but doesn't see now would cost an attack from the hex,
//each weighed by how sure the side is it is still there (#17: what it saw, not where they are)
function rememberedSupport(f: Flight, at: UnitState): number {
	if (!isAir(f.w, at)) return 0;
	let losses = 0;
	for (const s of f.view.enemies) {
		const e = f.w.equipment[s.eqid];
		if (s.confidence >= 1 || !AIR_SUPPORT.includes(e.uclass) || distance(s.row, s.col, at.row, at.col) > Math.max(1, e.gunrange)) continue;
		losses += attackResult(f.w, ghostOf(f, s), at, null).kills * s.confidence;
	}
	return losses;
}

//An enemy remembered, as a unit where it was last seen, with what the side saw of it
function ghostOf(f: Flight, s: Sighting): UnitState {
	const e = f.w.equipment[s.eqid], owner = f.w.state.players.find((p) => p.side !== f.side)?.id ?? 0;
	return { id: s.id, eqid: s.eqid, owner, row: s.row, col: s.col, transport: null, carrier: 0, strength: s.strength, moveLeft: 0,
		ammo: e.ammo, fuel: e.fuel, hits: 0, experience: 0, entrenchment: 0, entrenchTicks: 0, leader: -1, facing: 0, flag: -1,
		isCore: false, isMounted: false, hasMoved: false, hasFired: false, hasResupplied: false, hasOverstrength: false,
		isSurprised: false, tempSpotted: false };
}

//The unit's strikes on the target: from where it stands, and (before it has moved, and not on its way back) from each
//hex beside the target it can stop on and come back from
function strikesOn(f: Flight, u: UnitState, t: UnitState): Strike[] {
	const out: Strike[] = [], here = strikeFrom(f, u, t, null);
	if (here !== null) out.push(here);
	if (!movesToStrike(f, u, t)) return out;
	for (const c of f.cells(u)) {
		const s = strikesFrom(f, u, t, c) ? strikeFrom(f, u, t, { row: c.row, col: c.col }) : null;
		if (s !== null) out.push(s);
	}
	return out;
}

const movesToStrike = (f: Flight, u: UnitState, t: UnitState) => !u.hasMoved && !isSpent(f, u)
	&& distance(u.row, u.col, t.row, t.col) <= unitMoveRange(f.w, u) + unitAttackRange(f.w, u);

//A hex of its range the aircraft strikes the target from: another than its own, in range, and one it comes back from
const strikesFrom = (f: Flight, u: UnitState, t: UnitState, c: Position) => !samePosition(c, u)
	&& distance(c.row, c.col, t.row, t.col) <= unitAttackRange(f.w, u) && comesBack(f, u, c);

function bestOf(strikes: readonly Strike[]): Strike | null {
	let best: Strike | null = null;
	for (const s of strikes) if (best === null || gainOf(s) > gainOf(best)) best = s;
	return best;
}

//The best strike worth flying of the units on the targets, and the best one the support fire alone keeps from being
//worth it (blocked): what clearing the defence would open
function bestStrike(f: Flight, units: readonly UnitState[], targets: readonly UnitState[]): { worth: Strike | null; blocked: Strike | null } {
	const all: Strike[] = [];
	for (const u of units) for (const t of targets) all.push(...strikesOn(f, u, t));
	const blocked = all.filter((s) => !isWorth(s) && s.defence.length > 0 && s.kills >= MIN_KILLS);
	return { worth: bestOf(all.filter(isWorth)), blocked: bestOf(blocked) };
}

//A strike's commands: the attack from where it stands, or the move to its hex alone, the attack weighed again from
//there at the next order (the move may spot guns it didn't see)
function commandsOf(w: World, s: Strike): Command[] | null {
	const cmd: Command = s.from === null ? { type: "attack", unit: s.unit.id, target: s.target.id } : { type: "move", unit: s.unit.id, to: s.from };
	return check(w, cmd) === null ? [cmd] : null;
}

const seenEnemies = (f: Flight, keep: (t: UnitState) => boolean) => f.w.state.units.filter((t) => t.row >= 0 && sideOf(f.w, t) !== f.side
	&& seesUnit(f.w, t, f.side) && keep(t));

/**
 * The air's next order, before the armour attacks and the classic plan: an aircraft on its airfield supplied first when
 * it needs it; for a side that assaults, the fighters on the enemy's aircraft (its fighters first), then the bombers on
 * the assault's target and the guns covering it, each only when worth it with the support fire it meets (a strike the
 * support fire alone spoils has the artillery fire on the guns first, else it isn't flown); then a fighter beside each
 * bomber that has flown into the enemy fighters' reach. Null: none.
 *
 * The side that defends strikes and hunts with the classic plan: in the arena, the staff's air superiority and strikes
 * cost the defenders units and objectives.
 */
export function airStrikeOrder(s: Sky): Command[] | null {
	const f = flightOf(s);
	return airSupply(f) ?? (f.assault === undefined ? null : superiority(f) ?? groundStrikes(f)) ?? coverOrder(f);
}

/**
 * Whether the classic plan may fly the aircraft to the cell: where its fuel brings it back to an airfield. Kept out of
 * the enemy air defence's reach as well, or flown home when short, the attackers took fewer objectives in the arena.
 */
export function airFliesTo(s: Sky): (u: UnitState, cell: Position) => boolean {
	const f = flightOf(s);
	return (u, cell) => !isFlown(f.w, u) || comesBack(f, u, cell);
}

/** Whether a classic plan's attack by a fighter or bomber is worth flying, by the air doctrine's estimate (#259). */
export function airAttackWorth(s: Sky, cmd: Command): boolean {
	if (cmd.type !== "attack") return true;
	const u = s.w.state.units.find((x) => x.id === cmd.unit), t = s.w.state.units.find((x) => x.id === cmd.target);
	if (u === undefined || t === undefined || !isFlown(s.w, u)) return true;
	const strike = strikeFrom(flightOf(s), u, t, null);
	return strike === null || isWorth(strike);
}

//Fighters strike the enemy's fighters first, then its other aircraft
function superiority(f: Flight): Command[] | null {
	const fighters = f.aircraft.filter((u) => isFighter(f.w, u) && canStrike(u));
	if (fighters.length === 0) return null;
	const air = seenEnemies(f, (t) => isAir(f.w, t));
	for (const targets of [air.filter((t) => isFighter(f.w, t)), air.filter((t) => !isFighter(f.w, t))]) {
		const best = bestStrike(f, fighters, targets).worth;
		const cmds = best === null ? null : commandsOf(f.w, best);
		if (cmds !== null) return cmds;
	}
	return null;
}

//The assault's target and the guns covering it, by the bombers, then the fighters. The other targets are the classic
//plan's: the staff's strikes on any enemy took the attackers fewer objectives in the arena
function groundStrikes(f: Flight): Command[] | null {
	const ready = (is: typeof isBomber) => f.aircraft.filter((u) => is(f.w, u) && canStrike(u));
	const targets = sectorTargets(f, seenEnemies(f, (t) => isGround(f.w, t)));
	if (targets.length === 0) return null;
	for (const units of [ready(isBomber), ready(isFighter)]) {
		const cmds = units.length === 0 ? null : strikeOrClear(f, units, targets);
		if (cmds !== null) return cmds;
	}
	return null;
}

//The best strike worth flying, else the artillery's fire on the gun that spoils the best one
function strikeOrClear(f: Flight, units: readonly UnitState[], targets: readonly UnitState[]): Command[] | null {
	const { worth, blocked } = bestStrike(f, units, targets);
	if (worth !== null) return commandsOf(f.w, worth);
	return blocked === null ? null : clearing(f, blocked);
}

//The assault's main target, the enemy on its objective, and the guns that would cover it, these first
function sectorTargets(f: Flight, ground: readonly UnitState[]): UnitState[] {
	const op = f.assault, main = op === undefined ? undefined : ground.find((t) => samePosition(t, op.at));
	return main === undefined ? [] : [...coveringGuns(f.w, f.side, main).filter((g) => isGround(f.w, g)), main];
}

//The artillery's fire on a gun whose support fire spoils the strike: the best worth it from where a free gun stands
function clearing(f: Flight, blocked: Strike): Command[] | null {
	const guns = f.w.state.units.filter((g) => g.owner === f.player && g.row >= 0 && !f.held.has(g.id)
		&& classOf(f.w, g) === unitClass.artillery && !g.hasFired && ammoOf(g) > 0);
	const defence = blocked.defence.map((id) => f.w.state.units.find((x) => x.id === id)).filter((t) => t !== undefined && !isAir(f.w, t));
	let best: { cmd: Command; gain: number } | null = null;
	for (const t of defence) for (const g of guns) {
		const gain = gunGain(f.w, g, t);
		if (gain !== null && (best === null || gain > best.gain)) best = { cmd: { type: "attack", unit: g.id, target: t.id }, gain };
	}
	return best !== null && check(f.w, best.cmd) === null ? [best.cmd] : null;
}

//What a gun's fire on the target from where it stands is worth, when it kills and doesn't lose more than it kills
function gunGain(w: World, g: UnitState, t: UnitState): number | null {
	if (!isTargetFrom(w, g, t)) return null;
	const e = estimateAttack(w, g, t), kills = e.stopped ? 0 : e.result.kills, losses = e.result.losses;
	return kills >= MIN_KILLS && losses <= kills ? kills - LOSS_WEIGHT * losses : null;
}

//An aircraft on its airfield that hasn't moved or fired: reinforced when worn down and the player can pay a point,
//resupplied when short
function airSupply(f: Flight): Command[] | null {
	for (const u of f.aircraft) {
		if (u.hasMoved || u.hasFired || u.hasResupplied || !canSupplyHere(f.w, u)) continue;
		const cmd = supplyOf(f, u);
		if (cmd !== null && check(f.w, cmd) === null) return [cmd];
	}
	return null;
}

function supplyOf(f: Flight, u: UnitState): Command | null {
	const prestige = f.w.state.players[f.player].prestige;
	if (u.strength <= WORN && canReinforce(f.w, u) && prestige >= costPerStrength(f.w, u)) return { type: "reinforce", unit: u.id };
	return isShort(f.w, u) && canResupply(f.w, u) ? { type: "resupply", unit: u.id } : null;
}

function moveTo(w: World, u: UnitState, cell: Position): Command[] | null {
	const cmd: Command = { type: "move", unit: u.id, to: { row: cell.row, col: cell.col } };
	return check(w, cmd) === null ? [cmd] : null;
}

//A fighter beside each bomber that has flown into the reach of the enemy's fighters and has none: the nearest that
//hasn't moved and doesn't fly home, on a hex out of the air defence it can come back from (it intercepts for the
//bomber, attack.ts supportFireUnits)
function coverOrder(f: Flight): Command[] | null {
	const fighters = f.aircraft.filter((x) => isFighter(f.w, x) && !x.hasMoved && !isSpent(f, x));
	if (fighters.length === 0) return null;
	const threat = (b: UnitState) => f.a.threat.fighters[hexOf(f.w, b)];
	const bombers = f.aircraft.filter((b) => isBomber(f.w, b) && b.hasMoved && threat(b) > 0
		&& !f.aircraft.some((x) => isFighter(f.w, x) && distance(x.row, x.col, b.row, b.col) === 1));
	bombers.sort((x, y) => threat(y) - threat(x));
	for (const b of bombers) {
		const cmd = coverMove(f, b, fighters);
		if (cmd !== null) return cmd;
	}
	return null;
}

function coverMove(f: Flight, b: UnitState, fighters: readonly UnitState[]): Command[] | null {
	let best: { u: UnitState; c: Position; d: number } | null = null;
	for (const u of fighters) for (const c of f.cells(u)) {
		const d = distance(u.row, u.col, c.row, c.col);
		if (distance(c.row, c.col, b.row, b.col) !== 1 || isExposed(f, c) || !comesBack(f, u, c) || (best !== null && d >= best.d)) continue;
		best = { u, c, d };
	}
	return best === null ? null : moveTo(f.w, best.u, best.c);
}
