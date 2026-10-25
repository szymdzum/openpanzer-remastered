//The map's view model (#345): what each hex of the map shows and what a click on it does, from the core's
//World and nothing else (the MapOverlays and MovePath cards). Plain functions, no DOM, tested on a
//hand-built world (test/view-map.test.ts); the canvas (src/view/mapdraw.ts) only draws their answers.
//Every rule comes from the core's queries, never from distance: the move area is the core's move range,
//the path the one the move takes, the targets the attack cells.
import type { Command } from "../commands";
import { attackableUnit, attackCells } from "../core/attack";
import { adjacent } from "../core/geometry";
import { captureAt } from "../core/moves";
import { isBridgeForSide, moveRange, shortestPath, terrainCost, unitMoveRange } from "../core/movement";
import type { MoveCell, PathCell, Position, UnitId, UnitState, World } from "../core/types";
import { isGround, unitUsesAmmo, unitUsesFuel } from "../core/units";
import { ammoOf, fuelOf, hexIndex, isSpotted, onMap, sideOf, unitAt, unitById, unitData } from "../core/world";
import { unitClass } from "../prototypes";
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
	marker: Marker | null; //the unit shown on top of its hex has one, the one underneath none
}

//A hex's edge: adjacent()'s side k of the hex
export interface Edge {
	row: number;
	col: number;
	side: number;
}

//The selected unit on the map: its hex, and when the person can order it, where it can go and what it can
//hit. The area is the core's move range: the hexes it can stop on (tinted), the hexes it only passes
//(friends: not tinted), the outline round all of them with the unit's own hex
export interface Selection {
	unit: UnitId;
	at: Position;
	range: MoveCell[]; //the core's move range, the cells a path goes through
	area: Position[]; //the hexes the unit can stop on
	outline: Edge[];
	targets: Position[]; //the hexes with a unit it can attack, each once
}

//A line of the path's tag: its text and how it reads (a gain, a warning, low on fuel)
export interface TagLine {
	text: string;
	tone: "" | "gain" | "warn" | "low";
}

//The path to the hovered hex (MovePath): the hexes from the unit's (seen: the side sees them, else the line
//turns dashed), how it ends (a ring with the moves left, light when the unit can move again, or a stop
//square in an enemy zone) and the tag under it: what happens, then what it costs
export interface Path {
	cells: (Position & { seen: boolean })[];
	stop: boolean;
	left: number;
	again: boolean;
	lines: TagLine[];
}

//What a click on a hex does: a command for the host, or a unit selected (null: none)
export type Click = { command: Command } | { select: UnitId | null };

const STOP = 254;
const same = (a: Position, b: Position) => a.row === b.row && a.col === b.col;

//The side shown sees a unit: its own, on a hex it spots, or one that fired from hiding
function shown(w: World, u: UnitState): boolean {
	return sideOf(w, u) === w.spotSide || u.tempSpotted || (w.spotSide >= 0 && isSpotted(w, hexIndex(w, u.row, u.col), w.spotSide));
}

//What the side shown's unit can still do this turn; only the current player's units show it
function readiness(w: World, u: UnitState, own: boolean): Pick<Marker, "canMove" | "canFire" | "noAmmo" | "done"> {
	if (!own || u.owner !== w.state.turn.currentPlayer) return { canMove: false, canFire: false, noAmmo: false, done: false };
	const canMove = !u.hasMoved && unitMoveRange(w, u) > 0;
	const fires = !u.hasFired && unitUsesAmmo(w, u);
	const canFire = fires && ammoOf(u) > 0;
	return { canMove, canFire, noAmmo: fires && !canFire, done: !canMove && !fires };
}

function markerOf(w: World, u: UnitState): Marker {
	const own = sideOf(w, u) === w.spotSide;
	return { strength: u.strength, own, ...readiness(w, u, own), bars: Math.min(Math.floor(u.experience / 100), 5),
		entrenchment: u.entrenchment, hits: u.hits };
}

function mapUnit(w: World, u: UnitState, top: boolean, selected: UnitId | null): MapUnit {
	const side = sideOf(w, u);
	const bridge = u.id !== selected && isGround(w, u) && isBridgeForSide(w, hexIndex(w, u.row, u.col), side);
	return { id: u.id, row: u.row, col: u.col, icon: unitData(w, u).icon as unknown as string, facing: u.facing, side, bridge,
		marker: top && u.strength > 0 ? markerOf(w, u) : null };
}

//The units the side shown sees, hex by hex, row by row: on a hex with two, the one the layer doesn't show
//first and without a marker, then the one it shows (airMode: the aircraft) with its marker
export function mapUnits(w: World, airMode: boolean, selected: UnitId | null): MapUnit[] {
	const units: MapUnit[] = [];
	const { rows, cols } = w.state.map;
	for (let row = 0; row < rows; row++)
		for (let col = 0; col < cols; col++) {
			const hex = hexIndex(w, row, col);
			const top = unitAt(w, hex, airMode), below = unitAt(w, hex, !airMode);
			if (below !== null && below !== top && shown(w, below)) units.push(mapUnit(w, below, false, selected));
			if (top !== null && shown(w, top)) units.push(mapUnit(w, top, true, selected));
		}
	return units;
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
	if (u === null || u.row < 0 || !shown(w, u)) return null;
	const at = { row: u.row, col: u.col };
	if (!canOrder(w, u)) return { unit: u.id, at, range: [], area: [], outline: [], targets: [] };
	const range = moveRange(w, u);
	const area = range.filter((c) => c.canMove && !same(c, at)).map((c) => ({ row: c.row, col: c.col }));
	const outline = range.length === 0 ? [] : outlineOf(w, [at, ...range.map((c) => ({ row: c.row, col: c.col }))]);
	const targets: Position[] = [];
	for (const c of attackCells(w, u))
		if (!targets.some((t) => same(t, c))) targets.push({ row: c.row, col: c.col });
	return { unit: u.id, at, range, area, outline, targets };
}

const plural = (n: number, one: string, many: string) => n + " " + (n === 1 ? one : many);

//What the path's last hex costs, as the move pays it (src/core/moves.ts): its cost, but a hex that stops
//the move costs its terrain in an enemy zone, all the points left on a terrain that takes them all
function lastCost(w: World, u: UnitState, end: Position & { cost: number }, before: number): { used: number; zone: boolean } {
	if (end.cost < STOP) return { used: before + end.cost, zone: false };
	const terrain = terrainCost(w, u, end);
	return terrain >= STOP ? { used: Math.max(unitMoveRange(w, u), before + 1), zone: false } : { used: before + terrain, zone: true };
}

//The move's fuel, as the move burns it: the transport's when mounted, none on a carrier or for a unit that
//uses none. Low under a third of the tank
function fuelLine(w: World, u: UnitState, used: number): TagLine | null {
	if (!unitUsesFuel(w, u) || u.carrier !== 0) return null;
	const fuel = fuelOf(u), max = unitData(w, u).fuel, after = fuel - used;
	const low = after < max / 3;
	const text = (u.isMounted ? "transport fuel " : "fuel ") + fuel + " → " + after + " of " + max + (low ? " · low" : "");
	return { text, tone: low ? "low" : "" };
}

//What the move takes at its end: the flag or the objective, with the objectives its side has left after it
function captureLines(w: World, u: UnitState, end: Position): TagLine[] {
	const taken = captureAt(w, u, end);
	if (taken === null) return [];
	const name = w.data.hexes[hexIndex(w, end.row, end.col)].name;
	if (!taken.objective) return [{ text: "takes " + name, tone: "" }, { text: "+" + taken.prestige + " prestige", tone: "gain" }];
	const left = w.state.objectives[sideOf(w, u)].filter((c) => !same(c, end)).length;
	return [{ text: "takes " + name + " · objective", tone: "" },
		{ text: "+" + taken.prestige + " prestige · " + (left === 0 ? "the last objective" : left + " left to win"), tone: "gain" }];
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

//The tag's lines: what happens (a stop, a capture, a move that leaves the unit unable to fire, the moves
//left), then what it costs or risks
function tagLines(w: World, u: UnitState, to: Position, m: ReturnType<typeof moveOutcome>, unseen: boolean): TagLine[] {
	const line = (text: string, tone: TagLine["tone"] = ""): TagLine => ({ text, tone });
	const capture = m.zone ? [] : captureLines(w, u, to);
	const lines = m.zone ? [line("stops: enemy zone"), line(plural(Math.max(unitMoveRange(w, u) - m.used, 0), "move", "moves") + " unused")]
		: capture.length > 0 ? capture
		: [line(isMounted(u) ? "can't fire after this move" : plural(m.left, "move", "moves") + " left")];
	if (unseen) lines.push(line("unseen: ambush possible", "warn"));
	if (m.again) lines.push(line("can move again"));
	const fuel = fuelLine(w, u, m.used);
	return fuel === null ? lines : [...lines, fuel];
}

//The path the move to a hex of the area would take (the move command's own: the shortest path through the
//move range), null for a hex outside the area
export function pathOf(w: World, sel: Selection | null, to: Position): Path | null {
	if (sel === null || !sel.area.some((c) => same(c, to))) return null;
	const u = unitById(w, sel.unit), side = sideOf(w, u);
	const steps = shortestPath(u, to, sel.range);
	if (steps.length < 2) return null;
	const m = moveOutcome(w, u, steps);
	const cells = steps.map((c) => ({ row: c.row, col: c.col, seen: isSpotted(w, hexIndex(w, c.row, c.col), side) }));
	return { cells, stop: m.zone, left: m.left, again: m.again, lines: tagLines(w, u, to, m, cells.some((c) => !c.seen)) };
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
	return { select: u !== null && shown(w, u) ? u.id : null };
}
