//The map canvas's primitives (#345): where the map is on the screen and how a line is laid out at the
//map's scale and stroked at the screen's, so overlays keep their screen size at every scale (ZoomLevels).
//The map's drawing (src/view/mapdraw.ts) and its overlays (src/view/overlays.ts) share them.
import type { Position } from "../core/types";
import { CORNERS, EDGES, hexCentre, type Point } from "./hexgrid";
import type { Edge } from "./mapview";
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

//Where a point of the map is on the screen
export function toScreen(p: Point, vp: Viewport): Point {
	return { x: p.x * vp.scale - vp.x, y: p.y * vp.scale - vp.y };
}

//The whole map (its size in its own pixels) fit to a screen under a top inset and centred in the room left: the
//strategic map's viewport (StrategicMap). A screen not laid out yet still gets a scale above 0
export function fitViewport(map: { width: number; height: number }, screen: { width: number; height: number }, top: number,
	dpr: number): Viewport {
	const room = Math.max(1, screen.height - top);
	const scale = Math.min(Math.max(1, screen.width) / Math.max(1, map.width), room / Math.max(1, map.height));
	return { x: -(screen.width - map.width * scale) / 2, y: -(top + (room - map.height * scale) / 2), width: screen.width,
		height: screen.height, scale, dpr };
}

//Paths laid out in the map's pixels; strokes and markers in the screen's
export const atMap = (c: CanvasRenderingContext2D, vp: Viewport) =>
	c.setTransform(vp.dpr * vp.scale, 0, 0, vp.dpr * vp.scale, -vp.x * vp.dpr, -vp.y * vp.dpr);
export const atScreen = (c: CanvasRenderingContext2D, vp: Viewport) => c.setTransform(vp.dpr, 0, 0, vp.dpr, 0, 0);

//The rows and columns in view, a hex more on each side
export function inView(vp: Viewport, rows: number, cols: number): { r0: number; r1: number; c0: number; c1: number } {
	const x0 = vp.x / vp.scale, y0 = vp.y / vp.scale;
	const x1 = (vp.x + vp.width) / vp.scale, y1 = (vp.y + vp.height) / vp.scale;
	const step = PX["hex-w"] * 0.75, h = PX["hex-h"];
	return { c0: Math.max(0, Math.floor(x0 / step) - 1), c1: Math.min(cols - 1, Math.ceil(x1 / step) + 1),
		r0: Math.max(0, Math.floor(y0 / h) - 1), r1: Math.min(rows - 1, Math.ceil(y1 / h) + 1) };
}

//How far past its hex's centre something drawn for a hex reaches: a unit's sprite at the map's scale (the largest strip's
//frame is 160 by 120, drawn a little above the centre, an aircraft lifted with its shadow under it), and at the screen's a
//marker, a chip or a plaque (a town's name)
const REACH_MAP = 100, REACH_SCREEN = 160;

//Whether what is drawn for a hex can show on the screen (review F1): what can't is left out, which changes no pixel
export function nearView(vp: Viewport): (at: Position) => boolean {
	const m = REACH_MAP * vp.scale + REACH_SCREEN;
	const x0 = vp.x - m, y0 = vp.y - m, x1 = vp.x + vp.width + m, y1 = vp.y + vp.height + m;
	return (at) => {
		const p = hexCentre(at.row, at.col), x = p.x * vp.scale, y = p.y * vp.scale;
		return x >= x0 && x <= x1 && y >= y0 && y <= y1;
	};
}

export function addHex(c: CanvasRenderingContext2D, at: Position) {
	const o = hexCentre(at.row, at.col);
	c.moveTo(o.x + CORNERS[0].x, o.y + CORNERS[0].y);
	for (let k = 1; k < 6; k++) c.lineTo(o.x + CORNERS[k].x, o.y + CORNERS[k].y);
	c.closePath();
}

export function addEdge(c: CanvasRenderingContext2D, e: Edge) {
	const o = hexCentre(e.row, e.col), [a, b] = EDGES[e.side];
	c.moveTo(o.x + CORNERS[a].x, o.y + CORNERS[a].y);
	c.lineTo(o.x + CORNERS[b].x, o.y + CORNERS[b].y);
}

//The path laid out, stroked at screen size over the dark under-stroke every map line has
export function strokeLine(c: CanvasRenderingContext2D, vp: Viewport, colour: string, width: number, under: number, dash: number[] = []) {
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

export function fillHexes(c: CanvasRenderingContext2D, vp: Viewport, hexes: Position[], colour: string, alpha: number) {
	if (hexes.length === 0) return;
	atMap(c, vp);
	c.beginPath();
	for (const h of hexes) addHex(c, h);
	c.globalAlpha = alpha;
	c.fillStyle = colour;
	c.fill();
	c.globalAlpha = 1;
}

//A side's colour on the map: its plates, chips and plaques
export const sideColour = (side: number) => side === 1 ? MAP["map-allied"] : MAP["map-axis"];

//A token's colour (#rrggbb) at an alpha, for what takes the alpha in its colour (a canvas shadow)
export function withAlpha(colour: string, alpha: number): string {
	const n = parseInt(colour.slice(1), 16);
	return "rgba(" + (n >> 16) + ", " + ((n >> 8) & 255) + ", " + (n & 255) + ", " + alpha + ")";
}

//A path of the hexes in view (a hex more on each side), those keep says, laid out at the map's scale
export function addHexesInView(c: CanvasRenderingContext2D, vp: Viewport, rows: number, cols: number, keep: (hex: number) => boolean) {
	const v = inView(vp, rows, cols);
	atMap(c, vp);
	c.beginPath();
	for (let row = v.r0; row <= v.r1; row++)
		for (let col = v.c0; col <= v.c1; col++)
			if (keep(row * cols + col)) addHex(c, { row, col });
}
