/**
 * Fields over the map's hexes for the remastered AI's analysis: what the terrain costs a movement method, the
 * cheapest way to a set of hexes, the hexes a move reaches, the steps from a set of hexes. Terrain only: units,
 * zones of control and bridges aside.
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

import { isPartialEdge, neighbourCol, neighbourRow } from "../geometry";
import { moveCosts } from "../rules";
import { roadType } from "../tables";
import type { World } from "../types";

/** A field's value for a hex no way reaches. */
export const UNREACHED = 0xffff;

//The road column of the movement tables, after the terrains; costs from STOP stop the move, from NO_ENTRY
//can't be entered (movement.ts)
const ROAD = 17;
const STOP = 254;
const NO_ENTRY = 255;
//A hex that stops the move (a river, a mountain) counts as this many points in a distance field: about a
//turn's march, as the move ends there
const STOP_COST = 6;

/** What entering each hex costs a movement method on the map's ground, by hex (254 stops the move, 255 can't). */
export function terrainCosts(w: World, movmethod: number): Uint8Array {
	const costs = moveCosts(w.rules, w.state.scenario.ground, movmethod);
	const { rows, cols, lastRowPartial, lastColPartial } = w.state.map;
	const out = new Uint8Array(rows * cols);
	for (let h = 0; h < out.length; h++) {
		const hex = w.data.hexes[h];
		out[h] = isPartialEdge(Math.floor(h / cols), h % cols, rows, cols, lastRowPartial, lastColPartial) ? NO_ENTRY
			: costs[hex.road > roadType.none ? ROAD : hex.terrain];
	}
	return out;
}

/** Calls `visit` with the index of each hex next to hex `h` on the map. */
export function eachNeighbour(rows: number, cols: number, h: number, visit: (n: number) => void) {
	const row = Math.floor(h / cols), col = h % cols;
	for (let k = 0; k < 6; k++) {
		const r = neighbourRow(row, col, k), c = neighbourCol(col, k);
		if (r >= 0 && r < rows && c >= 0 && c < cols) visit(r * cols + c);
	}
}

//A binary heap of hexes by their cost
class Queue {
	private readonly hexes: number[] = [];
	private readonly keys: number[] = [];
	get size(): number {
		return this.hexes.length;
	}
	push(hex: number, key: number) {
		let i = this.hexes.length;
		this.hexes.push(hex);
		this.keys.push(key);
		while (i > 0) {
			const up = (i - 1) >> 1;
			if (this.keys[up] <= key) break;
			this.move(up, i);
			i = up;
		}
		this.hexes[i] = hex;
		this.keys[i] = key;
	}
	//The cheapest hex, taken off the heap
	pop(): number {
		const top = this.hexes[0], hex = this.hexes.pop() as number, key = this.keys.pop() as number;
		if (this.hexes.length > 0) this.sink(hex, key);
		return top;
	}
	private sink(hex: number, key: number) {
		const n = this.hexes.length;
		let i = 0;
		for (let child = 1; child < n; child = 2 * i + 1) {
			if (child + 1 < n && this.keys[child + 1] < this.keys[child]) child++;
			if (this.keys[child] >= key) break;
			this.move(child, i);
			i = child;
		}
		this.hexes[i] = hex;
		this.keys[i] = key;
	}
	private move(from: number, to: number) {
		this.hexes[to] = this.hexes[from];
		this.keys[to] = this.keys[from];
	}
}

//The points a path pays to enter a hex that costs `cost`, Infinity where it can't
const pathCost = (cost: number) => cost < STOP ? cost : cost === STOP ? STOP_COST : Infinity;

/**
 * The cheapest cost from every hex to the nearest of `targets` (hex indices), entering each hex at its terrain cost:
 * UNREACHED where no path leads.
 */
export function costField(w: World, costs: Uint8Array, targets: readonly number[]): Uint16Array {
	const { rows, cols } = w.state.map;
	const field = new Uint16Array(rows * cols).fill(UNREACHED), queue = new Queue();
	for (const t of targets) {
		field[t] = 0;
		queue.push(t, 0);
	}
	const done = new Uint8Array(rows * cols);
	while (queue.size > 0) {
		const h = queue.pop();
		if (done[h]) continue;
		done[h] = 1;
		//From a neighbour, the way to the targets enters h
		const through = field[h] + pathCost(costs[h]);
		if (through >= UNREACHED) continue;
		eachNeighbour(rows, cols, h, (n) => {
			if (through < field[n]) {
				field[n] = through;
				queue.push(n, through);
			}
		});
	}
	return field;
}

/**
 * The hexes a unit on `from` reaches with `points` to spend, on the terrain only: a hex that stops the move is
 * entered with any point left and ends it there.
 */
export function reached(w: World, costs: Uint8Array, from: number, points: number): number[] {
	const { rows, cols } = w.state.map;
	const spent = new Map<number, number>([[from, 0]]), queue = new Queue(), done = new Set<number>();
	queue.push(from, 0);
	while (queue.size > 0) {
		const h = queue.pop(), d = spent.get(h) as number;
		if (done.has(h)) continue;
		done.add(h);
		if (h !== from && costs[h] >= STOP) continue;
		eachNeighbour(rows, cols, h, (n) => {
			const cost = costs[n];
			if (cost >= NO_ENTRY || d >= points) return;
			const next = cost === STOP ? points : d + cost;
			if (next <= points && next < (spent.get(n) ?? Infinity)) {
				spent.set(n, next);
				queue.push(n, next);
			}
		});
	}
	return [...done];
}

/** The hexes within `steps` of any of `sources` on the map (the sources included), each once. */
export function around(w: World, sources: readonly number[], steps: number): number[] {
	const { rows, cols } = w.state.map;
	const depth = new Map<number, number>(), out = [...sources];
	for (const s of sources) depth.set(s, 0);
	for (let i = 0; i < out.length; i++) {
		const d = depth.get(out[i]) as number;
		if (d >= steps) continue;
		eachNeighbour(rows, cols, out[i], (n) => {
			if (depth.has(n)) return;
			depth.set(n, d + 1);
			out.push(n);
		});
	}
	return out;
}

/** The steps from every hex to the nearest of `sources`, terrain aside: UNREACHED for every hex without a source. */
export function stepField(w: World, sources: readonly number[]): Uint16Array {
	const { rows, cols } = w.state.map;
	const field = new Uint16Array(rows * cols).fill(UNREACHED), queue = [...sources];
	for (const s of sources) field[s] = 0;
	for (let i = 0; i < queue.length; i++)
		eachNeighbour(rows, cols, queue[i], (n) => {
			if (field[n] !== UNREACHED) return;
			field[n] = field[queue[i]] + 1;
			queue.push(n);
		});
	return field;
}
