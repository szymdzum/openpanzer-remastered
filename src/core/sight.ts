/**
 * Sight: spotting and zone of control, computed from the units (D10), not counted by hand, so nothing drifts
 * (#72, #73). A step computes it again after it changes the units.
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

import { leaderType, terrainType } from "./tables";
import { adjacent, cellsInRange } from "./geometry";
import type { Position, Sight, UnitState, World } from "./types";
import { hasLeader, hasLeaderAbility, isAir } from "./units";
import { airUnitAt, emptySight, groundUnitAt, hexIndex, isSpotted, onMap, sideOf, unitData } from "./world";
import { weatherSpotRange } from "./weathereffects";

/** How many hexes the unit spots: its equipment's range, plus its recon leaders', less in bad weather. */
export function unitSpotRange(w: World, u: UnitState): number {
	let range = unitData(w, u).spotrange;
	if (hasLeader(w, u, leaderType.eliteReconVeteran)) range += 2;
	if (hasLeader(w, u, leaderType.skilledReconnaissance)) range += 1;
	return weatherSpotRange(w, u, range);
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

/**
 * Whether the side spots the unit where it stands: it spots its hex, but a unit hidden by Forest Camouflage only
 * from next to it.
 */
export function spotsUnit(w: World, u: UnitState, side: number): boolean {
	if (!isSpotted(w, hexIndex(w, u.row, u.col), side)) return false;
	return w.noFOW || !isCamouflaged(w, u) || unitsNear(w, u).some((o) => sideOf(w, o) === side);
}

/** Whether the side sees the unit: it spots it, or the unit was spotted or fired this round (tempSpotted). */
export function seesUnit(w: World, u: UnitState, side: number): boolean {
	return spotsUnit(w, u, side) || u.tempSpotted;
}

/**
 * Whether Forest Camouflage hides the unit: a ground unit with it in a forest ("cannot be spotted by enemy units
 * unless they move adjacent to it"), in the rules where every leader ability works.
 */
export function isCamouflaged(w: World, u: UnitState): boolean {
	return w.rules.allLeaderAbilities && u.row >= 0 && w.data.hexes[hexIndex(w, u.row, u.col)].terrain === terrainType.Forest
		&& !isAir(w, u) && hasLeaderAbility(w, u, leaderType.forestCamouflage);
}

/** The other units on u's hex (the one above or below it) and on the hexes next to it; none for a unit on no hex. */
export function unitsNear(w: World, u: UnitState): UnitState[] {
	if (u.row < 0) return [];
	const near: UnitState[] = [];
	for (const c of [{ row: u.row, col: u.col }, ...adjacent(u.row, u.col)]) {
		if (!onMap(w, c.row, c.col)) continue;
		const hex = hexIndex(w, c.row, c.col);
		for (const o of [groundUnitAt(w, hex), airUnitAt(w, hex)]) if (o !== null && o.id !== u.id) near.push(o);
	}
	return near;
}
