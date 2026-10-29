/**
 * GameRules - the game's rules as the screen, the harness and the contracts ask them, answered by the
 * core (src/core/, #137) with their old shapes: units as the game's objects, cells, combat results
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 *
 * The rules were the old engine's (reconstructed from the Panzer Marshal 3.2.14 bundle). They are the
 * core's now, over a world: rulesOn(source) takes where that world comes from. The running game's is
 * the game's world (src/legacy/mirror.ts rulesWorld: the world kept, which the objects mirror; under ?harness
 * the objects' while toData of them is its state, so what the harness just wrote into them is in it); the
 * retreat's ranges are asked of a world made for them (src/legacy/commands.ts); the gamerules contract's reads
 * the old counters (test/coreadapter.ts).
 * What a unit is by itself (the render loop asks it of every unit it draws) reads the unit object as
 * the core's unit state, on a world of the equipment alone.
 *
 * What the rules do beyond the core's queries, as the old API did: the null guards (the core's queries
 * take a unit), and setZOCRange and setSpotRange, which switch the hexes' counters by the core's cells
 * (the harness moves units by hand with them).
 */

import { type Cell, type combatResults, type extendedCell, type pathCell, type Supply } from "./prototypes";
import { terrainType } from "../core/tables";
import { Equipment } from "./equipment";
import { engineContext, touched } from "./context";
import type { Hex, GameMap } from "./map";
import type { Transport, Unit } from "./unit";
import type { RngStream } from "../core/random";
import { Rng } from "../core/random";
import { createWorld } from "../core/create";
import { isBridge } from "../core/equipment";
import { emptySight, sideOf, unitById } from "../core/world";
import type { Position, UnitState, World } from "../core/types";
import * as units from "../core/units";
import * as attack from "../core/attack";
import * as movement from "../core/movement";
import * as combat from "../core/combat";
import * as supply from "../core/supply";
import * as costs from "../core/costs";
import * as geometry from "../core/geometry";
import { spotCells, unitSpotRange, zocCells } from "../core/sight";

//The GameRules module API. map is the hex grid of a GameMap (GameMap.map), rows/cols its size
export interface GameRulesModule {
	getMoveRange(mapObj: GameMap, unit: Unit): extendedCell[];
	getUnitMoveRange(unit: Unit): number;
	getUnitAttackCells(map: Hex[][], unit: Unit, rows: number, cols: number): Cell[];
	getUnitAttackRange(unit: Unit): number;
	setZOCRange(map: Hex[][], unit: Unit, on: boolean, mrows: number, mcols: number): void;
	setSpotRange(map: Hex[][], unit: Unit, on: boolean, mrows: number, mcols: number): number;
	getUnitSpotRange(unit: Unit): number;
	getShortestPath(startCell: Cell, endCell: Cell, cellList: extendedCell[]): pathCell[];
	pathTo(mapObj: GameMap, unit: Unit, cell: Cell): pathCell[];
	calculateCombatResults(atkunit: Unit, defunit: Unit, unitlist: Unit[], withHiddenUnits: boolean,
		estimate: boolean): combatResults;
	calculateAttackResults(atkunit: Unit, defunit: Unit, estimate: boolean): combatResults;
	isLossOverRetreatThreshold(strength: number, oldStrength: number): boolean;
	shouldDefenderRetreat(atkunit: Unit, defunit: Unit, oldStrength: number): boolean;
	getRetreatPosition(map: Hex[][], unit: Unit, rows: number): Cell | null;
	isRuggedDefense(atkunit: Unit, defunit: Unit): boolean;
	isEntrenchmentIntact(atkunit: Unit, defunit: Unit, terrain: number): boolean;
	getResupplyValue(map: Hex[][], unit: Unit, isTurnStart?: boolean): Supply;
	getReinforceValue(map: Hex[][], unit: Unit, overstrength?: boolean): number;
	canInitiateAttack(unit: Unit | null, targetUnit: Unit | null): boolean;
	canFire(unit: Unit | null, targetUnit: Unit | null): boolean;
	canPassInto(map: Hex[][], unit: Unit, cell: Cell): boolean;
	isBridgeForSide(hex: Hex | null, side: number): boolean;
	canResupply(map: Hex[][], unit: Unit): boolean;
	canReinforce(map: Hex[][], unit: Unit, overstrength?: boolean): boolean;
	canCapture(unit: Unit): boolean;
	canEntrench(unit: Unit | null): boolean;
	isEnemy(unit: Unit | null, targetUnit: Unit | null): boolean;
	getSupportFireUnits(unitList: Unit[], atkunit: Unit, defunit: Unit): Unit[];
	isInAttackRange(unit: Unit, targetUnit: Unit): boolean;
	getEmbarkType(map: Hex[][], unit: Unit): number; //a unitClass
	getDisembarkPositions(map: Hex[][], unit: Unit): Cell[];
	getLandingPositions(unit: Unit): Cell[]; //of a unit leaving its carrier, the hexes its disembark gave it
	getReinforcementDeployPositions(map: Hex[][], unit: Unit, row: number, col: number): Cell | null;
	canEmbark(map: Hex[][], unit: Unit): boolean;
	canDisembark(map: Hex[][], unit: Unit): boolean;
	canMount(unit: Unit): boolean;
	canUnmount(unit: Unit): boolean;
	isTransportable(unitID: number): boolean;
	isAir(unit: Unit | null): boolean;
	isSea(unit: Unit | null): boolean;
	isGround(unit: Unit | null): boolean;
	isTrain(unit: Unit | null): boolean;
	isCloseCombatTerrain(t: number): boolean; //a terrainType
	unitUsesFuel(unit: Unit | Transport): boolean;
	unitLowFuel(unit: Unit, threshold: number): boolean;
	unitUsesAmmo(unit: Unit): boolean;
	unitLowAmmo(unit: Unit, threshold: number): boolean;
	calculateUnitCosts(unitid: number, transportid?: number): number;
	calculateUpgradeCosts(unit: Unit | null, upgradeid: number, transportid: number): number;
	calculateUnitCostPerStrength(unit: Unit | null): number;
	calculateUnitSellCost(unit: Unit): number;
	getDirection(x1: number, y1: number, x2: number, y2: number): number; //a direction
	distance(x1: number, y1: number, x2: number, y2: number): number;
	getAdjacent(row: number, col: number): Cell[];
	facingToAdjacentIndex(facing: number): number;
	rollDice(min: number, max: number): number;
}

//Where the rules' world comes from: the world of the units asked (each the object's state), the dice
//(a rule that draws: an attack not estimated, a roll), and the counters switched by setZOCRange and
//setSpotRange (the world reads them again where its sight is theirs)
export interface RulesSource {
	world(...asked: Unit[]): World;
	game(): RngStream;
	countersChanged(): void;
}

//The world of the equipment alone, for what a unit is by itself: made again when the equipment is
let equipmentWorld: World | null = null;

function bare(): World {
	if (equipmentWorld === null || equipmentWorld.equipment !== Equipment.equipment)
		equipmentWorld = createWorld({ data: { name: "", description: "", equipment: "", image: "", startObjectives: null, hexes: [] },
			state: { units: [], map: { rows: 0, cols: 0, hexes: [] } } as unknown as World["state"] }, Equipment.equipment, { sight: emptySight(0) });
	return equipmentWorld;
}

//A unit object as the core's unit state: the fields the core reads have the same names
const asState = (u: Unit | Transport) => u as unknown as UnitState;

//The rules over a source of worlds
export function rulesOn(src: RulesSource): GameRulesModule {
	//The core's unit for an object; one that isn't on a hex (off the map) stands nowhere
	function unit(x: World, u: Unit): UnitState {
		const s = unitById(x, u.id);
		if (s === null) return { ...asState(u), row: -1, col: -1 };
		return u.getPos() ? s : { ...s, row: -1, col: -1 };
	}
	//A rule of one unit, of two, on the map; of the unit alone
	const one = <T>(f: (x: World, s: UnitState) => T) => (u: Unit): T => { const x = src.world(u); return f(x, unit(x, u)); };
	const two = <T>(f: (x: World, a: UnitState, b: UnitState) => T) => (a: Unit, b: Unit): T => {
		const x = src.world(a, b);
		return f(x, unit(x, a), unit(x, b));
	};
	const alone = (f: (x: World, s: UnitState) => boolean) => (u: Unit | null): boolean => u !== null && f(bare(), asState(u));
	const objectOf = (x: Unit[], s: UnitState) => x.find((u) => u.id === s.id);
	const cell = (p: Position | null) => p as Cell;
	const rng = (estimate: boolean) => estimate ? null : src.game();
	//The core's plain objects where the old API has its classes
	const asCells = (cells: unknown) => cells as extendedCell[];
	const asResult = (cr: unknown) => cr as combatResults;
	const asSupply = (s: unknown) => s as Supply;
	//The hexes' counters switched by the unit's cells; switched on, the enemy ground units on hexes its
	//side didn't see yet (by the counters, as they are) marked seen, counted
	const switchCounters = (map: Hex[][], u: Unit, on: boolean, zoc: boolean): number => {
		const x = src.world(u), s = unit(x, u), side = sideOf(x, s);
		let spotted = 0;
		for (const c of zoc ? zocCells(x, s) : spotCells(x, s)) {
			const h = map[c.row][c.col];
			if (zoc) {
				h.setZOC(side, on);
				continue;
			}
			const other = on && !h.isSpotted(side) ? h.getUnit(false) : null;
			if (other && other.player.side !== side) {
				spotted++;
				other.tempSpotted = true;
				touched();
			}
			h.setSpotted(side, on);
		}
		src.countersChanged();
		return spotted;
	};

	return {
		getMoveRange: (_map, u) => u === null ? [] : asCells(one(movement.moveRange)(u)),
		getUnitMoveRange: (u) => movement.unitMoveRange(bare(), asState(u)),
		getUnitAttackCells: (_map, u) => u === null ? [] : one(attack.attackCells)(u).map(cell),
		getUnitAttackRange: (u) => u ? attack.unitAttackRange(bare(), asState(u)) : 0,
		setZOCRange: (map, u, on) => { if (u) switchCounters(map, u, on, true); },
		setSpotRange: (map, u, on) => u ? switchCounters(map, u, on, false) : 0,
		getUnitSpotRange: (u) => u ? unitSpotRange(bare(), asState(u)) : 0,
		getShortestPath: (start, end, cells) => {
			//each cell's prev is the one before it, the start its own (pathCell)
			const path = movement.shortestPath(start, end, cells);
			return path.map((p, i) => Object.assign(p, { prev: path[i > 0 ? i - 1 : 0] })) as unknown as pathCell[];
		},
		pathTo: (_map, u, c) => one((x, s) => movement.pathTo(x, s, c))(u) as unknown as pathCell[],
		calculateCombatResults: (atk, def, _list, withHidden, estimate) =>
			asResult(two((x, a, d) => combat.combatResult(x, a, d, withHidden, rng(estimate)))(atk, def)),
		calculateAttackResults: (atk, def, estimate) => asResult(two((x, a, d) => combat.attackResult(x, a, d, rng(estimate)))(atk, def)),
		isLossOverRetreatThreshold: combat.isLossOverRetreatThreshold,
		shouldDefenderRetreat: (atk, def, o) => two((x, a, d) => combat.shouldDefenderRetreat(x, a, d, o))(atk, def),
		getRetreatPosition: (_map, u) => u ? cell(one(movement.retreatPosition)(u)) : null,
		isRuggedDefense: two(combat.isRuggedDefense),
		isEntrenchmentIntact: (atk, def, t) => two((x, a, d) => combat.isEntrenchmentIntact(x, a, d, t))(atk, def),
		getResupplyValue: (_map, u, turnStart) => asSupply(one((x, s) => supply.resupplyValue(x, s, turnStart))(u)),
		getReinforceValue: (_map, u, over) => one((x, s) => supply.reinforceValue(x, s, over))(u),
		canInitiateAttack: (u, t) => u !== null && t !== null && two(attack.canInitiateAttack)(u, t),
		canFire: (u, t) => u !== null && t !== null && two(attack.canFire)(u, t),
		canPassInto: (_map, u, c) => one((x, s) => movement.canPassInto(x, s, c))(u),
		//(off the hex itself: the render loop asks it of every unit it draws; movement.isBridgeForSide's rule)
		isBridgeForSide: (hex, side) => {
			if (!hex || !hex.unit || (hex.terrain !== terrainType.River && hex.terrain !== terrainType.Stream)) return false;
			return !hex.unit.isMounted && hex.unit.player.side === side && isBridge(Equipment.equipment, hex.unit.eqid);
		},
		canResupply: (_map, u) => one(supply.canResupply)(u),
		canReinforce: (_map, u, over) => one((x, s) => supply.canReinforce(x, s, over))(u),
		canCapture: one(units.canCapture),
		canEntrench: (u) => u !== null && one(units.canEntrench)(u),
		isEnemy: (u, t) => u !== null && t !== null && two(units.isEnemy)(u, t),
		getSupportFireUnits: (list, atk, def) => two(attack.supportFireUnits)(atk, def).map((s) => objectOf(list, s)),
		isInAttackRange: (u, t) => {
			//(a missing unit or target throws where the old rules threw: the tutorial's stuck attack, #80)
			if (u.getPos() === null || t.getPos() === null) return false;
			return two(attack.isInAttackRange)(u, t);
		},
		getEmbarkType: (_map, u) => one(movement.embarkTypeOf)(u),
		getDisembarkPositions: (_map, u) => one(movement.disembarkPositions)(u).map(cell),
		getLandingPositions: (u) => one(movement.landingPositions)(u).map(cell),
		getReinforcementDeployPositions: (_map, u, row, col) =>
			cell(one((x, s) => movement.reinforcementDeployPosition(x, s, row, col))(u)),
		canEmbark: (_map, u) => one(movement.canEmbark)(u),
		canDisembark: (_map, u) => one(movement.canDisembark)(u),
		canMount: alone(units.canMount),
		canUnmount: (u) => units.canUnmount(asState(u)),
		isTransportable: (eqid) => units.isTransportable(bare(), eqid),
		isAir: alone(units.isAir),
		isSea: alone(units.isSea),
		isGround: alone(units.isGround),
		isTrain: alone(units.isTrain),
		isCloseCombatTerrain: units.isCloseCombatTerrain,
		//(asked of a transport too: of its own equipment)
		unitUsesFuel: (u) => "getPos" in u ? units.unitUsesFuel(bare(), asState(u)) : units.usesFuel(Equipment.equipment[u.eqid]),
		unitLowFuel: (u, t) => units.unitLowFuel(bare(), asState(u), t),
		unitUsesAmmo: (u) => units.unitUsesAmmo(bare(), asState(u)),
		unitLowAmmo: (u, t) => units.unitLowAmmo(bare(), asState(u), t),
		calculateUnitCosts: (eqid, transportId) => costs.unitCost(bare(), eqid, transportId),
		calculateUpgradeCosts: (u, upgradeId, transportId) => u === null ? 0 : costs.upgradeCost(bare(), asState(u), upgradeId, transportId),
		calculateUnitCostPerStrength: (u) => u === null ? -1 : costs.costPerStrength(bare(), asState(u)),
		calculateUnitSellCost: (u) => u === null || u === undefined ? -1 : costs.sellCost(bare(), asState(u)),
		getDirection: geometry.directionTo,
		distance: geometry.distance,
		getAdjacent: (r, c) => geometry.adjacent(r, c).map(cell),
		facingToAdjacentIndex: geometry.facingToAdjacentIndex,
		rollDice: (min, max) => combat.rollDice(src.game(), min, max),
	};
}

//The running game's world (engineContext.world), the dice its stream
const gameSource: RulesSource = {
	world: () => engineContext.world(),
	game: () => Rng.game,
	countersChanged: () => {},
};

//(a module object: the harness assigns its members, docs/REFACTOR.md step 3)
export var GameRules: GameRulesModule = rulesOn(gameSource);

//The rules over a world made for a question of the screen's (the retreat's hexes, src/legacy/commands.ts), the
//dice the game's
export const rulesOver = (w: World): GameRulesModule => rulesOn({ ...gameSource, world: () => w });
