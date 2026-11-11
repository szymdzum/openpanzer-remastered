/**
 * Where a unit of the remastered AI's moves when it has no attack to make (#627): a ground unit toward the objectives
 * its directive gives it, a gun into range of them and out of the enemy's reach, an aircraft toward them or back to an
 * airfield, a ship into range of them.
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

import { unitAttackRange } from "../attack";
import type { Command } from "../command";
import { adjacent, distance } from "../geometry";
import { disembarkPositions } from "../movement";
import { seesUnit } from "../sight";
import { check } from "../step";
import { roadType, terrainEntrenchment, terrainInitiative, terrainType, unitClass } from "../tables";
import type { MoveCell, Position, UnitState, World } from "../types";
import { canEntrench, isAir, isCloseCombatTerrain, isGround, isSea } from "../units";
import { ammoOf, groundUnitAt, onMap, playerOf, sideOf, unitAt, unitData } from "../world";
import { type Analysis, type AnalysisCache, fieldTo } from "./analysis";
import { gunMove } from "./assault";
import { UNREACHED } from "./fields";
import { classOf, hexOf } from "./march";

/** What a unit's move reads: the world, the side's maps, and what the commander's directives make of the map. */
export interface Ground {
	w: World;
	a: Analysis;
	cache: AnalysisCache;
	player: number;
	side: number;
	//Whether the side assaults (clock.ts): its units away from the enemy leave their holes (#235)
	assaults: boolean;
	//What an objective's pull is worth on the objective itself (`pullOf`): more for the scenario's attacker
	pull: number;
	//The objectives a unit goes for: the main effort's sector, the one it is near, none when it stands fast
	goals(u: UnitState): readonly Position[];
	//The enemies the side sees now
	targets: readonly UnitState[];
	//The hexes of a unit's move as it stands, and those only its transport takes it to where it may end a ride
	cells(u: UnitState): readonly MoveCell[];
	rides(u: UnitState): readonly MoveCell[];
}

/** A unit's move: its commands (a mount first when it rides) and its place in the turn's moves, the lowest first. */
export interface Advance {
	commands: Command[];
	rank: number;
}

//The pull of an objective, over the points of the march to it (and ON_OBJECTIVE more on it): weak far away, where a
//unit fights what is near, and stronger than anything else beside it. Over the distance fields, which count a forest or
//a river at more than a hex: at the classic AI's 4000 a defender's units stayed in their holes with an objective to
//take back
const PULL = 6000;
//The scenario's attacker loses at the turn limit unless it took every objective (#256): they pull its units twice as
//hard, past the kills and the cover a defender weighs them against. Harder still, its units rush a crowded front
const ATTACKER_PULL = 12000;
const ON_OBJECTIVE = 100;

/** What an objective's pull is worth for a side: the scenario's attacker's, or a defender's. */
export const pullFor = (attacks: boolean) => attacks ? ATTACKER_PULL : PULL;

//What a unit stands on and beside is worth the classic AI's weights, which years of play tuned.
//A level of entrenchment is worth this much to a unit that stays: it leaves its holes for a clear gain only
const ENTRENCHED = 50;
//Within this distance of a seen enemy a unit is in contact (what one move of the enemy reaches): an attacker's unit
//keeps its holes there, to hold the line it reached
const CONTACT = 3;
//Terrain a unit digs deeper in than it is dug in now
const DIGS_DEEPER = 50;
//Terrain that gives a better initiative than where it stands
const BETTER_INITIATIVE = 20;
//A river or a stream without a road: a unit on it fights badly
const IN_RIVER = -70;
//Close terrain (a city, a forest, a mountain, a fortification): infantry holds it, an anti-tank gun hides in it, the
//others fight badly in it
const CLOSE_TERRAIN = { infantry: 120, antiTank: 10, others: -50 };
//A town that flies another flag is worth taking on the way
const FOREIGN_FLAG = 50;
//A deployment hex of the player's is left free for the units it buys
const DEPLOYMENT_HEX = -100;
//An objective the unit can stand on: infantry holds it best, then a tank
const HOLDS_OBJECTIVE = { infantry: 600, tank: 350, others: 300 };
//Beside a friend (its artillery covers the unit), beside an enemy (it is where the fight is), beside an objective
const BESIDE_FRIEND = 20;
const BESIDE_ARTILLERY = 100;
const BESIDE_ENEMY = 40;
const BESIDE_OBJECTIVE = { infantry: 100, others: 70 };
const BESIDE_OWN_OBJECTIVE = { infantry: 70, others: 50 };
//A ground unit at this strength or below is worn down (the scripted general's WORN): each enemy strength point that can
//strike a hex next turn costs it this much there, so it falls back where the pull of an objective isn't stronger (#6)
const WORN = 4;
const WORN_EXPOSED = 5;
//An aircraft is pulled a third as hard as a ground unit: it reaches the objective in a turn anyway
const AIR_PULL = 0.3;
//An enemy strength point that can strike an aircraft on a hex next turn costs this much: one air defence gun turns
//an aircraft away unless the objective is beside it
const AIR_THREAT = 10;
//A unit on an air or naval transport lands once its objective is this many turns of its own march from the hex it
//lands on; further off its transport carries it nearer first
const LANDING_TURNS = 2;
//The moves come in this order: the ground units nearest their objective first, they free the hexes behind them; then
//the guns, the aircraft and the ships
const GUNS_AFTER = 1e6, AIRCRAFT_AFTER = 2e6, SHIPS_AFTER = 3e6;

const pullOf = (pull: number, points: number) => points === UNREACHED ? 0 : points <= 0 ? pull + ON_OBJECTIVE : Math.round(pull / points);

const isGun = (uclass: number) => uclass === unitClass.artillery || uclass === unitClass.airDefence || uclass === unitClass.flak;

/** Whether a ground unit is worn down: it spares itself (#6). */
export const isWorn = (w: World, u: UnitState) => isGround(w, u) && u.strength <= WORN;

const moveTo = (u: UnitState, c: Position): Command => ({ type: "move", unit: u.id, to: { row: c.row, col: c.col } });

/**
 * What standing on a hex is worth to a unit that weighs its hexes (a ground unit that closes with the enemy, an
 * aircraft): `worth` of a hex, `holes` more where it stands, its `rank` among the turn's moves, and whether an
 * objective leads it (`led`): a unit that none leads moves only to attack.
 */
export interface Footing {
	worth(c: Position): number;
	holes: number;
	rank: number;
	led: boolean;
}

/** The footing of a unit that weighs its hexes; null for the others, whose move is `advanceOf`'s. */
export function footingOf(g: Ground, u: UnitState): Footing | null {
	if (u.carrier !== 0 || isSea(g.w, u)) return null;
	if (isAir(g.w, u)) return ammoOf(u) > 0 ? airFooting(g, u) : null;
	const uclass = classOf(g.w, u);
	return !isGround(g.w, u) || uclass === unitClass.fortification || isGun(uclass) ? null : groundFooting(g, u);
}

/** The move of a unit that doesn't weigh its hexes: a gun, a ship, an aircraft out of ammunition, a unit carried. */
export function advanceOf(g: Ground, u: UnitState): Advance | null {
	if (u.hasMoved || u.carrier < 0) return null;
	if (u.carrier > 0) return carriedMove(g, u);
	if (isAir(g.w, u)) return toAirfield(g, u);
	if (isSea(g.w, u)) return seaMove(g, u);
	return isGround(g.w, u) && isGun(classOf(g.w, u)) ? gunAdvance(g, u) : null;
}

//A ground unit's hexes: the pull of its objectives over the march to them, counted on foot (from the hex a ride ends
//on too: it fights there off its transport), and what the hex itself is worth
function groundFooting(g: Ground, u: UnitState): Footing {
	const goals = g.goals(u), field = goals.length === 0 ? null : fieldTo(g.w, g.cache, unitData(g.w, u, true).movmethod, goals);
	const pull = (c: Position) => field === null ? 0 : pullOf(g.pull, field[hexOf(g.w, c)]);
	//A worn-down unit keeps out of the enemy's reach where it can (#6)
	const exposed = (c: Position) => isWorn(g.w, u) ? WORN_EXPOSED * g.a.threat.ground[hexOf(g.w, c)] : 0;
	return { worth: (c) => pull(c) + hexWorth(g, u, c) - exposed(c), holes: holesWorth(g, u), rank: field === null ? 0 : field[hexOf(g.w, u)],
		led: field !== null };
}

/** A move's commands, the mount first when the unit rides; null when the core refuses the first. */
export function marchCommands(w: World, u: UnitState, to: Position, mounted: boolean): Command[] | null {
	const move = moveTo(u, to), first: Command = mounted ? { type: "mount", unit: u.id } : move;
	if (check(w, first) !== null) return null;
	return mounted ? [first, move] : [move];
}

//What its holes are worth to a unit that stays: all of it for a side that doesn't assault, and for an assaulting
//side's unit in contact with the enemy (#235)
function holesWorth(g: Ground, u: UnitState): number {
	const inContact = !g.assaults || g.targets.some((t) => distance(u.row, u.col, t.row, t.col) <= CONTACT);
	return inContact ? u.entrenchment * ENTRENCHED : 0;
}

//What a hex is worth to a ground unit standing on it, the pull aside: its terrain, an objective under it, its
//neighbours
function hexWorth(g: Ground, u: UnitState, c: Position): number {
	const w = g.w, hex = hexOf(w, c), h = w.state.map.hexes[hex];
	let worth = terrainWorth(w, u, hex);
	if (h.victorySide === -1 && w.data.hexes[hex].deployment === g.player) worth += DEPLOYMENT_HEX;
	if (h.victorySide !== -1 && freeFor(w, u, hex)) worth += byClass(HOLDS_OBJECTIVE, classOf(w, u));
	for (const n of adjacent(c.row, c.col)) if (onMap(w, n.row, n.col)) worth += neighbourWorth(g, u, n);
	return worth;
}

//A weight by the unit's class: infantry's, a tank's or an anti-tank gun's where it has its own, else the others'
function byClass(worth: { infantry: number; tank?: number; antiTank?: number; others: number }, uclass: number): number {
	if (uclass === unitClass.infantry) return worth.infantry;
	const own = uclass === unitClass.tank ? worth.tank : uclass === unitClass.antiTank ? worth.antiTank : undefined;
	return own ?? worth.others;
}

function freeFor(w: World, u: UnitState, hex: number): boolean {
	const on = groundUnitAt(w, hex);
	return on === null || on.id === u.id;
}

function terrainWorth(w: World, u: UnitState, hex: number): number {
	const terrain = w.data.hexes[hex].terrain, here = w.data.hexes[hexOf(w, u)].terrain, flag = w.state.map.hexes[hex].flag;
	return (canEntrench(w, u) && u.entrenchment < terrainEntrenchment[terrain] ? DIGS_DEEPER : 0)
		+ (terrainInitiative[here] < terrainInitiative[terrain] ? BETTER_INITIATIVE : 0)
		+ (isOpenRiver(w, hex) ? IN_RIVER : 0)
		+ (isCloseCombatTerrain(terrain) ? byClass(CLOSE_TERRAIN, classOf(w, u)) : 0)
		+ (flag !== -1 && flag !== playerOf(w, u).country ? FOREIGN_FLAG : 0);
}

function isOpenRiver(w: World, hex: number): boolean {
	const terrain = w.data.hexes[hex].terrain;
	return (terrain === terrainType.River || terrain === terrainType.Stream) && w.data.hexes[hex].road === roadType.none;
}

function neighbourWorth(g: Ground, u: UnitState, n: Position): number {
	const w = g.w, hex = hexOf(w, n), other = unitAt(w, hex, false), h = w.state.map.hexes[hex];
	let worth = 0;
	if (other !== null && other.id !== u.id) {
		if (sideOf(w, other) === g.side) worth += classOf(w, other) === unitClass.artillery ? BESIDE_ARTILLERY : BESIDE_FRIEND;
		else if (seesUnit(w, other, g.side)) worth += BESIDE_ENEMY;
	}
	if (h.victorySide !== -1) {
		const held = h.owner !== -1 && w.state.players[h.owner].side === g.side;
		worth += byClass(held ? BESIDE_OWN_OBJECTIVE : BESIDE_OBJECTIVE, classOf(w, u));
	}
	return worth;
}

const nearestOf = (u: Position, goals: readonly Position[]): Position | null => goals.reduce<Position | null>((best, o) =>
	best === null || distance(u.row, u.col, o.row, o.col) < distance(u.row, u.col, best.row, best.col) ? o : best, null);

//A gun follows its nearest objective to take: into range of it for the next turn, out of the enemy's reach (#234),
//when the pull of the hex it would move to is worth more than its holes
function gunAdvance(g: Ground, u: UnitState): Advance | null {
	const front = nearestOf(u, g.goals(u)), commands = front === null ? null : gunMove(g, u, front);
	if (front === null || commands === null) return null;
	const to = commands[commands.length - 1], near = (c: Position) => pullOf(g.pull, distance(c.row, c.col, front.row, front.col));
	const gain = to.type === "move" ? near(to.to) - near(u) : 0;
	return gain > holesWorth(g, u) ? { commands, rank: GUNS_AFTER + u.id } : null;
}

//An aircraft's hexes: toward the objectives, around the hexes the enemy's fighters and air defence reach when it can
function airFooting(g: Ground, u: UnitState): Footing {
	const goals = g.goals(u);
	const pull = (c: Position) => {
		const o = nearestOf(c, goals);
		return o === null ? 0 : AIR_PULL * pullOf(g.pull, distance(c.row, c.col, o.row, o.col));
	};
	return { worth: (c) => pull(c) - AIR_THREAT * g.a.threat.air[hexOf(g.w, c)], holes: 0, rank: AIRCRAFT_AFTER + u.id, led: goals.length > 0 };
}

//An aircraft out of ammunition flies back toward an airfield of its player's
function toAirfield(g: Ground, u: UnitState): Advance | null {
	const field = g.a.supply.air.get(u.owner);
	return field === undefined ? null : bestCell(g, u, (c) => -field[hexOf(g.w, c)], AIRCRAFT_AFTER);
}

//The move to the hex worth most, when one is worth more than where the unit is
function bestCell(g: Ground, u: UnitState, worth: (c: Position) => number, after: number): Advance | null {
	let best: MoveCell | null = null, most = worth(u);
	for (const c of g.cells(u)) {
		const value = c.canMove ? worth(c) : -Infinity;
		if (value > most) {
			best = c;
			most = value;
		}
	}
	const commands = best === null ? null : marchCommands(g.w, u, best, false);
	return commands === null ? null : { commands, rank: after + u.id };
}

//A ship moves into its guns' range of the nearest objective to take, when a move brings it nearer
function seaMove(g: Ground, u: UnitState): Advance | null {
	const front = nearestOf(u, g.goals(u));
	if (front === null) return null;
	const gap = (c: Position) => Math.max(0, distance(c.row, c.col, front.row, front.col) - unitAttackRange(g.w, u));
	return bestCell(g, u, (c) => -gap(c), SHIPS_AFTER);
}

//A unit on an air or naval transport: off it beside its objective, else carried nearer; off it too where it gets no
//nearer and can march the rest
function carriedMove(g: Ground, u: UnitState): Advance | null {
	const goal = nearestOf(u, g.goals(u));
	if (goal === null) return null;
	const own = unitData(g.w, u, true), field = fieldTo(g.w, g.cache, own.movmethod, [goal]);
	const march = (c: Position) => field[hexOf(g.w, c)];
	const shore = disembarkPositions(g.w, u).reduce<Position | null>((best, c) => best === null || march(c) < march(best) ? c : best, null);
	if (shore !== null && march(shore) <= LANDING_TURNS * Math.max(1, own.movpoints)) return landing(g.w, u, shore);
	const nearer = bestCell(g, u, (c) => -distance(c.row, c.col, goal.row, goal.col), SHIPS_AFTER);
	return nearer ?? (shore !== null && march(shore) !== UNREACHED ? landing(g.w, u, shore) : null);
}

function landing(w: World, u: UnitState, shore: Position): Advance | null {
	const disembark: Command = { type: "disembark", unit: u.id };
	return check(w, disembark) === null ? { commands: [disembark, moveTo(u, shore)], rank: SHIPS_AFTER + u.id } : null;
}
