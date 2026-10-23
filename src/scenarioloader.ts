/**
 * ScenarioLoader - Loads XML scenarios as exported from mapconvert.py script
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

import { Equipment } from "./equipment";
import type { Scenario } from "./scenario";

//Where the scenario files are, relative to the page (Scenario.scenarioPath is the same string)
export const scenarioPath = "resources/scenarios/data/";

//Loading is asynchronous: the scenario XML, then the map image (its size gives the real map
//size), then the equipment of the players countries; then ScenarioLoader.build makes the game (the
//core's newGame, src/coreload.ts, #137) and calls scen.onLoadFinished(). A file that doesn't load
//calls it with scen.isLoaded false.
//A class with its closure body as the constructor: the methods are own properties, as the original
export class ScenarioLoader {
	//Who makes the game once its files are in (src/coreload.ts, set by game.ts)
	declare static build: (scen: Scenario, xmlData: Document, imageSize: [number, number]) => void;
	//The countries of the core units a campaign carries in, loaded beside the players' (src/coreload.ts)
	declare static coreCountries: () => number[];
	declare noCache: boolean;
	declare loadScenario: (scenarioObject: Scenario) => void;

	constructor() {
		var scen: Scenario = null;

		this.noCache = true; //add a timestamp to the scenario url so the browser doesn't cache it

		this.loadScenario = function(scenarioObject: Scenario) {
			const xmlHttp = new XMLHttpRequest();
			let url;

			scen = scenarioObject;
			url = scenarioPath + scen.file;
			if (this.noCache)
				url += "?_=" + new Date().getTime();

			xmlHttp.onload = function() {
				if (xmlHttp.readyState === 4) {
					if (xmlHttp.status === 200 || xmlHttp.status === 0)
						parseScenario(xmlHttp.responseXML);
					else
						parseScenario(null);
				}
			}
			xmlHttp.open("GET", url, true);
			xmlHttp.send(null);
		}

		// Private functions
		function parseScenario(xmlData: Document) {
			if (xmlData == null || !parseMapHeader(xmlData))
				loadFailed();
		}

		//The equipment set (its country names are the game's from now on), then the map image
		function parseMapHeader(xmlData: Document) {
			const mapHeader = xmlData.getElementsByTagName("map")[0];
			if (!mapHeader)
				return false;
			const eqp = mapHeader.getAttribute("eqp");
			if (eqp) {
				scen.eqp = eqp;
				Equipment.name = eqp;
			}
			loadMapImage(xmlData, mapHeader.getAttribute("image"));
			return true;
		}

		function loadFailed() {
			scen.isLoaded = false;
			scen.onLoadFinished();
		}

		//The map image's size gives the map's (the scenario's rows and cols are only an upper limit),
		//then the equipment of the players' countries and their supporting ones, and a campaign's core units'
		function loadMapImage(xmlData: Document, src: string) {
			const img = new Image();
			img.src = src;
			img.onload = function() {
				const players = playerCountries(xmlData).concat(ScenarioLoader.coreCountries()
					.map((country) => ({ country, supportCountries: [] as number[] })));
				const imageSize: [number, number] = [img.width, img.height];
				Equipment.addPlayersEquipment(players, function() {
					if (--Equipment.equipmentToLoad) //called after each file, the last one makes the game
						return;
					ScenarioLoader.build(scen, xmlData, imageSize);
				});
			}
			img.onerror = loadFailed;
		}

		//The players' countries and supporting countries, for the equipment to load
		function playerCountries(xmlData: Document) {
			return Array.from(xmlData.getElementsByTagName("player")).map((p) => ({ country: +p.getAttribute("country"),
				supportCountries: p.getAttribute("support").split(", ").map(Number).filter((c) => c > 0) }));
		}
	}
}
