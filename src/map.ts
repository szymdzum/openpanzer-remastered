/**
 * Map - Provides map, player and hex objects
 *
 * http://www.linuxconsulting.ro
 * http://openpanzer.net
 *
 * Copyright (c) 2012 Nicu Pavel
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 *
 * Reconstructed from the Panzer Marshal 3.2.14 bundle, names and comments
 * carried over from the openpanzer 2.9 source where the code matches.
 */

import {
	Cell, type combatResults, difficultyModifiers, type extendedCell, leaderType, movementResults,
	outcomeNames, OVERSTRENGTH_PENALTY, playerType, prestigeGains, roadType, scoreGains, sideNames,
	type Supply, terrainType, uiSettings, unitClass
} from "./prototypes";
import { CombatLog } from "./combatlog";
import { Equipment } from "./equipment";
import { defined } from "./util";
import type { AI } from "./ai";
import type { AIScripted } from "./aiscripted";
import { GameRules } from "./gamerules";
import { Unit } from "./unit";
import { engineContext } from "./context";
import { Leaders } from "./leaders";
import { HexCounters, MapVisibility } from "./visibility";
import { MapBoard } from "./board";
import { MapSelection } from "./selection";

//Hex, Player and Map classes

//Campaign stats of a player, unit counts by unit class and scenario names by outcome
export interface PlayerDossier
{
	units?: {
		lostaux?: { [uclass: number]: number };
		lostcore?: { [uclass: number]: number };
		killed?: { [uclass: number]: number };
	};
	outcomes?: { [outcome: string]: string[] }; //outcomeNames keys
}

//Player Object Constructor
export class Player
{
	declare id: number;
	declare side: number;
	declare country: number;
	declare prestige: number;
	declare score: number;
	declare dossier: PlayerDossier;
	declare playedTurn: number;
	declare type: number; //playerType
	declare handler: AI | AIScripted;
	declare airTransports: number;
	declare navalTransports: number;
	declare supportCountries: number[];
	declare prestigePerTurn: number[];

	declare getCoreUnitList: () => Unit[];
	declare addCoreUnit: (unit: Unit) => boolean;
	declare removeUndeployedCoreUnit: (index: number) => void;
	declare setCoreUnitList: (list: Unit[]) => boolean;

	constructor()
	{
	this.id = -1;
	this.side = -1;
	this.country = -1;
	this.prestige = 0;
	this.score = 0;
	this.dossier = {}; //Campaign stats: units lost/killed by class and scenario outcomes
	this.playedTurn = -1;
	this.type = playerType.humanLocal;
	this.handler = null;

	//One time use transports available for this players
	this.airTransports = 0;
	this.navalTransports = 0;

	this.supportCountries = [];
	this.prestigePerTurn = [];

	//Privileged Methods that access private properties/methods
	this.getCoreUnitList = function() { return coreUnitList; }
	this.addCoreUnit = function(unit)
	{
		if (!unit || typeof unit === "undefined")
			return false;
		unit.isCore = true;
		coreUnitList.push(unit);
		return true;
	}
	this.removeUndeployedCoreUnit = function(index)
	{
		coreUnitList.splice(index, 1);
	}
	this.setCoreUnitList = function(list)
	{
		var i;
		if (!list || list.length == 0)
			return false;
		coreUnitList = [];
		for (i = 0; i < list.length; i++)
			coreUnitList.push(list[i]);
		return true;
	}

	//Private property
	var coreUnitList: Unit[] = []; //Core units obtained during campaign or bought by player
	}
}
//Player Object Public Methods, assigned to the prototype so they stay enumerable
export interface Player
{
	copy(p: Player, addScore?: boolean): void;
	initDossier(): void;
	copyDossier(p: Player): void;
	getCountryName(): string;
	getSideName(): string;
	hasUndeployedUnits(): boolean;
	buyUnit(unitid: number, transportid?: number): boolean;
	acquireUnit(unitid: number, transportid?: number): boolean;
	upgradeUnit(unit: Unit, upgradeid: number, transportid: number): boolean;
	sellUnit(unit: Unit): boolean;
	resupplyUnit(unit: Unit, supply: Supply): void;
	reinforceUnit(unit: Unit, strength: number, overstrength: boolean): number;
	updateScore(gain: number, count?: number): void;
	addDestroyedUnitToDossier(unit: Unit): void;
	addOutcomeToDossier(outcome: string, scenarioName: string): void;
	endTurn(turn: number): void;
	setPlayerToHQ(): void;
	cleanup(): void;
}
//Player Object Public Methods
//addScore: only add the score of p to this player, used to carry the campaign player
//between scenarios
Player.prototype.copy = function(p: Player, addScore?: boolean)
{
	var i;

	if (p === null) return;
	if (!defined(addScore)) addScore = false;
	this.id = p.id;
	this.side = p.side;
	this.country = p.country;
	this.prestige = p.prestige;
	this.playedTurn = p.playedTurn;
	this.type = p.type;

	if (addScore)
	{
		this.score += p.score;
	}
	else
	{
		this.score = p.score;
		this.airTransports = p.airTransports;
		this.navalTransports = p.navalTransports;

		if (p.supportCountries)
			for (i = 0; i < p.supportCountries.length; i++)
				this.supportCountries.push(p.supportCountries[i]);

		if (p.prestigePerTurn)
			for (i = 0; i < p.prestigePerTurn.length; i++)
				this.prestigePerTurn.push(p.prestigePerTurn[i]);
	}

	if (typeof p.getCoreUnitList === "function") { this.setCoreUnitList(p.getCoreUnitList()); }

	if (p.hasOwnProperty("dossier") && p.dossier.hasOwnProperty("units"))
		this.copyDossier(p);
}

Player.prototype.initDossier = function()
{
	this.dossier.units = {};
	this.dossier.units.lostaux = {};
	this.dossier.units.lostcore = {};
	this.dossier.units.killed = {};

	for (var c in unitClass)
	{
		var uclass = unitClass[c as keyof typeof unitClass];
		this.dossier.units.lostaux[uclass] = 0;
		this.dossier.units.lostcore[uclass] = 0;
		this.dossier.units.killed[uclass] = 0;
	}

	this.dossier.outcomes = {};
	for (var o in outcomeNames)
		this.dossier.outcomes[o] = [];
}

Player.prototype.copyDossier = function(p)
{
	this.initDossier();

	for (var c in unitClass)
	{
		var uclass = unitClass[c as keyof typeof unitClass];
		this.dossier.units.lostaux[uclass] = p.dossier.units.lostaux[uclass];
		this.dossier.units.lostcore[uclass] = p.dossier.units.lostcore[uclass];
		this.dossier.units.killed[uclass] = p.dossier.units.killed[uclass];
	}

	for (var o in outcomeNames)
		for (var i = 0; i < p.dossier.outcomes[o].length; i++)
			this.dossier.outcomes[o].push(p.dossier.outcomes[o][i]);
}

Player.prototype.getCountryName = function() { return Equipment.getCountryName(this.country); }
Player.prototype.getSideName = function() { return sideNames[this.side]; }

//Get the undeployed units from core unit list
Player.prototype.hasUndeployedUnits = function()
{
	var i;
	var cList = this.getCoreUnitList();
	for (i = 0; i < cList.length; i++)
		if (!cList[i].isDeployed)
			return true;

	return false;
}

Player.prototype.buyUnit = function(unitid, transportid)
{
	var cost = GameRules.calculateUnitCosts(unitid, transportid);

	if (cost > this.prestige) return false;

	if (this.acquireUnit(unitid, transportid))
		this.prestige -= cost;

	return true;
}

//Adds a new unit to the core unit list without paying for it
Player.prototype.acquireUnit = function(unitid, transportid)
{
	var u = new Unit(unitid);

	if (transportid > 0 && typeof transportid !== "undefined")
		u.setTransport(transportid);

	u.owner = this.id;
	u.flag = this.country * 1 + 1 ; //TODO fix this
	u.player = this;

	//Outside campaigns new units get the average experience of the enemy side (side is 0 or 1)
	if (engineContext.campaign() === null)
		u.experience = +engineContext.scenario().getSideUnitsAvgExp(+!this.side);

	this.addCoreUnit(u);

	return true;
}

Player.prototype.upgradeUnit = function(unit, upgradeid, transportid)
{
	var cost = GameRules.calculateUpgradeCosts(unit, upgradeid, transportid);

	if (cost > this.prestige)
		return false;
	if (!unit.upgrade(upgradeid, transportid))
		return false;

	this.prestige -= cost;

	return true;
}

Player.prototype.sellUnit = function(unit)
{
	if (!defined(unit))
		return false;

	var gain = GameRules.calculateUnitSellCost(unit);
	this.prestige += gain;

	return true;
}

Player.prototype.resupplyUnit = function(unit, supply)
{
	this.updateScore(scoreGains.resupply);
	unit.resupply(supply); //Supply doesn't cost prestige
}

//Returns the strength added, 0 if the player can't afford any
Player.prototype.reinforceUnit = function(unit, strength, overstrength)
{
	var penalty = 1;
	if (overstrength)
		penalty = OVERSTRENGTH_PENALTY;

	var costPerStrength = Math.round(GameRules.calculateUnitCostPerStrength(unit) * penalty);
	var maxStrength = (this.prestige / costPerStrength) >> 0;

	if (maxStrength < 1)
		return 0;
	if (maxStrength > strength)
		maxStrength = strength;
	this.prestige -= maxStrength * costPerStrength;
	//The score counts the requested strength, not the strength the player could afford
	this.updateScore(scoreGains.reinforce, strength);
	unit.reinforce(maxStrength, overstrength);

	return maxStrength;
}

//Adds gain * count to the score, scaled by the campaign difficulty
Player.prototype.updateScore = function(gain, count)
{
	if (count == null || typeof count === "undefined")
		count = 1;

	var coef = 1;
	if (engineContext.campaign() !== null)
		coef = difficultyModifiers[engineContext.campaign().difficulty].scoreCoef;

	this.score += (gain * count * coef) >> 0;
}

Player.prototype.addDestroyedUnitToDossier = function(unit)
{
	if (!this.dossier.hasOwnProperty("units"))
		this.initDossier();

	var uclass = unit.unitData(true).uclass;

	if (this.id === unit.player.id)
	{
		if (unit.isCore)
			this.dossier.units.lostcore[uclass]++;
		else
			this.dossier.units.lostaux[uclass]++;
	}
	else
	{
		this.dossier.units.killed[uclass]++;
	}
}

Player.prototype.addOutcomeToDossier = function(outcome, scenarioName)
{
	if (!this.dossier.hasOwnProperty("outcomes"))
		this.initDossier();

	this.dossier.outcomes[outcome].push(scenarioName);
}

Player.prototype.endTurn = function(turn)
{
	this.playedTurn = turn;

	//turn starts from 1, array index from 0. turn 1 or 0 array index will be applied when scen is loaded/game
	//is started, turn 2 prestige will get added at the end of turn 1
	if (turn < this.prestigePerTurn.length)
		this.prestige += this.prestigePerTurn[turn];

	this.updateScore(scoreGains.endTurn);
}

//Reset player properties from previous scenario and resets/reinforce/resupply it's core unit status
Player.prototype.setPlayerToHQ = function()
{
	var i, u;

	this.supportCountries = [];
	this.prestigePerTurn = [];
	this.airTransports = 0;
	this.navalTransports = 0;

	var cList = this.getCoreUnitList();
	for (i = 0; i < cList.length; i++)
	{
		u = cList[i];
		if (u.destroyed) //remove if destroyed
		{
			cList[i] = null;
			cList.splice(i, 1);
			i--;
			continue;
		}

		//TODO move this in Unit object in a setDefaults
		u.unmount();
		u.carrier = 0;
		u.hasMoved = u.hasFired = u.hasResupplied = false;
		u.isDeployed = false; //Send unit to HQ, undeploy from map
		if (u.strength < 10) //Overstrength units keep their strength
			u.strength = 10;
		u.refillAmmoFuel();
		u.moveLeft = u.unitData().movpoints;
		u.entrenchment = 0;
		u.hits = 0;
		u.setHex(null); //also does isDeployed = false
	}
}

Player.prototype.cleanup = function()
{
	//TODO check savedPlayer in campaign mode
}

//Hex Object Constructor
export class Hex
{
	declare unit: Unit;
	declare airunit: Unit;
	declare terrain: number; //terrainType
	declare road: number; //roadType bit mask
	declare owner: number;
	declare flag: number;
	declare isDeployment: number;
	declare victorySide: number;
	declare name: string;
	declare isMoveSel: boolean;
	declare isAttackSel: boolean;

	declare isZOC: (side: number) => boolean;
	declare isSpotted: (side: number) => boolean;
	declare setZOC: (side: number, on: boolean) => void;
	declare setSpotted: (side: number, on: boolean) => void;
	declare getPos: () => Cell;

	//counters: the hex's spotting and zone of control counters, from the map's MapVisibility
	constructor(row: number, col: number, counters?: HexCounters)
	{
	//Public Properties
	this.unit = null; //pointer to the ground unit on this hex
	this.airunit = null; //pointer to the air unit on this hex
	this.terrain = terrainType.Clear;
	this.road = roadType.none;
	this.owner = -1;
	this.flag = -1;
	this.isDeployment = -1; //deployment hex for played id
	this.victorySide = -1; //hex is a victory point for side [0,1]
	this.name = "";
	this.isMoveSel = false; //current unit can move to this hex
	this.isAttackSel = false; //current unit can attack this hex

	//TODO ZOC need to keep a list of units to be able to check if a unit that has that
	//ZOC is spotted. This will allow movement on ZOC generated by units that aren't yet spotted.
	//Privileged Methods that access private properties/methods
	this.isZOC = function(side) { return MapVisibility.isSet(hexCounters.zoc, side); }
	this.isSpotted = function(side)
	{
		if (uiSettings.noFOW) //Fog of war off, everything is spotted
			return true;
		return MapVisibility.isSet(hexCounters.spot, side);
	}
	this.setZOC = function(side, on) { MapVisibility.set(hexCounters.zoc, side, on); }
	this.setSpotted = function(side, on) { MapVisibility.set(hexCounters.spot, side, on); }
	this.getPos = function() { return new Cell(1 * row, 1 * col); }

	//Private Properties
	var hexCounters = counters || new HexCounters(); //zone of control and spotting by side
	}
}

//Hex Object Public Methods, assigned to the prototype: gamestate does for-in over a Hex
export interface Hex
{
	copy(hex: Hex): void;
	getUnit(airMode?: boolean | number): Unit; //gamerules passes 0 and 1
	setUnit(unit: Unit): void;
	delUnit(unit: Unit): void;
	getAttackableUnit(atkunit: Unit, airMode: boolean | number): Unit;
	cleanup(): void;
}
//Clone Hex object
Hex.prototype.copy = function(hex)
{
	if (hex === null) return;

	this.terrain = hex.terrain;
	this.road = hex.road;
	this.owner = hex.owner;
	this.flag = hex.flag;
	this.isDeployment = hex.isDeployment;
	this.victorySide = hex.victorySide;
	this.name = hex.name;
	//Set units and their correct links to the new object
	this.setUnit(hex.unit);
	this.setUnit(hex.airunit);
}

//Returns air or ground unit on a hex depending on UI airMode
Hex.prototype.getUnit = function(airMode?: boolean | number)
{
	if (this.unit !== null && this.airunit !== null)
	{
		if (airMode)
			return this.airunit;
		else
			return this.unit;
	}
	if (this.unit !== null)
		return this.unit;

	if (this.airunit !== null)
		return this.airunit;

	return null;
}

Hex.prototype.setUnit = function(unit)
{
	//Will return if unit object is just a copy.
	if (unit === null || typeof unit.setHex !== "function")
		return;
	unit.setHex(this); //back linking
	if (GameRules.isAir(unit))
		this.airunit = unit;
	else
		this.unit = unit;
}

Hex.prototype.delUnit = function(unit)
{
	if (unit === null || typeof unit.setHex !== "function")
		return;

	unit.setHex(null);
	//Need to remove by id instead of isAir(unit) since in case of carriers with paratroopers
	//unit type is changing from air to ground.
	if (this.unit !== null && this.unit.id == unit.id)
		this.unit = null;

	if (this.airunit !== null && this.airunit.id == unit.id)
		this.airunit = null;
}

//Returns the unit from this hex that can be attacked by atkunit
Hex.prototype.getAttackableUnit = function(atkunit, airMode)
{
	var isSpotted = this.isSpotted(atkunit.player.side);
	var checkedId = -1;
	var u = this.getUnit(airMode);

	if (u)
	{
		if ((isSpotted || u.tempSpotted) && GameRules.canInitiateAttack(atkunit, u))
			return u;
		checkedId = u.id;
	}

	u = this.getUnit(!airMode);

	//With a single unit on the hex getUnit() returns it for both modes, don't check it twice
	if (u && u.id !== checkedId && (isSpotted || u.tempSpotted) && GameRules.canInitiateAttack(atkunit, u))
		return u;

	return null;
}

//frees memory asociated with this object if possible
Hex.prototype.cleanup = function()
{
	if (this.unit)
	{
		this.unit.cleanup();
		delete(this.unit);
		this.unit = null;
	}

	if (this.airunit)
	{
		this.airunit.cleanup();
		delete(this.airunit);
		this.airunit = null;
	}
}

//What GameMap.reinforceUnit returns
export interface ReinforceResults { strength: number; ammo: number; fuel: number }
//What GameMap.captureHex returns
export interface CaptureResults { isWin: boolean; isCapture: boolean }
//Unit icons by eqid, for preloading
export interface UnitImagesList { [eqid: number]: string }
//The last move of a unit, saved for undo
export interface MapLastMove
{
	unit: Unit;
	savedUnit: Unit;
	oldOwner: number;
	oldFlag: number;
	oldVictorySide: number;
	prestigeGain: number;
	scoreGain: number;
	clear(): void;
}

//Map Object Constructor
export class GameMap //Map in the original, renamed: it replaced the built-in Map
{
	declare rows: number;
	declare cols: number;
	declare isLastRowPartial: boolean;
	declare isLastColPartial: boolean;
	declare map: Hex[][];
	declare terrainImage: string;
	declare victoryTurns: number[];
	declare maxTurns: number;
	declare turn: number;
	declare currentUnit: Unit;
	declare sidesVictoryHexes: Cell[][];
	declare currentPlayer: Player;
	declare name: string; //only set by copy()

	declare allocMap: () => void;
	declare addUnit: (unit: Unit) => void;
	declare getUnits: () => Unit[];
	declare getUnitById: (id: number) => Unit;
	declare getUnitImagesList: () => UnitImagesList;
	declare hasAliveUnits: (side: number) => boolean;
	declare removeAllSideUnits: (side: number) => void;
	declare getPlayers: () => Player[];
	declare addPlayer: (player: Player) => void;
	declare getPlayer: (id: number) => Player;
	declare getPlayersByCountry: (country: number) => Player[];
	declare getCountriesBySide: (side: number) => number[];
	declare setCurrentUnit: (unit: Unit) => void;
	declare delCurrentUnit: () => void;
	declare getUnitNeighbor: (unit: Unit, direction: number, onlyNotMoved: boolean) => Unit;
	declare delMoveSel: () => void;
	declare delAttackSel: () => void;
	declare setHex: (row: number, col: number, hex?: Hex) => void;
	declare updateVictorySides: (side: number, cell: Cell) => boolean;
	declare setMoveRange: (unit: Unit) => void;
	declare getCurrentMoveRange: () => Cell[];
	declare setAttackRange: (unit: Unit) => void;
	declare endTurn: () => void;
	declare attackUnit: (atkunit: Unit, defunit: Unit, supportFire: boolean, isOverrun?: boolean) => combatResults;
	declare updateUnitList: () => void;
	declare moveUnit: (unit: Unit, drow: number, dcol: number, cells?: Cell[]) => movementResults;
	declare retreatUnit: (unit: Unit, cell: Cell) => movementResults;
	declare resupplyUnit: (unit: Unit) => Supply;
	declare reinforceUnit: (unit: Unit, overstrength: boolean) => ReinforceResults;
	declare mountUnit: (unit: Unit) => void;
	declare mountUnitHandler: (unit: Unit) => void;
	declare unmountUnit: (unit: Unit) => void;
	declare unmountUnitHandler: (unit: Unit) => void;
	declare embarkUnit: (unit: Unit) => boolean;
	declare disembarkUnit: (unit: Unit) => boolean;
	declare upgradeUnit: (id: number, upgradeid: number, transportid: number) => boolean;
	declare disbandUnit: (id: number) => boolean;
	declare deployPlayerUnit: (player: Player, deployid: number, row: number, col: number) => boolean;
	declare deployNewUnitByEqId: (eqid: number, row: number, col: number, owner: number) => void;
	declare deployReinforcement: (unit: Unit, row: number, col: number) => Cell;
	declare selectUnit: (unit: Unit) => boolean;
	declare buildCoreUnitList: (player: Player) => void;
	declare restoreCoreUnitList: (player: Player, coreUnits: Unit[]) => void;
	declare removeNonCampaignUnits: (player: Player) => void;
	declare canUndoMove: (unit: Unit) => boolean;
	declare undoLastMove: () => void;
	declare captureHex: (hex: Hex, unit: Unit) => CaptureResults;
	declare getDeployHexes: (side: number) => Cell[];
	declare copy: (m: GameMap) => void;
	declare cleanup: () => void;
	declare dumpMap: () => void;

	declare static onPlayerTurn: (map: GameMap, player: Player) => void;

	constructor()
	{
	this.rows = 0;
	this.cols = 0;
	this.isLastRowPartial = false; //last row/col hexes are only half drawn on the map image
	this.isLastColPartial = false;
	this.map = null;
	this.terrainImage = null;
	this.victoryTurns = []; //Turns limit for briliant, victory and tactical victory
	this.maxTurns = 1;
	this.turn = 1;
	this.currentUnit = null;
	this.sidesVictoryHexes = [[], []]; //Victory hexes for each side
	this.currentPlayer = null; //Which player is currently playing

	var playerList: Player[] = []; //players list
	var visibility = new MapVisibility(this); //the hexes' zone of control and spotting counters
	var board = new MapBoard(this, visibility); //the units: the list, their ids, placing and moving them
	var unitList = board.units; //internal list of units
	var unitImagesList = board.images; //a "hash" of unique unit images used for caching
	var selection = new MapSelection(this); //the selected unit (this.currentUnit), the hexes it can move to and attack

	this.allocMap = function()
	{
		this.map = new Array(this.rows);
		visibility.alloc(this.rows, this.cols);
		for(var i = 0; i < this.rows; i++)
		{
			this.map[i] = new Array(this.cols);
			for(var j = 0; j < this.cols; j++)
			{
				this.map[i][j] = new Hex(i, j, visibility.counters[i][j]);
			}
		}
	}

	//Adds a unit already on its hex to the map: a new id, its player, its zone of control and spotting
	this.addUnit = function(unit) { board.add(unit); }

	this.getUnits = function() { return unitList; }
	this.getUnitById = function(id)
	{
		if (id < 0 || typeof id === "undefined")
			return null;

		for (var i = 0; i < unitList.length; i++)
		{
			if (unitList[i] !== null && unitList[i].id == id)
				return unitList[i];
		}
		return null;
	}
	this.getUnitImagesList = function() { return unitImagesList; }

	this.hasAliveUnits = function(side)
	{
		for (var i = 0; i < unitList.length; i++)
			if (unitList[i].player.side == side && !unitList[i].destroyed)
				return true;
		return false;
	}

	this.removeAllSideUnits = function(side)
	{
		for (var i = 0; i < unitList.length; i++)
			if (unitList[i].player.side == side)
				unitList[i].destroyed = true;
		this.updateUnitList();
	}

	this.getPlayers = function() { return playerList; }

	this.addPlayer = function(player)
	{
		if (!player)
			return;

		playerList.push(player);
		if  (this.currentPlayer === null) this.currentPlayer = playerList[0];

		//Check if player has available transports to add their images to the preloading list
		if (player.airTransports > 0)
		{
			var id = Equipment.getCountryEquipmentByClass(unitClass.airTransport, player.country + 1)[0];
			if (id && typeof id !== "undefined")
				unitImagesList[id] = Equipment.equipment[id].icon;
		}

		if (player.navalTransports > 0)
		{
			id = Equipment.getCountryEquipmentByClass(unitClass.navalTransport, player.country + 1)[0];
			if (id && typeof id !== "undefined")
				unitImagesList[id] = Equipment.equipment[id].icon;
		}
	}

	this.getPlayer = function(id) //TODO/FIX: returns player @ index instead of checking the ID
	{
		if (id < playerList.length)
			return playerList[id];
		else
			return playerList[0];
	}

	this.getPlayersByCountry = function(country)
	{
		var c = [];
		var p = this.getPlayers();
		for (var i = 0; i < p.length; i++)
			if (p[i].country == country)
				c.push(p[i]);
		return c;
	}

	//returns and array of countries playing on a side including supporting countries for the side players
	this.getCountriesBySide = function(side)
	{
		var c = [];
		var p = this.getPlayers();
		for (var i = 0; i < p.length; i++)
		{
			if (p[i].side == side)
			{
				c.push(p[i].country); //add player country
				for (var j = 0; j < p[i].supportCountries.length; j++)
				{
					if (p[i].supportCountries[j] > 0)
						c.push(p[i].supportCountries[j] - 1) //add supporting country //TODO -1 fix indexes
				}
			}
		}
		return c;
	}

	this.setCurrentUnit = function(unit) { this.currentUnit = unit; }

	this.delCurrentUnit = function() { selection.clear(); }

	//Returns the next (direction > 0) or previous unit of the same owner in the unit list,
	//onlyNotMoved: also cycle thru units that haven't moved yet, otherwise unit is the only candidate
	this.getUnitNeighbor = function(unit, direction, onlyNotMoved)
	{
		var count = unitList.length;
		var id = unit.id;
		var owner = unit.owner;
		var list = [];
		var pos = -1;

		for (var i = 0; i < count; i++)
		{
			var u = unitList[i];
			if (u !== null && u.owner == owner)
			{
				if (u.id == id)
				{
					list.push(u);
					pos = list.length - 1;
				}
				else if (onlyNotMoved && !u.hasMoved)
				{
					list.push(u);
				}
			}
		}

		if (pos !== -1)
		{
			var prev = pos - 1;
			if (pos == 0)
				prev = list.length - 1;
			var next = (pos + 1) % list.length;
			if (direction > 0)
				return list[next];
			return list[prev];
		}
		return unit;
	}

	this.delMoveSel = function() { selection.clearMove(); }
	this.delAttackSel = function() { selection.clearAttack(); }

	this.setHex = function(row, col, hex)
	{
		if (hex && typeof hex !== "undefined")
			this.map[row][col].copy(hex); //copy values from the hex argument
		else
			hex = this.map[row][col]; //in-place

		//Add coords for each victory hex into list
		var victorySide = hex.victorySide;

		if (victorySide != -1)
		{
			//Check ownership. Some victory hexes for other side might be already captured (see salerno map)
			if (hex.owner != -1 && (victorySide == this.getPlayer(hex.owner).side))
				victorySide = ~ victorySide & 1; //Change to enemy side

			//Don't add the same hex twice
			var pos = hex.getPos();
			var found = false;
			for (var i = 0; i < this.sidesVictoryHexes[victorySide].length; i++)
			{
				var c = this.sidesVictoryHexes[victorySide][i];
				if (c.row == pos.row && c.col == pos.col)
				{
					found = true;
					break;
				}
			}
			if (!found)
				this.sidesVictoryHexes[victorySide].push(pos);
		}

		if (hex.unit !== null)
			this.addUnit(hex.unit);
		if (hex.airunit !== null)
			this.addUnit(hex.airunit);
	}

	//Add remove victory hexes from the lists
	this.updateVictorySides = function(side, cell)
	{
		var eV = this.sidesVictoryHexes[~side & 1];
		var sV = this.sidesVictoryHexes[side];
		var removed = 0;
		//Side has ocuppied a victory hex that was marked as victory for it
		for (var i = sV.length - 1; i >= 0; i--)
		{
			if (sV[i].row == cell.row && sV[i].col == cell.col)
			{
				sV.splice(i, 1);
				removed++;
			}
		}
		if (removed > 0)
			eV.push(cell);

		if (this.sidesVictoryHexes[side].length == 0)
			return true;
		return false;
	}

	this.setMoveRange = function(unit) { selection.setMoveRange(unit); }
	this.getCurrentMoveRange = function() { return selection.moveSelected; }
	this.setAttackRange = function(unit) { selection.setAttackRange(unit); }

	this.endTurn = function()
	{
		//TODO move to Game object where applicable
		this.delMoveSel();
		this.delAttackSel();
		this.delCurrentUnit();
		lastMove.clear();
		this.currentPlayer.endTurn(this.turn);
		var p = this.getPlayers();
		for (var i = 0; i < p.length; i++)
		{
			if (p[i].id == this.currentPlayer.id)
			{
				if ((i + 1) < p.length)
					this.currentPlayer = p[i + 1];
				else
					this.currentPlayer = p[0];
				break;
			}
		}
		if (this.currentPlayer.id == 0)
		{
			this.turn++;
			//Resets unit properties for a new turn
			for (i = 0; i < unitList.length; i++)
			{
				if (unitList[i] === null)
					continue;
				if (unitList[i].isMounted)
					this.unmountUnitHandler(unitList[i]);
				var s = GameRules.getResupplyValue(this.map, unitList[i], true);
				if (s.ammo > 0 || s.fuel > 0 || s.transportAmmo > 0 || s.transportFuel > 0)
				{
					unitList[i].resupply(s);
					CombatLog.addResupply(unitList[i]);
				}
				unitList[i].unitEndTurn();
			}
		}
		GameMap.onPlayerTurn(this, this.currentPlayer);
	}

	//atkunit from srow, scol attacks defunit from drow, dcol
	this.attackUnit = function(atkunit, defunit, supportFire, isOverrun)
	{
		if (atkunit === null || defunit === null)
			return null;

		isOverrun = typeof isOverrun !== "undefined" ? isOverrun : false;
		lastMove.unit = null; //Reset last move undo save
		var a = atkunit.getPos();
		var d = defunit.getPos();
		var cr = GameRules.calculateAttackResults(atkunit, defunit, false);
		//map here is the global (no such variable in this scope), not this map: the turn
		//logged is whatever window.map.turn holds. Kept from the bundle.
		var combatId = CombatLog.addCombatStart(atkunit, defunit, map.turn);

		//Units on their side bridges keep their facing
		if (!GameRules.isBridgeForSide(atkunit.getHex(), atkunit.player.side))
			atkunit.facing = GameRules.getDirection(a.row, a.col, d.row, d.col);
		if (!GameRules.isBridgeForSide(defunit.getHex(), defunit.player.side))
			defunit.facing = GameRules.getDirection(d.row, d.col, a.row, a.col);

		//Dismount infantry when attacked
		if (defunit.isMounted && !defunit.isSurprised && defunit.unitData(true).uclass == unitClass.infantry)
			this.unmountUnitHandler(defunit);

		//Overrun destroys the defender without return fire, attacker gets an extra move
		if (isOverrun)
		{
			cr.kills = defunit.strength;
			cr.isOverrun = true;
			cr.defcanfire = false;
			if (atkunit.moveLeft > 0)
				atkunit.hasMoved = false;
			atkunit.moveLeft += 1;
		}

		atkunit.experience = Math.round(atkunit.experience + +cr.atkExpGained);
		defunit.experience = Math.round(defunit.experience + +cr.defExpGained);

		if (supportFire || isOverrun) atkunit.fire(false);
		else atkunit.fire(true);

		defunit.hit(cr.kills);

		if (cr.defcanfire && !supportFire)
		{
			defunit.fire(false);
			atkunit.hit(cr.losses);
		}

		if (!supportFire)
			this.delAttackSel(); //delete attack selected hexes since unit has fired

		atkunit.player.updateScore(scoreGains.damage, cr.kills);
		atkunit.player.updateScore(atkunit.isCore ? scoreGains.casualtyCore : scoreGains.casualty, cr.losses);
		defunit.player.updateScore(scoreGains.damage, cr.losses);
		defunit.player.updateScore(defunit.isCore ? scoreGains.casualtyCore : scoreGains.casualty, cr.kills);

		var leader = Leaders.generateLeaderWithChance(atkunit, cr.atkExpGained);
		if (leader != -1)
		{
			atkunit.leader = leader;
			cr.atkLeaderGain = true;
			CombatLog.addLeader(atkunit);
		}
		leader = Leaders.generateLeaderWithChance(defunit, cr.defExpGained);
		if (leader != -1)
		{
			defunit.leader = leader;
			cr.defLeaderGain = true;
			CombatLog.addLeader(defunit);
		}

		CombatLog.addCombatEnd(atkunit, defunit, combatId, supportFire);

		return cr;
	}

	//TODO unit might still exist in player coreUnitList
	this.updateUnitList = function()
	{
		for (var i = 0; i < unitList.length; i++)
		{
			if (unitList[i].destroyed)
			{
				var pos = unitList[i].getPos();
				if (pos)
					board.remove(unitList[i], this.map[pos.row][pos.col]);
				//Count the loss in the campaign player dossier unless the unit was disbanded or removed
				if (engineContext.campaign() !== null)
				{
					if (!(defined(unitList[i].nodossier) && unitList[i].nodossier != false))
						engineContext.campaignPlayer().addDestroyedUnitToDossier(unitList[i]);
				}
				unitList.splice(i, 1);
				i--;
			}
			if (unitList[i] === null)
			{
				unitList.splice(i, 1);
				i--;
			}
		}
	}

	// moves a unit to a new hex returns a movementResults object
	// cells: the cells to find the path in (the move range the player was shown, the disembark hexes),
	// by default the unit's move range on the current state (GameRules.pathTo)
	this.moveUnit = function(unit, drow, dcol, cells)
	{
		var s = unit.getPos();
		var srcHex = this.map[s.row][s.col];
		var side = unit.player.side;
		var enemySide = ~side & 1;
		var mr = new movementResults();
		var canCapture = GameRules.canCapture(unit);
		var moveCost = 0;
		var c = cells !== undefined ? GameRules.getShortestPath(s, new Cell(drow, dcol), cells as extendedCell[])
			: GameRules.pathTo(this, unit, new Cell(drow, dcol));

		if (!c || !c[0])
			return mr;

		//Save unit properties for undoing move, only human players can undo
		if (unit.player.type == playerType.humanLocal)
		{
			lastMove.clear();
			lastMove.savedUnit = new Unit(unit.eqid);
			lastMove.savedUnit.copy(unit);
			lastMove.savedUnit.setHex(unit.getHex());
		}

		for (var i = 0; i < c.length; i++)
		{
			if (i > 0 && !GameRules.canPassInto(this.map, unit, c[i]))
			{
				//These leaders avoid being surprised
				if (!Leaders.unitHasLeader(unit, leaderType.battlefieldIntelligence)
					&& !Leaders.unitHasLeader(unit, leaderType.skilledAssault))
				{
					unit.isSurprised = true;
					mr.surpriseCell = c[i];
				}
				break;
			}
			//Movement is shown if the enemy can see it
			if (unit.player.type == playerType.humanLocal || unit.player.type == playerType.aiScripted
				|| this.map[c[i].row][c[i].col].isSpotted(enemySide))
			{
				mr.isVisible = true;
				c[i].isVisible = true;
			}
			mr.passedCells.push(c[i]);
			moveCost += c[i].cost;
		}

		var lastCell = mr.passedCells[mr.passedCells.length - 1];
		var dstHex = this.map[lastCell.row][lastCell.col];

		//Only certain units ending on their destination can capture objectives
		if (lastCell.row == drow && lastCell.col == dcol && canCapture)
		{
			var cr = this.captureHex(dstHex, unit);
			if (cr.isCapture)
				mr.isCapture = true;
			if (cr.isWin)
				mr.isVictorySide = side;
		}

		if (!moveCost || moveCost < 0) //NaN from disembark that doesn't do cell costs
			moveCost = 0;

		unit.move(moveCost);
		//Returns the enemy units spotted for the first time
		var newSpotted = board.relocate(unit, srcHex, dstHex, GameRules.getDirection(s.row, s.col, lastCell.row, lastCell.col));

		this.setMoveRange(unit); //if unit can still move put new range
		this.setAttackRange(unit) //Put new attack range

		//If the unit hasn't spotted new units or wasn't surprised allow undo
		if (newSpotted == 0 && !unit.isSurprised && unit.player.type == playerType.humanLocal)
			lastMove.unit = unit;
		else
			lastMove.clear();

		return mr;
	}

	//Moves a unit to cell after a lost combat without using its moves
	this.retreatUnit = function(unit, cell)
	{
		var oldCurrentUnit = this.currentUnit;
		selection.addMoveCell(cell, false); //Kept in the selection as before: the move's setMoveRange clears its flag
		var moveLeft = unit.moveLeft;
		var hasMoved = unit.hasMoved;
		var hasOverstrength = unit.hasOverstrength;
		//The retreat cell is adjacent: the path is the unit's hex and the cell, whatever else the selection held
		var mr = this.moveUnit(unit, cell.row, cell.col, [cell]);
		unit.moveLeft = moveLeft;
		unit.hasMoved = hasMoved;
		unit.hasOverstrength = hasOverstrength;
		if (oldCurrentUnit !== null)
			this.selectUnit(oldCurrentUnit);
		return mr;
	}

	this.resupplyUnit = function(unit)
	{
		lastMove.unit = null; //Reset last move undo save
		var s = GameRules.getResupplyValue(this.map, unit);
		unit.player.resupplyUnit(unit, s);
		this.delAttackSel();
		this.delMoveSel();
		return s;
	}

	this.reinforceUnit = function(unit, overstrength)
	{
		lastMove.unit = null; //Reset last move undo save
		var str = GameRules.getReinforceValue(this.map, unit, overstrength);
		var s = GameRules.getResupplyValue(this.map, unit);
		var p = unit.player;
		if ((str = p.reinforceUnit(unit, str, overstrength)) <= 0)
			return { strength: 0, ammo: 0, fuel: 0 };

		p.resupplyUnit(unit, s); //Reinforcing also resupplies
		this.delAttackSel();
		this.delMoveSel();
		return { strength: str, ammo: s.ammo, fuel: s.fuel };
	}

	this.mountUnit = function(unit)
	{
		this.mountUnitHandler(unit);
		this.delMoveSel();
		this.delAttackSel();
		this.selectUnit(unit); //Select the unit again to have the move range adjusted
	}

	//Mounting changes the spotting range
	this.mountUnitHandler = function(unit)
	{
		visibility.setSpotting(unit, false);
		unit.mount();
		visibility.setSpotting(unit, true);
	}

	this.unmountUnit = function(unit)
	{
		this.delMoveSel();
		this.delAttackSel();
		this.unmountUnitHandler(unit);
		this.selectUnit(unit); //Select the unit again to have the move range adjusted
	}

	this.unmountUnitHandler = function(unit)
	{
		visibility.setSpotting(unit, false);
		unit.unmount();
		visibility.setSpotting(unit, true);
	}

	this.embarkUnit = function(unit)
	{
		var embarked = false;
		if (unit.carrier < 0) //Back on the carrier it was disembarking from
		{
			unit.carrier = -unit.carrier;
			embarked = true;
		}
		else
		{
			var et = GameRules.getEmbarkType(this.map, unit);
			if (et > 0)
			{
				if (!unit.embark(et))
					return false;
				if (et == unitClass.airTransport)
					unit.player.airTransports--;
				else if (et == unitClass.navalTransport)
					unit.player.navalTransports--;
				embarked = true;
			}
		}
		if (embarked)
		{
			//Refresh selection for the new move/attack range
			this.delMoveSel();
			this.delAttackSel();
			this.selectUnit(unit);
		}
		return embarked;
	}

	this.disembarkUnit = function(unit)
	{
		var c = GameRules.getDisembarkPositions(this.map, unit);
		if (c.length <= 0)
			return false;

		this.delMoveSel();
		this.delAttackSel();
		for (var i = 0; i < c.length; i++)
			selection.addMoveCell(c[i], true);

		unit.toggleEmbark();

		return true;
	}

	this.upgradeUnit = function(id, upgradeid, transportid)
	{
		var unit = null;
		if ((unit = this.getUnitById(id)) == null)
			return false;
		if (!unit.player.upgradeUnit(unit, upgradeid, transportid))
			return false;
		lastMove.unit = null; //Reset last move undo save

		//Add the new unit icon
		unitImagesList[unit.eqid] = unit.getIcon();

		if (unit.transport !== null) //TODO change this.addUnit to handle upgrading
			unitImagesList[unit.transport.eqid] = unit.transport.icon;

		return true;
	}

	//Removes a deployed unit from the map and sells it
	this.disbandUnit = function(id)
	{
		var unit = null;
		if ((unit = this.getUnitById(id)) == null)
			return false;

		unit.destroyed = true;
		unit.nodossier = true; //Not a loss
		lastMove.unit = null; //Reset last move undo save
		unit.player.sellUnit(unit);
		this.delCurrentUnit();
		this.updateUnitList();
		return true;
	}

	this.deployPlayerUnit = function(player, deployid, row, col)
	{
		if (!player)
			return false;

		var cList = player.getCoreUnitList();

		if (deployid < 0 || deployid >= cList.length)
			return false;

		var u = cList[deployid];

		if (u === null || u.isDeployed)
			return false;

		var hex = this.map[row][col];
		var isAir = GameRules.isAir(u);

		if ((isAir && hex.airunit !== null) || (!isAir && hex.unit !== null))
			return false;

		//Ground units deployed on ocean hexes start embarked
		if (!isAir && hex.terrain == terrainType.Ocean)
			u.embark(unitClass.navalTransport);

		board.place(u, hex);

		return true;
	}

	this.deployNewUnitByEqId = function(eqid, row, col, owner)
	{
		var u = new Unit(eqid);
		u.owner = owner;
		board.place(u, this.map[row][col]);
	}

	//Places a reinforcement unit at row, col or a free hex around it, returns the cell used or null
	this.deployReinforcement = function(unit, row, col)
	{
		if (!unit)
			return null;

		var c = GameRules.getReinforcementDeployPositions(this.map, unit, row, col);
		if (c === null)
			return null;

		board.place(unit, this.map[c.row][c.col]);
		return c;
	}

	// selects a new unit as the current unit
	this.selectUnit = function(unit) { return selection.select(unit); }

	//Builds a list of core units for a player. Only in campaign mode and only for the first scenario
	//if the units are standing on a deployment hex.
	this.buildCoreUnitList = function(player)
	{
		var i;
		for (i = 0; i < unitList.length; i++)
		{
			if (unitList[i].player.id == player.id)
			{
				if (unitList[i].getHex().isDeployment == player.id)
					player.addCoreUnit(unitList[i]);
			}
		}
	}

	//Restore a core unit list from a localStorage load, coreUnits has unit properties but no methods
	this.restoreCoreUnitList = function(player, coreUnits)
	{
		var i, u;
		//First look for units already deployed on map hexes and link them to core units if they are core
		for (i = 0; i < unitList.length; i++)
		{
			if (unitList[i].isCore && unitList[i].isDeployed)
				player.addCoreUnit(unitList[i]);
		}

		for (i = 0; i < coreUnits.length; i++)
		{
			if (!coreUnits[i].isDeployed) //Undeployed units must be recreated
			{
				u = new Unit(coreUnits[i].eqid);
				u.copy(coreUnits[i]); //Copy properties
				player.addCoreUnit(u);
				//Units will be added to the map with this.deployPlayerUnit()
			}
		}
	}

	//Remove units standing on deployment hexes in campaign mode for scenarios loaded after first scenario
	this.removeNonCampaignUnits = function(player)
	{
		var i, h, update = false;
		for (i = 0; i < unitList.length; i++)
		{
			if (unitList[i].player.id == player.id && !unitList[i].isCore) //Guard agains calls with deployed core units
			{
				h = unitList[i].getHex();
				if (h && h.isDeployment == player.id)
				{
					h.delUnit(unitList[i]); //Off the hex, its zone of control and spotting stay (#72)
					unitList[i].destroyed = true;
					unitList[i].nodossier = true;
					update = true;
				}
			}
		}
		if (update)
			this.updateUnitList();
	}

	//Returns true if last movement of a unit can be undoed
	this.canUndoMove = function(unit)
	{
		if (lastMove.unit !== null && lastMove.unit.id == unit.id)
			return true;
		return false;
	}

	this.undoLastMove = function()
	{
		if (lastMove.unit == null)
			return;
		var unit = lastMove.unit;
		var sUnit = lastMove.savedUnit;
		var sCell = unit.getPos();
		var dCell = sUnit.getPos();
		var srcHex = this.map[sCell.row][sCell.col];
		var dstHex = this.map[dCell.row][dCell.col];

		unit.copy(sUnit); //restore unit properties to previous state
		board.relocate(unit, srcHex, dstHex);
		this.selectUnit(unit);

		var currentPlayer = this.getPlayer(unit.player.id);

		//Restore srcHex properties
		if (lastMove.oldOwner !== null)
			srcHex.owner = lastMove.oldOwner;
		if (lastMove.oldFlag !== null)
			srcHex.flag = lastMove.oldFlag;

		if (lastMove.oldVictorySide !== null)
		{
			//remove from taken objectives
			this.updateVictorySides(~currentPlayer.side & 1, srcHex.getPos());
			srcHex.victorySide = lastMove.oldVictorySide;
		}

		currentPlayer.prestige -= lastMove.prestigeGain; //Remove any prestige gains
		currentPlayer.updateScore(-lastMove.scoreGain);
		lastMove.clear(); //Reset last move undo save
	}

	//Captures a hex objective by unit, returns {isWin: capture results in a win for the player,
	//isCapture: a flag or an objective was captured}
	this.captureHex = function(hex, unit)
	{
		var result = { isWin: false, isCapture: false };
		var prestigeGain = 0;
		var gainMultiplier = 1;
		var scoreGain = 0;
		var hexSide = -1;
		var player = unit.player;

		if (hex.owner == -1 && hex.flag == -1) //Hex not owned by any player
			return result;

		if (hex.owner != -1)
			hexSide = this.getPlayer(hex.owner).side;
		if (hexSide == player.side)
			return result;

		lastMove.oldOwner = hex.owner;
		hex.owner = player.id;

		if (Leaders.unitHasLeader(unit, leaderType.liberator))
			gainMultiplier = 2;

		if (hex.flag != -1) //Secondary Objective
		{
			lastMove.oldFlag = hex.flag;
			hex.flag = player.country;

			if (hex.victorySide == -1) //Only if not a bigger objective
			{
				prestigeGain += prestigeGains.flagCapture * gainMultiplier;
				scoreGain += scoreGains.flagCapture;
				result.isCapture = true;
			}
		}

		if (hex.victorySide != -1) //Primary Objective
		{
			lastMove.oldVictorySide = hex.victorySide;
			hex.victorySide = ~player.side & 1; //set it as a victory objective for enemy side
			if (this.updateVictorySides(player.side, hex.getPos()))
				result.isWin = true;
			prestigeGain += prestigeGains.objectiveCapture * gainMultiplier;
			scoreGain += scoreGains.objectiveCapture;
			result.isCapture = true;
			CombatLog.addObjectiveCapture(hex.getPos(), player.side);
		}

		lastMove.prestigeGain = prestigeGain; //Save how much it earned
		lastMove.scoreGain = scoreGain;
		player.prestige += prestigeGain;
		player.updateScore(scoreGain);

		return result;
	}

	//Returns the cells of the deployment hexes of the players on side
	this.getDeployHexes = function(side)
	{
		var c = [];
		for (var i = 0; i < this.rows; i++)
		{
			for (var j = 0; j < this.cols; j++)
			{
				var deployId = this.map[i][j].isDeployment;
				if (deployId > -1 && this.getPlayer(deployId).side == side)
					c.push(this.map[i][j].getPos());
			}
		}
		return c;
	}

	//Clone object / "copy constructor"
	this.copy = function(m)
	{
		if (m === null) return;
		this.rows = m.rows;
		this.cols = m.cols;
		this.terrainImage = m.terrainImage;
		this.name = m.name;
		this.turn = m.turn;
		this.maxTurns = m.maxTurns;

		this.allocMap();

		for (var r = 0; r < m.rows; r++)
		{
			for (var c = 0; c < m.cols; c++)
			{
				var h = m.map[r][c];
				var hex = this.map[r][c];
				if (Object.keys(h).length !== 0) //Skip empty hexes
				{
					hex.copy(h);

					if (h.unit !== null)
					{
						var u = new Unit(h.unit.eqid);
						u.copy(h.unit);
						hex.setUnit(u);
					}
					if (h.airunit !== null)
					{
						u = new Unit(h.airunit.eqid);
						u.copy(h.airunit);
						hex.setUnit(u);
					}
				}
				this.setHex(r, c);
			}
		}
		//Update sideVictoryHexes with values from the in-progress game not
		//the default ones set by setHex()
		this.sidesVictoryHexes = [[],[]];
		for (var i = 0; i < m.sidesVictoryHexes[0].length; i++)
			this.sidesVictoryHexes[0].push(m.sidesVictoryHexes[0][i]);
		for (i = 0; i < m.sidesVictoryHexes[1].length; i++)
			this.sidesVictoryHexes[1].push(m.sidesVictoryHexes[1][i]);

		//Copy victoryTurns
		for (i = 0; i < m.victoryTurns.length; i++)
			this.victoryTurns.push(m.victoryTurns[i]);
	}

	//frees memory asociated with this object if possible
	this.cleanup = function()
	{
		for(var i = 0; i < this.rows; i++)
		{
			for(var j = 0; j < this.cols; j++)
			{
				this.map[i][j].cleanup();
				delete(this.map[i][j]);
			}
		}
		this.map = null;
	}

	//The player and victory hexes logging is stripped from the bundle, only the loop is left
	this.dumpMap = function()
	{
		for (var i = 0; i < playerList.length; i++)
			;
	}

	//Private

	//For saving changes made by last move of a unit
	var lastMove: MapLastMove =
	{
		unit: null, 		//Current unit properties
		savedUnit: null, 	//Old state unit properties (fuel, movesleft)
		oldOwner: null,		//If changed owner of the hex
		oldFlag: null,		//If changed a flag
		oldVictorySide: null, 	//If an objective was captured
		prestigeGain: 0,	//If player got any prestige
		scoreGain: 0,		//If player got any score
		clear: function()
			{
				this.unit = this.savedUnit = null;
				this.oldVictorySide = this.oldOwner = this.oldFlag = null;
				this.prestigeGain = this.scoreGain = 0;
			}
	};

	}
} // end GameMap class

//The turn driver: Map.endTurn calls it when the turn has passed to the next player, after a new
//turn's units were reset and before Game deploys that player's reinforcements. The default is what
//endTurn did itself: an AI or scripted player plans its whole turn here (#94: its reinforcements
//arrive after it planned). A headless game can drive the players its own way
GameMap.onPlayerTurn = function(map: GameMap, player: Player)
{
	if (player.type == playerType.aiLocal || player.type == playerType.aiScripted)
		player.handler.buildActions();
}
