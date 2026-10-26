//The attack preview on the map's canvas (#347, the AttackPreview card): the grey badge on each enemy in range the
//selected unit can't attack, with its reason under the pointer (stage 0), and over the pointed target a brass
//crosshair with the two losses and at most one glyph (stage 1), where the old attack cursor showed two numbers. It
//draws what the view model (src/view/odds.ts) computed, at screen size; colours are the tokens'.
import type { Position } from "../core/types";
import { atMap, atScreen, strokeLine, toScreen, type Viewport } from "./canvas";
import { hexCentre, type Point } from "./hexgrid";
import type { Blocked, LossChip, Glance, Glyph } from "./odds";
import { label } from "./overlays";
import { TOKENS } from "./tokens";

const MAP = TOKENS.map, PX = TOKENS.px;

//A crosshair: a ring and four ticks, over the dark under-stroke
function crosshair(c: CanvasRenderingContext2D, p: Point, r: number, colour: string, width: number) {
	c.beginPath();
	c.arc(p.x, p.y, r, 0, Math.PI * 2);
	for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
		c.moveTo(p.x + dx * (r + 3), p.y + dy * (r + 3));
		c.lineTo(p.x + dx * (r - 3), p.y + dy * (r - 3));
	}
	c.globalAlpha = 0.6;
	c.strokeStyle = MAP["hex-shadow"];
	c.lineWidth = width + 2;
	c.stroke();
	c.globalAlpha = 1;
	c.strokeStyle = colour;
	c.lineWidth = width;
	c.stroke();
}

//What the preview draws: the enemies in range the selected unit can't attack and the one pointed at (stage 0), the glance
//over the pointed target (stage 1)
export interface Preview {
	blocked: Blocked[];
	blockedAt: Blocked | null;
	glance: Glance | null;
	trail: { from: Position; to: Position } | null; //a retreat just shown (CombatResults): from where the defender stood
}

//Over the rest of the map, after the markers and the plaques
export function drawPreview(c: CanvasRenderingContext2D, vp: Viewport, p: Preview) {
	if (p.trail !== null) drawTrail(c, vp, p.trail.from, p.trail.to);
	drawBlocked(c, vp, p.blocked, p.blockedAt);
	if (p.glance !== null) drawGlance(c, vp, p.glance);
}

//A retreat's trail: a dashed line from where the defender stood to where it fell back, over the dark under-stroke
function drawTrail(c: CanvasRenderingContext2D, vp: Viewport, from: Position, to: Position) {
	atMap(c, vp);
	const a = hexCentre(from.row, from.col), b = hexCentre(to.row, to.col);
	c.beginPath();
	c.moveTo(a.x, a.y);
	c.lineTo(b.x, b.y);
	c.lineCap = "butt";
	strokeLine(c, vp, MAP["map-paper-raised"], 2, 4, [3, 3]);
}

//Stage 0: a grey crossed crosshair at the top right of each hex the unit can't attack; the reason under the one pointed at
function drawBlocked(c: CanvasRenderingContext2D, vp: Viewport, blocked: Blocked[], pointed: Blocked | null) {
	atScreen(c, vp);
	const dx = PX["hex-w"] / 4 * vp.scale, dy = PX["hex-h"] / 4 * vp.scale;
	for (const b of blocked) {
		const o = toScreen(hexCentre(b.at.row, b.at.col), vp), p = { x: o.x + dx, y: o.y - dy };
		c.beginPath();
		c.arc(p.x, p.y, 7, 0, Math.PI * 2);
		c.fillStyle = MAP["map-paper-sunken"];
		c.fill();
		c.lineWidth = 1;
		c.strokeStyle = MAP["map-edge"];
		c.stroke();
		c.beginPath();
		c.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
		c.moveTo(p.x - 4, p.y + 4);
		c.lineTo(p.x + 4, p.y - 4);
		c.strokeStyle = MAP["map-ink"];
		c.lineWidth = 1.2;
		c.stroke();
	}
	if (pointed === null) return;
	const o = toScreen(hexCentre(pointed.at.row, pointed.at.col), vp);
	label(c, pointed.reason, o.x + dx, o.y - dy + 10, { size: TOKENS.fontPx["map-label"], height: 13, paper: MAP["map-paper-raised"],
		ink: MAP["map-ink"], edge: MAP["map-edge"] });
}

//A loss chip: the loss typed on its side's colour, 0 when none; returns its width
function chip(c: CanvasRenderingContext2D, ch: LossChip, x: number, y: number): number {
	const text = ch.loss === 0 ? "0" : "−" + ch.loss;
	c.font = "bold 12px " + TOKENS.fonts.mono;
	const w = Math.ceil(c.measureText(text).width) + 8;
	c.fillStyle = ch.side === 1 ? MAP["map-allied"] : MAP["map-axis"];
	c.fillRect(x, y, w, 17);
	c.lineWidth = 1;
	c.strokeStyle = MAP["hex-shadow"];
	c.strokeRect(x + 0.5, y + 0.5, w - 1, 16);
	c.textAlign = "start";
	c.textBaseline = "middle";
	c.fillStyle = MAP.glint;
	c.fillText(text, x + 4, y + 9);
	return w;
}

//The glyph's fill: a trap in critical, a bonus in ok, the guns in low
const GLYPH_FILL: Record<Glyph, string> = { rugged: MAP["map-critical"], overrun: MAP["map-ok"], "no-return": MAP["map-ok"], support: MAP["map-low"] };

//The glyph's mark, in white on its square at x, y: a crossed circle, a double chevron, a shield, a gun
function glyphMark(c: CanvasRenderingContext2D, g: Glyph, x: number, y: number) {
	c.beginPath();
	if (g === "rugged") {
		c.arc(x + 8, y + 8, 4.6, 0, Math.PI * 2);
		c.moveTo(x + 5.2, y + 5.2); c.lineTo(x + 10.8, y + 10.8);
		c.moveTo(x + 10.8, y + 5.2); c.lineTo(x + 5.2, y + 10.8);
	} else if (g === "overrun") {
		c.moveTo(x + 3.5, y + 4.5); c.lineTo(x + 7, y + 8); c.lineTo(x + 3.5, y + 11.5);
		c.moveTo(x + 8.5, y + 4.5); c.lineTo(x + 12, y + 8); c.lineTo(x + 8.5, y + 11.5);
	} else if (g === "no-return") {
		c.moveTo(x + 8, y + 3); c.lineTo(x + 12.5, y + 4.8); c.lineTo(x + 12, y + 9); c.lineTo(x + 8, y + 13);
		c.lineTo(x + 4, y + 9); c.lineTo(x + 3.5, y + 4.8); c.closePath();
	} else {
		c.moveTo(x + 3, y + 12); c.lineTo(x + 13, y + 4);
		c.moveTo(x + 6.5, y + 11.5); c.arc(x + 5, y + 11.5, 1.5, 0, Math.PI * 2);
	}
	c.lineWidth = 1.4;
	c.strokeStyle = MAP.glint;
	c.stroke();
}

//Stage 1 over the pointed target: the brass crosshair on its centre, the two chips (yours, then theirs) and the glyph at
//a fixed offset to its lower right
function drawGlance(c: CanvasRenderingContext2D, vp: Viewport, g: Glance) {
	atScreen(c, vp);
	const p = toScreen(hexCentre(g.at.row, g.at.col), vp);
	crosshair(c, p, 10, MAP["hex-select"], 2);
	const y = Math.round(p.y + 12);
	let x = Math.round(p.x + 16);
	x += chip(c, g.yours, x, y) + 2;
	x += chip(c, g.theirs, x, y) + 4;
	if (g.glyph === null) return;
	c.fillStyle = GLYPH_FILL[g.glyph];
	c.fillRect(x, y + 0.5, 16, 16);
	c.lineWidth = 1;
	c.strokeStyle = MAP["map-edge"];
	c.strokeRect(x + 0.5, y + 1, 15, 15);
	glyphMark(c, g.glyph, x, y + 0.5);
}
