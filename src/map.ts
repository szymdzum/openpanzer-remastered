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

import { Cell, outcomeNames, playerType, roadType, sideNames, terrainType, uiSettings, unitClass } from "./prototypes";
import { Equipment } from "./equipment";
import { defined } from "./util";
import type { AI } from "./ai";
import type { AIScripted } from "./aiscripted";
import { GameRules } from "./gamerules";
import { Unit } from "./unit";
import { HexCounters, MapVisibility } from "./visibility";
import { MapBoard } from "./board";
import { MapSelection } from "./selection";
import { UndoSlot } from "./undo";

//Hex, Player and Map classes

//Campaign stats of a player, unit counts by unit class and scenario names by outcome
export interface PlayerDossier {
	units?: {
		lostaux?: { [uclass: number]: number };
		lostcore?: { [uclass: number]: number };
		killed?: { [uclass: number]: number };
	};
	outcomes?: { [outcome: string]: string[] }; //outcomeNames keys
}

//Player Object Constructor
export class Player {
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

	constructor() {
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
	this.addCoreUnit = function(unit) {
		if (!unit || typeof unit === "undefined")
			return false;
		unit.isCore = true;
		coreUnitList.push(unit);
		return true;
	}
	this.removeUndeployedCoreUnit = function(index) {
		coreUnitList.splice(index, 1);
	}
	this.setCoreUnitList = function(list) {
		let i;
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
export interface Player {
	copy(p: Player, addScore?: boolean): void;
	initDossier(): void;
	addDestroyedUnitToDossier(unit: Unit): void;
	copyDossier(p: Player): void;
	getCountryName(): string;
	getSideName(): string;
	hasUndeployedUnits(): boolean;
	addOutcomeToDossier(outcome: string, scenarioName: string): void;
	cleanup(): void;
}
//Player Object Public Methods
//addScore: only add the score of p to this player, used to carry the campaign player
//between scenarios
Player.prototype.copy = function(p: Player, addScore?: boolean) {
	let i;

	if (p === null) return;
	if (!defined(addScore)) addScore = false;
	this.id = p.id;
	this.side = p.side;
	this.country = p.country;
	this.prestige = p.prestige;
	this.playedTurn = p.playedTurn;
	this.type = p.type;

	if (addScore) {
		this.score += p.score;
	} else {
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

Player.prototype.initDossier = function() {
	this.dossier.units = {};
	this.dossier.units.lostaux = {};
	this.dossier.units.lostcore = {};
	this.dossier.units.killed = {};

	for (const c in unitClass) {
		const uclass = unitClass[c as keyof typeof unitClass];
		this.dossier.units.lostaux[uclass] = 0;
		this.dossier.units.lostcore[uclass] = 0;
		this.dossier.units.killed[uclass] = 0;
	}

	this.dossier.outcomes = {};
	for (const o in outcomeNames)
		this.dossier.outcomes[o] = [];
}

Player.prototype.copyDossier = function(p) {
	this.initDossier();

	for (const c in unitClass) {
		const uclass = unitClass[c as keyof typeof unitClass];
		this.dossier.units.lostaux[uclass] = p.dossier.units.lostaux[uclass];
		this.dossier.units.lostcore[uclass] = p.dossier.units.lostcore[uclass];
		this.dossier.units.killed[uclass] = p.dossier.units.killed[uclass];
	}

	for (const o in outcomeNames)
		for (let i = 0; i < p.dossier.outcomes[o].length; i++)
			this.dossier.outcomes[o].push(p.dossier.outcomes[o][i]);
}

Player.prototype.getCountryName = function() { return Equipment.getCountryName(this.country); }
Player.prototype.getSideName = function() { return sideNames[this.side]; }

//Get the undeployed units from core unit list
Player.prototype.hasUndeployedUnits = function() {
	let i;
	const cList = this.getCoreUnitList();
	for (i = 0; i < cList.length; i++)
		if (!cList[i].isDeployed)
			return true;

	return false;
}

//Counts a unit lost (own: core or auxiliary) or killed in the dossier (the debug dossier shows it)
Player.prototype.addDestroyedUnitToDossier = function(unit) {
	if (!this.dossier.hasOwnProperty("units"))
		this.initDossier();

	const uclass = unit.unitData(true).uclass;

	if (this.id === unit.player.id) {
		if (unit.isCore)
			this.dossier.units.lostcore[uclass]++;
		else
			this.dossier.units.lostaux[uclass]++;
	} else {
		this.dossier.units.killed[uclass]++;
	}
}

Player.prototype.addOutcomeToDossier = function(outcome, scenarioName) {
	if (!this.dossier.hasOwnProperty("outcomes"))
		this.initDossier();

	this.dossier.outcomes[outcome].push(scenarioName);
}

Player.prototype.cleanup = function() {
	//TODO check savedPlayer in campaign mode
}

//Hex Object Constructor
export class Hex {
	declare unit: Unit;
	declare airunit: Unit;
	declare terrain: number; //terrainType
	declare road: number; //roadType bit mask
	declare owner: number;
	declare flag: number;
	declare isDeployment: number;
	declare victorySide: number;
	declare name: string;

	declare isZOC: (side: number) => boolean;
	declare isSpotted: (side: number) => boolean;
	declare setZOC: (side: number, on: boolean) => void;
	declare setSpotted: (side: number, on: boolean) => void;
	declare getPos: () => Cell;

	//counters: the hex's spotting and zone of control counters, from the map's MapVisibility
	constructor(row: number, col: number, counters?: HexCounters) {
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

	//TODO ZOC need to keep a list of units to be able to check if a unit that has that
	//ZOC is spotted. This will allow movement on ZOC generated by units that aren't yet spotted.
	//Privileged Methods that access private properties/methods
	this.isZOC = function(side) { return MapVisibility.isSet(hexCounters.zoc, side); }
	this.isSpotted = function(side) {
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
export interface Hex {
	getUnit(airMode?: boolean | number): Unit; //gamerules passes 0 and 1
	setUnit(unit: Unit): void;
	delUnit(unit: Unit): void;
	getAttackableUnit(atkunit: Unit, airMode: boolean | number): Unit;
	cleanup(): void;
}
//Returns air or ground unit on a hex depending on UI airMode
Hex.prototype.getUnit = function(airMode?: boolean | number) {
	if (this.unit !== null && this.airunit !== null) {
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

Hex.prototype.setUnit = function(unit) {
	//Will return if unit object is just a copy.
	if (unit === null || typeof unit.setHex !== "function")
		return;
	unit.setHex(this); //back linking
	if (GameRules.isAir(unit))
		this.airunit = unit;
	else
		this.unit = unit;
}

Hex.prototype.delUnit = function(unit) {
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
Hex.prototype.getAttackableUnit = function(atkunit, airMode) {
	const isSpotted = this.isSpotted(atkunit.player.side);
	let checkedId = -1;
	let u = this.getUnit(airMode);

	if (u) {
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

//frees memory associated with this object if possible
Hex.prototype.cleanup = function() {
	if (this.unit) {
		this.unit.cleanup();
		delete(this.unit);
		this.unit = null;
	}

	if (this.airunit) {
		this.airunit.cleanup();
		delete(this.airunit);
		this.airunit = null;
	}
}

//What a reinforcement gave (the reinforce command's result)
export interface ReinforceResults { strength: number; ammo: number; fuel: number }
//Unit icons by eqid, for preloading
export interface UnitImagesList { [eqid: number]: string }

//Map Object Constructor
export class GameMap { //Map in the original, renamed: it replaced the built-in Map
	declare rows: number;
	declare cols: number;
	declare isLastRowPartial: boolean;
	declare isLastColPartial: boolean;
	declare map: Hex[][];
	declare terrainImage: string;
	declare victoryTurns: number[];
	declare maxTurns: number;
	declare turn: number;
	declare sidesVictoryHexes: Cell[][];
	declare currentPlayer: Player;

	declare allocMap: () => void;
	declare getUnits: () => Unit[];
	declare getUnitById: (id: number) => Unit;
	declare getUnitImagesList: () => UnitImagesList;
	declare getBoard: () => MapBoard;
	declare getVisibility: () => MapVisibility;
	declare getUndoSlot: () => UndoSlot;
	declare getSelection: () => MapSelection;
	declare hasAliveUnits: (side: number) => boolean;
	declare getPlayers: () => Player[];
	declare addPlayer: (player: Player) => void;
	declare getPlayer: (id: number) => Player;
	declare getPlayersByCountry: (country: number) => Player[];
	declare getCountriesBySide: (side: number) => number[];
	declare delCurrentUnit: () => void;
	declare getUnitNeighbor: (unit: Unit, direction: number, onlyNotMoved: boolean) => Unit;
	declare delMoveSel: () => void;
	declare delAttackSel: () => void;
	declare setMoveRange: (unit: Unit) => void;
	declare getCurrentMoveRange: () => Cell[];
	declare selectUnit: (unit: Unit) => boolean;
	declare canUndoMove: (unit: Unit) => boolean;
	declare updateUnitList: () => void;
	declare cleanup: () => void;

	//What takes the units marked destroyed off the map (the game's: src/coresession.ts)
	declare static removeDestroyed: (map: GameMap) => void;

	//The selected unit: the old UI's selection's, not the game's (src/selection.ts, #377)
	get currentUnit(): Unit { return this.getSelection().unit; }
	set currentUnit(unit: Unit) { this.getSelection().unit = unit; }

	constructor() {
	this.rows = 0;
	this.cols = 0;
	this.isLastRowPartial = false; //last row/col hexes are only half drawn on the map image
	this.isLastColPartial = false;
	this.map = null;
	this.terrainImage = null;
	this.victoryTurns = []; //Turns limit for briliant, victory and tactical victory
	this.maxTurns = 1;
	this.turn = 1;
	this.sidesVictoryHexes = [[], []]; //Victory hexes for each side
	this.currentPlayer = null; //Which player is currently playing

	const playerList: Player[] = []; //players list
	const visibility = new MapVisibility(this); //the hexes' zone of control and spotting counters
	const board = new MapBoard(this); //the units: the list, their ids, the image cache
	const unitList = board.units; //internal list of units
	const unitImagesList = board.images; //a "hash" of unique unit images used for caching
	const selection = new MapSelection(this); //the old UI's: the selected unit (currentUnit), the hexes it can move to and attack

	this.allocMap = function() {
		this.map = new Array(this.rows);
		visibility.alloc(this.rows, this.cols);
		for(let i = 0; i < this.rows; i++) {
			this.map[i] = new Array(this.cols);
			for(let j = 0; j < this.cols; j++) {
				this.map[i][j] = new Hex(i, j, visibility.counters[i][j]);
			}
		}
	}

	this.getUnits = function() { return unitList; }
	this.getUnitById = function(id) {
		if (id < 0 || typeof id === "undefined")
			return null;

		for (let i = 0; i < unitList.length; i++) {
			if (unitList[i] !== null && unitList[i].id == id)
				return unitList[i];
		}
		return null;
	}
	this.getUnitImagesList = function() { return unitImagesList; }
	//The unit list with its next id, and the undo slot: src/state.ts reads and restores them
	this.getBoard = function() { return board; }
	this.getVisibility = function() { return visibility; }
	this.getUndoSlot = function() { return lastMove; }
	//The old UI's selection, which it shows after each command as the old commands left it (src/selection.ts)
	this.getSelection = function() { return selection; }

	this.hasAliveUnits = function(side) {
		for (let i = 0; i < unitList.length; i++)
			if (unitList[i].player.side == side && !unitList[i].destroyed)
				return true;
		return false;
	}

	this.getPlayers = function() { return playerList; }

	this.addPlayer = function(player) {
		if (!player)
			return;

		playerList.push(player);
		if  (this.currentPlayer === null) this.currentPlayer = playerList[0];

		//Check if player has available transports to add their images to the preloading list
		if (player.airTransports > 0) {
			var id = Equipment.getCountryEquipmentByClass(unitClass.airTransport, player.country + 1)[0];
			if (id && typeof id !== "undefined")
				unitImagesList[id] = Equipment.equipment[id].icon;
		}

		if (player.navalTransports > 0) {
			id = Equipment.getCountryEquipmentByClass(unitClass.navalTransport, player.country + 1)[0];
			if (id && typeof id !== "undefined")
				unitImagesList[id] = Equipment.equipment[id].icon;
		}
	}

	this.getPlayer = function(id) { //TODO/FIX: returns player @ index instead of checking the ID
		if (id < playerList.length)
			return playerList[id];
		else
			return playerList[0];
	}

	this.getPlayersByCountry = function(country) {
		const c = [];
		const p = this.getPlayers();
		for (let i = 0; i < p.length; i++)
			if (p[i].country == country)
				c.push(p[i]);
		return c;
	}

	//returns and array of countries playing on a side including supporting countries for the side players
	this.getCountriesBySide = function(side) {
		const c = [];
		const p = this.getPlayers();
		for (let i = 0; i < p.length; i++) {
			if (p[i].side == side) {
				c.push(p[i].country); //add player country
				for (let j = 0; j < p[i].supportCountries.length; j++) {
					if (p[i].supportCountries[j] > 0)
						c.push(p[i].supportCountries[j] - 1) //add supporting country //TODO -1 fix indexes
				}
			}
		}
		return c;
	}

	this.delCurrentUnit = function() { selection.clear(); }

	//Returns the next (direction > 0) or previous unit of the same owner in the unit list,
	//onlyNotMoved: also cycle thru units that haven't moved yet, otherwise unit is the only candidate
	this.getUnitNeighbor = function(unit, direction, onlyNotMoved) {
		const count = unitList.length;
		const id = unit.id;
		const owner = unit.owner;
		const list = [];
		let pos = -1;

		for (let i = 0; i < count; i++) {
			const u = unitList[i];
			if (u !== null && u.owner == owner) {
				if (u.id == id) {
					list.push(u);
					pos = list.length - 1;
				} else if (onlyNotMoved && !u.hasMoved) {
					list.push(u);
				}
			}
		}

		if (pos !== -1) {
			let prev = pos - 1;
			if (pos == 0)
				prev = list.length - 1;
			const next = (pos + 1) % list.length;
			if (direction > 0)
				return list[next];
			return list[prev];
		}
		return unit;
	}

	this.delMoveSel = function() { selection.clearMove(); }
	this.delAttackSel = function() { selection.clearAttack(); }

	this.setMoveRange = function(unit) { selection.setMoveRange(unit); }
	this.getCurrentMoveRange = function() { return selection.moveSelected; }

	// selects a new unit as the current unit
	this.selectUnit = function(unit) { return selection.select(unit); }

	//Returns true if last movement of a unit can be undone
	this.canUndoMove = function(unit) {
		return lastMove.canUndo(unit);
	}

	//The units marked destroyed off the map, as the old engine's cleanup took them off (the harness takes
	//a side's units away so)
	this.updateUnitList = function() { GameMap.removeDestroyed(this); }

	//frees memory associated with this object if possible
	this.cleanup = function() {
		for(let i = 0; i < this.rows; i++) {
			for(let j = 0; j < this.cols; j++) {
				this.map[i][j].cleanup();
				delete(this.map[i][j]);
			}
		}
		this.map = null;
	}

	//Private

	//For saving changes made by last move of a unit
	var lastMove = new UndoSlot();

	}
} // end GameMap class
