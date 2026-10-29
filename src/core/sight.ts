/**
 * Sight: spotting and zone of control, computed from the units (D10), not counted by hand, so nothing drifts
 * (#72, #73). A step computes it again after it changes the units.
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

import { leaderType } from "./tables";
import { adjacent, cellsInRange } from "./geometry";
import type { Position, Sight, UnitState, World } from "./types";
import { hasLeader, isAir } from "./units";
import { emptySight, hexIndex, onMap, sideOf, unitData } from "./world";

/** How many hexes the unit spots: its equipment's range, plus its recon leaders'. */
export function unitSpotRange(w: World, u: UnitState): number {
	let range = unitData(w, u).spotrange;
	if (hasLeader(w, u, leaderType.eliteReconVeteran)) range += 2;
	if (hasLeader(w, u, leaderType.skilledReconnaissance)) range += 1;
	return range;
}

/** The hexes in a unit's zone of control: its neighbours on the map; none for an air unit or a unit on no hex. */
export function zocCells(w: World, u: UnitState): Position[] {
	if (u.row < 0 || isAir(w, u)) return [];
	return adjacent(u.row, u.col).filter((c) => onMap(w, c.row, c.col));
}

/** The hexes a unit spots: its spotting range and its own hex; none for a unit on no hex. */
export function spotCells(w: World, u: UnitState): Position[] {
	if (u.row < 0) return [];
	const cells = cellsInRange(u.row, u.col, unitSpotRange(w, u), w.state.map.rows, w.state.map.cols);
	cells.push({ row: u.row, col: u.col });
	return cells;
}

export function computeSight(w: World): Sight {
	const sight = emptySight(w.state.map.rows * w.state.map.cols);
	for (const u of w.state.units) {
		const side = sideOf(w, u);
		if (side > 1) continue;
		for (const c of zocCells(w, u)) sight.zoc[side][hexIndex(w, c.row, c.col)]++;
		for (const c of spotCells(w, u)) sight.spot[side][hexIndex(w, c.row, c.col)]++;
	}
	return sight;
}
