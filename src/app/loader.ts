/**
 * ScenarioLoader - loads the XML scenarios as exported from the mapconvert.py script
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

import { Equipment } from "../legacy/equipment";
import { fileEquipment, type ScenarioFile } from "../core/newgame";
import { readScenarioFile } from "../core/scenariofile";
import type { Scenario } from "../legacy/scenario";

/** Where the scenario files are, relative to the page. */
export const scenarioPath = "resources/scenarios/data/";

/**
 * Loads the scenario XML, then the map image (its size gives the real map size), then the equipment of the
 * players' countries and of the units; then ScenarioLoader.build makes the game and calls
 * scen.onLoadFinished(). A file that doesn't load (an equipment file too, #367) calls it with scen.isLoaded false.
 */
//A class with its closure body as the constructor: the methods are own properties, as the original
export class ScenarioLoader {
	//Set by the host's runGame to buildOnCore (src/app/start.ts)
	declare static build: (scen: Scenario, file: ScenarioFile, imageSize: [number, number]) => void;
	//Set by the host's runGame to carriedCountries (src/app/start.ts)
	declare static coreCountries: () => number[];
	declare noCache: boolean;
	declare loadScenario: (scenarioObject: Scenario) => void;

	constructor() {
		var scen: Scenario = null;

		this.noCache = true; //adds a timestamp to the scenario url so the browser doesn't cache it

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
			xmlHttp.onerror = xmlHttp.onabort = loadFailed;
			xmlHttp.open("GET", url, true);
			xmlHttp.send(null);
		}

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

		//The scenario's rows and cols are only an upper limit: the map image's size gives the map's
		function loadMapImage(xmlData: Document, src: string) {
			const img = new Image();
			img.src = src;
			img.onload = function() {
				const players = playerCountries(xmlData).concat(ScenarioLoader.coreCountries()
					.map((country) => ({ country, supportCountries: [] as number[] })));
				const imageSize: [number, number] = [img.width, img.height];
				//(a file that doesn't load fails the load, #367)
				Equipment.addPlayersEquipment(players, function() {
					if (--Equipment.equipmentToLoad) //called after each file
						return;
					//(then the files of the units' equipment its countries don't have, #286; the file is read once,
					//for them and the game)
					const file = readScenarioFile(xmlData);
					Equipment.addUnitsEquipment(fileEquipment(file), () => ScenarioLoader.build(scen, file, imageSize), loadFailed);
				}, loadFailed);
			}
			img.onerror = loadFailed;
		}

		function playerCountries(xmlData: Document) {
			return Array.from(xmlData.getElementsByTagName("player")).map((p) => ({ country: +p.getAttribute("country"),
				supportCountries: p.getAttribute("support").split(", ").map(Number).filter((c) => c > 0) }));
		}
	}
}
