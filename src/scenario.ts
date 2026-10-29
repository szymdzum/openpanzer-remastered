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

import type { Unit } from "./unit";
import { GameMap } from "./map";
import type { ScenarioOutcome } from "./core/types";
import { ScenarioLoader, scenarioPath } from "./app/loader";

//A unit to deploy later, Scenario.reinforcements[turn]
export interface Reinforcement {
	row: number;
	col: number;
	unit: Unit;
	turn: number;
	id: number;   //1 based position in its turn list when added
}

//A class with its closure body as the constructor: the methods are own properties, as the original
export class Scenario {
	declare static loader: ScenarioLoader;
	declare static scenarioPath: string;
	declare static getScenarioDataByFileName: (scenFile: string) => ScenarioListEntry;

	declare name: string;
	declare maxTurns: number;
	declare date: Date;
	declare atmosferic: number;
	declare latitude: number;
	declare ground: number;
	declare turnsPerDay: number;
	declare dayTurn: number;
	declare reinforcements: { [turn: string]: Reinforcement[] };
	declare map: GameMap;
	declare file: string;
	declare expPerSide: { exp: number; count: number }[];
	declare unitsCostPerSide: number[];
	declare isLoaded: boolean;
	declare eqp: string;
	declare load: (onFinished: () => void) => void;
	declare onLoadFinished: () => void;
	declare addReinforcement: (turn: number, row: number, col: number, unit: Unit) => void;
	declare checkVictory: () => ScenarioOutcome;
	declare getDescription: () => string;
	declare setDescription: (str: string) => void;
	declare getStartObjectives: () => [number, number] | null;
	declare setStartObjectives: (n: [number, number] | null) => void;
	declare showStatistics: () => void;

	constructor(scenFile?: string) {
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

		let description = "";
		//How many objectives each side had to take at the start (#256): in the closure as the description, so
		//the harness's walk of the objects compares with the original's, which has none
		let startObjectives: [number, number] | null = null;
		let loadCallback: () => void = null;

		if (typeof scenFile !== "undefined") {
			const scenData = Scenario.getScenarioDataByFileName(scenFile);
			if (scenData) {
				this.name = scenData[1];
				description = scenData[2];
			}
		}

		//Loads scenario data files, calls onFinished when done (through onLoadFinished)
		this.load = function(onFinished: () => void) {
			loadCallback = onFinished;
			Scenario.loader.loadScenario(this);
		}

		//Called by the loader when the scenario finished loading (or failed to load: isLoaded false)
		this.onLoadFinished = function() {
			if (loadCallback)
				loadCallback();
		}

		this.addReinforcement = function(turn: number, row: number, col: number, unit: Unit) {
			if (this.reinforcements[turn] === null || typeof this.reinforcements[turn] === "undefined")
				this.reinforcements[turn] = [];

			this.reinforcements[turn].push({row: row, col: col, unit: unit, turn: turn,
				id: this.reinforcements[turn].length + 1});
		}

		this.checkVictory = function(): ScenarioOutcome {
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
		this.getStartObjectives = function() { return startObjectives; }
		this.setStartObjectives = function(n: [number, number] | null) { startObjectives = n; }

		this.showStatistics = function() {};
	}
}

//After the class: a class isn't hoisted like the constructor function was
Scenario.loader = new ScenarioLoader();
Scenario.scenarioPath = scenarioPath;

//Lookup information about scenario in scenariolist, returns the scenariolist entry or null
Scenario.getScenarioDataByFileName = function(scenFile: string): ScenarioListEntry {
	for (let i = 0; i < scenariolist.length; i++)
		if (scenariolist[i][0] == scenFile)
			return scenariolist[i];
	return null;
}
