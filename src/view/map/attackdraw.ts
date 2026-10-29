//The attack cursor on the map's canvas (#441, the AttackPreview card's stage 1): over the pointed target a brass
//crosshair with the two losses, as the old attack cursor showed them; and a retreat's trail (CombatResults). It draws
//what the view model (src/view/hud/odds.ts, src/view/hud/results.ts) computed, at screen size; colours are the tokens'.
import type { Position } from "../../core/types";
import { atMap, atScreen, sideColour, strokeLine, toScreen, type Viewport } from "./canvas";
import { hexCentre, type Point } from "./hexgrid";
import type { LossChip, Glance } from "../hud/odds";
import { TOKENS } from "../tokens";

const MAP = TOKENS.map;

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

//What the cursor draws: the glance over the pointed target
export interface Preview {
	glance: Glance | null;
	trail: { from: Position; to: Position } | null; //a retreat just shown (CombatResults): from where the defender stood
}

//Over the rest of the map, after the markers and the plaques
export function drawPreview(c: CanvasRenderingContext2D, vp: Viewport, p: Preview) {
	if (p.trail !== null) drawTrail(c, vp, p.trail.from, p.trail.to);
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

//A loss chip: the loss typed on its side's colour, 0 when none; returns its width
function chip(c: CanvasRenderingContext2D, ch: LossChip, x: number, y: number): number {
	const text = ch.loss === 0 ? "0" : "−" + ch.loss;
	c.font = "bold 12px " + TOKENS.fonts.mono;
	const w = Math.ceil(c.measureText(text).width) + 8;
	c.fillStyle = sideColour(ch.side);
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

//Over the pointed target: the brass crosshair on its centre, the two chips (yours, then theirs) at a fixed offset to its
//lower right
function drawGlance(c: CanvasRenderingContext2D, vp: Viewport, g: Glance) {
	atScreen(c, vp);
	const p = toScreen(hexCentre(g.at.row, g.at.col), vp);
	crosshair(c, p, 10, MAP["hex-select"], 2);
	const y = Math.round(p.y + 12), x = Math.round(p.x + 16);
	chip(c, g.theirs, x + chip(c, g.yours, x, y) + 2, y);
}
