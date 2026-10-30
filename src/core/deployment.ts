/**
 * Where a side deploys the units it bought: the scenario's deployment hexes, or in the remaster's rules,
 * for a side with none, the cities, airfields and ports it owns.
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

import { movMethod, terrainType, unitClass } from "./tables";
import { playerAt } from "./draft";
import { cellsInRange } from "./geometry";
import type { World } from "./types";
import { sideOf, unitById } from "./world";
import { seesUnit } from "./sight";

type Kind = "ground" | "air" | "sea";

//As Map.getDeployHexes.
const ownDeployment = (w: World, side: number, hex: number) => {
	const deployment = w.data.hexes[hex].deployment;
	return deployment >= 0 && playerAt(w, deployment).side === side;
};

//For a side without deployment hexes: a ground unit on a city, an aircraft on an airfield, a ship on a port.
function kindOn(terrain: number): Kind | null {
	if (terrain === terrainType.City) return "ground";
	if (terrain === terrainType.Airfield) return "air";
	return terrain === terrainType.Port ? "sea" : null;
}

function kindOf(w: World, eqid: number): Kind {
	const e = w.equipment[eqid];
	if (e.movmethod === movMethod.air) return "air";
	return e.uclass >= unitClass.submarine && e.uclass <= unitClass.lightCruiser ? "sea" : "ground";
}

function nearSeenEnemy(w: World, side: number, hex: number): boolean {
	const { rows, cols } = w.state.map, row = Math.floor(hex / cols), col = hex % cols;
	return [{ row, col }, ...cellsInRange(row, col, 1, rows, cols)].some((c) => {
		const at = c.row * cols + c.col, h = w.state.map.hexes[at];
		return [h.unit, h.air].some((id) => {
			const u = id === null ? null : unitById(w, id);
			return u !== null && sideOf(w, u) !== side && seesUnit(w, u, side);
		});
	});
}

function ownTown(w: World, side: number, hex: number): boolean {
	const owner = w.state.map.hexes[hex].owner;
	return owner >= 0 && playerAt(w, owner).side === side && kindOn(w.data.hexes[hex].terrain) !== null
		&& !nearSeenEnemy(w, side, hex);
}

/**
 * The hexes the side deploys on, row by row, taken or not; of what a unit of eqid deploys on, else of
 * every kind. Own towns count only away from an enemy the side sees.
 */
export function deploymentHexes(w: World, side: number, eqid?: number): number[] {
	const hexes = w.data.hexes.map((_h, hex) => hex);
	const own = hexes.filter((hex) => ownDeployment(w, side, hex));
	if (own.length > 0 || !w.rules.deployOnOwnTowns) return own;
	const kind = eqid === undefined ? null : kindOf(w, eqid);
	return hexes.filter((hex) => ownTown(w, side, hex) && (kind === null || kindOn(w.data.hexes[hex].terrain) === kind));
}
