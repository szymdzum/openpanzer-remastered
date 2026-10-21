/**
 * Scenario - handles scenario related tasks
 *
 * http://www.linuxconsulting.ro
 * http://openpanzer.net
 *
 * Copyright (c) 2013 Nicu Pavel
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 *
 * Reconstructed from the Panzer Marshal 3.2.14 bundle, names and comments
 * carried over from the openpanzer 2.9 source where the code matches.
 */

import {
	CURRENCY_MULTIPLIER, groundCondition, movTableDry, movTableFrozen, movTableMud, setMovTable,
	PROTOTYPE_MIN_COST, SCENARIO_START_PRESTIGE, scoreGains, unitClass
} from "./prototypes";
import { Equipment } from "./equipment";
import { Unit } from "./unit";
import { GameMap, type Player } from "./map";
import { ScenarioLoader, type ScenarioLoaderConstructor } from "./scenarioloader";

//Undeclared in the bundle (implicit globals): module variables here, same lifetime (copy)
var t: any;

//The outcomes of a scenario, as checkVictory returns them (the campaign outcome keys)
export type ScenarioOutcome = "briliant" | "victory" | "tactical" | "lose";

//A unit to deploy later, Scenario.reinforcements[turn]
export interface Reinforcement
{
	row: number;
	col: number;
	unit: Unit;
	turn: number; //after a copy the turn key string of the copied scenario
	id: number;   //1 based position in its turn list when added
}

export interface Scenario
{
	name: string;
	maxTurns: number;
	date: Date;
	atmosferic: number;
	latitude: number;
	ground: number;
	turnsPerDay: number;
	dayTurn: number;
	reinforcements: { [turn: string]: Reinforcement[] };
	map: GameMap;
	file: string;
	expPerSide: { exp: number; count: number }[];
	unitsCostPerSide: number[];
	isLoaded: boolean;
	eqp: string;
	load(onFinished: () => void): void;
	onLoadFinished(): void;
	addReinforcement(turn: number, row: number, col: number, unit: Unit): void;
	getReinforcements(turn: number, playerId: number): Reinforcement[];
	removeReinforcement(turn: number, id: number): boolean;
	checkDefeat(lastSide: number, localPlayingSide: number): boolean;
	checkVictory(): ScenarioOutcome;
	getDescription(): string;
	setDescription(str: string): void;
	endTurn(): void;
	setMoveTable(): void;
	getPrototypeUnitsAvailable(country: number): number[];
	getRandomPrototype(country: number): number;
	getBalancedPrestige(side: number): number;
	getSideUnitsAvgExp(side: number): number;
	showStatistics(): void;
	copy(s: Scenario): void;
}

Scenario.loader = new (ScenarioLoader as unknown as ScenarioLoaderConstructor)();
Scenario.scenarioPath = "resources/scenarios/data/";

//Lookup information about scenario in scenariolist, returns the scenariolist entry or null
Scenario.getScenarioDataByFileName = function(scenFile: string): ScenarioListEntry
{
	for (var i = 0; i < scenariolist.length; i++)
		if (scenariolist[i][0] == scenFile)
			return scenariolist[i];
	return null;
}

export function Scenario(this: Scenario, scenFile?: string)
{
	this.name = "";
	this.maxTurns = 0;
	this.date = new Date();
	this.atmosferic = 0;
	this.latitude = 0;
	this.ground = 0;
	this.turnsPerDay = 1;  //how many turns to increase day
	this.dayTurn = 0;      //the turn in current day
	this.reinforcements = {}; //units deployed later, keyed by turn
	this.map = new GameMap();
	this.file = scenFile;
	this.expPerSide = [{exp: 0, count: 0}, {exp: 0, count: 0}]; //total experience and unit count per side
	this.unitsCostPerSide = [0, 0]; //total cost of the units of each side
	this.isLoaded = false;
	this.eqp = "eqp-adlerkorps"; //equipment set used by the scenario

	var description = "";
	var loadCallback: () => void = null;

	if (typeof scenFile !== "undefined")
	{
		var scenData = Scenario.getScenarioDataByFileName(scenFile);
		if (scenData)
		{
			this.name = scenData[1];
			description = scenData[2];
		}
	}

	//Loads scenario data files, calls onFinished when done (through onLoadFinished)
	this.load = function(onFinished: () => void)
	{
		loadCallback = onFinished;
		Scenario.loader.loadScenario(this);
	}

	//Called by the loader when the scenario finished loading (or failed to load)
	this.onLoadFinished = function()
	{
		if (this.isLoaded)
		{
			this.setMoveTable();

			//Initial score of each player: objectives worth per turn and the units it has
			var map = this.map;
			var scores: { [playerId: string]: number } = {};
			var players = map.getPlayers();
			var i;
			for (i = 0; i < players.length; i++)
				scores[players[i].id] = ((map.sidesVictoryHexes[players[i].side].length *
					scoreGains.objectivePerTurn) / map.maxTurns) >> 0;

			var units = map.getUnits();
			for (i = 0; i < units.length; i++)
				scores[units[i].player.id] += units[i].isCore ? scoreGains.coreUnit : scoreGains.normalUnit;

			for (i = 0; i < players.length; i++)
				players[i].updateScore(scores[players[i].id]);
		}
		if (loadCallback)
			loadCallback();
	}

	this.addReinforcement = function(turn: number, row: number, col: number, unit: Unit)
	{
		if (this.reinforcements[turn] === null || typeof this.reinforcements[turn] === "undefined")
			this.reinforcements[turn] = [];

		this.reinforcements[turn].push({row: row, col: col, unit: unit, turn: turn,
			id: this.reinforcements[turn].length + 1});
	}

	//Returns the reinforcements of a player up to and including turn
	this.getReinforcements = function(turn: number, playerId: number)
	{
		var list: Reinforcement[] = [];
		for (var t in this.reinforcements)
		{
			if ((t as unknown as number) > turn) continue; //compares the turn key string as a number
			if (this.reinforcements[t] === null || typeof this.reinforcements[t] === "undefined")
				continue;
			for (var i = 0; i < this.reinforcements[t].length; i++)
				if (this.reinforcements[t][i].unit.owner == playerId)
					list.push(this.reinforcements[t][i]);
		}
		return list;
	}

	this.removeReinforcement = function(turn: number, id: number)
	{
		if (this.reinforcements[turn] === null || typeof this.reinforcements[turn] === "undefined")
			return false;

		for (var i = 0; i < this.reinforcements[turn].length; i++)
		{
			if (this.reinforcements[turn][i].id == id)
			{
				this.reinforcements[turn].splice(i, 1);
				return true;
			}
		}
		return false;
	}

	//Checks if local human player (not net/ai) has reached the map turn limit
	this.checkDefeat = function(lastSide: number, localPlayingSide: number)
	{
		if (this.map.turn >= this.map.maxTurns && (lastSide == localPlayingSide || localPlayingSide == 2))
		{
			if (hasSidePlayedTurn(this.map.getPlayers(), lastSide, this.map.maxTurns))
				return true;
		}
		return false;
	}

	this.checkVictory = function(): ScenarioOutcome
	{
		if (this.map.turn <= this.map.victoryTurns[0])
			return "briliant";
		if (this.map.turn <= this.map.victoryTurns[1])
			return "victory";
		if (this.map.turn <= this.map.victoryTurns[2])
			return "tactical";

		return "lose"; //shouldn't happen as checkDefeat checks each turn
	}

	this.getDescription = function() { return description; }
	this.setDescription = function(str: string) { description = str; }

	this.endTurn = function()
	{
		//increase the scenario date
		this.dayTurn++;
		if (this.dayTurn >= this.turnsPerDay)
		{
			this.dayTurn = 0;
			this.date.setDate(this.date.getDate() + 1); //increase 1 day
		}

		//end map turn
		this.map.endTurn();
	}

	//Sets the movement cost table for the scenario
	this.setMoveTable = function()
	{
		switch (this.ground)
		{
			case groundCondition.dry:
				setMovTable(movTableDry);
				break;
			case groundCondition.frozen:
				setMovTable(movTableFrozen);
				break;
			case groundCondition.mud:
				setMovTable(movTableMud);
				break;
			default:
				setMovTable(movTableDry);
		}
	}

	//Returns the equipment ids of a country that can be awarded as prototypes:
	//units that appear next year, only combat ground and air classes and not too cheap
	this.getPrototypeUnitsAvailable = function(country: number)
	{
		var year = this.date.getFullYear() + 1;
		var list = Equipment.getCountryEquipmentByYearRange(year, year, country);
		for (var i = 0; i < list.length; i++)
		{
			var ud = Equipment.equipment[list[i]];
			var uclass = ud.uclass;
			if (((uclass < unitClass.tank || uclass > unitClass.antiTank)
				&& (uclass < unitClass.artillery || uclass > unitClass.tacticalBomber))
				|| ud.cost * CURRENCY_MULTIPLIER < PROTOTYPE_MIN_COST)
			{
				list.splice(i, 1);
				i--;
			}
		}
		return list;
	}

	this.getRandomPrototype = function(country: number)
	{
		var list = this.getPrototypeUnitsAvailable(country);
		var index = (Math.random() * list.length) >> 0;
		return list[index];
	}

	//Start prestige for scenarios outside a campaign: the side with cheaper units gets the difference
	this.getBalancedPrestige = function(side: number)
	{
		var prestige = SCENARIO_START_PRESTIGE + this.unitsCostPerSide[+!side] - this.unitsCostPerSide[side];
		if (prestige < SCENARIO_START_PRESTIGE)
			prestige = SCENARIO_START_PRESTIGE;
		return prestige;
	}

	this.getSideUnitsAvgExp = function(side: number)
	{
		return Math.round(this.expPerSide[side].exp / +this.expPerSide[side].count || 0);
	}

	this.showStatistics = function() {};

	//Copy constructor
	this.copy = function(s: Scenario)
	{
		//name already set in constructor
		this.maxTurns = s.maxTurns;
		this.date = new Date(s.date);
		this.atmosferic = s.atmosferic;
		this.latitude = s.latitude;
		this.ground = s.ground;
		this.turnsPerDay = s.turnsPerDay;
		this.eqp = s.eqp;
		if (s.reinforcements)
		{
			//t is an implicit global in the bundle, kept as is
			for (t in s.reinforcements)
			{
				for (var i = 0; i < s.reinforcements[t].length; i++)
				{
					var unit = new Unit(s.reinforcements[t][i].unit.eqid);
					unit.copy(s.reinforcements[t][i].unit);
					this.addReinforcement(t, s.reinforcements[t][i].row, s.reinforcements[t][i].col, unit);
				}
			}
		}
		this.map.copy(s.map);
		this.file = s.file;
		this.setMoveTable();
	}

	//Private methods
	//Check if all players from a side have played certain turn
	//(inlined by the compiler in the bundle)
	function hasSidePlayedTurn(playerList: Player[], side: number, turn: number)
	{
		for (var i = 0; i < playerList.length; i++)
		{
			if (playerList[i].side == side && playerList[i].playedTurn < turn)
				return false;
		}
		return true;
	}
}
