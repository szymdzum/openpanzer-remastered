/**
 * What a unit is and can do on its own: air, sea or ground, its leaders, its fuel and ammo, and whether it
 * can mount, entrench or capture.
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

import { movMethod, terrainType, unitClass, unitEntrenchRate } from "./tables";
import type { UnitState, World } from "./types";
import { ammoOf, fuelOf, sideOf, unitData } from "./world";

/** Whether the unit currently moves by air. */
export function isAir(w: World, u: UnitState): boolean {
	return unitData(w, u).movmethod === movMethod.air;
}

/** Whether the unit is a ship or a submarine. */
export function isSea(w: World, u: UnitState): boolean {
	const uclass = unitData(w, u).uclass;
	return uclass >= unitClass.submarine && uclass <= unitClass.lightCruiser;
}

/** Whether the unit is of a ground class. */
export function isGround(w: World, u: UnitState): boolean {
	return unitData(w, u).uclass <= unitClass.airDefence;
}

/** Whether the unit is a train: a ground unit with the deep naval movement table. */
export function isTrain(w: World, u: UnitState): boolean {
	return isGround(w, u) && unitData(w, u).movmethod === movMethod.deepnaval;
}

/** Whether the terrain makes an attack on it close combat. */
export function isCloseCombatTerrain(terrain: number): boolean {
	return terrain === terrainType.City || terrain === terrainType.Forest || terrain === terrainType.Mountain
		|| terrain === terrainType.Fortification;
}

/** Whether the unit has the leader as its own or as its class's (the class of what it currently is). */
export function hasLeader(w: World, u: UnitState, leader: number): boolean {
	if (u.leader === -1) return false;
	if (u.leader === leader) return true;
	return w.rules.classLeaders[unitData(w, u).uclass] === leader;
}

/** Whether the two units are on different sides. */
export function isEnemy(w: World, u: UnitState, target: UnitState): boolean {
	return sideOf(w, u) !== sideOf(w, target);
}

/** Whether an attack destroyed the unit and its removal hasn't run yet (World.destroyed). */
export function isGone(w: World, u: UnitState): boolean {
	return w.destroyed.has(u.id);
}

/** Whether equipment burns fuel when it moves: legs and towed guns don't. */
export function usesFuel(e: EquipmentEntry): boolean {
	if (e.fuel === 0) return false;
	return e.movmethod !== movMethod.leg && e.movmethod !== movMethod.towed && e.movmethod !== movMethod.allTerrainLeg;
}

/** Whether the unit burns fuel as what it currently is. */
export function unitUsesFuel(w: World, u: UnitState): boolean {
	return usesFuel(unitData(w, u));
}

/** Whether the unit uses ammo as what it currently is. */
export function unitUsesAmmo(w: World, u: UnitState): boolean {
	return unitData(w, u).ammo !== 0;
}

/** Whether the unit burns fuel and has less than `threshold` left. */
export function unitLowFuel(w: World, u: UnitState, threshold: number): boolean {
	return unitUsesFuel(w, u) && fuelOf(u) < threshold;
}

/** Whether the unit uses ammo and has less than `threshold` left. */
export function unitLowAmmo(w: World, u: UnitState, threshold: number): boolean {
	return unitUsesAmmo(w, u) && ammoOf(u) < threshold;
}

/** Whether the unit can mount its transport. */
export function canMount(w: World, u: UnitState): boolean {
	return !u.hasMoved && isGround(w, u) && u.transport !== null;
}

/** Whether the unit can get off its transport. */
export function canUnmount(u: UnitState): boolean {
	return !u.hasMoved && u.isMounted;
}

/** Whether the unit can entrench: only some unit classes gain entrenchment, and not a unit on a carrier. */
export function canEntrench(w: World, u: UnitState): boolean {
	return u.carrier === 0 && unitEntrenchRate[unitData(w, u).uclass] > 0;
}

/** Whether the unit can capture a hex: air units and mounted guns can't. */
export function canCapture(w: World, u: UnitState): boolean {
	if (isAir(w, u)) return false;
	const uclass = unitData(w, u).uclass;
	return !(u.isMounted && (uclass === unitClass.antiTank || uclass === unitClass.flak
		|| uclass === unitClass.artillery || uclass === unitClass.airDefence));
}

/** Whether a transport can carry the equipment: it has a ground weight. */
export function isTransportable(w: World, eqid: number): boolean {
	if (eqid === undefined || eqid < 1) return false;
	return w.equipment[eqid].groundweight !== 0;
}

/**
 * Whether the side still has units to fight with: one on the map or, in the remaster's rules, one waiting to
 * deploy (a reserve unit of one of its players) or to arrive (a reinforcement). The original counts only the
 * units on the map, so a side whose units all wait to deploy is eliminated (#115).
 */
export function sideHasUnits(w: World, side: number): boolean {
	const s = w.state;
	if (s.units.some((u) => sideOf(w, u) === side)) return true;
	if (!w.rules.waitingUnitsFight) return false;
	return s.players.some((p) => p.side === side && p.core.some((c) => "reserve" in c))
		|| s.reinforcements.some((r) => s.players[r.unit.owner].side === side);
}
