//The AI's debug overlay drawn over the map (aidebug.ts, #611): only the cells of the hexes in view, the tints one fill
//a colour and strength, the outlines one stroke a colour, the numbers as small labels at screen size
import type { Position } from "../../core/types";
import { addHex, atMap, atScreen, fillHexes, inView, strokeLine, toScreen, type Viewport } from "./canvas";
import type { DebugCell, Overlay } from "./aidebug";
import { hexCentre } from "./hexgrid";
import { label } from "./overlays";
import { TOKENS } from "../tokens";

const MAP = TOKENS.map, PX = TOKENS.px;
const LOOK = { size: TOKENS.fontPx["map-small"], height: 12, paper: MAP["map-paper-raised"], ink: MAP["map-ink"], edge: MAP["map-edge"] };

const positionOf = (hex: number, cols: number): Position => ({ row: Math.floor(hex / cols), col: hex % cols });

//The cells keyed by what they share
function grouped(cells: DebugCell[], key: (c: DebugCell) => string | null): Map<string, DebugCell[]> {
	const groups = new Map<string, DebugCell[]>();
	for (const c of cells) {
		const k = key(c);
		if (k !== null) groups.set(k, [...groups.get(k) || [], c]);
	}
	return groups;
}

export function drawAIOverlay(c: CanvasRenderingContext2D, vp: Viewport, o: Overlay, rows: number, cols: number) {
	const v = inView(vp, rows, cols);
	const shown = o.cells.filter((x) => {
		const p = positionOf(x.hex, cols);
		return p.row >= v.r0 && p.row <= v.r1 && p.col >= v.c0 && p.col <= v.c1;
	});
	for (const [, cells] of grouped(shown, (x) => x.tint === null ? null : x.tint + " " + x.alpha))
		fillHexes(c, vp, cells.map((x) => positionOf(x.hex, cols)), cells[0].tint!, cells[0].alpha);
	for (const [, cells] of grouped(shown, (x) => x.outline ? (x.tint || "") + (x.dashed ? " dashed" : "") : null)) {
		atMap(c, vp);
		c.beginPath();
		for (const x of cells) addHex(c, positionOf(x.hex, cols));
		strokeLine(c, vp, cells[0].tint || MAP["hex-select"], PX["hex-move-width"], PX["hex-shadow-width"], cells[0].dashed ? [4, 3] : []);
	}
	atScreen(c, vp);
	for (const x of shown) {
		if (x.text === null) continue;
		const p = positionOf(x.hex, cols), at = toScreen(hexCentre(p.row, p.col), vp);
		label(c, x.text, at.x, at.y - LOOK.height / 2, LOOK);
	}
}
