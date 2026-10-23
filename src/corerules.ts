/**
 * CoreRules - the rules the screen asks of the running game, answered by the core (#137): the old
 * GameRules entries the UI and the selection call, with their shapes, over the world of the game's
 * objects (src/mirror.ts)
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 *
 * Two kinds of question. What a unit is and can do by itself (air or ground, its ranges, its fuel and
 * ammo, its costs) reads only the unit and the equipment: the unit object is read as the core's unit
 * state (the same fields), on a world of the equipment alone, built once. The render loop asks these
 * for every unit it draws, so they stay as cheap as the old ones. What the map decides (the move and
 * attack hexes, the combat estimate, whether a unit can resupply, embark...) is asked of the world made
 * from the objects at the call: what the harness or the UI just wrote into them (a unit teleported, a
 * hex's terrain) is in it, as it was for the old rules.
 */

import { type Cell, type combatResults, type extendedCell, terrainType, uiSettings } from "./prototypes";
import { Equipment } from "./equipment";
import { engineContext } from "./context";
import type { Hex } from "./map";
import type { Unit } from "./unit";
import { worldOf } from "./mirror";
import { attackCells, isInAttackRange, unitAttackRange } from "./core/attack";
import { combatResult } from "./core/combat";
import { costPerStrength, sellCost, unitCost, upgradeCost } from "./core/costs";
import { createWorld } from "./core/create";
import { isBridge } from "./core/equipment";
import { directionTo } from "./core/geometry";
import { canDisembark, canEmbark, moveRange, unitMoveRange } from "./core/movement";
import { canReinforce, canResupply } from "./core/supply";
import type { EquipmentTable, UnitState, World } from "./core/types";
import { isAir, isGround, isTrain, isTransportable, canMount, unitLowAmmo, unitLowFuel, unitUsesAmmo, unitUsesFuel } from "./core/units";
import { unitById } from "./core/world";

//The world of the equipment alone, for what a unit is by itself: made again when the equipment is
//(another scenario's set)
let equipmentWorld: World | null = null, equipmentOf: EquipmentTable | null = null;

function bare(): World {
	if (equipmentWorld === null || equipmentOf !== Equipment.equipment) {
		equipmentOf = Equipment.equipment;
		equipmentWorld = createWorld({ data: { name: "", description: "", equipment: "", image: "", hexes: [] },
			state: { units: [], map: { rows: 0, cols: 0, hexes: [] } } as unknown as World["state"] }, equipmentOf, { sight: undefined });
	}
	return equipmentWorld;
}

//A unit object as the core's unit state: the fields the core reads have the same names
const asState = (u: Unit) => u as unknown as UnitState;

//The world of the game's objects now
function now(): World {
	const scenario = engineContext.scenario();
	return worldOf(scenario, engineContext.host(), { spotSide: engineContext.spotSide(), noFOW: !!uiSettings.noFOW });
}

//A unit of the world now, by the object's id (one off the map stands nowhere, as the old rules saw it)
function onMap(w: World, u: Unit): UnitState {
	const s = unitById(w, u.id);
	return s === null || !u.getPos() ? { ...asState(u), row: -1, col: -1 } : s;
}

//A rule of the unit alone; false for no unit, as the old rules answered
const alone = (rule: (w: World, u: UnitState) => boolean) => (u: Unit | null): boolean => u !== null && rule(bare(), asState(u));
//A rule of the unit on the map now
const onTheMap = <T>(rule: (w: World, u: UnitState) => T) => (u: Unit): T => {
	const w = now();
	return rule(w, onMap(w, u));
};

export interface CoreRulesAPI {
	getMoveRange(map: unknown, unit: Unit): extendedCell[];
	getUnitAttackCells(map: unknown, unit: Unit, rows?: number, cols?: number): Cell[];
	getUnitMoveRange(unit: Unit): number;
	getUnitAttackRange(unit: Unit | null): number;
	isInAttackRange(unit: Unit, target: Unit): boolean;
	calculateCombatResults(atk: Unit, def: Unit, list: unknown, withHidden: boolean, estimate: boolean): combatResults;
	canMount(unit: Unit): boolean;
	canEmbark(map: unknown, unit: Unit): boolean;
	canDisembark(map: unknown, unit: Unit): boolean;
	canResupply(map: unknown, unit: Unit): boolean;
	canReinforce(map: unknown, unit: Unit, overstrength?: boolean): boolean;
	isAir(unit: Unit | null): boolean;
	isGround(unit: Unit | null): boolean;
	isTrain(unit: Unit | null): boolean;
	isTransportable(eqid: number): boolean;
	isBridgeForSide(hex: Hex | null, side: number): boolean;
	unitUsesFuel(unit: Unit): boolean;
	unitUsesAmmo(unit: Unit): boolean;
	unitLowFuel(unit: Unit, threshold: number): boolean;
	unitLowAmmo(unit: Unit, threshold: number): boolean;
	calculateUnitCosts(eqid: number, transport?: number): number;
	calculateUpgradeCosts(unit: Unit | null, eqid: number, transport: number): number;
	calculateUnitCostPerStrength(unit: Unit | null): number;
	calculateUnitSellCost(unit: Unit | null): number;
	getDirection(row1: number, col1: number, row2: number, col2: number): number;
}

export const CoreRules: CoreRulesAPI = {
	getMoveRange: (_map, u) => u === null ? [] : onTheMap(moveRange)(u) as unknown as extendedCell[],
	getUnitAttackCells: (_map, u) => u === null ? [] : onTheMap(attackCells)(u) as Cell[],
	getUnitMoveRange: (u) => unitMoveRange(bare(), asState(u)),
	getUnitAttackRange: (u) => u ? unitAttackRange(bare(), asState(u)) : 0,
	isInAttackRange: (u, t) => {
		//(a missing unit or target throws where the old rules threw: the tutorial's stuck attack, #80)
		if (u.getPos() === null || t.getPos() === null) return false;
		const w = now();
		return isInAttackRange(w, onMap(w, u), onMap(w, t));
	},
	//(the screen asks the estimate: no draw)
	calculateCombatResults: (atk, def, _list, withHidden) => {
		const w = now();
		return combatResult(w, onMap(w, atk), onMap(w, def), withHidden, null) as unknown as combatResults;
	},
	canMount: alone(canMount),
	canEmbark: (_map, u) => onTheMap(canEmbark)(u),
	canDisembark: (_map, u) => onTheMap(canDisembark)(u),
	canResupply: (_map, u) => onTheMap(canResupply)(u),
	canReinforce: (_map, u, over) => onTheMap((w, s) => canReinforce(w, s, over))(u),
	isAir: alone(isAir),
	isGround: alone(isGround),
	isTrain: alone(isTrain),
	isTransportable: (eqid) => isTransportable(bare(), eqid),
	//(read off the hex itself: the render loop asks it of every unit it draws, movement.isBridgeForSide's rule)
	isBridgeForSide: (hex, side) => {
		if (!hex || (hex.terrain !== terrainType.River && hex.terrain !== terrainType.Stream)) return false;
		const bridge = hex.unit;
		return bridge !== null && !bridge.isMounted && bridge.player.side === side && isBridge(Equipment.equipment, bridge.eqid);
	},
	unitUsesFuel: alone(unitUsesFuel),
	unitUsesAmmo: alone(unitUsesAmmo),
	unitLowFuel: (u, t) => unitLowFuel(bare(), asState(u), t),
	unitLowAmmo: (u, t) => unitLowAmmo(bare(), asState(u), t),
	calculateUnitCosts: (eqid, transport) => unitCost(bare(), eqid, transport),
	calculateUpgradeCosts: (u, eqid, transport) => u === null ? 0 : upgradeCost(bare(), asState(u), eqid, transport),
	calculateUnitCostPerStrength: (u) => u === null ? -1 : costPerStrength(bare(), asState(u)),
	calculateUnitSellCost: (u) => u === null || u === undefined ? -1 : sellCost(bare(), asState(u)),
	getDirection: directionTo,
};
