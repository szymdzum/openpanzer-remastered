//The map's view model (#345): what each hex of the map shows and what a click on it does, from the core's
//World and nothing else (the MapOverlays and MovePath cards). Plain functions, no DOM, tested on a
//hand-built world (test/view-map.test.ts); the canvas (src/view/mapdraw.ts) only draws their answers.
//Every rule comes from the core's queries, never from distance: the move area is the core's move range,
//the path the one the move takes, the targets the attack cells.
import type { Command } from "../core/command";
import { attackableUnit, attackCells, canFireThisTurn } from "../core/attack";
import { adjacent } from "../core/geometry";
import { isBridgeForSide, moveRange, movesLeftThisTurn, shortestPath, terrainCost, unitMoveRange } from "../core/movement";
import type { MoveCell, PathCell, Position, UnitId, UnitState, World } from "../core/types";
import { isAir, isGround, unitUsesAmmo } from "../core/units";
import { airUnitAt, groundUnitAt, hexIndex, isSpotted, onMap, sideOf, unitAt, unitById, unitData } from "../core/world";
import { unitClass } from "../core/tables";
import { canOrder } from "./model";

//A unit's marker under its sprite (MapOverlays): what it can still do this turn, its strength in its
//side's colour, experience, entrenchment and the hits it took this turn
export interface Marker {
	strength: number;
	own: boolean; //the side shown's: a square plate, readiness shown; the enemy's plate has pointed ends
	canMove: boolean;
	canFire: boolean;
	noAmmo: boolean; //it could fire but has no ammo: the crosshair crossed out
	done: boolean; //the current player's unit with nothing left to do this turn: the marker dimmed
	bars: number; //experience, a bar per 100 points, five at most
	entrenchment: number;
	hits: number;
	revealed: boolean; //an enemy that fired from a hex the side doesn't see: known to be there, not what's around it
}

//A unit as the map draws it
export interface MapUnit {
	id: UnitId;
	row: number;
	col: number;
	icon: string; //the sprite strip's file: what the unit is now (its transport, its carrier)
	facing: number;
	side: number;
	bridge: boolean; //a ground unit on a bridge of its side is drawn as the bridge, unless selected
	marker: Marker | null; //a unit alone on its hex or on top of it has one, the one underneath another none
	dim: boolean; //in the other layer's slot of a shared hex (MapLayers): drawn underneath at 75%, with a chip instead of its marker
	chip: number | null; //the strength chip of a unit drawn underneath: the one thing its marker would have told
	lifted: boolean; //an aircraft on top in the air layer (AirLayer): lifted with a shadow inside a dashed air ring
	current: boolean; //the unit of the player whose turn it is (the old map's Mark own units, #464)
}

//A hex's edge: adjacent()'s side k of the hex
export interface Edge {
	row: number;
	col: number;
	side: number;
}

//The selected unit on the map: its hex, and when the person can order it, where it can go and what it can
//hit. The area is the core's move range: the hexes it can stop on (tinted, or hatched where its side doesn't
//see: a hidden enemy there is an ambush; for an aircraft none: only an enemy aircraft stops it, MapOverlays), the hexes it only passes (friends: not tinted), the outline round
//all of them with the unit's own hex, and a bar on each edge of the area that faces an enemy its side sees
//and whose zone of control ends the move there
export interface Selection {
	unit: UnitId;
	at: Position;
	range: MoveCell[]; //the core's move range, the cells a path goes through
	area: Position[]; //the hexes the unit can stop on
	unseen: Position[]; //those of them its side doesn't see
	outline: Edge[];
	zones: Edge[];
	targets: Position[]; //the hexes with a unit it can attack, each once
}

//The path to the hovered hex (MovePath): the hexes from the unit's (seen: the side sees them, else the line
//turns dashed) and how it ends (a ring with the moves left, light when the unit can move again, or a stop
//square in an enemy zone)
export interface Path {
	cells: (Position & { seen: boolean })[];
	stop: boolean;
	left: number;
	again: boolean;
}

//What a click on a hex does: a command for the host, or a unit selected (null: none)
export type Click = { command: Command } | { select: UnitId | null };

const STOP = 254;
const same = (a: Position, b: Position) => a.row === b.row && a.col === b.col;

//The side shown sees a unit: its own, on a hex it spots, or one that fired from hiding
export function isShown(w: World, u: UnitState): boolean {
	return sideOf(w, u) === w.spotSide || u.tempSpotted || (w.spotSide >= 0 && isSpotted(w, hexIndex(w, u.row, u.col), w.spotSide));
}

//What the side shown's unit can still do this turn; only the current player's units show it
function readiness(w: World, u: UnitState, own: boolean): Pick<Marker, "canMove" | "canFire" | "noAmmo" | "done"> {
	if (!own || u.owner !== w.state.turn.currentPlayer) return { canMove: false, canFire: false, noAmmo: false, done: false };
	const canMove = movesLeftThisTurn(w, u) > 0;
	const fires = !u.hasFired && unitUsesAmmo(w, u);
	const canFire = canFireThisTurn(w, u);
	return { canMove, canFire, noAmmo: fires && !canFire, done: !canMove && !fires };
}

//The current player's units that can still do something this turn: move, or fire at a target in range (the core's
//attack cells); what End turn warns of when a person plays it (#8). A unit with its shot but nothing to hit isn't one
//(#436), though its marker still shows the shot
export function unitsToAct(w: World): UnitState[] {
	return w.state.units.filter((u) => {
		if (u.row < 0) return false;
		const r = readiness(w, u, true);
		return r.canMove || (r.canFire && attackCells(w, u).length > 0);
	});
}

function markerOf(w: World, u: UnitState): Marker {
	const own = sideOf(w, u) === w.spotSide;
	return { strength: u.strength, own, ...readiness(w, u, own), bars: Math.min(Math.floor(u.experience / 100), 5),
		entrenchment: u.entrenchment, hits: u.hits, revealed: !own && !(w.spotSide >= 0 && isSpotted(w, hexIndex(w, u.row, u.col), w.spotSide)) };
}

//A unit as the map draws it: alone on its hex or on top of it, with its marker (lifted when it is the air
//layer's), or in the other layer's slot of a shared hex, dimmed underneath with a strength chip
function mapUnit(w: World, u: UnitState, top: boolean, shared: boolean, airMode: boolean, selected: UnitId | null): MapUnit {
	const side = sideOf(w, u);
	const bridge = u.id !== selected && isGround(w, u) && isBridgeForSide(w, hexIndex(w, u.row, u.col), side);
	return { id: u.id, row: u.row, col: u.col, icon: unitData(w, u).icon, facing: u.facing, side, bridge,
		marker: !shared && u.strength > 0 ? markerOf(w, u) : null, dim: shared, chip: shared && u.strength > 0 ? u.strength : null,
		lifted: top && airMode, current: u.owner === w.state.turn.currentPlayer };
}

//The units the side shown sees, hex by hex, row by row (MapLayers): every hex has a ground slot and an air slot.
//A unit alone on its hex is drawn whole, with its marker, whatever the layer. Where both slots are taken the
//one of the layer shown (airMode: the air slot) is on top with its marker; the other is drawn first, dimmed,
//with a strength chip, and the layer still tells which unit a click deals with. (A click on a unit under it
//still selects it, as the old UI's Hex.getUnit did, and selecting an aircraft switches the air layer on:
//src/view/store.ts)
export function mapUnits(w: World, airMode: boolean, selected: UnitId | null): MapUnit[] {
	const units: MapUnit[] = [];
	eachSlot(w, airMode, (top, below) => {
		const shown = top !== null && isShown(w, top), underShown = below !== null && isShown(w, below);
		//(a shared hex: the side sees what is on it, so both are drawn, or neither)
		const shared = shown && underShown;
		if (underShown) units.push(mapUnit(w, below, false, shared, airMode, selected));
		if (shown) units.push(mapUnit(w, top, true, false, airMode, selected));
	});
	return units;
}

//Each hex row by row, with the unit in the slot of the layer shown (airMode: the air slot) and the other slot's
export function eachSlot(w: World, airMode: boolean, f: (top: UnitState | null, below: UnitState | null) => void) {
	const { rows, cols } = w.state.map;
	for (let row = 0; row < rows; row++)
		for (let col = 0; col < cols; col++) {
			const hex = hexIndex(w, row, col), air = airUnitAt(w, hex), ground = groundUnitAt(w, hex);
			f(airMode ? air : ground, airMode ? ground : air);
		}
}

//The outline round a set of hexes: each edge whose neighbour isn't in it
export function outlineOf(w: World, hexes: Position[]): Edge[] {
	const inSet = new Set(hexes.map((c) => hexIndex(w, c.row, c.col)));
	const edges: Edge[] = [];
	for (const c of hexes)
		adjacent(c.row, c.col).forEach((n, side) => {
			if (!onMap(w, n.row, n.col) || !inSet.has(hexIndex(w, n.row, n.col))) edges.push({ row: c.row, col: c.col, side });
		});
	return edges;
}

//The selected unit as the map shows it, null when there is none or the side shown doesn't see it
export function selectionOf(w: World, id: UnitId | null): Selection | null {
	const u = id === null ? null : unitById(w, id);
	if (u === null || u.row < 0 || !isShown(w, u)) return null;
	const at = { row: u.row, col: u.col };
	if (!canOrder(w, u)) return { unit: u.id, at, range: [], area: [], unseen: [], outline: [], zones: [], targets: [] };
	const range = moveRange(w, u), side = sideOf(w, u);
	const area = range.filter((c) => c.canMove && !same(c, at)).map((c) => ({ row: c.row, col: c.col }));
	//(round the hexes it can stop on and its own, as the old map tinted only those: not a friend's or an enemy's hex it
	//only passes)
	const outline = range.length === 0 ? [] : outlineOf(w, [at, ...area]);
	const targets: Position[] = [];
	for (const c of attackCells(w, u))
		if (!targets.some((t) => same(t, c))) targets.push({ row: c.row, col: c.col });
	//(an aircraft is stopped by an enemy aircraft only, in canPassInto, and the side can't know where one hides:
	//the fog says it all, no hatching)
	const unseen = isAir(w, u) ? [] : area.filter((c) => !isSpotted(w, hexIndex(w, c.row, c.col), side));
	return { unit: u.id, at, range, area, unseen, outline,
		zones: zoneEdges(w, u, range), targets };
}

//The edges of the move range where an enemy zone of control ends the move (a hex that stops it, though its
//terrain doesn't) facing an enemy the unit's side sees: ground and naval units cast a zone, aircraft none.
//A hidden enemy's zone ends the move too, as in the original (#282), but has no enemy to face: no bar there,
//the path's stop square still says the move stops
function zoneEdges(w: World, u: UnitState, range: MoveCell[]): Edge[] {
	const side = sideOf(w, u), edges: Edge[] = [];
	for (const c of range) {
		if (c.cost < STOP || terrainCost(w, u, c) >= STOP) continue;
		adjacent(c.row, c.col).forEach((n, k) => {
			if (!onMap(w, n.row, n.col)) return;
			const hex = hexIndex(w, n.row, n.col), other = groundUnitAt(w, hex);
			if (other !== null && sideOf(w, other) !== side && (isSpotted(w, hex, side) || other.tempSpotted))
				edges.push({ row: c.row, col: c.col, side: k });
		});
	}
	return edges;
}

//What the path's last hex costs, as the move pays it (src/core/moves.ts): its cost, but a hex that stops
//the move costs its terrain in an enemy zone, all the points left on a terrain that takes them all
function lastCost(w: World, u: UnitState, end: Position & { cost: number }, before: number): { used: number; zone: boolean } {
	if (end.cost < STOP) return { used: before + end.cost, zone: false };
	const terrain = terrainCost(w, u, end);
	return terrain >= STOP ? { used: Math.max(unitMoveRange(w, u), before + 1), zone: false } : { used: before + terrain, zone: true };
}

//What the move to the path's end leaves (src/core/moves.ts payMove): the points it uses, whether an enemy zone
//stops it there, the moves left (none for a transport, which uses them all, or a hex that stops the move), and
//whether a recon unit with moves left can move again
function moveOutcome(w: World, u: UnitState, steps: PathCell[]): { used: number; zone: boolean; left: number; again: boolean } {
	const before = steps.slice(1, -1).reduce((sum, c) => sum + c.cost, 0);
	const end = steps[steps.length - 1];
	const { used, zone } = lastCost(w, u, end, before);
	const left = isMounted(u) || end.cost >= STOP ? 0 : Math.max(u.moveLeft - used, 0);
	return { used, zone, left, again: unitData(w, u).uclass === unitClass.recon && left > 0 };
}

const isMounted = (u: UnitState) => u.isMounted && u.transport !== null;

//The path the move to a hex of the area would take (the move command's own: the shortest path through the
//move range), null for a hex outside the area
export function pathOf(w: World, sel: Selection | null, to: Position): Path | null {
	if (sel === null || !sel.area.some((c) => same(c, to))) return null;
	const u = unitById(w, sel.unit), side = sideOf(w, u);
	const steps = shortestPath(u, to, sel.range);
	if (steps.length < 2) return null;
	const m = moveOutcome(w, u, steps);
	const cells = steps.map((c) => ({ row: c.row, col: c.col, seen: isSpotted(w, hexIndex(w, c.row, c.col), side) }));
	return { cells, stop: m.zone, left: m.left, again: m.again };
}

//A click on a hex: an attack on a target there, a move to a hex of the area, else the unit the layer shows
//there selected when the side shown sees it, or none
export function clickOn(w: World, sel: Selection | null, at: Position, airMode: boolean): Click {
	if (sel !== null && sel.targets.some((c) => same(c, at))) {
		const target = attackableUnit(w, unitById(w, sel.unit), hexIndex(w, at.row, at.col), airMode);
		if (target !== null) return { command: { type: "attack", unit: sel.unit, target: target.id } };
	}
	if (sel !== null && sel.area.some((c) => same(c, at))) return { command: { type: "move", unit: sel.unit, to: at } };
	const u = unitAt(w, hexIndex(w, at.row, at.col), airMode);
	return { select: u !== null && isShown(w, u) ? u.id : null };
}
