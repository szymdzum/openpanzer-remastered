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
import { defined } from "./dom";
import { GameRules } from "./gamerules";
import type { Unit } from "./unit";
import type { GameMap, Player } from "./map";
import { game } from "./game";
import { Rng } from "./rng";

//Undeclared in the bundle (implicit globals): module variables here, same lifetime (buildActions)
var h: any;

//One queued action, param depends on type (actionType): [unit] for resupply, reinforce,
//mount and select, [unit, cell] for move, [unit, target] for attack, and for the tutorial
//messages [text, cell it points at]. type is a plain number, so it can't narrow a union:
//the elements stay any for game.js, which reads them as the type says
export type AIActionParam = Unit | Cell | string;
export interface AIAction { type: number; param: any[]; }

//AI and AIScripted are constructor functions, as in the bundle: this gives `new` on them a type
export interface AIConstructor { new (player: Player, map: GameMap): AI; }

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

//The methods AI sets up in its constructor
export interface AI
{
	buildActions(): void;
	getAction(): AIAction;
}

//player is the AI controlled player, map the scenario map
export function AI(this: AI, player: Player, map: GameMap)
{
	var allUnits: Unit[] = [];
	var aiUnits: AIUnit[] = []; //AIUnit list of the units still having something to do
	var enemyUnits: { [unitId: number]: EnemyUnit } = {}; //EnemyUnit by unit id of the units attacked this turn
	var actionsQueue: AIAction[] = [];
	var takenPositions: Cell[] = []; //cells the AI units were ordered to move to
	var freedPositions: Cell[] = []; //cells the AI units were ordered to leave
	var defendObjectives: Cell[] = []; //victory hexes the enemy side has to capture
	var objectives: Cell[] = []; //victory hexes this side has to capture
	var prestigeLeft = player.prestige; //prestige left for reinforcements

	this.buildActions = function()
	{
		var i, j;
		prestigeLeft = player.prestige;
		var prestige = player.prestige;

		//Buy new units with the prestige over the reserve, part of it for air units
		if (!(prestige <= prestigeReserve))
		{
			prestige = prestige - prestigeReserve;
			var airPrestige = prestige * airPrestigeRatio;
			if (airPrestige < 300)
				airPrestige = 0;
			prestige = prestige - airPrestige;
			var airPurchase = buyUnits(airPrestige, airPurchaseClasses);
			var groundPurchase = buyUnits(prestige, groundPurchaseClasses);
			var eqList = airPurchase.units;
			for (i = eqList.length - 1; i >= 0; i--)
				player.buyUnit(eqList[i]);
			airPurchase.units = [];
			eqList = groundPurchase.units;
			for (i = eqList.length - 1; i >= 0; i--)
				player.buyUnit(eqList[i]);
			groundPurchase.units = [];
		}

		//Deploy the undeployed core units on the deployment hexes
		var coreUnits = player.getCoreUnitList();
		var deployHexes = map.getDeployHexes(player.side);
		//h is not declared: an implicit global, kept as in the bundle
		for (h = 0; h < deployHexes.length; h++)
		{
			for (j = 0; j < coreUnits.length; j++)
			{
				if (!coreUnits[j].isDeployed)
				{
					var cell = deployHexes[h];
					map.deployPlayerUnit(player, j, cell.row, cell.col);
				}
			}
		}
		for (j = 0; j < coreUnits.length; j++); //empty loop, kept from the bundle
		if (AI.onUnitsDeployed) AI.onUnitsDeployed();

		allUnits = map.getUnits();
		takenPositions = [];
		freedPositions = [];
		objectives = map.sidesVictoryHexes[player.side];
		defendObjectives = map.sidesVictoryHexes[+!player.side];
		enemyUnits = {};
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
		var aiUnit: AIUnit = null;
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

	this.getAction = function()
	{
		if (actionsQueue.length == 0)
			return null;
		var action = actionsQueue[0];
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
		var unit = aiUnit.unit;
		if (!GameRules.canReinforce(map.map, unit) || aiUnit.didResupplyReinforce || aiUnit.didAttack
			|| aiUnit.didMove || unit.unitData().uclass == unitClass.fortification || prestigeLeft <= 0)
		{
			aiUnit.noReinforce = true;
			return false;
		}
		if ((aiUnit.noAttack && aiUnit.noMove) || unit.strength < minReinforceStrength)
		{
			var costPerStrength = GameRules.calculateUnitCostPerStrength(unit);
			var reinforceValue = GameRules.getReinforceValue(map.map, unit);
			var strength = (prestigeLeft / costPerStrength) >> 0;
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
		var unit = aiUnit.unit;
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
		else if (aiUnit.noAttack && aiUnit.noMove) //never true, the previous check already caught it
		{
			aiUnit.noResupply = true;
		}
	}

	//Moves the unit to the best scored cell in its move range, if better than where it stands
	function moveUnit(aiUnit: AIUnit): boolean
	{
		var unit = aiUnit.unit;
		if (aiUnit.didMove || aiUnit.didResupplyReinforce || !unit)
		{
			aiUnit.noMove = true;
			return false;
		}
		var moveCells = GameRules.getMoveRange(map, unit);
		if (!moveCells || moveCells.length == 0)
		{
			aiUnit.noMove = true;
			return false;
		}
		var pos: Cell & { canMove?: boolean } = unit.getPos();
		pos.canMove = true;
		var bestScore = getCellScore(unit, pos);
		var objective: AIObjectiveScore;
		if (GameRules.isGround(unit))
		{
			objective = getObjectiveScore(pos);
			bestScore = bestScore + objective.score;
		}
		bestScore = bestScore + unit.entrenchment * entrenchmentScore;
		var attackScore = getAttackPotential(unit, pos);
		bestScore = bestScore + attackScore;
		var bestCell: Cell = null;
		var score = 0;
		for (var i = 0; i < moveCells.length; i++)
		{
			objective = getObjectiveScore(moveCells[i]);
			if (GameRules.isAir(unit))
				objective.score *= 0.3;
			if (GameRules.isSea(unit))
				objective.score = 0;
			score = getCellScore(unit, moveCells[i]) + objective.score;
			if (score < -2000)
				continue;
			attackScore = getAttackPotential(unit, moveCells[i]);
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
			var dest = bestCell;
			var oldPos = unit.getPos();
			var index: number;
			takenPositions.push(dest);
			if ((index = findFreedPosition(dest)) >= 0)
				freedPositions.splice(index, 1);
			freedPositions.push(oldPos);

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
		var unit = aiUnit.unit;
		if (unit.hasFired || aiUnit.didAttack || aiUnit.didResupplyReinforce)
		{
			aiUnit.noAttack = true;
			return;
		}
		var target: Unit = null;
		var result = {} as AIAttackScore;
		var unitHex = unit.getHex();
		var attackHex = unitHex;
		//An attack must score more than these losses
		var bestScore = -(attackLossesThreshold * unitClassLossCost[unit.unitData().uclass]);
		var bestKills = 0;
		if (aiUnit.didMove && aiUnit.newPosition !== null)
		{
			attackHex = map.map[aiUnit.newPosition.row][aiUnit.newPosition.col];
			unit.setHex(attackHex);
		}
		//Less eager to attack from a victory hex
		if (attackHex.victorySide != -1)
			bestScore -= 50;
		var cells = GameRules.getUnitAttackCells(map.map, unit, map.rows, map.cols);
		for (var i = 0; i < cells.length; i++)
		{
			result = getAttackScore(unit, cells[i], false);
			if (result.score > bestScore)
			{
				bestScore = result.score;
				bestKills = result.kills;
				var targetHex = map.map[cells[i].row][cells[i].col];
				target = targetHex.getAttackableUnit(unit, false);
			}
		}
		if (aiUnit.didMove && unitHex !== null)
			unit.setHex(unitHex);

		if (target)
		{
			//Record the expected losses of the target (inlined in the bundle)
			var enemy = target;
			if (enemy)
			{
				if (typeof enemyUnits[enemy.id] === "undefined")
					enemyUnits[enemy.id] = new EnemyUnit(enemy);
				enemyUnits[enemy.id].isAttacked = true;
				enemyUnits[enemy.id].losses += bestKills;
				if (enemyUnits[enemy.id].losses > enemy.strength)
					enemyUnits[enemy.id].isKilled = true;
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

	//Returns the score and the expected kills of unit attacking the unit on cell
	//isPotential: scoring a possible position, attacks on killed targets or with
	//too many losses count as their score or 0 instead of the bad attack score
	function getAttackScore(unit: Unit, cell: Cell, isPotential: boolean): AIAttackScore
	{
		var score = 0;
		var kills = 0;
		var target = map.map[cell.row][cell.col].getAttackableUnit(unit, false);
		var targetHex = target.getHex(); //throws before the target check below, kept from the bundle
		if (target && GameRules.canInitiateAttack(unit, target))
		{
			if (typeof enemyUnits[target.id] !== "undefined" && enemyUnits[target.id] !== null)
			{
				var enemy = enemyUnits[target.id];
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
			var cr = GameRules.calculateCombatResults(unit, target, map.getUnits(), true, true);
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
		var result: number | AIAttackScore = 0; //holds the attack scores, starts as a number
		var score = 0;
		var unitHex = unit.getHex();
		unit.setHex(map.map[cell.row][cell.col]);
		var cells = GameRules.getUnitAttackCells(map.map, unit, map.rows, map.cols);
		for (var i = 0; i < cells.length; i++)
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
		var score = 0;
		var unitHex = unit.getHex();
		var uclass = unit.unitData().uclass;
		var side = unit.player.side;
		var enemySide = ~side & 1;
		var isFreed = false;
		var i;

		//Another unit was ordered to move there
		var takenIndex = -1;
		for (i = 0; i < takenPositions.length; i++)
		{
			if (takenPositions[i].row == cell.row && takenPositions[i].col == cell.col)
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

		var hex = map.map[cell.row][cell.col];
		if (!hex.isSpotted(enemySide))
			score -= 40;
		if (!hex.isSpotted(side))
			score += 30;
		var deployment = hex.isDeployment;
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
		var canOccupy = (hex.victorySide != -1);
		if (canOccupy)
		{
			canOccupy = (hex.unit === null);
			if (!canOccupy)
			{
				//(the null check is always false here, from an inlined helper)
				canOccupy = isFreed || hex.unit.id == unit.id
					|| (hex.unit === null ? true
						: (typeof enemyUnits[hex.unit.id] !== "undefined" && enemyUnits[hex.unit.id] !== null
							&& enemyUnits[hex.unit.id].isKilled ? true : false));
			}
		}
		if (canOccupy)
		{
			var isOwned = map.getPlayer(hex.owner).side == side; //unused
			if (uclass == unitClass.artillery)
				score += 50;
			else if (uclass == unitClass.infantry)
				score += 600;
			else if (uclass == unitClass.tank)
				score += 350;
			else
				score += 300;
		}

		var adjacent = GameRules.getAdjacent(cell.row, cell.col);
		for (i = 0; i < adjacent.length; i++)
		{
			if (adjacent[i].row < 0 || adjacent[i].col < 0 || adjacent[i].row >= map.rows - 1 || adjacent[i].col >= map.cols - 1)
				continue;
			var adjHex = map.map[adjacent[i].row][adjacent[i].col];
			var adjUnit = adjHex.getUnit();
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
				var isOwnedAdj = map.getPlayer(adjHex.owner).side == side;
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
		var list = objectives;
		if (defined(toCapture) && !toCapture)
			list = defendObjectives;
		var result: AIObjectiveScore = { cell: null, score: 0 };
		for (var i = 0; i < list.length; i++)
		{
			var d = GameRules.distance(cell.row, cell.col, list[i].row, list[i].col);
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

	//Returns the index of cell in freedPositions or -1
	function findFreedPosition(cell: Cell): number
	{
		for (var i = 0; i < freedPositions.length; i++)
			if (freedPositions[i].row == cell.row && freedPositions[i].col == cell.col)
				return i;
		return -1;
	}

	//Random integer between min and max inclusive
	function random(min: number, max: number): number
	{
		return Math.floor(Rng.random() * (max - min + 1) + min);
	}

	//Picks random affordable units of the classes in classList, cycling through the list,
	//until prestige runs out or a whole cycle ends on a class with nothing to buy
	function buyUnits(prestige: number, classList: number[]): { prestige: number; units: number[] }
	{
		var units: number[] = [];
		var country = player.country + 1;
		var classIndex = 0;
		var noneFound = false;
		while (prestige > 0)
		{
			if (classIndex > classList.length - 1)
			{
				if (noneFound)
					break;
				classIndex = 0;
			}
			var eqList = Equipment.getCountryEquipmentByClass(classList[classIndex], country);
			for (var i = eqList.length - 1; i >= 0; i--)
			{
				var cost = GameRules.calculateUnitCosts(eqList[i]);
				if (cost > prestige || cost > maxUnitCost || cost < minUnitCost
					|| Equipment.equipment[eqList[i]].movmethod == movMethod.deepnaval
					|| Equipment.equipment[eqList[i]].yearavailable > game.scenario.date.getFullYear())
					eqList.splice(i, 1);
			}
			if (eqList.length > 0)
			{
				var eqid = eqList[random(0, eqList.length - 1)];
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

	var minReinforceStrength = 4; //reinforce below this strength even if the unit can still act
	var minAmmo = 2; //resupply below this ammo
	var minFuel = 5; //resupply below this fuel
	var objectiveScore = 4000; //divided by the distance to the nearest objective
	var attackLossesThreshold = 4; //times the unit class loss cost, the score an attack must beat
	var entrenchmentScore = 50; //per entrenchment level, for staying in place
	var minStrengthLossRatio = 2.5; //minimum strength / expected losses to attack
	var badAttackScore = -1000;
	var unspottedFactor = 0.3; //attacks on targets on unspotted hexes
	var randomFactor = [0.8, 0.85, 0.9, 0.95, 1, 1.1, 1.15, 1.2];
	var prestigeReserve = 1000; //prestige not spent on buying units
	var airPrestigeRatio = 0.3; //of the prestige over the reserve, for air units
	var maxUnitCost = 900;
	var minUnitCost = 120;
	var airPurchaseClasses = [unitClass.fighter, unitClass.tacticalBomber];
	var groundPurchaseClasses = [unitClass.infantry, unitClass.infantry, unitClass.artillery, unitClass.antiTank,
		unitClass.tank, unitClass.infantry, unitClass.tank];
	//By unit class: the cost of losing strength and the value of killing strength
	var unitClassLossCost = [0, 5, 5, 10, 10, 5, 10, 40, 20, 10, 5, 30, 30, 40, 15, 10, 10, 40, 40, 10, 10, 10];
	var unitClassKillValue = [0, 50, 25, 30, 10, 10, 5, 150, 150, 10, 50, 100, 100, 150, 50, 50, 50, 100, 150, 50, 50, 50];
}

//Called after the AI deployed its units, before it plans: Game.init sets it to the UI's redraw
AI.onUnitsDeployed = null as (() => void) | null;
