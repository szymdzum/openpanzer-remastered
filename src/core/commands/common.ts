/**
 * What the handlers share: the refusals, the units they name
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

import type { Refusal } from "../command";
import type { CoreUnit, OffMapUnit, PlayerState, UnitState, World } from "../types";
import { unitById } from "../world";

export { playerAt } from "../draft";

export function refuse(reason: string): Refusal {
	return { reason };
}

//A unit in the unit list that is the current player's and passes rule (if given), or the refusal
export function unitCheck(w: World, id: number, rule?: (u: UnitState) => boolean, reason?: string): Refusal | null {
	const u = unitById(w, id);
	if (u === null) return refuse("no such unit");
	if (u.owner !== w.state.turn.currentPlayer) return refuse("not your unit");
	return !rule || rule(u) ? null : refuse(reason);
}

export function currentPlayer(w: World): PlayerState {
	return w.state.players[w.state.turn.currentPlayer];
}

//The current player's core unit at index, null when the list has none there
export function coreAt(w: World, index: number): CoreUnit | null {
	const p = currentPlayer(w);
	if (!p) return null;
	const c = p.core[index];
	return c === undefined ? null : c;
}

export
 function coreUnitOf(w: World, c: CoreUnit): OffMapUnit {
	if ("onMap" in c) return unitById(w, c.onMap);
	return "reserve" in c ? c.reserve : c.lost;
}

//A unit off the map, for the queries that read only what it is (its equipment, transport, carrier)
export function asUnit(u: OffMapUnit): UnitState {
	return u as UnitState;
}
