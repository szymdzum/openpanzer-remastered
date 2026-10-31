/**
 * The remastered AI's staff: operations that hold units over turns, a garrison on each of the side's objectives in
 * the enemy's reach (#5), a unit onto an objective to take that the side's attack has just emptied (#312).
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
import type { SideView } from "./perception";

/** An operation's task: hold an objective of the side's (#5), take one it emptied (#312), assault one (#618). */
export type OperationKind = "garrison" | "occupy" | "assault";

/** An operation of the staff: what it does and where, the units it holds, the last turn it holds them, and why. */
export interface Operation {
	kind: OperationKind;
	at: Position;
	units: UnitId[];
	until: number;
	reason: string;
}

/** An objective of the side's the enemy can reach soon, and why the staff thinks so. */
export interface ThreatenedObjective {
	at: Position;
	reason: string;
}

//The turns of the enemy's moves within which an objective needs a garrison: one could be there before it otherwise
const GARRISON_TURNS = 2;
//The turns after the first a garrison holds its unit; then the staff weighs the objective again, the enemy has moved
const GARRISON_HOLD = 2;
//A unit already on the objective is worth this much more than one that has to march there
const ON_IT = 20;
//Infantry and anti-tank guns hold a hex best: worth this much more than a tank or a recon as a garrison
const PREFERRED = 3;
//Each hex further from the objective costs a candidate this much of its strength: nearer arrives sooner (the
//scripted general's STRENGTH_PER_HEX)
const PER_HEX = 3;
//A garrison with nothing to fire at is reinforced below this strength: it holds the line where the enemy comes
const REINFORCE_BELOW = 8;

const samePosition = (a: Position, b: Position) => a.row === b.row && a.col === b.col;

const isOn = (u: UnitState, at: Position) => u.row === at.row && u.col === at.col;

/** The side's objectives a ground enemy it knows of (seen or remembered, #17) can reach within GARRISON_TURNS moves. */
export function threatenedObjectives(w: World, view: SideView, held: readonly Position[]): ThreatenedObjective[] {
	const out: ThreatenedObjective[] = [];
	for (const at of held) {
		let nearest = Infinity;
		for (const s of view.enemies) {
			if (w.equipment[s.eqid].uclass > unitClass.airDefence) continue;
			const d = distance(at.row, at.col, s.row, s.col);
			if (d <= GARRISON_TURNS * w.equipment[s.moving].movpoints && d < nearest) nearest = d;
		}
		if (nearest !== Infinity) out.push({ at, reason: `garrison ${at.row},${at.col}: enemy ${nearest} ${nearest === 1 ? "hex" : "hexes"} away` });
	}
	return out;
}

const isAlive = (w: World, id: UnitId) => {
	const u = unitById(w, id);
	return u !== null && u.row >= 0 && !w.destroyed.has(id);
};

/**
 * The operations that go on: their units alive, their deadline not passed, a garrison's objective still the side's
 * and still threatened.
 */
export function liveOperations(w: World, side: number, ops: readonly Operation[], threats: readonly ThreatenedObjective[]): Operation[] {
	const turn = w.state.turn.turn;
	return ops.filter((op) => turn <= op.until && op.units.every((id) => isAlive(w, id))
		&& (op.kind !== "garrison" || (heldBy(w, op.at) === side && threats.some((t) => samePosition(t.at, op.at)))));
}

//The side holding a victory hex, -1 for none
function heldBy(w: World, at: Position): number {
	const owner = w.state.map.hexes[hexIndex(w, at.row, at.col)].owner;
	return owner < 0 ? -1 : w.state.players[owner].side;
}

/** The units the operations hold: the classic plan leaves them out. */
export function heldUnits(ops: readonly Operation[]): Set<UnitId> {
	const held = new Set<UnitId>();
	for (const op of ops) for (const id of op.units) held.add(id);
	return held;
}

/** A garrison for each threatened objective that has none, the operations given first. */
export function withGarrisons(w: World, player: number, ops: readonly Operation[], threats: readonly ThreatenedObjective[]): Operation[] {
	const out = [...ops], held = heldUnits(ops), turn = w.state.turn.turn;
	for (const t of threats) {
		if (out.some((op) => op.kind === "garrison" && samePosition(op.at, t.at))) continue;
		const u = garrisonFor(w, player, t.at, held);
		if (u === null) continue;
		held.add(u.id);
		out.push({ kind: "garrison", at: t.at, units: [u.id], until: turn + GARRISON_HOLD, reason: t.reason });
	}
	return out;
}

//The unit on the objective, if it is the player's; else the best of the player's mobile ground units that can get
//there in time: strong, near, infantry or anti-tank first. Null when another unit of the side stands on it
function garrisonFor(w: World, player: number, at: Position, held: ReadonlySet<UnitId>): UnitState | null {
	const on = groundUnitAt(w, hexIndex(w, at.row, at.col));
	if (on !== null) return on.owner === player && !held.has(on.id) ? on : null;
	let best: UnitState | null = null, bestScore = -Infinity;
	for (const u of w.state.units) {
		const d = distance(u.row, u.col, at.row, at.col);
		if (!isFree(u, player, held) || !canGarrison(w, u) || d > GARRISON_TURNS * marchOf(w, u)) continue;
		const score = garrisonScore(w, u, d);
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

/**
 * A garrison's fire from its objective, without a move: the attack the estimate gives most kills over losses, when
 * it gives more kills than losses and the support fire doesn't stop it. Null when no garrison has one.
 */
export function garrisonFire(w: World, ops: readonly Operation[]): Command | null {
	for (const op of ops) {
		const u = op.kind === "garrison" ? unitById(w, op.units[0]) : null;
		if (u === null || !isOn(u, op.at)) continue;
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
 * A garrison's supply on its objective once it has nothing to fire at: reinforced when worn down and the player can
 * pay for a point, else resupplied when short of ammo or fuel. `tried`: the garrisons already given one this turn.
 */
export function garrisonSupply(w: World, ops: readonly Operation[], tried: Set<UnitId>): Command | null {
	for (const op of ops) {
		const u = op.kind === "garrison" ? unitById(w, op.units[0]) : null;
		if (u === null || !isOn(u, op.at) || tried.has(u.id) || u.hasFired) continue;
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
