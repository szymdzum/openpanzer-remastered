/**
 * What a unit is and can do on its own: air, sea or ground, its leaders, its fuel and ammo, and whether it
 * can mount, entrench or capture.
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

import { leaderType, movMethod, terrainType, unitClass, unitEntrenchRate } from "./tables";
import type { UnitState, World } from "./types";
import { ammoOf, fuelOf, sideOf, unitData } from "./world";

export function isAir(w: World, u: UnitState): boolean {
	return unitData(w, u).movmethod === movMethod.air;
}

export function isSea(w: World, u: UnitState): boolean {
	const uclass = unitData(w, u).uclass;
	return uclass >= unitClass.submarine && uclass <= unitClass.lightCruiser;
}

export function isGround(w: World, u: UnitState): boolean {
	return unitData(w, u).uclass <= unitClass.airDefence;
}

/** Whether the unit is a train: a ground unit with the deep naval movement table. */
export function isTrain(w: World, u: UnitState): boolean {
	return isGround(w, u) && unitData(w, u).movmethod === movMethod.deepnaval;
}

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

/**
 * hasLeader for an ability the original game read nowhere: only in the rules where every leader ability works
 * (Ruleset.allLeaderAbilities).
 */
export function hasLeaderAbility(w: World, u: UnitState, leader: number): boolean {
	return w.rules.allLeaderAbilities && hasLeader(w, u, leader);
}

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

export function unitUsesFuel(w: World, u: UnitState): boolean {
	return usesFuel(unitData(w, u));
}

export function unitUsesAmmo(w: World, u: UnitState): boolean {
	return unitData(w, u).ammo !== 0;
}

export function unitLowFuel(w: World, u: UnitState, threshold: number): boolean {
	return unitUsesFuel(w, u) && fuelOf(u) < threshold;
}

export function unitLowAmmo(w: World, u: UnitState, threshold: number): boolean {
	return unitUsesAmmo(w, u) && ammoOf(u) < threshold;
}

/**
 * Whether a move uses the unit's shot, wherever it goes: in the remaster rules artillery and air defence (flak too),
 * but with Mechanized Veteran. Its own class counts, not its transport's.
 */
export function firesOnlyBeforeMoving(w: World, u: UnitState): boolean {
	if (!w.rules.gunsFireBeforeMoving) return false;
	const uclass = unitData(w, u, true).uclass;
	return (uclass === unitClass.artillery || uclass === unitClass.airDefence || uclass === unitClass.flak)
		&& !hasLeaderAbility(w, { ...u, isMounted: false }, leaderType.mechanizedVeteran);
}

export function canMount(w: World, u: UnitState): boolean {
	return !u.hasMoved && isGround(w, u) && u.transport !== null;
}

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
	//Kept bug (#544) in the classic rules: a mounted gun's class is its transport's, so it can capture
	const uclass = unitData(w, u, w.rules.mountedGunsDontCapture).uclass;
	return !(u.isMounted && (uclass === unitClass.antiTank || uclass === unitClass.flak
		|| uclass === unitClass.artillery || uclass === unitClass.airDefence));
}

/** Whether a transport can carry the equipment: it has a ground weight. */
export function isTransportable(w: World, eqid: number): boolean {
	if (eqid === undefined || eqid < 1) return false;
	return w.equipment[eqid].groundweight !== 0;
}

/** Whether the side has units to fight: on the map or, in the remaster's rules, waiting to deploy or arrive (#115). */
export function sideHasUnits(w: World, side: number): boolean {
	const s = w.state;
	if (s.units.some((u) => sideOf(w, u) === side)) return true;
	if (!w.rules.waitingUnitsFight) return false;
	return s.players.some((p) => p.side === side && p.core.some((c) => "reserve" in c))
		|| s.reinforcements.some((r) => s.players[r.unit.owner].side === side);
}
