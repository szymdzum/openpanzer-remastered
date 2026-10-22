/**
 * Costs - what units, upgrades and their sale are worth in prestige
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

import { CURRENCY_MULTIPLIER, UPGRADE_PENALTY } from "../prototypes";
import type { UnitState, World } from "./types";
import { unitData } from "./world";

//A unit and its transport (an eqid of 0 or less, or none, for nothing)
export function unitCost(w: World, eqid?: number, transportId?: number): number {
	let cost = 0;
	if (eqid > 0) cost += w.equipment[eqid].cost * CURRENCY_MULTIPLIER;
	if (transportId > 0) cost += w.equipment[transportId].cost * CURRENCY_MULTIPLIER;
	return cost;
}

//An upgrade of u to upgradeId (none: itself) with transportId (-1 removes the transport), less what
//u is worth: a different unit or transport costs UPGRADE_PENALTY times its price
export function upgradeCost(w: World, u: UnitState, upgradeId?: number, transportId?: number): number {
	let ncost: number;
	if (upgradeId > 0)
		ncost = u.eqid === upgradeId ? unitCost(w, u.eqid, -1) : unitCost(w, upgradeId, -1) * UPGRADE_PENALTY;
	else
		ncost = unitCost(w, u.eqid, -1);

	let tcost = 0;
	if (transportId > 0)
		tcost = u.transport !== null && u.transport.eqid === transportId ? unitCost(w, -1, transportId)
			: unitCost(w, -1, transportId) * UPGRADE_PENALTY;

	const ocost = u.transport !== null && transportId !== -1 ? unitCost(w, u.eqid, u.transport.eqid) : unitCost(w, u.eqid, -1);
	return (ncost + tcost - ocost) >> 0;
}

//A strength point of what the unit currently is
export function costPerStrength(w: World, u: UnitState): number {
	return ((unitData(w, u).cost * CURRENCY_MULTIPLIER) / 10) >> 0;
}

//What selling the unit gives back: its and its transport's price, less the penalty, by strength
export function sellCost(w: World, u: UnitState): number {
	const transportId = u.transport !== null ? u.transport.eqid : -1;
	return ((unitCost(w, u.eqid, transportId) / UPGRADE_PENALTY / 10) * u.strength) >> 0;
}
