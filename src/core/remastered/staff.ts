/**
 * The remastered AI's staff: operations made from the commander's directives (#638), a garrison on each objective to
 * hold (#5) and the line that stands fast by it, the reserve; and a unit onto an objective to take that the side's
 * attack has just emptied (#312).
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

import { attackableUnit, attackCells } from "../attack";
import type { Command } from "../command";
import { costPerStrength } from "../costs";
import { estimateAttack } from "../estimate";
import { nextToSeenEnemy } from "../ai";
import { distance } from "../geometry";
import { moveRange, unitMoveRange } from "../movement";
import { check } from "../step";
import { unitClass } from "../tables";
import type { MoveCell, Position, UnitId, UnitState, World } from "../types";
import { canCapture, canMount, isGround, unitUsesFuel } from "../units";
import { groundUnitAt, hexIndex, unitById, unitData } from "../world";
import type { Directive } from "./directives";
import type { SideView } from "./perception";
import type { AnalysisCache } from "./analysis";
import { freeGround, samePosition, turnsTo } from "./march";

/**
 * An operation's task: hold an objective of the side's (#5), take one it emptied (#312), assault one (#618), strike
 * back at a hex or wait in reserve (#638).
 */
export type OperationKind = "garrison" | "occupy" | "assault" | "counterattack" | "reserve";

/** An operation of the staff: what it does and where, the units it holds, the last turn it holds them, and why. */
export interface Operation {
	kind: OperationKind;
	at: Position;
	units: UnitId[];
	until: number;
	reason: string;
	//The directive an assault or a counterattack was made for
	directive?: Directive;
}

//The turns of the enemy's moves within which a garrison's candidate has to reach its objective
const GARRISON_TURNS = 2;
//A unit already on the objective is worth this much more than one that has to march there
const ON_IT = 20;
//Infantry and anti-tank guns hold a hex best: worth this much more than a tank or a recon as a garrison
const PREFERRED = 3;
//Each hex further from the objective costs a candidate this much of its strength: nearer arrives sooner (the
//scripted general's STRENGTH_PER_HEX)
const PER_HEX = 3;
//A unit of the reserve is sent to hold an objective before another this much better: that is what it waits for (the
//scripted general's RESERVE_PREFERENCE, in strength)
const RESERVE_FIRST = 6;
//A garrison with nothing to fire at is reinforced below this strength: it holds the line where the enemy comes
const REINFORCE_BELOW = 8;

const isOn = (u: UnitState, at: Position) => u.row === at.row && u.col === at.col;

const isAlive = (w: World, id: UnitId) => {
	const u = unitById(w, id);
	return u !== null && u.row >= 0 && !w.destroyed.has(id);
};

/**
 * The staff's operations that hold units, for the commander's directives and for nothing else: those going on (their
 * units alive, their deadline not passed), a garrison for each `hold` or `delay` that has none, the directives' first
 * in priority first, and the reserve while a `reserve` stands. `withStrikes` adds the assault and the counterattacks.
 */
export function holdingOperations(w: World, view: SideView, player: number, ops: readonly Operation[], directives: readonly Directive[]): Operation[] {
	return withReserve(w, view, player, withGarrisons(w, player, liveOperations(w, ops, directives), directives), directives);
}

const posturesOf = (directives: readonly Directive[]) => directives.filter((d) => d.task === "hold" || d.task === "delay");

//The operations that go on. A reserve's is kept whole here: withReserve drops its dead
function liveOperations(w: World, ops: readonly Operation[], directives: readonly Directive[]): Operation[] {
	const turn = w.state.turn.turn, postures = posturesOf(directives);
	return ops.filter((op) => op.kind === "reserve" || (turn <= op.until && op.units.every((id) => isAlive(w, id))
		&& (op.kind !== "garrison" || postures.some((d) => samePosition(d.target, op.at)))));
}

/** The units the operations hold: the planner leaves them out. */
export function heldUnits(ops: readonly Operation[]): Set<UnitId> {
	const held = new Set<UnitId>();
	for (const op of ops) for (const id of op.units) held.add(id);
	return held;
}

//A garrison for each posture that has none: a unit no operation holds or one of the reserve, which it leaves
function withGarrisons(w: World, player: number, ops: readonly Operation[], directives: readonly Directive[]): Operation[] {
	let out = [...ops];
	const held = heldUnits(ops.filter((op) => op.kind !== "reserve")), reserve = heldUnits(ops.filter((op) => op.kind === "reserve"));
	for (const d of posturesOf(directives)) {
		if (out.some((op) => op.kind === "garrison" && samePosition(op.at, d.target))) continue;
		const u = garrisonFor(w, player, d.target, held, reserve);
		if (u === null) continue;
		held.add(u.id);
		if (reserve.delete(u.id)) out = out.map((op) => op.kind === "reserve" ? { ...op, units: op.units.filter((id) => id !== u.id) } : op);
		out.push({ kind: "garrison", at: d.target, units: [u.id], until: d.until, reason: d.reason });
	}
	return out;
}

//The share of the mobile units the reserve holds back: enough to answer one threat, few enough to attack with the
//rest (the scripted general's RESERVE_SHARE)
const RESERVE_SHARE = 0.2;
//A unit that moves this far a turn can be sent where it is needed (the scripted general's MOBILE_MOVES)
const MOBILE_MOVES = 4;

//The reserve while the directive stands, its dead dropped: chosen when the directive first comes, RESERVE_SHARE of the
//player's mobile units no operation holds, the furthest from the enemies the side knows of
function withReserve(w: World, view: SideView, player: number, ops: Operation[], directives: readonly Directive[]): Operation[] {
	const d = directives.find((x) => x.task === "reserve"), current = ops.find((op) => op.kind === "reserve");
	if (d === undefined) return current === undefined ? ops : ops.filter((op) => op !== current);
	if (current === undefined) return [...ops, { kind: "reserve", at: d.target, units: pickReserve(w, view, player, heldUnits(ops)), until: d.until, reason: d.reason }];
	const alive = current.units.filter((id) => isAlive(w, id));
	if (alive.length === current.units.length && samePosition(current.at, d.target) && current.until === d.until) return ops;
	return ops.map((op) => op === current ? { ...op, at: d.target, units: alive, until: d.until } : op);
}

function pickReserve(w: World, view: SideView, player: number, held: ReadonlySet<UnitId>): UnitId[] {
	const enemies = view.enemies.filter((s) => w.equipment[s.eqid].uclass <= unitClass.airDefence);
	const front = (u: UnitState) => enemies.reduce((n, s) => Math.min(n, distance(u.row, u.col, s.row, s.col)), Infinity);
	const mobile = w.state.units.filter((u) => u.owner === player && u.row >= 0 && !held.has(u.id) && canGarrison(w, u)
		&& unitData(w, u, true).movpoints >= MOBILE_MOVES);
	mobile.sort((x, y) => front(y) - front(x) || x.id - y.id);
	return mobile.slice(0, Math.round(mobile.length * RESERVE_SHARE)).map((u) => u.id);
}

//The enemy this near an objective to hold calls units into its line
const LINE_RADIUS = 4;
//A unit of the line for each 10 points of the enemy's strength there: a unit at full strength for each of the enemy's
const LINE_STRENGTH = 10;
//The turns of its march within which a unit is near enough the objective to be its line
const LINE_TURNS = 2;

/**
 * The line of the objectives to hold: the units that stand fast, pulled to no objective of the enemy's. For each
 * `hold` or `delay`, the infantry and anti-tank guns no operation holds nearest it, within LINE_TURNS of their
 * march, one for each LINE_STRENGTH of the enemy the side knows of within LINE_RADIUS of it. They stay where they
 * are, in their holes: moved up beside the objective they were lost in the open (docs/ai/arena.md, #638).
 */
export function standFast(w: World, view: SideView, cache: AnalysisCache, player: number, held: ReadonlySet<UnitId>,
	directives: readonly Directive[]): Set<UnitId> {
	const line = new Set<UnitId>(), free = freeGround(w, player, held).filter((u) => holdsLine(w, u));
	const apart = (u: UnitState, o: Position) => distance(u.row, u.col, o.row, o.col);
	for (const d of posturesOf(directives)) {
		const near = free.filter((u) => !line.has(u.id)).map((u) => ({ u, turns: turnsTo(w, cache, u, d.target) })).filter((x) => x.turns <= LINE_TURNS);
		near.sort((x, y) => x.turns - y.turns || apart(x.u, d.target) - apart(y.u, d.target) || x.u.id - y.u.id);
		for (const x of near.slice(0, Math.ceil(enemyNear(w, view, d.target) / LINE_STRENGTH))) line.add(x.u.id);
	}
	return line;
}

//Infantry and anti-tank guns hold a line; tanks and recon are the units that move
function holdsLine(w: World, u: UnitState): boolean {
	const uclass = unitData(w, u, true).uclass;
	return uclass === unitClass.infantry || uclass === unitClass.antiTank;
}

//The strength of the ground enemies the side knows of within LINE_RADIUS of the hex, each by its confidence in it
function enemyNear(w: World, view: SideView, at: Position): number {
	let strength = 0;
	for (const s of view.enemies)
		if (w.equipment[s.eqid].uclass <= unitClass.airDefence && distance(s.row, s.col, at.row, at.col) <= LINE_RADIUS) strength += s.strength * s.confidence;
	return strength;
}

const isStrike = (kind: string) => kind === "assault" || kind === "counterattack";

/**
 * The operations with one for the `assault` and for each `counterattack`, in the directives' order: the one going on
 * while the commander keeps its directive (the same object), a new one for a directive given anew, even on the same
 * hex: the commander weighed its sectors again, and so does the plan.
 */
export function withStrikes(ops: Operation[], directives: readonly Directive[]): Operation[] {
	const strikes = directives.filter((d) => isStrike(d.task)), going = ops.filter((op) => isStrike(op.kind));
	if (strikes.length === going.length && strikes.every((d, i) => going[i].directive === d)) return ops;
	return [...ops.filter((op) => !isStrike(op.kind)), ...strikes.map((d): Operation =>
		going.find((op) => op.directive === d) ?? { kind: d.task as OperationKind, at: d.target, units: [], until: d.until, reason: d.reason, directive: d })];
}

//The unit on the objective, if it is the player's; else the best that can get there in time. Null when another unit
//of the side stands on it
function garrisonFor(w: World, player: number, at: Position, held: ReadonlySet<UnitId>, reserve: ReadonlySet<UnitId>): UnitState | null {
	const on = groundUnitAt(w, hexIndex(w, at.row, at.col));
	if (on !== null) return on.owner === player && !held.has(on.id) ? on : null;
	return bestGarrison(w, player, at, held, reserve);
}

//The best of the player's mobile ground units that can get to the objective in time: strong, near, infantry or
//anti-tank first, one of the reserve before another as good
function bestGarrison(w: World, player: number, at: Position, held: ReadonlySet<UnitId>, reserve: ReadonlySet<UnitId>): UnitState | null {
	let best: UnitState | null = null, bestScore = -Infinity;
	for (const u of w.state.units) {
		const d = distance(u.row, u.col, at.row, at.col);
		if (!isFree(u, player, held) || !canGarrison(w, u) || d > GARRISON_TURNS * marchOf(w, u)) continue;
		const score = garrisonScore(w, u, d) + (reserve.has(u.id) ? RESERVE_FIRST : 0);
		if (score > bestScore) {
			best = u;
			bestScore = score;
		}
	}
	return best;
}

/** A unit of the player's on the map that no operation holds and that can still move this turn. */
export const isFree = (u: UnitState, player: number, held: ReadonlySet<UnitId>) => u.owner === player && u.row >= 0 && !held.has(u.id)
	&& !u.hasMoved;

//The ground units that fight for a hex: not artillery, air defence or transports, which can't hold one
function canGarrison(w: World, u: UnitState): boolean {
	const uclass = unitData(w, u, true).uclass;
	return isGround(w, u) && (uclass === unitClass.infantry || uclass === unitClass.antiTank || uclass === unitClass.tank
		|| uclass === unitClass.recon);
}

//The hexes a unit marches a turn: in its transport when it has one
function marchOf(w: World, u: UnitState): number {
	const own = unitData(w, u, true).movpoints;
	return u.transport === null ? own : Math.max(own, w.equipment[u.transport.eqid].movpoints);
}

function garrisonScore(w: World, u: UnitState, hexes: number): number {
	const uclass = unitData(w, u, true).uclass;
	const preferred = uclass === unitClass.infantry || uclass === unitClass.antiTank ? PREFERRED : 0;
	return (hexes === 0 ? ON_IT : 0) + preferred + u.strength - PER_HEX * hexes;
}

/**
 * The next march of a garrison not yet on its objective: onto it, else as near as its move takes it, in its
 * transport when that goes further (a mount, then the move). Null when no garrison has a move to make.
 */
export function garrisonMarch(w: World, ops: readonly Operation[], rides: Rides): Command[] | null {
	for (const op of ops) {
		if (op.kind !== "garrison") continue;
		const u = unitById(w, op.units[0]);
		if (u === null || isOn(u, op.at) || u.hasMoved) continue;
		const march = marchTo(w, u, op.at, rides);
		if (march !== null) return march;
	}
	return null;
}

//The move nearest the objective, if it brings the unit nearer; the mount first when it rides
function marchTo(w: World, u: UnitState, at: Position, rides: Rides): Command[] | null {
	const way = wayTo(w, u, at, rides);
	if (way === null || distanceTo(way.cell, at) >= distance(u.row, u.col, at.row, at.col)) return null;
	const move: Command = { type: "move", unit: u.id, to: { row: way.cell.row, col: way.cell.col } };
	const first: Command = way.ride ? { type: "mount", unit: u.id } : move;
	if (check(w, first) !== null) return null;
	return way.ride ? [first, move] : [move];
}

//The hex nearest the objective the unit can stop on, on foot or in its transport when that goes nearer
function wayTo(w: World, u: UnitState, at: Position, rides: Rides): { cell: MoveCell; ride: boolean } | null {
	const onFoot = nearestCell(moveRange(w, u), at);
	const mounted = canMount(w, u) && !u.isMounted ? nearestCell(mountedCells(w, u, rides), at) : null;
	if (mounted !== null && (onFoot === null || distanceTo(mounted, at) < distanceTo(onFoot, at))) return { cell: mounted, ride: true };
	return onFoot === null ? null : { cell: onFoot, ride: false };
}

const distanceTo = (c: Position, at: Position) => distance(c.row, c.col, at.row, at.col);

//The hex a unit can stop on nearest the objective, the cheapest of equally near ones
function nearestCell(cells: readonly MoveCell[], at: Position): MoveCell | null {
	let best: MoveCell | null = null;
	for (const c of cells) {
		if (!c.canMove) continue;
		if (best === null || distanceTo(c, at) < distanceTo(best, at) || (distanceTo(c, at) === distanceTo(best, at) && c.cost < best.cost))
			best = c;
	}
	return best;
}

/** Whether a move on the unit's transport may end on the cell. */
export type Rides = (u: UnitState, cell: Position) => boolean;

//The hexes its transport takes it to where it may end the ride (`rides`), and not next to an enemy the side sees: it
//would stand there in its truck
function mountedCells(w: World, u: UnitState, rides: Rides): MoveCell[] {
	return moveRange(w, { ...u, isMounted: true }).filter((c) => !nextToSeenEnemy(w, u, c) && rides(u, c));
}

//The units that stand where they are for their operation: a garrison on its objective, the reserve
function standing(w: World, ops: readonly Operation[]): UnitState[] {
	const out: UnitState[] = [];
	for (const op of ops) {
		if (op.kind !== "garrison" && op.kind !== "reserve") continue;
		for (const id of op.units) {
			const u = unitById(w, id);
			if (u !== null && (op.kind === "reserve" || isOn(u, op.at))) out.push(u);
		}
	}
	return out;
}

/**
 * The fire of a garrison from its objective or of a reserve unit from where it waits, without a move: the attack the
 * estimate gives most kills over losses, when it gives more kills than losses and the support fire doesn't stop it.
 * Null when none has one.
 */
export function garrisonFire(w: World, ops: readonly Operation[]): Command | null {
	for (const u of standing(w, ops)) {
		const target = bestTarget(w, u);
		if (target === null) continue;
		const attack: Command = { type: "attack", unit: u.id, target: target.id };
		if (check(w, attack) === null) return attack;
	}
	return null;
}

function bestTarget(w: World, u: UnitState): UnitState | null {
	let best: UnitState | null = null, bestGain = 0;
	for (const c of attackCells(w, u)) {
		const hex = hexIndex(w, c.row, c.col);
		for (const air of [false, true]) {
			const t = attackableUnit(w, u, hex, air);
			if (t === null) continue;
			const e = estimateAttack(w, u, t);
			const gain = e.result.kills - e.result.losses;
			if (!e.stopped && gain > bestGain) {
				best = t;
				bestGain = gain;
			}
		}
	}
	return best;
}

/**
 * The supply of a garrison on its objective, or of a reserve unit, once it has nothing to fire at: reinforced when
 * worn down and the player can pay for a point, else resupplied when short of ammo or fuel. `tried`: the units
 * already given one this turn.
 */
export function garrisonSupply(w: World, ops: readonly Operation[], tried: Set<UnitId>): Command | null {
	for (const u of standing(w, ops)) {
		if (tried.has(u.id) || u.hasFired) continue;
		const cmd = supplyOf(w, u);
		if (cmd === null) continue;
		tried.add(u.id);
		return cmd;
	}
	return null;
}

function supplyOf(w: World, u: UnitState): Command | null {
	const reinforce: Command = { type: "reinforce", unit: u.id };
	if (u.strength < REINFORCE_BELOW && w.state.players[u.owner].prestige >= costPerStrength(w, u) && check(w, reinforce) === null)
		return reinforce;
	const own = unitData(w, u, true), resupply: Command = { type: "resupply", unit: u.id };
	const short = u.ammo < own.ammo || (unitUsesFuel(w, u) && u.fuel < own.fuel);
	return short && check(w, resupply) === null ? resupply : null;
}

/**
 * The move onto an objective to take that the side's attack has left empty, by the player's ground unit that reaches
 * it this turn and can capture it, infantry first, then the strongest, then the nearest; and the operation that holds
 * the unit for the rest of the turn. Null when the hex isn't such an objective or none can.
 */
export function occupation(w: World, player: number, at: Position, held: ReadonlySet<UnitId>): { op: Operation; move: Command } | null {
	const side = w.state.players[player].side;
	if (groundUnitAt(w, hexIndex(w, at.row, at.col)) !== null || !w.state.objectives[side].some((o) => samePosition(o, at))) return null;
	const u = occupier(w, player, at, held);
	if (u === null) return null;
	const move: Command = { type: "move", unit: u.id, to: { row: at.row, col: at.col } };
	if (check(w, move) !== null) return null;
	const reason = `occupy ${at.row},${at.col}: emptied by our attack`;
	return { op: { kind: "occupy", at, units: [u.id], until: w.state.turn.turn, reason }, move };
}

//An infantry first, then a strength point is worth more than any difference in the move's cost
const INFANTRY_FIRST = 1000;
const PER_STRENGTH = 10;

function occupier(w: World, player: number, at: Position, held: ReadonlySet<UnitId>): UnitState | null {
	let best: { u: UnitState; score: number } | null = null;
	for (const u of w.state.units) {
		const cell = canOccupy(w, u, player, held, at) ? moveRange(w, u).find((c) => c.canMove && samePosition(c, at)) : undefined;
		if (cell === undefined) continue;
		const score = (unitData(w, u).uclass === unitClass.infantry ? INFANTRY_FIRST : 0) + u.strength * PER_STRENGTH - cell.cost;
		if (best === null || score > best.score) best = { u, score };
	}
	return best === null ? null : best.u;
}

const canOccupy = (w: World, u: UnitState, player: number, held: ReadonlySet<UnitId>, at: Position) => isFree(u, player, held)
	&& isGround(w, u) && canCapture(w, u) && distance(u.row, u.col, at.row, at.col) <= unitMoveRange(w, u);
