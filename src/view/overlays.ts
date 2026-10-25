//The map's overlays beside the move area (#345, the MapOverlays card): the fog of war, the hatched hexes
//the unit can reach but its side doesn't see, the enemy zone bars, the support fire arcs, and the plaques
//of the objectives and the towns (#62). They draw what the view model computed (src/view/mapview.ts,
//src/view/mapinfo.ts), at screen size at every map scale; colours and widths are the tokens'.
import type { Position } from "../core/types";
import { addHex, addHexesInView, atMap, atScreen, strokeLine, toScreen, type Viewport } from "./canvas";
import { CORNERS, EDGES, hexCentre, type Point } from "./hexgrid";
import type { Plaque, Support } from "./mapinfo";
import type { Edge } from "./mapview";
import { TOKENS } from "./tokens";

const MAP = TOKENS.map, PX = TOKENS.px;

//A flat wash on every hex in view the side shown doesn't see
export function drawFog(c: CanvasRenderingContext2D, vp: Viewport, fog: Uint8Array, rows: number, cols: number) {
	addHexesInView(c, vp, rows, cols, (hex) => fog[hex] === 1);
	c.fillStyle = MAP["hex-fog"];
	c.fill();
}

//The hexes the unit can reach but its side doesn't see, hatched at 45 degrees instead of tinted: a hidden
//enemy there is an ambush. The hatch is drawn at screen size inside the hexes, 6px apart
export function drawHatch(c: CanvasRenderingContext2D, vp: Viewport, hexes: Position[]) {
	if (hexes.length === 0) return;
	c.save();
	atMap(c, vp);
	c.beginPath();
	for (const h of hexes) addHex(c, h);
	c.globalAlpha = 0.1;
	c.fillStyle = MAP["hex-move"];
	c.fill();
	c.clip();
	atScreen(c, vp);
	const box = boundsOf(hexes, vp);
	c.beginPath();
	for (let x = box.x0 - box.h; x < box.x1; x += 6) {
		c.moveTo(x, box.y1);
		c.lineTo(x + box.h, box.y0);
	}
	c.globalAlpha = 0.55;
	c.strokeStyle = MAP["hex-move"];
	c.lineWidth = 1.2;
	c.stroke();
	c.restore();
}

//The screen box round some hexes, and its height
function boundsOf(hexes: Position[], vp: Viewport): { x0: number; y0: number; x1: number; y1: number; h: number } {
	const pts = hexes.map((h) => toScreen(hexCentre(h.row, h.col), vp));
	const rx = PX["hex-w"] / 2 * vp.scale, ry = PX["hex-h"] / 2 * vp.scale;
	const x0 = Math.min(...pts.map((p) => p.x)) - rx, x1 = Math.max(...pts.map((p) => p.x)) + rx;
	const y0 = Math.min(...pts.map((p) => p.y)) - ry, y1 = Math.max(...pts.map((p) => p.y)) + ry;
	return { x0, y0, x1, y1, h: y1 - y0 };
}

//An enemy zone: a bar on the middle of the edge that faces the enemy, where the move ends
export function drawZones(c: CanvasRenderingContext2D, vp: Viewport, zones: Edge[]) {
	if (zones.length === 0) return;
	atMap(c, vp);
	c.beginPath();
	for (const e of zones) {
		const o = hexCentre(e.row, e.col), [a, b] = EDGES[e.side];
		const p = { x: o.x + CORNERS[a].x, y: o.y + CORNERS[a].y }, q = { x: o.x + CORNERS[b].x, y: o.y + CORNERS[b].y };
		c.moveTo(p.x + (q.x - p.x) * 0.22, p.y + (q.y - p.y) * 0.22);
		c.lineTo(p.x + (q.x - p.x) * 0.78, p.y + (q.y - p.y) * 0.78);
	}
	c.lineCap = "round";
	strokeLine(c, vp, MAP["hex-target"], PX["hex-zone-width"], PX["hex-zone-width"] + 2);
}

//Support fire: a dashed arc from each gun to the attacker's hex with an arrowhead, the gun's hex outlined
//with a thin dotted line
export function drawSupport(c: CanvasRenderingContext2D, vp: Viewport, s: Support) {
	const to = hexCentre(s.attacker.row, s.attacker.col);
	atMap(c, vp);
	c.beginPath();
	for (const g of s.guns) addHex(c, g);
	atScreen(c, vp);
	c.setLineDash([1, 3]);
	c.lineWidth = 1;
	c.strokeStyle = MAP["hex-target"];
	c.stroke();
	c.setLineDash([]);
	for (const g of s.guns) {
		const from = hexCentre(g.row, g.col), bend = bendOf(from, to);
		atMap(c, vp);
		c.beginPath();
		c.moveTo(from.x, from.y);
		c.quadraticCurveTo(bend.x, bend.y, to.x, to.y);
		c.lineCap = "butt";
		strokeLine(c, vp, MAP["hex-target"], PX["hex-support-width"], PX["hex-support-width"] + 2.2, [5, 3]);
		arrowHead(c, toScreen(bend, vp), toScreen(to, vp));
	}
}

//The arc's control point: a fifth of its length to the side of the straight line
function bendOf(from: Point, to: Point): Point {
	const dx = to.x - from.x, dy = to.y - from.y;
	return { x: (from.x + to.x) / 2 + dy * 0.2, y: (from.y + to.y) / 2 - dx * 0.2 };
}

//An arrowhead at the tip, pointing along the line from the control point
function arrowHead(c: CanvasRenderingContext2D, from: Point, tip: Point) {
	const a = Math.atan2(tip.y - from.y, tip.x - from.x), len = 7, wide = 0.45;
	c.beginPath();
	c.moveTo(tip.x, tip.y);
	c.lineTo(tip.x - len * Math.cos(a - wide), tip.y - len * Math.sin(a - wide));
	c.lineTo(tip.x - len * Math.cos(a + wide), tip.y - len * Math.sin(a + wide));
	c.closePath();
	c.fillStyle = MAP["hex-target"];
	c.fill();
}

//How a label looks: its type size and height, its paper, ink and edge, the room left of its text (a star's)
interface Look {
	size: number;
	height: number;
	paper: string;
	ink: string;
	edge: string;
	lead?: number;
}

//A label on the map at screen size, centred at x with its top at y: text on paper with a thin edge
function label(c: CanvasRenderingContext2D, text: string, x: number, y: number, look: Look): { left: number; width: number } {
	c.font = "bold " + look.size + "px " + TOKENS.fonts.mono;
	const lead = look.lead || 0, textWidth = Math.ceil(c.measureText(text).width);
	const width = textWidth + 10 + lead, left = Math.round(x - width / 2);
	c.fillStyle = look.paper;
	c.fillRect(left, y, width, look.height);
	c.lineWidth = 1;
	c.strokeStyle = look.edge;
	c.strokeRect(left + 0.5, y + 0.5, width - 1, look.height - 1);
	c.textAlign = "center";
	c.textBaseline = "middle";
	c.fillStyle = look.ink;
	c.fillText(text, left + 5 + lead + textWidth / 2, y + look.height / 2 + 0.5);
	return { left, width };
}

//"support fire" over each gun
export function drawSupportTags(c: CanvasRenderingContext2D, vp: Viewport, s: Support) {
	atScreen(c, vp);
	for (const g of s.guns) {
		const p = toScreen(hexCentre(g.row, g.col), vp);
		label(c, "support fire", p.x, p.y - PX["hex-h"] / 2 * vp.scale - 8, { size: TOKENS.fontPx["map-label"], height: 13,
			paper: MAP["map-paper-raised"], ink: MAP["map-critical"], edge: MAP["map-edge"] });
	}
}

//A five-pointed star
function star(c: CanvasRenderingContext2D, x: number, y: number, r: number) {
	c.beginPath();
	for (let i = 0; i < 10; i++) {
		const a = -Math.PI / 2 + i * Math.PI / 5, rr = i & 1 ? r * 0.42 : r;
		c.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a));
	}
	c.closePath();
	c.fillStyle = MAP["hex-select"];
	c.fill();
	c.lineWidth = 0.6;
	c.strokeStyle = MAP["map-brass"];
	c.stroke();
}

//What a plaque says: its name set in capitals as the cards' labels are (the letters as the data has them), and
//the prestige taking it gives
function plaqueText(p: Plaque): string {
	return (p.name !== "" ? p.name : p.objective ? "Objective" : "Town").toUpperCase() + "  +" + p.prestige;
}

//An objective on paper, room for its star; a town smaller and greyer
const plaqueLook = (objective: boolean): Look => objective
	? { size: TOKENS.fontPx["map-label"], height: 15, lead: 10, paper: MAP["map-paper"], ink: MAP["map-ink"], edge: MAP["map-edge"] }
	: { size: TOKENS.fontPx["map-small"], height: 13, paper: MAP["map-paper-sunken"], ink: MAP["map-ink"], edge: MAP["map-edge"] };

//The plaques at the top of their hexes (#62): an objective with a star, its name and +150, a town with its name
//and +50; the bar at the foot in the owner's side colour
export function drawPlaques(c: CanvasRenderingContext2D, vp: Viewport, plaques: Plaque[]) {
	atScreen(c, vp);
	for (const p of plaques) {
		const at = toScreen(hexCentre(p.row, p.col), vp), look = plaqueLook(p.objective);
		const y = Math.round(at.y - PX["hex-h"] / 2 * vp.scale - 2);
		const box = label(c, plaqueText(p), at.x, y, look);
		if (p.objective) star(c, box.left + 8, y + look.height / 2 - 0.5, 4.2);
		if (p.side < 0) continue;
		c.fillStyle = p.side === 1 ? MAP["map-allied"] : MAP["map-axis"];
		c.fillRect(box.left + 1, y + look.height - 3, box.width - 2, 2);
	}
}
