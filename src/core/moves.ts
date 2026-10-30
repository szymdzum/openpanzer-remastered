/**
 * A unit moving (Map.moveUnit, Unit.move, Map.captureHex): along its path until a hidden enemy stops it,
 * what it pays, the hex it takes, the undo it leaves.
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

import { leaderType, playerType, prestigeGains, scoreGains } from "./tables";
import { addScore, changeUnit, emit, playerAt, relocate, writeHex, writeObjectives, writePlayer, writeUnit } from "./draft";
import type { PathStep } from "./events";
import { directionTo } from "./geometry";
import { canPassInto, disembarkPositions, movesInPhases, pathTo, shortestPath, terrainCost, unitMoveRange } from "./movement";
import type { Draft, HexState, PathCell, Position, UndoState, UnitId, UnitState, World } from "./types";
import { winsByCapture } from "./turn";
import { canCapture, hasLeader, unitUsesFuel, usesFuel } from "./units";
import { hexIndex, isRiding, isSpotted, unitById } from "./world";
import { fuelPerPoint } from "./weathereffects";

/** What a move came to: the hex a hidden enemy stopped it before (null: none), and whether it won by capture. */
export interface MoveOutcome {
	surprise: Position | null;
	win: boolean;
}

type MoveCells = readonly { row: number; col: number; cost: number }[];

/**
 * Map.moveUnit: moves a unit along the cheapest path through `cells` (the cells the player was shown; its
 * move range when null). It stops before a hidden enemy (surprised, unless a leader sees it coming), takes
 * the hex at the end, pays the path's cost, faces where it went and spots. A human's move can be undone
 * when it spotted nothing new and wasn't surprised (D5); a retreat never can: its player didn't make it.
 */
export function moveUnit(d: Draft, id: UnitId, to: Position, cells: MoveCells | null, retreat = false): MoveOutcome {
	const start = unitById(d, id);
	const path = cells !== null ? shortestPath(start, to, cells) : pathTo(d, start, to);
	if (path.length === 0) return { surprise: null, win: false };
	const undoable = !retreat && playerAt(d, start.owner).type === playerType.humanLocal;
	const undo: UndoState | null = undoable ? newUndo(start) : null;
	const capturer = canCapture(d, start);
	const walked = walk(d, start, path);
	const last = walked.passed[walked.passed.length - 1];
	const visible = walked.passed.some((c) => c.visible);
	emit(d, retreat ? { type: "retreated", unit: id, from: { row: start.row, col: start.col }, to: { row: last.row, col: last.col },
		path: walked.passed, visible } : { type: "moved", unit: id, path: walked.passed, cost: walked.cost, visible });

	const win = last.row === to.row && last.col === to.col && capturer ? capture(d, id, last, undo) : false;
	payMove(d, writeUnit(d, id), walked.cost, walked.stopped);
	const spotted = relocate(d, id, last, (u) => { u.facing = directionTo(start.row, start.col, last.row, last.col); });
	if (walked.surprise !== null) emit(d, { type: "surprised", unit: id, at: walked.surprise });
	d.state.turn.undoable = spotted.length === 0 && !unitById(d, id).isSurprised && undoable ? undo : null;
	return { surprise: walked.surprise, win };
}

//A path cost from this one up stops the move: a hex that uses all the points, or a zone of control.
const STOP = 254;

//Stops at a hex it can't pass (an enemy it didn't see). A step shows where the enemy sees it; a human's
//and the scripted opponent's always.
function walk(d: Draft, u: UnitState, path: PathCell[]): { passed: PathStep[]; cost: number; stopped: boolean; surprise: Position | null } {
	const player = playerAt(d, u.owner);
	const seen = player.type === playerType.humanLocal || player.type === playerType.aiScripted;
	const passed: PathStep[] = [];
	let surprise: Position | null = null;
	for (let i = 0; i < path.length; i++) {
		const c = path[i];
		if (i > 0 && !canPassInto(d, u, c)) {
			surprise = surprised(d, u, c);
			break;
		}
		passed.push({ row: c.row, col: c.col, visible: seen || isSpotted(d, hexIndex(d, c.row, c.col), ~player.side & 1) });
	}
	return { passed, ...pathCost(d, u, path.slice(0, passed.length)), surprise };
}

function pathCost(d: Draft, u: UnitState, path: PathCell[]): { cost: number; stopped: boolean } {
	let cost = 0, stopped = false;
	for (let i = 1; i < path.length; i++) {
		stopped = path[i].cost >= STOP;
		cost += stopped ? stopCost(d, u, path[i], cost) : path[i].cost;
	}
	//(NaN from a path whose cells have no cost: a retreat)
	return { cost: !cost || cost < 0 ? 0 : cost, stopped };
}

//What a hex that stops the move costs after the path's cost before it: a hex that uses all the points (an A of
//the tables: a mountain, a river) all those left, a hex in a zone of control its terrain. Deliberate (#214).
function stopCost(d: Draft, u: UnitState, c: PathCell, before: number): number {
	const terrain = terrainCost(d, u, c);
	return terrain >= STOP ? Math.max(unitMoveRange(d, u) - before, 1) : terrain;
}

//A unit stopped by an enemy it didn't see is surprised, unless its leader sees the enemy coming
function surprised(d: Draft, u: UnitState, at: Position): Position | null {
	if (hasLeader(d, u, leaderType.battlefieldIntelligence) || hasLeader(d, u, leaderType.skilledAssault)) return null;
	writeUnit(d, u.id).isSurprised = true;
	return { row: at.row, col: at.col };
}

//UndoSlot.save: the unit as it is, but tempSpotted, which the saved copy doesn't take (Unit.copy).
function newUndo(u: UnitState): UndoState {
	return { unit: u.id, before: { ...u, transport: u.transport === null ? null : { ...u.transport }, tempSpotted: false },
		oldOwner: null, oldFlag: null, oldVictorySide: null, prestigeGain: 0, scoreGain: 0 };
}

//Unit.move: a transport uses all its points and can't fire after; so does a hex that stops the move (#214).
//A unit that moves in phases (recon) with points left can move again; a unit leaving its carrier is off it for good.
function payMove(d: Draft, u: UnitState, cost: number, stopped: boolean) {
	u.entrenchment = 0;
	burn(d, u, cost);
	if (stopped) u.moveLeft = 0;
	if (!movesInPhases(d, u) || u.moveLeft <= 0) {
		u.hasMoved = true;
		u.hasOverstrength = true;
	}
	if (u.carrier < 0) u.carrier = 0;
}

//A transport's fuel and all its points (it can't fire after), or the unit's own (no fuel on a carrier).
function burn(d: Draft, u: UnitState, used: number) {
	const fuel = used * fuelPerPoint(d, u);
	if (isRiding(u)) {
		u.hasFired = true;
		if (usesFuel(d.equipment[u.transport.eqid])) u.transport.fuel -= fuel;
		u.moveLeft = 0;
	} else {
		if (unitUsesFuel(d, u) && u.carrier === 0) u.fuel -= fuel;
		u.moveLeft -= used;
	}
}

//Map.captureHex: a hex with an owner or a flag not of the unit's side becomes its player's, a flag (not an
//objective) and an objective give prestige (twice with a liberator) and score, an objective leaves the side's
//list. What changed goes in undo. Whether the side won: no objective left (and in the remaster rules some
//to take at the start, #91).
function capture(d: Draft, id: UnitId, at: Position, undo: UndoState | null): boolean {
	const hex = hexIndex(d, at.row, at.col), h = d.state.map.hexes[hex], u = unitById(d, id);
	const player = playerAt(d, u.owner);
	if (!canTake(d, hex, player.side)) return false;
	const flag = h.flag !== -1 && h.victorySide === -1, objective = h.victorySide !== -1;
	const old = undoFields(h);
	const w = writeHex(d, hex);
	w.owner = player.id;
	if (w.flag !== -1) w.flag = player.country;
	if (objective) w.victorySide = ~player.side & 1; //now the enemy's to take back
	const index = d.state.objectives[player.side].findIndex((c) => c.row === at.row && c.col === at.col);
	const win = objective && updateVictorySides(d, player.side, at) && winsByCapture(d, player.side);
	const taken = gains(flag, objective, hasLeader(d, u, leaderType.liberator) ? 2 : 1);
	if (undo !== null) recordCapture(undo, old, taken, objective, index);
	writePlayer(d, player.id).prestige += taken.prestige;
	addScore(d, player.id, taken.score);
	emit(d, { type: "captured", unit: id, at: { row: at.row, col: at.col }, flag, objective, ...taken, win });
	return win;
}

//What a capture changed, for the undo: the hex, the gains, and where an objective was in its side's list.
function recordCapture(undo: UndoState, old: ReturnType<typeof undoFields>, taken: ReturnType<typeof gains>, objective: boolean,
	index: number) {
	Object.assign(undo, old, { prestigeGain: taken.prestige, scoreGain: taken.score });
	if (objective && index >= 0) undo.objectiveIndex = index;
}

function undoFields(h: HexState): Pick<UndoState, "oldOwner" | "oldFlag" | "oldVictorySide"> {
	return { oldOwner: h.owner, oldFlag: h.flag !== -1 ? h.flag : null, oldVictorySide: h.victorySide !== -1 ? h.victorySide : null };
}

function canTake(w: World, hex: number, side: number): boolean {
	const h = w.state.map.hexes[hex];
	if (h.owner === -1) return h.flag !== -1;
	return playerAt(w, h.owner).side !== side;
}

/** What u would take by ending its move on a hex, as capture() takes it; null when nothing. */
export function captureAt(w: World, u: UnitState, at: Position): { flag: boolean; objective: boolean; prestige: number } | null {
	const hex = hexIndex(w, at.row, at.col), h = w.state.map.hexes[hex];
	if (!canCapture(w, u) || !canTake(w, hex, playerAt(w, u.owner).side)) return null;
	const flag = h.flag !== -1 && h.victorySide === -1, objective = h.victorySide !== -1;
	return { flag, objective, prestige: gains(flag, objective, hasLeader(w, u, leaderType.liberator) ? 2 : 1).prestige };
}

function gains(flag: boolean, objective: boolean, times: number): { prestige: number; score: number } {
	return {
		prestige: (flag ? prestigeGains.flagCapture * times : 0) + (objective ? prestigeGains.objectiveCapture * times : 0),
		score: (flag ? scoreGains.flagCapture : 0) + (objective ? scoreGains.objectiveCapture : 0),
	};
}

/** Map.updateVictorySides: the hex moves to the end of the other side's objectives. Whether side has none left. */
export function updateVictorySides(d: Draft, side: number, cell: Position): boolean {
	const own = writeObjectives(d, side);
	let removed = 0;
	for (let i = own.length - 1; i >= 0; i--)
		if (own[i].row === cell.row && own[i].col === cell.col) {
			own.splice(i, 1);
			removed++;
		}
	if (removed > 0) writeObjectives(d, ~side & 1).push({ row: cell.row, col: cell.col });
	return own.length === 0;
}

/**
 * What selecting a unit of the player whose turn it is does to it (MapSelection.select): a unit leaving its
 * carrier gets back on it unless it can still land somewhere. The selection itself is the UI's (D6).
 */
export function reselect(d: Draft, id: UnitId) {
	const u = unitById(d, id);
	if (playerAt(d, u.owner).id !== d.state.turn.currentPlayer || u.carrier >= 0) return;
	changeUnit(d, id, (x) => { x.carrier = -x.carrier; });
	if (disembarkPositions(d, unitById(d, id)).length > 0) changeUnit(d, id, (x) => { x.carrier = -x.carrier; });
}
