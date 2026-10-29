/**
 * Costs: what units, upgrades and their sale are worth in prestige.
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

import { CURRENCY_MULTIPLIER, UPGRADE_PENALTY } from "./tables";
import type { UnitState, World } from "./types";
import { unitData } from "./world";

/** The price of a unit and its transport (an eqid of 0 or less, or none, for nothing). */
export function unitCost(w: World, eqid?: number, transportId?: number): number {
	let cost = 0;
	if (eqid > 0) cost += w.equipment[eqid].cost * CURRENCY_MULTIPLIER;
	if (transportId > 0) cost += w.equipment[transportId].cost * CURRENCY_MULTIPLIER;
	return cost;
}

/** The price of upgrading `u` to `upgradeId` with `transportId` (-1: none), less its worth; a change costs more. */
export function upgradeCost(w: World, u: UnitState, upgradeId?: number, transportId?: number): number {
	let ncost: number;
	if (upgradeId > 0)
		//Compared as numbers: a scenario's units can hold their eqid as the file's text, which the original's == took
		ncost = +u.eqid === +upgradeId ? unitCost(w, u.eqid, -1) : unitCost(w, upgradeId, -1) * UPGRADE_PENALTY;
	else
		ncost = unitCost(w, u.eqid, -1);

	let tcost = 0;
	if (transportId > 0)
		tcost = u.transport !== null && +u.transport.eqid === +transportId ? unitCost(w, -1, transportId)
			: unitCost(w, -1, transportId) * UPGRADE_PENALTY;

	const ocost = u.transport !== null && transportId !== -1 ? unitCost(w, u.eqid, u.transport.eqid) : unitCost(w, u.eqid, -1);
	return (ncost + tcost - ocost) >> 0;
}

/** The price of a strength point of what the unit currently is. */
export function costPerStrength(w: World, u: UnitState): number {
	return ((unitData(w, u).cost * CURRENCY_MULTIPLIER) / 10) >> 0;
}

/** What selling the unit gives back: its and its transport's price, less the penalty, by strength. */
export function sellCost(w: World, u: UnitState): number {
	const transportId = u.transport !== null ? u.transport.eqid : -1;
	return ((unitCost(w, u.eqid, transportId) / UPGRADE_PENALTY / 10) * u.strength) >> 0;
}
