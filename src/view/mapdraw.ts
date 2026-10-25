//The map's canvas (#345): the terrain, the hex grid, the move area, the targets, the selection, the move
//path, the units and their markers, in the MapOverlays card's order. It draws what the map's view model
//(src/view/mapview.ts) computed and decides nothing. Colours and line widths are the tokens'
//(src/view/tokens.ts), the same in both themes.
//
//The canvas is the size of the screen, at the device's pixels (sharp on HiDPI, #31), and draws the part of
//the map in view. The terrain and the sprites scale with the map (ZoomLevels); everything drawn on top
//keeps its screen size: a line's path is laid out at the map's scale, then stroked at the screen's, so its
//width is the token's in screen pixels, and the markers and the path's ring are drawn at screen points.
import type { Position } from "../core/types";
import { CORNERS, EDGES, hexCentre, type Point } from "./hexgrid";
import type { Edge, Marker, MapUnit, Path, Selection } from "./mapview";
import { TOKENS } from "./tokens";

const MAP = TOKENS.map, PX = TOKENS.px;

//The part of the map on the screen: its top left corner in screen pixels from the map's (the scroll), the
//screen's size in CSS pixels, the map's scale and the device's pixels per CSS pixel
export interface Viewport {
	x: number;
	y: number;
	width: number;
	height: number;
	scale: number;
	dpr: number;
}

//What the canvas draws
export interface Scene {
	terrain: CanvasImageSource | null;
	rows: number;
	cols: number;
	grid: boolean; //the hex grid setting
	units: MapUnit[];
	selection: Selection | null;
	path: Path | null;
}

//A sprite strip or the bridge by its file, null until it has loaded
export type Images = (file: string) => (CanvasImageSource & { width: number; height: number }) | null;

//The bridge drawn instead of a ground unit on a bridge of its side
export const BRIDGE = "resources/units/images/bridg.png";

//Where a point of the map is on the screen
export function toScreen(p: Point, vp: Viewport): Point {
	return { x: p.x * vp.scale - vp.x, y: p.y * vp.scale - vp.y };
}

//Paths laid out in the map's pixels; strokes and markers in the screen's
const atMap = (c: CanvasRenderingContext2D, vp: Viewport) =>
	c.setTransform(vp.dpr * vp.scale, 0, 0, vp.dpr * vp.scale, -vp.x * vp.dpr, -vp.y * vp.dpr);
const atScreen = (c: CanvasRenderingContext2D, vp: Viewport) => c.setTransform(vp.dpr, 0, 0, vp.dpr, 0, 0);

//The rows and columns in view, a hex more on each side
function inView(vp: Viewport, rows: number, cols: number): { r0: number; r1: number; c0: number; c1: number } {
	const x0 = vp.x / vp.scale, y0 = vp.y / vp.scale;
	const x1 = (vp.x + vp.width) / vp.scale, y1 = (vp.y + vp.height) / vp.scale;
	const step = PX["hex-w"] * 0.75, h = PX["hex-h"];
	return { c0: Math.max(0, Math.floor(x0 / step) - 1), c1: Math.min(cols - 1, Math.ceil(x1 / step) + 1),
		r0: Math.max(0, Math.floor(y0 / h) - 1), r1: Math.min(rows - 1, Math.ceil(y1 / h) + 1) };
}

function addHex(c: CanvasRenderingContext2D, at: Position) {
	const o = hexCentre(at.row, at.col);
	c.moveTo(o.x + CORNERS[0].x, o.y + CORNERS[0].y);
	for (let k = 1; k < 6; k++) c.lineTo(o.x + CORNERS[k].x, o.y + CORNERS[k].y);
	c.closePath();
}

function addEdge(c: CanvasRenderingContext2D, e: Edge) {
	const o = hexCentre(e.row, e.col), [a, b] = EDGES[e.side];
	c.moveTo(o.x + CORNERS[a].x, o.y + CORNERS[a].y);
	c.lineTo(o.x + CORNERS[b].x, o.y + CORNERS[b].y);
}

//The path laid out, stroked at screen size over the dark under-stroke every map line has
function strokeLine(c: CanvasRenderingContext2D, vp: Viewport, colour: string, width: number, under: number, dash: number[] = []) {
	atScreen(c, vp);
	c.lineJoin = "round";
	c.setLineDash([]);
	c.globalAlpha = 0.55;
	c.strokeStyle = MAP["hex-shadow"];
	c.lineWidth = under;
	c.stroke();
	c.globalAlpha = 1;
	c.setLineDash(dash);
	c.strokeStyle = colour;
	c.lineWidth = width;
	c.stroke();
	c.setLineDash([]);
}

function fillHexes(c: CanvasRenderingContext2D, vp: Viewport, hexes: Position[], colour: string, alpha: number) {
	if (hexes.length === 0) return;
	atMap(c, vp);
	c.beginPath();
	for (const h of hexes) addHex(c, h);
	c.globalAlpha = alpha;
	c.fillStyle = colour;
	c.fill();
	c.globalAlpha = 1;
}

function drawGrid(c: CanvasRenderingContext2D, vp: Viewport, rows: number, cols: number) {
	const v = inView(vp, rows, cols);
	atMap(c, vp);
	c.beginPath();
	for (let row = v.r0; row <= v.r1; row++)
		for (let col = v.c0; col <= v.c1; col++) addHex(c, { row, col });
	atScreen(c, vp);
	c.globalAlpha = 0.35;
	c.strokeStyle = MAP["hex-shadow"];
	c.lineWidth = 1;
	c.stroke();
	c.globalAlpha = 1;
}

//The move area's tint, the one outline round it, the targets and the selected hex
function drawSelection(c: CanvasRenderingContext2D, vp: Viewport, sel: Selection) {
	fillHexes(c, vp, sel.area, MAP["hex-move"], 0.16);
	if (sel.outline.length > 0) {
		atMap(c, vp);
		c.beginPath();
		for (const e of sel.outline) addEdge(c, e);
		c.lineCap = "round";
		strokeLine(c, vp, MAP["hex-move"], PX["hex-move-width"], PX["hex-move-width"] + 2);
	}
	fillHexes(c, vp, sel.targets, MAP["hex-target"], 0.12);
	if (sel.targets.length > 0) {
		atMap(c, vp);
		c.beginPath();
		for (const t of sel.targets) addHex(c, t);
		c.lineCap = "butt";
		strokeLine(c, vp, MAP["hex-target"], PX["hex-target-width"], PX["hex-target-width"] + 2.6, [5, 3]);
	}
	atMap(c, vp);
	c.beginPath();
	addHex(c, sel.at);
	strokeLine(c, vp, MAP["hex-select"], PX["hex-select-width"], PX["hex-shadow-width"]);
}

//A part of the path, seen or not: dotted where the side sees the hexes, dashed past the edge of what it sees
function pathPart(c: CanvasRenderingContext2D, vp: Viewport, path: Path, seen: boolean) {
	atMap(c, vp);
	c.beginPath();
	let any = false;
	for (let i = 1; i < path.cells.length; i++) {
		const a = path.cells[i - 1], b = path.cells[i];
		if ((a.seen && b.seen) !== seen) continue;
		const p = hexCentre(a.row, a.col), q = hexCentre(b.row, b.col);
		c.moveTo(p.x, p.y);
		c.lineTo(q.x, q.y);
		any = true;
	}
	if (any) strokeLine(c, vp, MAP["hex-move"], 2.5, 5, seen ? [1, 6] : [6, 4]);
}

function circle(c: CanvasRenderingContext2D, p: Point, r: number) {
	c.beginPath();
	c.arc(p.x, p.y, r, 0, Math.PI * 2);
}

//The ring at the end with the moves left (light: the unit can move again), or the stop square of an enemy zone
function drawPathEnd(c: CanvasRenderingContext2D, end: Point, path: Path) {
	if (path.stop) {
		c.lineWidth = 4;
		c.globalAlpha = 0.6;
		c.strokeStyle = MAP["hex-shadow"];
		c.strokeRect(end.x - 7, end.y - 7, 14, 14);
		c.globalAlpha = 1;
		c.fillStyle = MAP["hex-target"];
		c.fillRect(end.x - 7, end.y - 7, 14, 14);
		c.lineWidth = 1.6;
		c.strokeStyle = MAP["hex-move"];
		c.strokeRect(end.x - 7, end.y - 7, 14, 14);
		c.fillStyle = MAP.glint;
		c.fillRect(end.x - 3.5, end.y - 1, 7, 2);
		return;
	}
	circle(c, end, 10);
	c.globalAlpha = 0.55;
	c.fillStyle = MAP["hex-shadow"];
	c.fill();
	c.globalAlpha = 1;
	circle(c, end, 8.5);
	c.fillStyle = path.again ? MAP["hex-move"] : MAP["hex-select"];
	c.fill();
	c.lineWidth = 1.4;
	c.strokeStyle = MAP["hex-shadow"];
	c.stroke();
	c.font = "bold 11px " + TOKENS.fonts.mono;
	c.textAlign = "center";
	c.textBaseline = "middle";
	c.fillStyle = MAP["hex-shadow"];
	c.fillText(String(path.left), end.x, end.y + 0.5);
}

//The move path (MovePath): the route from hex centre to hex centre, a dot on each hex passed, its end
function drawPath(c: CanvasRenderingContext2D, vp: Viewport, path: Path) {
	c.lineCap = "round";
	pathPart(c, vp, path, true);
	pathPart(c, vp, path, false);
	atScreen(c, vp);
	for (const cell of path.cells.slice(1, -1)) {
		circle(c, toScreen(hexCentre(cell.row, cell.col), vp), 2.6);
		c.fillStyle = MAP["hex-move"];
		c.fill();
		c.lineWidth = 1.2;
		c.strokeStyle = MAP["hex-shadow"];
		c.stroke();
	}
	const last = path.cells[path.cells.length - 1];
	drawPathEnd(c, toScreen(hexCentre(last.row, last.col), vp), path);
}

//A unit's sprite: the strip has nine facings from south to north, the other seven are mirrored. Drawn at the
//map's scale, its centre a little above the hex's to leave room for the marker
function drawSprite(c: CanvasRenderingContext2D, u: MapUnit, images: Images) {
	const img = images(u.bridge ? BRIDGE : u.icon);
	if (img === null) return;
	const w = img.width / 9, h = img.height, o = hexCentre(u.row, u.col);
	const mirror = u.facing > 8, frame = mirror ? 16 - u.facing : u.facing;
	const x = Math.floor(o.x - w / 2), y = Math.floor(o.y - h / 2 - 8);
	c.save();
	if (mirror) {
		c.translate(x + w / 2, 0);
		c.scale(-1, 1);
		c.translate(-(x + w / 2), 0);
	}
	c.drawImage(img, w * frame, 0, w, h, x, y, w, h);
	c.restore();
}

//An arrow: the unit can still move
function drawMoveMark(c: CanvasRenderingContext2D, x: number, y: number) {
	c.lineWidth = 1.3;
	c.strokeStyle = MAP.glint;
	c.beginPath();
	c.moveTo(x - 3, y); c.lineTo(x + 2.5, y);
	c.moveTo(x, y - 2.5); c.lineTo(x + 2.8, y); c.lineTo(x, y + 2.5);
	c.stroke();
}

//A crosshair: the unit can still fire; crossed out in red without ammo
function drawFireMark(c: CanvasRenderingContext2D, x: number, y: number, noAmmo: boolean) {
	c.lineWidth = 1;
	c.strokeStyle = noAmmo ? MAP["hex-target"] : MAP.glint;
	c.beginPath();
	c.arc(x, y, 2.2, 0, Math.PI * 2);
	c.moveTo(x, y - 3.6); c.lineTo(x, y - 2.4); c.moveTo(x, y + 2.4); c.lineTo(x, y + 3.6);
	c.moveTo(x - 3.6, y); c.lineTo(x - 2.4, y); c.moveTo(x + 2.4, y); c.lineTo(x + 3.6, y);
	if (noAmmo) { c.moveTo(x - 3, y + 3); c.lineTo(x + 3, y - 3); }
	c.stroke();
}

//What the unit can still do, on the plate's left: an arrow to move, a crosshair to fire
function drawReadiness(c: CanvasRenderingContext2D, m: Marker, right: number, y: number) {
	const fire = m.canFire || m.noAmmo;
	const marks = (m.canMove ? 1 : 0) + (fire ? 1 : 0);
	if (marks === 0) return;
	const w = marks * 8 + 2, x = right - w - 1;
	c.globalAlpha *= 0.75;
	c.fillStyle = MAP["hex-shadow"];
	c.fillRect(x, y + 1, w, 9);
	c.globalAlpha /= 0.75;
	if (m.canMove) drawMoveMark(c, x + 5, y + 5.5);
	if (fire) drawFireMark(c, x + 5 + (m.canMove ? 8 : 0), y + 5.5, m.noAmmo);
}

//The strength plate in the side's colour: square for the side shown's units, pointed ends for the enemy's
function drawPlate(c: CanvasRenderingContext2D, m: Marker, side: number, x: number, y: number, w: number) {
	c.beginPath();
	if (m.own) c.rect(x, y, w, 11);
	else {
		c.moveTo(x - 2, y + 5.5); c.lineTo(x + 2, y); c.lineTo(x + w - 2, y);
		c.lineTo(x + w + 2, y + 5.5); c.lineTo(x + w - 2, y + 11); c.lineTo(x + 2, y + 11);
		c.closePath();
	}
	c.fillStyle = side === 1 ? MAP["map-allied"] : MAP["map-axis"];
	c.fill();
	c.globalAlpha *= 0.75;
	c.strokeStyle = MAP.shade;
	c.lineWidth = 1;
	c.stroke();
	c.globalAlpha /= 0.75;
	c.font = "bold 9px " + TOKENS.fonts.ui;
	c.textAlign = "center";
	c.textBaseline = "middle";
	c.fillStyle = MAP.glint;
	c.fillText(String(m.strength), x + w / 2, y + 6);
}

//Experience bars right of the plate, then the hits taken this turn: the defence they cost later attacks
function drawRight(c: CanvasRenderingContext2D, m: Marker, x: number, y: number) {
	if (m.bars > 0) {
		c.globalAlpha *= 0.75;
		c.fillStyle = MAP["hex-shadow"];
		c.fillRect(x, y + 10 - m.bars * 2.2, 7, m.bars * 2.2 + 1);
		c.globalAlpha /= 0.75;
		c.fillStyle = MAP["hex-select"];
		for (let b = 0; b < m.bars; b++) c.fillRect(x + 1, y + 8.6 - b * 2.2, 5, 1.4);
		x += 9;
	}
	if (m.hits === 0) return;
	const text = "−" + m.hits * 2;
	c.font = "bold 8px " + TOKENS.fonts.mono;
	const w = Math.ceil(c.measureText(text).width) + 4;
	c.fillStyle = MAP["map-critical"];
	c.fillRect(x, y, w, 11);
	c.strokeStyle = MAP.shade;
	c.lineWidth = 0.5;
	c.strokeRect(x, y, w, 11);
	c.textAlign = "start";
	c.textBaseline = "middle";
	c.fillStyle = MAP.glint;
	c.fillText(text, x + 2, y + 6);
}

//A sandbag per entrenchment level, under the plate
function drawSandbags(c: CanvasRenderingContext2D, levels: number, cx: number, y: number) {
	const left = cx - (levels * 6 - 1) / 2;
	c.lineWidth = 0.5;
	c.strokeStyle = MAP["map-edge"];
	c.fillStyle = MAP["map-sandbag"];
	for (let i = 0; i < levels; i++) {
		c.beginPath();
		c.roundRect(left + i * 6, y, 5, 3, 1.5);
		c.fill();
		c.stroke();
	}
}

//The marker under a unit at screen size (MapOverlays), the plate's top centre at p
function drawMarker(c: CanvasRenderingContext2D, u: MapUnit, m: Marker, p: Point) {
	const text = String(m.strength), w = text.length * 5 + 6;
	const x = Math.round(p.x - w / 2), y = Math.round(p.y);
	c.save();
	if (m.done) c.globalAlpha = 0.45;
	drawReadiness(c, m, x - (m.own ? 0 : 2), y);
	drawPlate(c, m, u.side, x, y, w);
	drawRight(c, m, x + w + (m.own ? 2 : 4), y);
	if (m.entrenchment > 0) drawSandbags(c, m.entrenchment, x + w / 2, y + 12);
	c.restore();
}

//The whole map in view, cleared first
export function drawMap(c: CanvasRenderingContext2D, scene: Scene, vp: Viewport, images: Images) {
	c.setTransform(1, 0, 0, 1, 0, 0);
	c.clearRect(0, 0, vp.width * vp.dpr, vp.height * vp.dpr);
	c.imageSmoothingEnabled = false;
	atMap(c, vp);
	if (scene.terrain !== null) c.drawImage(scene.terrain, 0, 0);
	if (scene.grid) drawGrid(c, vp, scene.rows, scene.cols);
	if (scene.selection !== null) drawSelection(c, vp, scene.selection);
	if (scene.path !== null) drawPath(c, vp, scene.path);
	atMap(c, vp);
	for (const u of scene.units) drawSprite(c, u, images);
	atScreen(c, vp);
	for (const u of scene.units)
		if (u.marker !== null) drawMarker(c, u, u.marker, toScreen({ x: hexCentre(u.row, u.col).x, y: hexCentre(u.row, u.col).y + 12 }, vp));
}
