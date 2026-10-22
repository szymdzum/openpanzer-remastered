/**
 * Movement - where a unit can go and the path it takes, where it retreats, deploys, embarks and
 * disembarks
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

import { embarkType, leaderType, movMethod, roadType, terrainType, unitClass } from "../prototypes";
import { isBridge } from "./equipment";
import { adjacent, cellsInRange, distance, facingToAdjacentIndex, isAdjacent, isPartialEdge } from "./geometry";
import { moveCosts } from "./rules";
import type { MoveCell, PathCell, Position, UnitState, World } from "./types";
import { hasLeader, isAir, isGround, isSea, isTrain, unitUsesFuel } from "./units";
import {
	airUnitAt, fuelOf, groundUnitAt, hexIndex, isSpotted, isZOC, movesLeft, onMap, playerOf, sideOf, unitData
} from "./world";

//The road column of the movement tables, after the terrains
const ROAD = 17;
//Costs from this one up stop the move (254) or can't be entered (255)
const STOP = 254;
const NO_ENTRY = 255;
//The neighbours of geometry.ts's adjacent(), as offsets: an odd column's side neighbours are a row lower
const NEAR_COL = [0, -1, -1, 0, 1, 1];
const NEAR_ROW = [-1, -1, 0, 1, 0, -1];

//The movement costs of what the unit currently is (eqid: of that equipment instead)
function costsOf(w: World, movmethod: number): number[] {
	return moveCosts(w.rules, w.state.scenario.ground, movmethod);
}

//The most hexes a unit can move, terrain aside: its moves left, no more than its fuel, the leaders'
//extra hex. A towed gun without transport (not a fortification) moves 1
export function unitMoveRange(w: World, u: UnitState): number {
	let range = movesLeft(w, u);
	const ud = unitData(w, u);
	if (unitUsesFuel(w, u) && fuelOf(u) < range) range = fuelOf(u);
	if (hasLeader(w, u, leaderType.aggressiveTankManeuver)) range += 1;
	if (hasLeader(w, u, leaderType.aggressiveManeuver)) range += 1;
	if (ud.movmethod === movMethod.towed && u.transport === null && range === 0 && ud.uclass !== unitClass.fortification)
		range = 1;
	return range;
}

//Whether u can end its move on a hex: nothing of its kind (ground and naval, or air) there
export function canMoveInto(w: World, u: UnitState, cell: Position): boolean {
	const hex = hexIndex(w, cell.row, cell.col);
	if ((isGround(w, u) || isSea(w, u)) && groundUnitAt(w, hex) === null) return true;
	return isAir(w, u) && airUnitAt(w, hex) === null;
}

//Whether u can pass through a hex: nothing of its kind there, or a unit of its side
export function canPassInto(w: World, u: UnitState, cell: Position): boolean {
	const hex = hexIndex(w, cell.row, cell.col), side = sideOf(w, u);
	if (isGround(w, u) || isSea(w, u)) {
		const other = groundUnitAt(w, hex);
		if (other === null || sideOf(w, other) === side) return true;
	}
	if (isAir(w, u)) {
		const other = airUnitAt(w, hex);
		if (other === null || sideOf(w, other) === side) return true;
	}
	return false;
}

//A bridge unit (not mounted) on a river or stream is a road for its side
export function isBridgeForSide(w: World, hex: number, side: number): boolean {
	const terrain = w.data.hexes[hex].terrain;
	if (terrain !== terrainType.River && terrain !== terrainType.Stream) return false;
	const bridge = groundUnitAt(w, hex);
	if (bridge === null || bridge.isMounted || sideOf(w, bridge) !== side) return false;
	return isBridge(w.equipment, bridge.eqid);
}

//Whether a hex blocks sight of what's on it: it isn't spotted, and its unit (ground or air, as
//asked) didn't fire from hiding
function seen(w: World, hex: number, side: number, unit: UnitState | null): boolean {
	return isSpotted(w, hex, side) || (unit !== null && unit.tempSpotted);
}

//The hexes a unit can move to or pass through (GameRules.getMoveRange), in the order of
//cellsInRange, then its own hex. The range expands ring by ring: a hex's entry cost (cin) is the
//exit cost (cout) of a neighbour one ring nearer, its exit cost the entry plus the terrain cost,
//lowered when another neighbour is cheaper. An enemy zone of control the unit's side sees stops it
//(254). An air unit moves anywhere in range at cost 1. The order of the updates is the old
//engine's, list order, so a tie resolves as it did
export function moveRange(w: World, u: UnitState): MoveCell[] {
	if (u.hasMoved) return [];
	const { rows, cols, lastRowPartial, lastColPartial } = w.state.map;
	const range = unitMoveRange(w, u);
	const side = sideOf(w, u);

	const c: MoveCell[] = [];
	for (const p of cellsInRange(u.row, u.col, range, rows, cols))
		if (!isPartialEdge(p.row, p.col, rows, cols, lastRowPartial, lastColPartial))
			c.push(moveCell(p.row, p.col, distance(u.row, u.col, p.row, p.col)));

	if (isAir(w, u)) {
		const allowed: MoveCell[] = [];
		for (const cell of c) {
			const hex = hexIndex(w, cell.row, cell.col);
			if (seen(w, hex, side, airUnitAt(w, hex)) && !canMoveInto(w, u, cell)) continue;
			cell.canMove = true;
			cell.cost = 1; //no terrain cost in the air
			allowed.push(cell);
		}
		return allowed;
	}

	c.push(moveCell(u.row, u.col, 0));
	expand(w, u, c, range, side);
	return c.filter((cell) => cell.canPass || cell.canMove);
}

function moveCell(row: number, col: number, range: number): MoveCell {
	return { row, col, range, cin: 0, cout: 0, cost: 0, canMove: false, canPass: false };
}

//The costs, ring by ring (moveRange): for each cell of ring r in list order, its neighbours of ring
//r and beyond in list order. A neighbour is found through w.scratch, hex -> cell index + 1
function expand(w: World, u: UnitState, c: MoveCell[], range: number, side: number) {
	const cols = w.state.map.cols;
	const slot = scratch(w);
	for (let i = 0; i < c.length; i++) slot[c[i].row * cols + c[i].col] = i + 1;

	const s: StepRules = { costs: costsOf(w, unitData(w, u).movmethod), train: isTrain(w, u), side, enemySide: ~side & 1, range };
	const near: number[] = [];
	try {
		for (let r = 0; r <= range; r++)
			for (const from of c) {
				if (from.range !== r) continue;
				neighbours(w, from, slot, near);
				for (const j of near) {
					const to = c[j];
					if (to.range < r) continue; //(not always right: a path can turn back)
					step(w, u, from, to, s);
				}
			}
	} finally {
		for (const cell of c) slot[cell.row * cols + cell.col] = 0;
	}
}

interface StepRules {
	costs: number[];
	train: boolean;
	side: number;
	enemySide: number;
	range: number;
}

//What entering to from from costs, and whether u can stop on it or pass through
function step(w: World, u: UnitState, from: MoveCell, to: MoveCell, s: StepRules) {
	const hex = hexIndex(w, to.row, to.col);
	const visible = seen(w, hex, s.side, groundUnitAt(w, hex));
	to.cost = enterCost(w, hex, s);
	if (visible && to.cost < STOP && isZOC(w, hex, s.enemySide))
		to.cost = STOP;
	relax(from, to);
	if (to.cout <= s.range || (to.cost <= STOP && to.cin <= s.range)) reach(w, u, to, visible);
}

//A hex in reach: u passes through it if friendly units let it, stops on it unless it sees it taken
function reach(w: World, u: UnitState, to: MoveCell, visible: boolean) {
	if (canPassInto(w, u, to)) to.canPass = true;
	if (!visible || canMoveInto(w, u, to)) to.canMove = true;
}

//The terrain's cost, or the road's: trains can't use roads, bridges are roads for their side
function enterCost(w: World, hex: number, s: StepRules): number {
	const road = (!s.train && w.data.hexes[hex].road > roadType.none) || isBridgeForSide(w, hex, s.side);
	return s.costs[road ? ROAD : w.data.hexes[hex].terrain];
}

//The entry and exit costs of to, entered from from: set the first time, lowered when from is cheaper
function relax(from: MoveCell, to: MoveCell) {
	if (to.cin === 0) to.cin = from.cout;
	if (to.cout === 0) to.cout = to.cin + to.cost;
	if (to.cin > from.cout && to.cost <= STOP) {
		to.cin = from.cout;
		to.cout = to.cin + to.cost;
	}
}

//The hex -> cell table of the move range, all 0, kept on the world for the next call
function scratch(w: World): Int32Array {
	const size = w.state.map.rows * w.state.map.cols;
	if (w.scratch === null || w.scratch.length !== size) w.scratch = new Int32Array(size);
	return w.scratch;
}

//The cell indexes of from's neighbours in the range, ascending (the order the old engine visits them)
function neighbours(w: World, from: MoveCell, slot: Int32Array, out: number[]) {
	out.length = 0;
	const { rows, cols } = w.state.map;
	const odd = from.col % 2;
	for (let n = 0; n < 6; n++) { //adjacent()'s six, without making them
		const col = from.col + NEAR_COL[n];
		const row = from.row + NEAR_ROW[n] + (NEAR_COL[n] === 0 ? 0 : odd);
		if (row >= 0 && row < rows && col >= 0 && col < cols && slot[row * cols + col] > 0)
			insertSorted(out, slot[row * cols + col] - 1);
	}
}

function insertSorted(list: number[], n: number) {
	let k = list.length;
	list.push(n);
	while (k > 0 && list[k - 1] > n) {
		list[k] = list[k - 1];
		k--;
	}
	list[k] = n;
}

//A cell of the path search: the cost of entering it, the cheapest cost found to reach it, and from where
interface PathNode {
	row: number;
	col: number;
	cost: number;
	dist: number;
	prev: PathNode | null;
}

//The cheapest path from start to end through cells (GameRules.getShortestPath), start included,
//[] when there is none. Each cell costs what entering it costs; the start keeps cost 1 (kept bug
//#70: a move pays one point more than its range shows). Of cells as near, the last in the list is
//taken first: the path's tie-breaks are the old engine's
export function shortestPath(start: Position, end: Position, cells: readonly { row: number; col: number; cost: number }[]): PathCell[] {
	const first: PathNode = { row: start.row, col: start.col, cost: 1, dist: 0, prev: null };
	first.prev = first;
	const open: PathNode[] = [first];
	for (const c of cells) open.push({ row: c.row, col: c.col, cost: c.cost, dist: Infinity, prev: null });

	while (open.length > 0) {
		const idx = nearest(open);
		const near = open[idx];
		if (near.dist === Infinity) return [];
		for (const n of open)
			if (isAdjacent(near.row, near.col, n.row, n.col) && (n.dist === Infinity || near.dist + near.cost < n.dist)) {
				n.dist = near.dist + near.cost;
				n.prev = near;
			}
		if (near.row === end.row && near.col === end.col) return backtrack(near, start);
		open.splice(idx, 1);
	}
	return [];
}

//The index of the nearest node, the last of equally near ones; 0 when none is reached
function nearest(open: PathNode[]): number {
	let idx = 0;
	for (let i = 1; i < open.length; i++)
		if (open[i].dist !== Infinity && open[i].dist <= open[idx].dist) idx = i;
	return idx;
}

//The path to node, back to the start
function backtrack(node: PathNode, start: Position): PathCell[] {
	const path: PathCell[] = [];
	for (let t = node; ; t = t.prev) {
		path.unshift({ row: t.row, col: t.col, cost: t.cost, dist: t.dist });
		if (t.row === start.row && t.col === start.col) return path;
	}
}

//The path to a cell of the move range, [] when there is none
export function pathTo(w: World, u: UnitState, cell: Position): PathCell[] {
	return shortestPath(u, cell, moveRange(w, u));
}

//Where a unit pushed back goes: the free hex behind it (opposite its facing) first, then the
//other free neighbours it can enter, null for none or a unit that can't move. Kept: the last row's
//odd columns count as half hexes on every map
export function retreatPosition(w: World, u: UnitState): Position | null {
	const ud = unitData(w, u);
	if (ud.movpoints === 0) return null;
	const costs = costsOf(w, ud.movmethod);
	const rows = w.state.map.rows;
	const adj = adjacent(u.row, u.col);
	adj.unshift(adj[facingToAdjacentIndex(Math.abs(u.facing - 8))]);
	for (const c of adj) {
		if (c.row === 0 && c.col % 2 === 0) continue;
		if (c.row === rows - 1 && c.col % 2 === 1) continue;
		if (!onMap(w, c.row, c.col)) continue;
		const hex = hexIndex(w, c.row, c.col);
		if (groundUnitAt(w, hex) === null && costs[w.data.hexes[hex].terrain] < NO_ENTRY) return c;
	}
	return null;
}

//Where a bought unit deploys: (row, col) or the first neighbour it can stand on
export function reinforcementDeployPosition(w: World, u: UnitState, row: number, col: number): Position | null {
	const costs = costsOf(w, w.equipment[u.eqid].movmethod);
	const cells = adjacent(row, col);
	cells.unshift({ row, col });
	for (const c of cells) {
		if (!onMap(w, c.row, c.col)) continue;
		if (canMoveInto(w, u, c) && costs[w.data.hexes[hexIndex(w, c.row, c.col)].terrain] < NO_ENTRY) return c;
	}
	return null;
}

//The transport a unit can embark on where it stands: an air transport on an airfield, a naval one
//in a port, unitClass.none if neither
export function embarkTypeOf(w: World, u: UnitState): number {
	const hex = hexIndex(w, u.row, u.col);
	const terrain = w.data.hexes[hex].terrain, player = playerOf(w, u), ud = unitData(w, u);
	if (terrain === terrainType.Airfield && player.airTransports > 0 && ud.embark > embarkType.naval && airUnitAt(w, hex) === null)
		return unitClass.airTransport;
	if (terrain === terrainType.Port && player.navalTransports > 0 && ud.embark > embarkType.none)
		return unitClass.navalTransport;
	return unitClass.none;
}

//The hexes an embarked unit that hasn't moved can land on: free neighbours its own (ground)
//equipment can enter
export function disembarkPositions(w: World, u: UnitState): Position[] {
	const uclass = unitData(w, u).uclass;
	if (u.hasMoved || (uclass !== unitClass.airTransport && uclass !== unitClass.navalTransport)) return [];
	const costs = costsOf(w, w.equipment[u.eqid].movmethod);
	return adjacent(u.row, u.col).filter((c) => {
		if (!onMap(w, c.row, c.col)) return false;
		const hex = hexIndex(w, c.row, c.col);
		return groundUnitAt(w, hex) === null && costs[w.data.hexes[hex].terrain] < NO_ENTRY;
	});
}

export function canEmbark(w: World, u: UnitState): boolean {
	return embarkTypeOf(w, u) > 0 || u.carrier < 0;
}

export function canDisembark(w: World, u: UnitState): boolean {
	return disembarkPositions(w, u).length > 0;
}
