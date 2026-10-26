/**
 * Movement - where a unit can go and the path it takes, where it retreats, deploys, embarks and
 * disembarks
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

import { embarkType, leaderType, movMethod, roadType, terrainType, unitClass } from "../prototypes";
import { isBridge } from "./equipment";
import { adjacent, cellsInRange, distance, facingToAdjacentIndex, isPartialEdge, neighbourCol, neighbourRow } from "./geometry";
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

//The movement costs of what the unit currently is (eqid: of that equipment instead)
function costsOf(w: World, movmethod: number): number[] {
	return moveCosts(w.rules, w.state.scenario.ground, movmethod);
}

//The hexes the unit's leaders add to its moves: Aggressive Tank Maneuver and Aggressive Maneuver, one each
export function leaderMoves(w: World, u: UnitState): number {
	return (hasLeader(w, u, leaderType.aggressiveTankManeuver) ? 1 : 0) + (hasLeader(w, u, leaderType.aggressiveManeuver) ? 1 : 0);
}

//The most hexes a unit can move, terrain aside: its moves left and the leaders' extra hex, no more
//than its fuel (#205: the leaders' hex came after the fuel, so a move could end below 0 fuel). A
//towed gun without transport (not a fortification) moves 1
export function unitMoveRange(w: World, u: UnitState): number {
	let range = movesLeft(w, u) + leaderMoves(w, u);
	const ud = unitData(w, u);
	if (unitUsesFuel(w, u) && fuelOf(u) < range) range = fuelOf(u);
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

//Whether u may be ordered to end its move on a hex (#74): no other unit of its kind there (ground and
//naval, or air: the slot it would take), but an enemy its side doesn't see, which stops the move before
//it (the surprise). The move range's canMove, for any hex a command names: the range also holds the
//hexes the unit only passes through, its side's units, and a command may give cells of its own
export function canEndMoveOn(w: World, u: UnitState, cell: Position): boolean {
	const hex = hexIndex(w, cell.row, cell.col), side = sideOf(w, u);
	const other = isAir(w, u) ? airUnitAt(w, hex) : groundUnitAt(w, hex);
	if (other === null || other.id === u.id) return true;
	return sideOf(w, other) !== side && !seen(w, hex, side, other);
}

//The hexes a unit can move to or pass through (GameRules.getMoveRange), in the order of
//cellsInRange, then its own hex. The range expands ring by ring: a hex's entry cost (cin) is the
//exit cost (cout) of a neighbour one ring nearer, its exit cost the entry plus the terrain cost,
//lowered when another neighbour is cheaper. A hex is in reach when the points left pay for it (#205);
//a hex that uses all the points (254) takes any left, at least one. An enemy zone of control the
//unit's side sees stops it (254) on a hex it can pay for. An air unit moves at cost 1 a hex, over its
//side's aircraft and around the enemy's it sees, as far as its points take it (#217). The order of
//the updates is the old engine's, list order, so a tie resolves as it did
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
			if (!seen(w, hex, side, airUnitAt(w, hex)) || canMoveInto(w, u, cell)) cell.canMove = true;
			else if (canPassInto(w, u, cell)) cell.canPass = true; //over its side's aircraft (#217: left out, flown around)
			else continue;
			cell.cost = 1; //no terrain cost in the air
			allowed.push(cell);
		}
		return withinSteps(w, u, allowed, range);
	}

	c.push(moveCell(u.row, u.col, 0));
	expand(w, u, c, range, side);
	return c.filter((cell) => cell.canPass || cell.canMove);
}

//The cells a path through them reaches from u's hex in range steps or less, in their order (#217: an
//air unit's range was every hex within range, and the path around the aircraft it can't fly through
//took more points than it had)
function withinSteps(w: World, u: UnitState, cells: MoveCell[], range: number): MoveCell[] {
	const cols = w.state.map.cols;
	const slot = scratch(w);
	for (let i = 0; i < cells.length; i++) slot[cells[i].row * cols + cells[i].col] = i + 1;
	const steps = new Int32Array(cells.length).fill(-1);
	const near: number[] = [];
	let ring: Position[] = [u];
	try {
		for (let r = 1; r <= range && ring.length > 0; r++) {
			const next: MoveCell[] = [];
			for (const from of ring) {
				neighbours(w, from, slot, near);
				for (const j of near)
					if (steps[j] < 0) {
						steps[j] = r;
						next.push(cells[j]);
					}
			}
			ring = next;
		}
	} finally {
		for (const cell of cells) slot[cell.row * cols + cell.col] = 0;
	}
	return cells.filter((_, i) => steps[i] > 0);
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
	for (const cell of c) if (cell.range > 0) cell.cin = -1; //not reached yet (relax)

	const s: StepRules = { costs: costsOf(w, unitData(w, u).movmethod), train: isTrain(w, u), side, enemySide: ~side & 1, range,
		groundOrSea: isGround(w, u) || isSea(w, u) };
	const near: number[] = [];
	try {
		for (let r = 0; r <= range; r++)
			for (const from of c)
				if (from.range === r) expandFrom(w, c, from, slot, near, s);
	} finally {
		for (const cell of c) slot[cell.row * cols + cell.col] = 0;
	}
}

//The steps from a cell to its neighbours as far or farther (not always right: a path can turn back),
//from the unit's hex or a cell the path can go through (#205: the old engine went on from every
//cell, an enemy's it sees too, so the hexes behind it showed costs no path had)
function expandFrom(w: World, c: MoveCell[], from: MoveCell, slot: Int32Array, near: number[], s: StepRules) {
	if (from.range > 0 && !from.canPass && !from.canMove) return;
	neighbours(w, from, slot, near);
	for (const j of near)
		if (c[j].range >= from.range) step(w, from, c[j], s);
}

interface StepRules {
	costs: number[];
	train: boolean;
	side: number;
	enemySide: number;
	range: number;
	groundOrSea: boolean;	//(not air: an air unit's range has no costs)
}

//What entering to from from costs, and whether the unit can stop on it or pass through
function step(w: World, from: MoveCell, to: MoveCell, s: StepRules) {
	const hex = hexIndex(w, to.row, to.col);
	const other = groundUnitAt(w, hex);
	const visible = seen(w, hex, s.side, other);
	const terrain = enterCost(w, hex, s);
	to.cost = visible && terrain < STOP && isZOC(w, hex, s.enemySide) ? STOP : terrain;
	relax(from, to);
	if (affordable(to.cin, terrain, s.range)) reach(w, to, other, visible, s);
}

//Whether the points left after cin pay for a hex of that terrain cost: all of it, or at least one
//for a hex that uses them all (#205: the old engine let any hex up to 254 in on the points left, or
//none left, so a move ended below 0 points and fuel)
function affordable(cin: number, terrain: number, range: number): boolean {
	if (terrain === STOP) return cin < range;
	return terrain < STOP && cin + terrain <= range;
}

//A hex in reach (canPassInto, canMoveInto of a unit that isn't air): the unit passes through it
//empty or held by its side, stops on it empty or unless it sees it taken
function reach(w: World, to: MoveCell, other: UnitState | null, visible: boolean, s: StepRules) {
	if (s.groundOrSea && (other === null || sideOf(w, other) === s.side)) to.canPass = true;
	if (!visible || (s.groundOrSea && other === null)) to.canMove = true;
}

//What entering a hex costs u in its terrain (the road's, a bridge's), its zone of control aside: what
//a move pays for the hex a zone of control stopped it on (#214)
export function terrainCost(w: World, u: UnitState, cell: Position): number {
	return enterCost(w, hexIndex(w, cell.row, cell.col), { costs: costsOf(w, unitData(w, u).movmethod), train: isTrain(w, u),
		side: sideOf(w, u) });
}

//The terrain's cost, or the road's: trains can't use roads, bridges are roads for their side
function enterCost(w: World, hex: number, s: Pick<StepRules, "costs" | "train" | "side">): number {
	const road = (!s.train && w.data.hexes[hex].road > roadType.none) || isBridgeForSide(w, hex, s.side);
	return s.costs[road ? ROAD : w.data.hexes[hex].terrain];
}

//The entry and exit costs of to, entered from from: set the first time, lowered when from is cheaper.
//Not set is an entry cost below 0 (expand): a neighbour of the unit's hex is entered at 0 (#167: 0
//counted as not set, so another neighbour overwrote it and its exit cost went up, and ranges lost hexes)
function relax(from: MoveCell, to: MoveCell) {
	if (to.cin < 0 || (to.cin > from.cout && to.cost <= STOP)) {
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
function neighbours(w: World, from: Position, slot: Int32Array, out: number[]) {
	out.length = 0;
	const { rows, cols } = w.state.map;
	for (let n = 0; n < 6; n++) { //adjacent()'s six, without making them
		const col = neighbourCol(from.col, n), row = neighbourRow(from.row, from.col, n);
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

//A cell of the path search: its place in the list, the cost of entering it, the cheapest cost found
//to reach it, and from where; open until the search has taken it
interface PathNode {
	index: number;
	row: number;
	col: number;
	cost: number;
	dist: number;
	prev: PathNode | null;
	open: boolean;
}

//The cheapest path from start to end through cells (GameRules.getShortestPath), start included,
//[] when there is none. Each cell costs what entering it costs; the start costs nothing, the unit
//is already there (#70: it cost 1, so a move paid one point more than its range showed). The
//path's tie-breaks are the old engine's: of cells as near, it takes the last in the list first.
//The old engine compares every open cell at each turn; here a heap ordered by distance, then by
//place in the list (the later first), gives the same cell, and a table by hex the neighbours to
//update (in any order: each is updated from the same cell)
export function shortestPath(start: Position, end: Position, cells: readonly { row: number; col: number; cost: number }[]): PathCell[] {
	const first: PathNode = { index: 0, row: start.row, col: start.col, cost: 0, dist: 0, prev: null, open: true };
	first.prev = first;
	const byHex = new Map<number, PathNode[]>();
	addNode(byHex, first);
	cells.forEach((c, i) => addNode(byHex, { index: i + 1, row: c.row, col: c.col, cost: c.cost, dist: Infinity, prev: null, open: true }));

	const heap = new NodeHeap();
	heap.push(first, 0);
	for (let near = heap.pop(); near !== null; near = heap.pop()) {
		for (let k = 0; k < 6; k++) //adjacent()'s six
			reachFrom(near, byHex.get(hexKey(neighbourRow(near.row, near.col, k), neighbourCol(near.col, k))), heap);
		if (near.row === end.row && near.col === end.col) return backtrack(near, start);
		near.open = false;
	}
	return [];
}

function addNode(byHex: Map<number, PathNode[]>, n: PathNode) {
	const list = byHex.get(hexKey(n.row, n.col));
	if (list === undefined) byHex.set(hexKey(n.row, n.col), [n]);
	else list.push(n);
}

//The open nodes of a neighbouring hex reached through near, when that is the first way or cheaper
function reachFrom(near: PathNode, nodes: PathNode[] | undefined, heap: NodeHeap) {
	if (nodes === undefined) return;
	for (const n of nodes)
		if (n.open && (n.dist === Infinity || near.dist + near.cost < n.dist)) {
			n.dist = near.dist + near.cost;
			n.prev = near;
			heap.push(n, n.dist);
		}
}

//A hex's key in the path search's table (any cell a command gives: off the map too)
function hexKey(row: number, col: number): number {
	return row * 65536 + col;
}

//The open nodes reached, nearest first and of equally near ones the later in the list. A node is
//pushed again when it gets nearer: the entries it left behind are skipped (taken, or another distance)
class NodeHeap {
	declare nodes: PathNode[];
	declare dists: number[];

	constructor() {
		this.nodes = [];
		this.dists = [];
	}

	push(n: PathNode, dist: number) {
		let i = this.nodes.length;
		this.nodes.push(n);
		this.dists.push(dist);
		while (i > 0) {
			const parent = (i - 1) >> 1;
			if (!this.before(i, parent)) break;
			this.swap(i, parent);
			i = parent;
		}
	}

	//The nearest open node, null when there is none
	pop(): PathNode | null {
		while (this.nodes.length > 0) {
			const n = this.nodes[0], dist = this.dists[0];
			const lastNode = this.nodes.pop(), lastDist = this.dists.pop();
			if (this.nodes.length > 0) {
				this.nodes[0] = lastNode;
				this.dists[0] = lastDist;
				this.sink(0);
			}
			if (n.open && n.dist === dist) return n;
		}
		return null;
	}

	private sink(i: number) {
		for (;;) {
			const l = 2 * i + 1, r = l + 1;
			let top = i;
			if (l < this.nodes.length && this.before(l, top)) top = l;
			if (r < this.nodes.length && this.before(r, top)) top = r;
			if (top === i) return;
			this.swap(i, top);
			i = top;
		}
	}

	//Whether entry a comes out before entry b: nearer, or as near and later in the list
	private before(a: number, b: number): boolean {
		if (this.dists[a] !== this.dists[b]) return this.dists[a] < this.dists[b];
		return this.nodes[a].index > this.nodes[b].index;
	}

	private swap(a: number, b: number) {
		const n = this.nodes[a], d = this.dists[a];
		this.nodes[a] = this.nodes[b];
		this.dists[a] = this.dists[b];
		this.nodes[b] = n;
		this.dists[b] = d;
	}
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

//The hexes a unit leaving its carrier (a negative carrier) can land on: its disembark hexes from aboard,
//the ones the disembark gave it
export function landingPositions(w: World, u: UnitState): Position[] {
	return disembarkPositions(w, u.carrier < 0 ? { ...u, carrier: -u.carrier } : u);
}

export function canEmbark(w: World, u: UnitState): boolean {
	return embarkTypeOf(w, u) > 0 || u.carrier < 0;
}

export function canDisembark(w: World, u: UnitState): boolean {
	return disembarkPositions(w, u).length > 0;
}
