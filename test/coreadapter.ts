//The old GameRules API (src/gamerules.ts) on the new core (src/core/): each call takes toData of the
//old engine's state as it is at the call, asks the core, and turns its answer back into the old
//shapes (units as the old engine's objects, path cells linked by prev). The gamerules contract runs
//on it (test/core-contract.test.ts), so the core answers every recorded call (docs/CORE.md).
//
//What the adapter does itself, as the old API did and the core doesn't: the null guards (the core's
//queries take a unit), and setZOCRange/setSpotRange, which switch the old engine's counters: they
//apply the core's zone of control and spotting cells to them, so the contract's map snapshot reads
//what the core computed
import type { GameRulesModule } from "../src/gamerules";
import type { Scenario } from "../src/scenario";
import type { EquipmentModule } from "../src/equipment";
import type { Transport, Unit } from "../src/unit";
import type { RngStream } from "../src/rng";
import type { toData as ToData } from "../src/state";
import type { Cell, combatResults, extendedCell, pathCell, Supply } from "../src/prototypes";
import { createWorld } from "../src/core/create";
import { emptySight, hexIndex, sideOf, unitById } from "../src/core/world";
import type { Position, Sight, UnitState, World } from "../src/core/types";
import * as units from "../src/core/units";
import * as attack from "../src/core/attack";
import * as movement from "../src/core/movement";
import * as combat from "../src/core/combat";
import * as supply from "../src/core/supply";
import * as costs from "../src/core/costs";
import * as geometry from "../src/core/geometry";
import { newlySpotted, spotCells, unitSpotRange, zocCells } from "../src/core/sight";

//The old engine's modules of the restored game (the contracts reset the modules per fixture)
export interface OldEngine {
	scenario: Scenario;
	Equipment: EquipmentModule;
	toData: typeof ToData;
	game: RngStream; //Rng.game: the dice draw from the old engine's own game stream
	computedSight?: boolean; //the core's own sight instead of the old counters (where they don't drift)
}

//The spotting and zone of control the old engine's counters say (whether each is above 0), for the
//queries: the contract's fuzz changes units under counters that stay
export function oldSight(scenario: Scenario): Sight {
	const m = scenario.map;
	const sight = emptySight(m.rows * m.cols);
	for (let r = 0; r < m.rows; r++)
		for (let c = 0; c < m.cols; c++) {
			const h = m.map[r][c], i = r * m.cols + c;
			for (const side of [0, 1]) {
				sight.spot[side][i] = +h.isSpotted(side);
				sight.zoc[side][i] = +h.isZOC(side);
			}
		}
	return sight;
}

//The fields of a unit a query reads, besides its hex and transport
const unitFields = ["eqid", "owner", "strength", "leader", "experience", "entrenchment", "hits", "ammo", "fuel", "facing",
	"moveLeft", "carrier", "isSurprised", "hasMoved", "hasFired", "hasResupplied", "hasOverstrength", "tempSpotted", "isMounted"] as const;

//Whether the core's unit is still the old one
function same(u: Unit, s: UnitState, destroyed: boolean): boolean {
	const p = u.getPos() || { row: -1, col: -1 };
	return p.row === s.row && p.col === s.col && !!u.destroyed === destroyed && unitFields.every((k) => u[k] === s[k])
		&& sameTransport(u.transport, s.transport);
}

function sameTransport(t: Transport | null, s: UnitState["transport"]): boolean {
	if (t === null || s === null) return t === s;
	return t.eqid === s.eqid && t.ammo === s.ammo && t.fuel === s.fuel;
}

export function coreGameRules(old: OldEngine): GameRulesModule {
	const m = old.scenario.map;
	let world: World | null = null, countersChanged = false;

	//The world of the old state now: its sight read again after the counters changed (setZOCRange,
	//setSpotRange), all of it taken again when one of the units a call asks about isn't what the
	//world has: the contract changes the units only between its rounds, all of them (its fuzz)
	function w(...asked: Unit[]): World {
		//(the core's own sight follows the units, not the counters)
		if (world !== null && countersChanged && !old.computedSight) world = { ...world, sight: oldSight(old.scenario) };
		countersChanged = false;
		if (world !== null && asked.every((u) => {
			const s = unitById(world, u.id);
			return s === null || same(u, s, world.destroyed.has(u.id));
		}))
			return world;
		const destroyed = new Set(m.getUnits().filter((u) => u.destroyed).map((u) => u.id));
		world = createWorld(old.toData(old.scenario), old.Equipment.equipment, { destroyed, sight: sight() });
		return world;
	}
	const sight = () => old.computedSight ? undefined : oldSight(old.scenario);

	//The core's unit for an old one; a unit that isn't on a hex (as the contract's off map unit) stands nowhere
	function unit(x: World, u: Unit): UnitState {
		const s = unitById(x, u.id);
		if (s === null) throw new Error("unit#" + u.id + " isn't in the old engine's unit list");
		return u.getPos() ? s : { ...s, row: -1, col: -1 };
	}
	//A query of one unit, or of two
	const one = <T>(f: (x: World, s: UnitState) => T) => (u: Unit): T => { const x = w(u); return f(x, unit(x, u)); };
	const two = <T>(f: (x: World, a: UnitState, b: UnitState) => T) => (a: Unit, b: Unit): T => {
		const x = w(a, b);
		return f(x, unit(x, a), unit(x, b));
	};
	const oldUnit = (s: UnitState) => m.getUnits().find((u) => u.id === s.id);
	const cell = (p: Position | null) => p as Cell;
	const rng = (estimate: boolean) => estimate ? null : old.game;
	//The core's plain objects where the old API has its classes (the contract compares their fields)
	const asCells = (cells: unknown) => cells as extendedCell[];
	const asResult = (cr: unknown) => cr as combatResults;
	const asSupply = (s: unknown) => s as Supply;

	return {
		getMoveRange: (_map, u) => u === null ? [] : asCells(one(movement.moveRange)(u)),
		getUnitMoveRange: one(movement.unitMoveRange),
		getUnitAttackCells: (_map, u) => u === null ? [] : one(attack.attackCells)(u).map(cell),
		getUnitAttackRange: (u) => u ? one(attack.unitAttackRange)(u) : 0,
		setZOCRange: (map, u, on) => {
			if (!u) return;
			const x = w(u), s = unit(x, u);
			for (const c of zocCells(x, s)) map[c.row][c.col].setZOC(sideOf(x, s), on);
			countersChanged = true;
		},
		setSpotRange: (map, u, on) => {
			if (!u) return 0;
			const x = w(u), s = unit(x, u);
			const spotted = on ? newlySpotted(x, s) : [];
			for (const c of spotCells(x, s)) map[c.row][c.col].setSpotted(sideOf(x, s), on);
			for (const t of spotted) oldUnit(t).tempSpotted = true; //(the contract puts them back after)
			countersChanged = true;
			return spotted.length;
		},
		getUnitSpotRange: (u) => u ? one(unitSpotRange)(u) : 0,
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
		isBridgeForSide: (hex, side) => {
			if (!hex) return false;
			const x = w(), p = hex.getPos();
			return movement.isBridgeForSide(x, hexIndex(x, p.row, p.col), side);
		},
		canResupply: (_map, u) => one(supply.canResupply)(u),
		canReinforce: (_map, u, over) => one((x, s) => supply.canReinforce(x, s, over))(u),
		canCapture: one(units.canCapture),
		canEntrench: (u) => u !== null && one(units.canEntrench)(u),
		isEnemy: (u, t) => u !== null && t !== null && two(units.isEnemy)(u, t),
		getSupportFireUnits: (_list, atk, def) => two(attack.supportFireUnits)(atk, def).map(oldUnit),
		isInAttackRange: two(attack.isInAttackRange),
		getEmbarkType: (_map, u) => one(movement.embarkTypeOf)(u),
		getDisembarkPositions: (_map, u) => one(movement.disembarkPositions)(u).map(cell),
		getReinforcementDeployPositions: (_map, u, row, col) =>
			cell(one((x, s) => movement.reinforcementDeployPosition(x, s, row, col))(u)),
		canEmbark: (_map, u) => one(movement.canEmbark)(u),
		canDisembark: (_map, u) => one(movement.canDisembark)(u),
		canMount: one(units.canMount),
		canUnmount: one((_x, s) => units.canUnmount(s)),
		isTransportable: (eqid) => units.isTransportable(w(), eqid),
		isAir: (u) => u !== null && one(units.isAir)(u),
		isSea: (u) => u !== null && one(units.isSea)(u),
		isGround: (u) => u !== null && one(units.isGround)(u),
		isTrain: (u) => u !== null && one(units.isTrain)(u),
		isCloseCombatTerrain: units.isCloseCombatTerrain,
		//Unit.move asks it of a transport too: of its own equipment
		unitUsesFuel: (u: Unit | Transport) => "getPos" in u ? one(units.unitUsesFuel)(u) : units.usesFuel(old.Equipment.equipment[u.eqid]),
		unitLowFuel: (u, t) => one((x, s) => units.unitLowFuel(x, s, t))(u),
		unitUsesAmmo: one(units.unitUsesAmmo),
		unitLowAmmo: (u, t) => one((x, s) => units.unitLowAmmo(x, s, t))(u),
		calculateUnitCosts: (eqid, transportId) => costs.unitCost(w(), eqid, transportId),
		calculateUpgradeCosts: (u, upgradeId, transportId) => u === null ? 0 : one((x, s) => costs.upgradeCost(x, s, upgradeId, transportId))(u),
		calculateUnitCostPerStrength: (u) => u === null ? -1 : one(costs.costPerStrength)(u),
		calculateUnitSellCost: (u) => u === null || u === undefined ? -1 : one(costs.sellCost)(u),
		getDirection: geometry.directionTo,
		distance: geometry.distance,
		getAdjacent: (r, c) => geometry.adjacent(r, c).map(cell),
		facingToAdjacentIndex: geometry.facingToAdjacentIndex,
		rollDice: (min, max) => combat.rollDice(old.game, min, max),
	};
}
