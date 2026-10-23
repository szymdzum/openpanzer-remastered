/**
 * Geometry - the hex grid: distance, neighbours, the cells in a range, directions
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 *
 * Columns are offset: an odd column sits half a hex lower. A cell is { row, col }.
 */

import { direction } from "../prototypes";
import type { Position } from "./types";

//The distance in hexes between two cells (GameRules.distance)
export function distance(row1: number, col1: number, row2: number, col2: number): number {
	//shift the grid so its columns run diagonally: x is twice the row, plus one on odd columns
	const x1 = col1 % 2 ? row1 * 2 + 1 : row1 * 2;
	const x2 = col2 % 2 ? row2 * 2 + 1 : row2 * 2;
	const dx = Math.abs(x2 - x1);
	const dy = Math.abs(col2 - col1);
	return dx > dy ? ((dx - dy) / 2 + dy) >> 0 : dy;
}

//adjacent()'s six as offsets, for the hot paths that don't make them: an odd column's side
//neighbours are a row lower
const NEAR_COL = [0, -1, -1, 0, 1, 1];
const NEAR_ROW = [-1, -1, 0, 1, 0, -1];

//The column of the k-th of adjacent()'s neighbours of a cell in col
export function neighbourCol(col: number, k: number): number {
	return col + NEAR_COL[k];
}

//Its row
export function neighbourRow(row: number, col: number, k: number): number {
	return row + NEAR_ROW[k] + (NEAR_COL[k] === 0 ? 0 : col % 2);
}

//The six neighbours from north: N, NW, SW, S, SE, NE (also off the map)
export function adjacent(row: number, col: number): Position[] {
	const odd = col % 2;
	return [
		{ row: row - 1, col },
		{ row: row - 1 + odd, col: col - 1 },
		{ row: row + odd, col: col - 1 },
		{ row: row + 1, col },
		{ row: row + odd, col: col + 1 },
		{ row: row - 1 + odd, col: col + 1 },
	];
}

//The cells around (row, col) up to range on a rows x cols map, without the cell itself: its
//column first, top down, then the columns at 1, 2... on the right and the left, row by row. The
//order is the move range's and the attack cells'. Column 0 is a column like the others (#69: the
//left edge test was > 0, so no other column reached it)
export function cellsInRange(row: number, col: number, range: number, rows: number, cols: number): Position[] {
	const cells: Position[] = [];
	if (range <= 0) return cells;

	let minRow = row - range;
	let maxRow = row + range;
	for (let r = Math.max(0, minRow); r <= Math.min(rows - 1, maxRow); r++)
		if (r !== row) cells.push({ row: r, col });

	for (let colOff = 1; colOff <= range; colOff++) {
		//the rows in reach shrink by one every column, from the bottom on odd ones
		if ((col + colOff) % 2 === 1) {
			if (maxRow > 0) maxRow--;
		} else if (minRow < rows) {
			minRow++;
		}
		columnPair(cells, Math.max(0, minRow), Math.min(rows - 1, maxRow), col, colOff, cols);
	}
	return cells;
}

//The rows from lo to hi of the columns colOff to the right and to the left of col, row by row
function columnPair(cells: Position[], lo: number, hi: number, col: number, colOff: number, cols: number) {
	for (let r = lo; r <= hi; r++) {
		if (col + colOff < cols) cells.push({ row: r, col: col + colOff });
		if (col - colOff >= 0) cells.push({ row: r, col: col - colOff });
	}
}

//The half hexes on the map's edges, which no unit can enter: the even columns of the first row,
//the last column and the odd columns of the last row when the map says they are partial
export function isPartialEdge(row: number, col: number, rows: number, cols: number,
	lastRowPartial: boolean, lastColPartial: boolean): boolean {
	return (row === 0 && col % 2 === 0) || (lastColPartial && col === cols - 1)
		|| (lastRowPartial && row === rows - 1 && col % 2 === 1);
}

//The approximate compass direction from (row1, col1) to (row2, col2), one of 16
//(GameRules.getDirection)
export function directionTo(row1: number, col1: number, row2: number, col2: number): number {
	if (col1 & 1 && row1 === row2) row1++;
	if (col2 & 1 && row1 === row2) row2++;

	const dx = row1 - row2;
	const dy = col1 - col2;
	if (dx === 0) return dy >= 0 ? direction.W : direction.E;
	if (dy === 0) return dx > 0 ? direction.N : direction.S;
	//steep: one subdivision towards west or east
	const delta = Math.abs(dy / dx) > 3 ? 1 : 0;
	if (dx > 0) return (dy > 0 ? direction.NW : direction.NE) + delta;
	return (dy > 0 ? direction.SW : direction.SE) + delta;
}

//The index in adjacent()'s list of the neighbour a facing points to
export function facingToAdjacentIndex(facing: number): number {
	switch (facing) {
		case direction.NW: case direction.NNW: case direction.WNW: case direction.W:
			return 1;
		case direction.SW: case direction.WSW: case direction.SSW:
			return 2;
		case direction.S:
			return 3;
		case direction.SE: case direction.SSE: case direction.ESE:
			return 4;
		case direction.NE: case direction.E: case direction.ENE: case direction.NNE:
			return 5;
		default:
			return 0;
	}
}
