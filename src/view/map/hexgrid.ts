//The map's hex grid in the pixels of the map image (PG2's, as the old renderer lays it out): flat-topped
//hexes 60 wide and 50 high, a column every 45px, an odd column half a hex lower. The map image starts
//inside the first column and row, which PG2 maps define as half hexes, so hex 0,0's centre is at -15,0.
//Plain functions, no DOM: the map's view model and its drawing both read them (test/view-map.test.ts).
import type { Position } from "../../core/types";
import { TOKENS } from "../tokens";

export interface Point {
	x: number;
	y: number;
}

//Half the hex's height (its radius to an edge), and the length of its top edge
const R = TOKENS.px["hex-h"] / 2;
const SIDE = TOKENS.px["hex-w"] / 2;
//The column step: a side and the half side the next column's hexes slot under
const STEP = SIDE * 1.5;

export function hexCentre(row: number, col: number): Point {
	return { x: col * STEP - SIDE / 2, y: row * 2 * R + (col & 1 ? R : 0) };
}

//A hex's corners from its centre, clockwise from the top left. adjacent()'s neighbour k (N, NW, SW, S,
//SE, NE: src/core/geometry.ts) is across the edge from corner EDGES[k][0] to EDGES[k][1]
export const CORNERS: readonly Point[] = [
	{ x: -SIDE / 2, y: -R }, { x: SIDE / 2, y: -R }, { x: SIDE, y: 0 }, { x: SIDE / 2, y: R }, { x: -SIDE / 2, y: R }, { x: -SIDE, y: 0 },
];
export const EDGES: readonly (readonly [number, number])[] = [[0, 1], [5, 0], [4, 5], [3, 4], [2, 3], [1, 2]];

//Whether a point, from a hex's centre, is inside the hex: within its height, and inside the slanted
//edges that run from the top and bottom corners to the side points
function inside(dx: number, dy: number): boolean {
	return Math.abs(dy) <= R && Math.abs(dx) <= SIDE - (SIDE / 2) * (Math.abs(dy) / R);
}

//The hex under a point of the map image, null off the map. The columns near the point are tried with the
//rows near it, the first whose hex holds it taken
export function cellAt(p: Point, rows: number, cols: number): Position | null {
	const near = Math.round((p.x + SIDE / 2) / STEP);
	for (let col = near - 1; col <= near + 1; col++) {
		if (col < 0 || col >= cols) continue;
		const row = Math.round((p.y - (col & 1 ? R : 0)) / (2 * R)) || 0; //(not -0)
		const c = hexCentre(row, col);
		if (row >= 0 && row < rows && inside(p.x - c.x, p.y - c.y)) return { row, col };
	}
	return null;
}

//The size of the grid, from the first hex's top left edge to the last's bottom right: the map image's
//size when it hasn't loaded (an image is as big as its map, or a little bigger)
export function gridSize(rows: number, cols: number): { width: number; height: number } {
	return { width: Math.max(0, (cols - 1) * STEP + SIDE / 2), height: rows * 2 * R };
}
