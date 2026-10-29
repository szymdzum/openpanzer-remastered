//The strategic map's drawing (#345, the StrategicMap card): over the terrain fit to the window, a chip per unit
//and a large plaque per objective, laid out in the map's pixels so they shrink with it, as the card's scene does.
//No grid, fog, move area, path or cursor at this zoom. It draws what src/view/map/strategic.ts computed.
import { atMap, sideColour, type Viewport } from "./canvas";
import { hexCentre } from "./hexgrid";
import type { Plaque } from "./mapinfo";
import { star } from "./overlays";
import type { Chip, Strategic } from "./strategic";
import { TOKENS } from "../tokens";

const MAP = TOKENS.map;

//The flag strip once it has loaded, a flag 21 by 14 pixels a country
type Strip = CanvasImageSource | null;
const FLAG = { width: 21, height: 14 };


function drawFlag(c: CanvasRenderingContext2D, strip: Strip, flag: number, x: number, y: number, width: number) {
	if (strip === null || flag < 0) return;
	c.drawImage(strip, flag * FLAG.width, 0, FLAG.width, FLAG.height, x, y, width, width * FLAG.height / FLAG.width);
}

//A unit's chip on its hex's centre: a square with an edge for the side shown's, a lozenge for the enemy's (the
//strength plates' shapes), its nation's flag inside, at 55% when it has moved
function drawChip(c: CanvasRenderingContext2D, chip: Chip, strip: Strip) {
	const o = hexCentre(chip.row, chip.col), h = 26;
	c.globalAlpha = chip.moved ? 0.55 : 1;
	c.beginPath();
	if (chip.own) c.rect(o.x - 19, o.y - h / 2, 38, h);
	else {
		const x0 = o.x - 21, x1 = o.x + 21, tip = 7;
		c.moveTo(x0, o.y); c.lineTo(x0 + tip, o.y - h / 2); c.lineTo(x1 - tip, o.y - h / 2);
		c.lineTo(x1, o.y); c.lineTo(x1 - tip, o.y + h / 2); c.lineTo(x0 + tip, o.y + h / 2);
		c.closePath();
	}
	c.fillStyle = sideColour(chip.side);
	c.fill();
	if (chip.own) {
		c.lineWidth = 2;
		c.strokeStyle = MAP["hex-shadow"];
		c.stroke();
	}
	drawFlag(c, strip, chip.flag, o.x - 9, o.y - 6, 18);
	c.globalAlpha = 1;
}

//An objective's large plaque on its hex's centre: the star, the name as the data writes it, the flag on it, and the
//bar at the foot in its holder's side colour
function drawObjective(c: CanvasRenderingContext2D, p: Plaque, strip: Strip) {
	const o = hexCentre(p.row, p.col), h = 40, flag = p.flag >= 0 && strip !== null ? 22 + 8 : 0;
	c.font = "bold 22px " + TOKENS.fonts.mono;
	const name = p.name !== "" ? p.name : "Objective", text = Math.ceil(c.measureText(name).width);
	const w = 12 + 20 + 8 + text + flag + 10, x = Math.round(o.x - w / 2), y = Math.round(o.y - h / 2);
	c.fillStyle = MAP["map-paper"];
	c.fillRect(x, y, w, h);
	if (p.side >= 0) {
		c.fillStyle = sideColour(p.side);
		c.fillRect(x, y + h - 6, w, 6);
	}
	c.lineWidth = 2;
	c.strokeStyle = MAP["map-edge"];
	c.strokeRect(x, y, w, h);
	star(c, x + 22, y + h / 2 - 2, 10);
	c.textAlign = "start";
	c.textBaseline = "middle";
	c.fillStyle = MAP["map-ink"];
	c.fillText(name, x + 40, y + h / 2 - 2);
	drawFlag(c, strip, p.flag, x + 40 + text + 8, y + h / 2 - 9, 22);
}

//The chips, then the objectives over them
export function drawStrategic(c: CanvasRenderingContext2D, vp: Viewport, s: Strategic, strip: Strip) {
	atMap(c, vp);
	for (const chip of s.chips) drawChip(c, chip, strip);
	for (const p of s.plaques) drawObjective(c, p, strip);
}
