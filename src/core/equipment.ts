/**
 * The equipment's attribute bits the rules read (bridges, units that ignore entrenchment, the targets a unit
 * can start an attack on) and an entry's weak defence.
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

import { unitClass, unitType } from "./tables";
import type { EquipmentTable } from "./types";

//The bits of an entry's attr field
const IGNORE_ENTRENCH = 1 << 2;
const BRIDGE = 1 << 3;
const NO_START_SOFT_ATTACK = 1 << 4;
const NO_START_HARD_ATTACK = 1 << 5;
const NO_START_AIR_ATTACK = 1 << 6;
const ATTACKS_AIR = 1 << 15;

//The classes that can start an attack on an air unit without the attacks air bit
const airAttackers = [unitClass.airDefence, unitClass.fighter, unitClass.levelBomber, unitClass.tacticalBomber,
	unitClass.battleship, unitClass.battleCruiser, unitClass.lightCruiser, unitClass.airTransport];

//Whether eqid has an attribute bit, false for an unknown eqid
function hasAttr(table: EquipmentTable, eqid: number, bit: number): boolean {
	const e = table[eqid];
	return e !== undefined && (e.attr & bit) !== 0;
}

export function isBridge(table: EquipmentTable, eqid: number): boolean {
	return hasAttr(table, eqid, BRIDGE);
}

export function ignoresEntrenchment(table: EquipmentTable, eqid: number): boolean {
	return hasAttr(table, eqid, IGNORE_ENTRENCH);
}

/** Whether `eqid` can start an attack on `targetEqid` (whether it can fire at all is attack.ts's canFire). */
export function canStartAttackOn(table: EquipmentTable, eqid: number, targetEqid: number): boolean {
	const e = table[eqid], t = table[targetEqid];
	if (e === undefined || t === undefined) return false;

	//Only destroyers and tactical bombers can attack submarines
	if (t.uclass === unitClass.submarine && e.uclass !== unitClass.destroyer && e.uclass !== unitClass.tacticalBomber)
		return false;
	if (t.target === unitType.soft && (e.attr & NO_START_SOFT_ATTACK) !== 0) return false;
	if (t.target === unitType.hard && (e.attr & NO_START_HARD_ATTACK) !== 0) return false;
	return t.target !== unitType.air || startsAirAttacks(e);
}

/** Whether the entry can start an attack on an aircraft: its class, or the attacks air bit. */
export function startsAirAttacks(e: EquipmentEntry): boolean {
	return (e.attr & NO_START_AIR_ATTACK) === 0 && (airAttackers.includes(e.uclass) || (e.attr & ATTACKS_AIR) !== 0);
}

export type DefenceField = "grounddef" | "airdef" | "closedef";
const DEFENCES: DefenceField[] = ["grounddef", "airdef", "closedef"];

/** The entry's weak defence: the lowest of the three, when at most half the highest; none when all are 0. */
export function weakDefences(e: EquipmentEntry): DefenceField[] {
	const values = DEFENCES.map((f) => e[f]);
	const low = Math.min(...values), high = Math.max(...values);
	if (high === 0 || low * 2 > high) return [];
	return DEFENCES.filter((f) => e[f] === low);
}
