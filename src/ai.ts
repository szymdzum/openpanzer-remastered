/**
 * AI - provides AI for OpenPanzer
 *
 * http://www.linuxconsulting.ro
 * http://openpanzer.net
 *
 * Copyright (c) 2012 Nicu Pavel
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 *
 * Reconstructed from the Panzer Marshal 3.2.14 bundle. The 2.9 AI was a stub, most names
 * come from what the code does and how game.js calls it.
 */

import {
	actionType, type Cell, movMethod, roadType, terrainEntrenchment, terrainInitiative, terrainType,
	unitClass
} from "./prototypes";
import { Equipment } from "./equipment";
import { defined } from "./util";
import { GameRules } from "./gamerules";
import type { Unit } from "./unit";
import type { GameMap, Player } from "./map";
import { engineContext } from "./context";
import { Rng } from "./rng";

//Undeclared in the bundle (implicit globals): module variables here, same lifetime (buildActions)
var h: any;

//One queued action, param depends on type (actionType): [unit] for resupply, reinforce,
//mount and select, [unit, cell] for move, [unit, target] for attack, and for the tutorial
//messages [text, cell it points at]. type is a plain number, so it can't narrow a union:
//the elements stay any for game.js, which reads them as the type says
export type AIActionParam = Unit | Cell | string;
export interface AIAction { type: number; param: any[]; }

//The AI's settings: what it buys, when it reinforces and resupplies, how it scores
export interface AIConfig
{
	minReinforceStrength: number; //reinforce below this strength even if the unit can still act
	minAmmo: number; //resupply below this ammo
	minFuel: number; //resupply below this fuel
	objectiveScore: number; //divided by the distance to the nearest objective
	attackLossesThreshold: number; //times the unit class loss cost, the score an attack must beat
	entrenchmentScore: number; //per entrenchment level, for staying in place
	minStrengthLossRatio: number; //minimum strength / expected losses to attack
	badAttackScore: number;
	unspottedFactor: number; //attacks on targets on unspotted hexes
	randomFactor: number[]; //a score is multiplied by one of these, picked at random
	prestigeReserve: number; //prestige not spent on buying units
	airPrestigeRatio: number; //of the prestige over the reserve, for air units
	maxUnitCost: number;
	minUnitCost: number;
	airPurchaseClasses: number[];
	groundPurchaseClasses: number[];
	//By unit class: the cost of losing strength and the value of killing strength
	unitClassLossCost: number[];
	unitClassKillValue: number[];
}

//The settings of the bundle's AI
export var aiDefaultConfig: AIConfig = {
	minReinforceStrength: 4,
	minAmmo: 2,
	minFuel: 5,
	objectiveScore: 4000,
	attackLossesThreshold: 4,
	entrenchmentScore: 50,
	minStrengthLossRatio: 2.5,
	badAttackScore: -1000,
	unspottedFactor: 0.3,
	randomFactor: [0.8, 0.85, 0.9, 0.95, 1, 1.1, 1.15, 1.2],
	prestigeReserve: 1000,
	airPrestigeRatio: 0.3,
	maxUnitCost: 900,
	minUnitCost: 120,
	airPurchaseClasses: [unitClass.fighter, unitClass.tacticalBomber],
	groundPurchaseClasses: [unitClass.infantry, unitClass.infantry, unitClass.artillery, unitClass.antiTank,
		unitClass.tank, unitClass.infantry, unitClass.tank],
	unitClassLossCost: [0, 5, 5, 10, 10, 5, 10, 40, 20, 10, 5, 30, 30, 40, 15, 10, 10, 40, 40, 10, 10, 10],
	unitClassKillValue: [0, 50, 25, 30, 10, 10, 5, 150, 150, 10, 50, 100, 100, 150, 50, 50, 50, 100, 150, 50, 50, 50]
};

//What an AI can be given besides its player and map: its random numbers in [0, 1) (default
//Rng.random, the engine's stream, read at each draw) and its settings (default aiDefaultConfig).
//Nothing else: an AI is a player's handler, and the saved game keeps the player's own fields
export interface AIOptions
{
	rng?: () => number;
	config?: AIConfig;
}

//What the AI has decided so far this turn, which the scores read: planTurn resets and fills it
export interface AIPlan
{
	enemyUnits: { [unitId: number]: EnemyUnit }; //EnemyUnit by unit id of the units attacked this turn
	takenPositions: Cell[]; //cells the AI units were ordered to move to
	freedPositions: Cell[]; //cells the AI units were ordered to leave
	defendObjectives: Cell[]; //victory hexes the enemy side has to capture
	objectives: Cell[]; //victory hexes this side has to capture
}

//The AI's estimate of an attack and of the objective nearest to a cell
export interface AIAttackScore { score: number; kills: number; }
export interface AIObjectiveScore { cell: Cell; score: number; }

//The AI state of one of its own units during a turn: what it did and what it can't do anymore
export class AIUnit
{
	declare unit: Unit;
	declare noAttack: boolean;
	declare noMove: boolean;
	declare noReinforce: boolean;
	declare noResupply: boolean;
	declare didAttack: boolean;
	declare didMove: boolean;
	declare didResupplyReinforce: boolean;
	declare newPosition: Cell;
	declare noResupplyReinforce?: boolean; //only set by the typo in AI attackUnit

	constructor(unit: Unit)
	{
	this.unit = unit;
	this.noAttack = false;
	this.noMove = false;
	this.noReinforce = false;
	this.noResupply = false;
	this.didAttack = false;
	this.didMove = false;
	this.didResupplyReinforce = false;
	this.newPosition = null; //cell the unit was ordered to move to
	}
}

//An enemy unit already targeted by the AI this turn
export class EnemyUnit
{
	declare unit: Unit;
	declare isAttacked: boolean;
	declare losses: number;
	declare isKilled: boolean;

	constructor(unit: Unit)
	{
	this.unit = unit;
	this.isAttacked = false;
	this.losses = 0; //expected losses from the attacks ordered so far
	this.isKilled = false;
	}
}

//player is the AI controlled player, map the scenario map, options its random numbers and settings.
//The constructor's body keeps the state in its closure and sets up the methods (docs/TYPES.md rule 3)
export class AI
{
	declare buildActions: () => void; //startTurn, then planTurn
	declare startTurn: () => void;
	declare planTurn: () => void;
	declare getAction: () => AIAction;
	declare getEvaluator: () => AIEvaluator;

	declare static onUnitsDeployed: (() => void) | null; //assigned below

	constructor(player: Player, map: GameMap, options?: AIOptions)
	{
		const config = options && options.config ? options.config : aiDefaultConfig;
		var rng = options && options.rng ? options.rng : Rng.random;
		var allUnits: Unit[] = [];
		var aiUnits: AIUnit[] = []; //AIUnit list of the units still having something to do
		var actionsQueue: AIAction[] = [];
		var plan: AIPlan = { enemyUnits: {}, takenPositions: [], freedPositions: [], defendObjectives: [], objectives: [] };
		var evaluator = createAIEvaluator(player, map, plan, config, rng);
		var prestigeLeft = player.prestige; //prestige left for reinforcements

		//The turn as Map.endTurn starts it (GameMap.onPlayerTurn): the start, then the plan
		this.buildActions = function()
		{
			startTurn();
			planTurn();
		}

		//Buys units with the prestige over the reserve, deploys the core units, lets the UI redraw
		//(AI.onUnitsDeployed). The prestige left for reinforcements is taken before buying (#21)
		function startTurn(): void
		{
			let i, j;
			prestigeLeft = player.prestige;
			let prestige = player.prestige;

			//Buy new units with the prestige over the reserve, part of it for air units
			if (!(prestige <= prestigeReserve))
			{
				prestige = prestige - prestigeReserve;
				let airPrestige = prestige * airPrestigeRatio;
				if (airPrestige < 300)
					airPrestige = 0;
				prestige = prestige - airPrestige;
				const airPurchase = buyUnits(airPrestige, airPurchaseClasses);
				const groundPurchase = buyUnits(prestige, groundPurchaseClasses);
				let eqList = airPurchase.units;
				for (i = eqList.length - 1; i >= 0; i--)
					player.buyUnit(eqList[i]);
				airPurchase.units = [];
				eqList = groundPurchase.units;
				for (i = eqList.length - 1; i >= 0; i--)
					player.buyUnit(eqList[i]);
				groundPurchase.units = [];
			}

			//Deploy the undeployed core units on the deployment hexes
			const coreUnits = player.getCoreUnitList();
			const deployHexes = map.getDeployHexes(player.side);
			//h is not declared: an implicit global, kept as in the bundle
			for (h = 0; h < deployHexes.length; h++)
			{
				for (j = 0; j < coreUnits.length; j++)
				{
					if (!coreUnits[j].isDeployed)
					{
						const cell = deployHexes[h];
						map.deployPlayerUnit(player, j, cell.row, cell.col);
					}
				}
			}
			if (AI.onUnitsDeployed) AI.onUnitsDeployed();
		}

		//Plans the turn: the actions getAction hands out, unit by unit
		function planTurn(): void
		{
			let i;
			allUnits = map.getUnits();
			plan.takenPositions = [];
			plan.freedPositions = [];
			plan.objectives = map.sidesVictoryHexes[player.side];
			plan.defendObjectives = map.sidesVictoryHexes[+!player.side];
			plan.enemyUnits = {};
			aiUnits = [];
			//Artillery, fortifications, air and naval combat units act first
			for (i = 0; i < allUnits.length; i++)
			{
				if (allUnits[i].player.id != player.id)
					continue;
				if (allUnits[i].unitData().uclass == unitClass.artillery
					|| allUnits[i].unitData().uclass == unitClass.fortification
					|| (GameRules.isAir(allUnits[i]) && allUnits[i].unitData().uclass != unitClass.airTransport)
					|| (GameRules.isSea(allUnits[i]) && allUnits[i].unitData().uclass != unitClass.navalTransport))
					aiUnits.unshift(new AIUnit(allUnits[i]));
				else
					aiUnits.push(new AIUnit(allUnits[i]));
			}

			//Each unit gets another pass until it can't do anything else
			let aiUnit: AIUnit = null;
			while (aiUnits.length > 0)
			{
				aiUnit = aiUnits[0];
				reinforceUnit(aiUnit);
				resupplyUnit(aiUnit);
				moveUnit(aiUnit);
				attackUnit(aiUnit);
				if (aiUnit.noReinforce && aiUnit.noResupply && aiUnit.noAttack && aiUnit.noMove)
					aiUnits.shift();
			}
		}

		this.startTurn = startTurn;
		this.planTurn = planTurn;

		//The scores this AI plans with, on its plan of the turn
		this.getEvaluator = function() { return evaluator; }

		this.getAction = function()
		{
			if (actionsQueue.length == 0)
				return null;
			const action = actionsQueue[0];
			actionsQueue.splice(0, 1);
			return action;
		}

		function addAction(actionType: number, params: AIActionParam[])
		{
			actionsQueue.push({ type: actionType, param: params });
		}

		//Reinforces a weak unit or one that can't move or attack anymore, if there is prestige left
		function reinforceUnit(aiUnit: AIUnit): boolean
		{
			const unit = aiUnit.unit;
			if (!GameRules.canReinforce(map.map, unit) || aiUnit.didResupplyReinforce || aiUnit.didAttack
				|| aiUnit.didMove || unit.unitData().uclass == unitClass.fortification || prestigeLeft <= 0)
			{
				aiUnit.noReinforce = true;
				return false;
			}
			if ((aiUnit.noAttack && aiUnit.noMove) || unit.strength < minReinforceStrength)
			{
				const costPerStrength = GameRules.calculateUnitCostPerStrength(unit);
				const reinforceValue = GameRules.getReinforceValue(map.map, unit);
				let strength = (prestigeLeft / costPerStrength) >> 0;
				if (strength > reinforceValue)
					strength = reinforceValue;
				if (reinforceValue > 0 && strength > 0)
				{
					addAction(actionType.reinforce, [ unit ]);
					prestigeLeft -= strength * costPerStrength;
					return (aiUnit.didResupplyReinforce = true);
				}
			}
			if (aiUnit.noAttack && aiUnit.noMove)
				aiUnit.noReinforce = true;
			return false;
		}

		//Resupplies a unit low on ammo or fuel or one that can't move or attack anymore
		//(inlined into buildActions in the bundle)
		function resupplyUnit(aiUnit: AIUnit): void
		{
			const unit = aiUnit.unit;
			if (!GameRules.canResupply(map.map, unit) || aiUnit.didResupplyReinforce || aiUnit.didAttack || aiUnit.didMove)
			{
				aiUnit.noResupply = true;
			}
			else if ((aiUnit.noAttack && aiUnit.noMove) || unit.ammo < minAmmo
					|| (GameRules.unitUsesFuel(unit) && unit.fuel < minFuel))
			{
				addAction(actionType.resupply, [ unit ]);
				aiUnit.didResupplyReinforce = true;
			}
		}

		//Moves the unit to the best scored cell in its move range, if better than where it stands
		function moveUnit(aiUnit: AIUnit): boolean
		{
			const unit = aiUnit.unit;
			if (aiUnit.didMove || aiUnit.didResupplyReinforce || !unit)
			{
				aiUnit.noMove = true;
				return false;
			}
			const moveCells = GameRules.getMoveRange(map, unit);
			if (!moveCells || moveCells.length == 0)
			{
				aiUnit.noMove = true;
				return false;
			}
			const pos: Cell & { canMove?: boolean } = unit.getPos();
			pos.canMove = true;
			let bestScore = evaluator.getCellScore(unit, pos);
			let objective: AIObjectiveScore;
			if (GameRules.isGround(unit))
			{
				objective = evaluator.getObjectiveScore(pos);
				bestScore = bestScore + objective.score;
			}
			bestScore = bestScore + unit.entrenchment * entrenchmentScore;
			let attackScore = evaluator.getAttackPotential(unit, pos);
			bestScore = bestScore + attackScore;
			let bestCell: Cell = null;
			let score = 0;
			for (let i = 0; i < moveCells.length; i++)
			{
				objective = evaluator.getObjectiveScore(moveCells[i]);
				if (GameRules.isAir(unit))
					objective.score *= 0.3;
				if (GameRules.isSea(unit))
					objective.score = 0;
				score = evaluator.getCellScore(unit, moveCells[i]) + objective.score;
				if (score < -2000)
					continue;
				attackScore = evaluator.getAttackPotential(unit, moveCells[i]);
				score += attackScore;
				if (score > bestScore)
				{
					bestCell = moveCells[i];
					bestScore = score;
				}
			}
			if (bestCell !== null)
			{
				//Mark the destination taken and the old position free (inlined in the bundle)
				const dest = bestCell;
				const oldPos = unit.getPos();
				let index: number;
				plan.takenPositions.push(dest);
				if ((index = evaluator.findFreedPosition(dest)) >= 0)
					plan.freedPositions.splice(index, 1);
				plan.freedPositions.push(oldPos);

				addAction(actionType.move, [ unit, bestCell ]);
				aiUnit.didMove = true;
				aiUnit.newPosition = bestCell;
				return true;
			}
			aiUnit.noMove = true;
			return false;
		}

		//Attacks the best scored target from where the unit stands or was ordered to move to
		//(inlined into buildActions in the bundle)
		function attackUnit(aiUnit: AIUnit): void
		{
			const unit = aiUnit.unit;
			if (unit.hasFired || aiUnit.didAttack || aiUnit.didResupplyReinforce)
			{
				aiUnit.noAttack = true;
				return;
			}
			let target: Unit = null;
			let result = {} as AIAttackScore;
			const unitHex = unit.getHex();
			let attackHex = unitHex;
			//An attack must score more than these losses
			let bestScore = -(attackLossesThreshold * unitClassLossCost[unit.unitData().uclass]);
			let bestKills = 0;
			if (aiUnit.didMove && aiUnit.newPosition !== null)
			{
				attackHex = map.map[aiUnit.newPosition.row][aiUnit.newPosition.col];
				unit.setHex(attackHex);
			}
			//Less eager to attack from a victory hex
			if (attackHex.victorySide != -1)
				bestScore -= 50;
			const cells = GameRules.getUnitAttackCells(map.map, unit, map.rows, map.cols);
			for (let i = 0; i < cells.length; i++)
			{
				result = evaluator.getAttackScore(unit, cells[i], false);
				if (result.score > bestScore)
				{
					bestScore = result.score;
					bestKills = result.kills;
					const targetHex = map.map[cells[i].row][cells[i].col];
					target = targetHex.getAttackableUnit(unit, false);
				}
			}
			if (aiUnit.didMove && unitHex !== null)
				unit.setHex(unitHex);

			if (target)
			{
				//Record the expected losses of the target (inlined in the bundle)
				const enemy = target;
				if (enemy)
				{
					if (typeof plan.enemyUnits[enemy.id] === "undefined")
						plan.enemyUnits[enemy.id] = new EnemyUnit(enemy);
					plan.enemyUnits[enemy.id].isAttacked = true;
					plan.enemyUnits[enemy.id].losses += bestKills;
					if (plan.enemyUnits[enemy.id].losses > enemy.strength)
						plan.enemyUnits[enemy.id].isKilled = true;
				}
				addAction(actionType.attack, [ unit, target ]);
				//noResupplyReinforce is not an AIUnit property (a typo for noResupply?), kept from the bundle
				aiUnit.didAttack = aiUnit.noResupplyReinforce = true;
			}
			else if (aiUnit.noMove || aiUnit.didMove)
			{
				aiUnit.noAttack = true;
			}
		}

		//Picks random affordable units of the classes in classList, cycling through the list,
		//until prestige runs out or a whole cycle ends on a class with nothing to buy
		function buyUnits(prestige: number, classList: number[]): { prestige: number; units: number[] }
		{
			const units: number[] = [];
			const country = player.country + 1;
			let classIndex = 0;
			let noneFound = false;
			while (prestige > 0)
			{
				if (classIndex > classList.length - 1)
				{
					if (noneFound)
						break;
					classIndex = 0;
				}
				const eqList = Equipment.getCountryEquipmentByClass(classList[classIndex], country);
				for (let i = eqList.length - 1; i >= 0; i--)
				{
					const cost = GameRules.calculateUnitCosts(eqList[i]);
					if (cost > prestige || cost > maxUnitCost || cost < minUnitCost
						|| Equipment.equipment[eqList[i]].movmethod == movMethod.deepnaval
						|| Equipment.equipment[eqList[i]].yearavailable > engineContext.scenario().date.getFullYear())
						eqList.splice(i, 1);
				}
				if (eqList.length > 0)
				{
					const eqid = eqList[randomInt(rng, 0, eqList.length - 1)];
					prestige -= GameRules.calculateUnitCosts(eqid);
					units.push(eqid);
					noneFound = false;
				}
				else
				{
					noneFound = true;
				}
				classIndex++;
			}
			return { prestige: prestige, units: units };
		}

		//The settings (AIConfig), assigned last as in the bundle
		var minReinforceStrength = config.minReinforceStrength;
		var minAmmo = config.minAmmo;
		var minFuel = config.minFuel;
		var attackLossesThreshold = config.attackLossesThreshold;
		var entrenchmentScore = config.entrenchmentScore;
		var prestigeReserve = config.prestigeReserve;
		var airPrestigeRatio = config.airPrestigeRatio;
		var maxUnitCost = config.maxUnitCost;
		var minUnitCost = config.minUnitCost;
		var airPurchaseClasses = config.airPurchaseClasses;
		var groundPurchaseClasses = config.groundPurchaseClasses;
		var unitClassLossCost = config.unitClassLossCost;
	}
}

//Random integer between min and max inclusive, from rng's number in [0, 1)
function randomInt(rng: () => number, min: number, max: number): number
{
	return Math.floor(rng() * (max - min + 1) + min);
}

//The AI's scores: of a cell for a unit, of an attack, of the attacks from a cell, of the nearest
//objective. They read the plan of the turn (the positions taken and freed, the enemy units
//already attacked). getCellScore and getAttackScore draw once from rng, except where they return
//early (a taken or unreachable cell, a target expected killed): the order of the draws is behavior
export interface AIEvaluator
{
	getAttackScore(unit: Unit, cell: Cell, isPotential: boolean): AIAttackScore;
	getAttackPotential(unit: Unit, cell: Cell): number;
	getCellScore(unit: Unit, cell: Cell & { canMove?: boolean }): number;
	getObjectiveScore(cell: Cell, toCapture?: boolean): AIObjectiveScore;
	findFreedPosition(cell: Cell): number;
}

//player is the AI controlled player, map the scenario map, plan what the AI decided this turn
export function createAIEvaluator(player: Player, map: GameMap, plan: AIPlan, config: AIConfig,
	rng: () => number): AIEvaluator
{
	var objectiveScore = config.objectiveScore;
	var minStrengthLossRatio = config.minStrengthLossRatio;
	var badAttackScore = config.badAttackScore;
	var unspottedFactor = config.unspottedFactor;
	var randomFactor = config.randomFactor;
	var unitClassLossCost = config.unitClassLossCost;
	var unitClassKillValue = config.unitClassKillValue;

	//Returns the score and the expected kills of unit attacking the unit on cell
	//isPotential: scoring a possible position, attacks on killed targets or with
	//too many losses count as their score or 0 instead of the bad attack score
	function getAttackScore(unit: Unit, cell: Cell, isPotential: boolean): AIAttackScore
	{
		let score = 0;
		let kills = 0;
		const target = map.map[cell.row][cell.col].getAttackableUnit(unit, false);
		const targetHex = target.getHex(); //throws before the target check below, kept from the bundle
		if (target && GameRules.canInitiateAttack(unit, target))
		{
			if (typeof plan.enemyUnits[target.id] !== "undefined" && plan.enemyUnits[target.id] !== null)
			{
				const enemy = plan.enemyUnits[target.id];
				if (enemy.isKilled)
				{
					if (isPotential)
						return { score: 0, kills: 0 };
					return { score: badAttackScore, kills: 0 };
				}
				//Finish an already attacked unit
				if (enemy.isAttacked)
					score += 100;
			}
			const cr = GameRules.calculateCombatResults(unit, target, map.getUnits(), true, true);
			score = score + (cr.kills * unitClassKillValue[target.unitData().uclass]
				- cr.losses * unitClassLossCost[unit.unitData().uclass]);
			kills = cr.kills;
			if (cr.losses >= unit.strength || unit.strength / cr.losses < minStrengthLossRatio)
			{
				if (isPotential)
					return { score: score, kills: cr.kills };
				return { score: badAttackScore, kills: cr.kills };
			}
			if (targetHex.victorySide !== -1)
				score += 350;
			if (!targetHex.isSpotted(unit.player.side))
				score *= unspottedFactor;
		}
		return { score: score * randomFactor[random(0, 7)], kills: kills };
	}

	//Returns the sum of the attack scores unit would have if standing on cell
	function getAttackPotential(unit: Unit, cell: Cell): number
	{
		let result: number | AIAttackScore = 0; //holds the attack scores, starts as a number
		let score = 0;
		const unitHex = unit.getHex();
		unit.setHex(map.map[cell.row][cell.col]);
		const cells = GameRules.getUnitAttackCells(map.map, unit, map.rows, map.cols);
		for (let i = 0; i < cells.length; i++)
		{
			result = getAttackScore(unit, cells[i], true);
			score += result.score;
		}
		unit.setHex(unitHex);
		return score;
	}

	//Returns the score of unit standing on cell: terrain, objectives and neighbours
	function getCellScore(unit: Unit, cell: Cell & { canMove?: boolean }): number
	{
		let score = 0;
		const unitHex = unit.getHex();
		const uclass = unit.unitData().uclass;
		const side = unit.player.side;
		const enemySide = ~side & 1;
		let isFreed = false;
		let i;

		//Another unit was ordered to move there
		let takenIndex = -1;
		for (i = 0; i < plan.takenPositions.length; i++)
		{
			if (plan.takenPositions[i].row == cell.row && plan.takenPositions[i].col == cell.col)
			{
				takenIndex = i;
				break;
			}
		}
		if (takenIndex >= 0)
			return -5000;
		if (findFreedPosition(cell) >= 0)
			isFreed = true;
		if (!cell.canMove && !isFreed)
			return -5000;

		const hex = map.map[cell.row][cell.col];
		if (!hex.isSpotted(enemySide))
			score -= 40;
		if (!hex.isSpotted(side))
			score += 30;
		const deployment = hex.isDeployment;
		if (hex.victorySide == -1 && deployment > -1 && deployment == player.id)
			score -= 100;
		if (uclass == unitClass.fighter || uclass == unitClass.tacticalBomber || uclass == unitClass.levelBomber)
			return score * randomFactor[random(0, 7)];

		if (GameRules.canEntrench(unit) && unit.entrenchment < terrainEntrenchment[hex.terrain])
			score += 50;
		if (terrainInitiative[unitHex.terrain] < terrainInitiative[hex.terrain])
			score += 20;
		if ((hex.terrain == terrainType.River || hex.terrain == terrainType.Stream) && hex.road == roadType.none)
			score -= 70;
		if (GameRules.isCloseCombatTerrain(hex.terrain))
		{
			if (uclass == unitClass.infantry)
				score += 120;
			else if (uclass == unitClass.artillery || uclass == unitClass.antiTank || uclass == unitClass.airDefence)
				score += 10;
			else
				score -= 50;
		}
		if (hex.flag != -1 && hex.flag != unit.player.country && GameRules.isGround(unit))
			score += 50;

		//A victory hex that is free, freed, ours or held by a unit expected to be killed
		let canOccupy = (hex.victorySide != -1);
		if (canOccupy)
		{
			canOccupy = (hex.unit === null);
			if (!canOccupy)
			{
				canOccupy = isFreed || hex.unit.id == unit.id
					|| (typeof plan.enemyUnits[hex.unit.id] !== "undefined" && plan.enemyUnits[hex.unit.id] !== null
						&& plan.enemyUnits[hex.unit.id].isKilled ? true : false);
			}
		}
		if (canOccupy)
		{
			const isOwned = map.getPlayer(hex.owner).side == side; //unused
			if (uclass == unitClass.artillery)
				score += 50;
			else if (uclass == unitClass.infantry)
				score += 600;
			else if (uclass == unitClass.tank)
				score += 350;
			else
				score += 300;
		}

		const adjacent = GameRules.getAdjacent(cell.row, cell.col);
		for (i = 0; i < adjacent.length; i++)
		{
			if (adjacent[i].row < 0 || adjacent[i].col < 0 || adjacent[i].row >= map.rows - 1 || adjacent[i].col >= map.cols - 1)
				continue;
			const adjHex = map.map[adjacent[i].row][adjacent[i].col];
			const adjUnit = adjHex.getUnit();
			if (adjUnit && adjUnit.id !== unit.id)
			{
				//Friendly neighbour that stays there, artillery support counts more
				if (!GameRules.isEnemy(unit, adjUnit) && findFreedPosition(adjacent[i]) < 0)
				{
					score += 20;
					if (adjUnit.unitData().uclass == unitClass.artillery)
						score += 80;
				}
				else
				{
					if (uclass == unitClass.artillery)
						score -= 100;
					else
						score += 40;
				}
			}
			if (adjHex.victorySide != -1)
			{
				const isOwnedAdj = map.getPlayer(adjHex.owner).side == side;
				if (uclass == unitClass.artillery || uclass == unitClass.flak)
					score += 50;
				else if (uclass == unitClass.infantry)
					score += isOwnedAdj ? 70 : 100;
				else
					score += isOwnedAdj ? 50 : 70;
			}
		}
		return score * randomFactor[random(0, 7)];
	}

	//Returns the nearest objective to cell and a score growing as it gets closer
	//toCapture false scores against the objectives to defend (no caller passes it)
	function getObjectiveScore(cell: Cell, toCapture?: boolean): AIObjectiveScore
	{
		let list = plan.objectives;
		if (defined(toCapture) && !toCapture)
			list = plan.defendObjectives;
		const result: AIObjectiveScore = { cell: null, score: 0 };
		for (let i = 0; i < list.length; i++)
		{
			let d = GameRules.distance(cell.row, cell.col, list[i].row, list[i].col);
			if (d > 0)
			{
				d = objectiveScore / d;
				if (d > result.score)
				{
					result.score = d;
					result.cell = list[i];
				}
			}
			else
			{
				return { cell: cell, score: objectiveScore + 100 };
			}
		}
		result.score = Math.round(result.score);
		return result;
	}

	//Returns the index of cell in plan.freedPositions or -1
	function findFreedPosition(cell: Cell): number
	{
		for (let i = 0; i < plan.freedPositions.length; i++)
			if (plan.freedPositions[i].row == cell.row && plan.freedPositions[i].col == cell.col)
				return i;
		return -1;
	}

	//Random integer between min and max inclusive
	function random(min: number, max: number): number
	{
		return randomInt(rng, min, max);
	}

	return {
		getAttackScore: getAttackScore,
		getAttackPotential: getAttackPotential,
		getCellScore: getCellScore,
		getObjectiveScore: getObjectiveScore,
		findFreedPosition: findFreedPosition
	};
}

//Called after the AI deployed its units, before it plans: Game.init sets it to the UI's redraw
AI.onUnitsDeployed = null as (() => void) | null;
