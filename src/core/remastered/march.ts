/**
 * The remastered AI's units on the march: the ground units free to fight and the turns each needs to reach a hex, on
 * the distance fields (fields.ts).
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

import { unitClass } from "../tables";
import type { Position, UnitId, UnitState, World } from "../types";
import { isGround } from "../units";
import { hexIndex, unitData } from "../world";
import { type AnalysisCache, fieldTo } from "./analysis";
import { UNREACHED } from "./fields";

export const samePosition = (a: Position, b: Position) => a.row === b.row && a.col === b.col;
export const classOf = (w: World, u: UnitState) => unitData(w, u, true).uclass;
export const hexOf = (w: World, p: Position) => hexIndex(w, p.row, p.col);

/** How a unit marches: in its transport when that goes further. */
export function marchOf(w: World, u: UnitState): EquipmentEntry {
	const own = unitData(w, u, true);
	if (u.transport === null) return own;
	const transport = w.equipment[u.transport.eqid];
	return transport.movpoints > own.movpoints ? transport : own;
}

/** The turns of its march a unit needs to reach the hex, on the terrain alone (fields.ts); Infinity where it can't. */
export function turnsTo(w: World, cache: AnalysisCache, u: UnitState, at: Position): number {
	const march = marchOf(w, u), points = fieldTo(w, cache, march.movmethod, [at])[hexOf(w, u)];
	if (points === 0) return 0;
	return march.movpoints <= 0 || points === UNREACHED ? Infinity : Math.ceil(points / march.movpoints);
}

/** The player's ground units no operation holds, on the map, that fight. */
export function freeGround(w: World, player: number, held: ReadonlySet<UnitId>): UnitState[] {
	return w.state.units.filter((u) => u.owner === player && u.row >= 0 && !held.has(u.id) && isGround(w, u)
		&& classOf(w, u) !== unitClass.groundTransport && classOf(w, u) !== unitClass.fortification);
}
