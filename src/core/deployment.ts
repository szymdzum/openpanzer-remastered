/**
 * Deployment - where a side deploys the units it bought: its deployment hexes (the scenario's), or in
 * the remaster's rules, for a side the scenario gave none, the cities, airfields and ports it owns
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

import { movMethod, terrainType, unitClass } from "./tables";
import { playerAt } from "./draft";
import { cellsInRange } from "./geometry";
import type { World } from "./types";
import { isSpotted, sideOf, unitById } from "./world";

//What deploys on a hex: a ground unit, an aircraft or a ship
type Kind = "ground" | "air" | "sea";

//A deployment hex of the side's (Map.getDeployHexes)
const ownDeployment = (w: World, side: number, hex: number) => {
	const deployment = w.data.hexes[hex].deployment;
	return deployment >= 0 && playerAt(w, deployment).side === side;
};

//What the remaster deploys on a hex of the terrain, a side without deployment hexes (#302): a ground
//unit on a city, an aircraft on an airfield, a ship on a port
function kindOn(terrain: number): Kind | null {
	if (terrain === terrainType.City) return "ground";
	if (terrain === terrainType.Airfield) return "air";
	return terrain === terrainType.Port ? "sea" : null;
}

//What a unit of eqid is, as deploy places it (units.ts isAir, isSea)
function kindOf(w: World, eqid: number): Kind {
	const e = w.equipment[eqid];
	if (e.movmethod === movMethod.air) return "air";
	return e.uclass >= unitClass.submarine && e.uclass <= unitClass.lightCruiser ? "sea" : "ground";
}

//An enemy unit the side sees on the hex or next to it
function nearSeenEnemy(w: World, side: number, hex: number): boolean {
	const { rows, cols } = w.state.map, row = Math.floor(hex / cols), col = hex % cols;
	return [{ row, col }, ...cellsInRange(row, col, 1, rows, cols)].some((c) => {
		const at = c.row * cols + c.col, h = w.state.map.hexes[at];
		return [h.unit, h.air].some((id) => {
			const u = id === null ? null : unitById(w, id);
			return u !== null && sideOf(w, u) !== side && (isSpotted(w, at, side) || u.tempSpotted);
		});
	});
}

//A city, airfield or port the side owns with no enemy it sees on it or next to it
function ownTown(w: World, side: number, hex: number): boolean {
	const owner = w.state.map.hexes[hex].owner;
	return owner >= 0 && playerAt(w, owner).side === side && kindOn(w.data.hexes[hex].terrain) !== null
		&& !nearSeenEnemy(w, side, hex);
}

//The hexes the side deploys on, row by row: its deployment hexes; in the remaster's rules, for a side
//with none, its cities, airfields and ports away from the enemy it sees (#302). Of every kind, or of
//what a unit of eqid deploys on. Taken or not
export function deploymentHexes(w: World, side: number, eqid?: number): number[] {
	const hexes = w.data.hexes.map((_h, hex) => hex);
	const own = hexes.filter((hex) => ownDeployment(w, side, hex));
	if (own.length > 0 || !w.rules.deployOnOwnTowns) return own;
	const kind = eqid === undefined ? null : kindOf(w, eqid);
	return hexes.filter((hex) => ownTown(w, side, hex) && (kind === null || kindOn(w.data.hexes[hex].terrain) === kind));
}
