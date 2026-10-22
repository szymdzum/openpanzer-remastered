/**
 * Moves - a unit moving as the old engine moves it (Map.moveUnit, Unit.move, Map.captureHex): along
 * its path until a hidden enemy stops it, what it pays, the hex it takes, the undo it leaves
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

import { changeUnit, playerAt } from "./draft";
import { disembarkPositions } from "./movement";
import type { Draft, UnitId } from "./types";
import { unitById } from "./world";

//What selecting a unit of the player whose turn it is does to it (MapSelection.select), which the
//old engine's mount, unmount and undo do last: a unit leaving its carrier gets back on it unless it
//can still land somewhere. The selection itself is the UI's (D6)
export function reselect(d: Draft, id: UnitId) {
	const u = unitById(d, id);
	if (playerAt(d, u.owner).id !== d.state.turn.currentPlayer || u.carrier >= 0) return;
	changeUnit(d, id, (x) => { x.carrier = -x.carrier; });
	if (disembarkPositions(d, unitById(d, id)).length > 0) changeUnit(d, id, (x) => { x.carrier = -x.carrier; });
}
