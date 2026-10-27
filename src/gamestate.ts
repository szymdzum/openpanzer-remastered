/**
 * GameState - Provides localStorage state and network state
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

import { MAJOR_VERSION, type UISettings, uiSettings } from "./prototypes";
import { Equipment, type EquipmentPlayerCountries } from "./equipment";
import { isChromeApp } from "./dom";
import { Scenario } from "./scenario";
import { Campaign } from "./campaign";
import { coreCountries } from "./core/campaign";
import { stateEquipment } from "./core/newgame";
import type { Game } from "./game";
import { game } from "./session";
import { campaignFromSave, type ReadSave, readSave, readSaveObject, scenarioFromSave, writeSave } from "./savegame";

//What saveToCloud and restoreFromCloud read from the GitHub gists API
export interface GistReply {
	id: string;
	files: { [fileName: string]: { content: string } };
}

//The cloud save's id field: the old UI's #cloudid input, or what stands for it (the new UI's, #349). The cloud saves
//write their progress and errors into its value and placeholder
export type CloudField = Pick<HTMLInputElement, "value" | "setAttribute">;

//GameState keeps its save names and restored items in the closure, its methods are
//assigned in the constructor: a class with its closure body as the constructor, as the original
export class GameState {
	declare save: () => void;
	declare saveToCloud: (inputElement: CloudField, callback: (error: string | null, gistId?: string) => void) => void;
	declare restore: (onDone: () => void, onFail: () => void) => void;
	declare restoreFromString: (saveData: string) => boolean;
	declare restoreFromFile: (file: Blob, onDone?: () => void, onFail?: () => void) => boolean;
	declare restoreFromCloud: (inputElement: CloudField, onDone?: () => void) => boolean;
	declare clear: () => void;
	declare saveSettings: () => void;
	declare restoreSettings: () => void;
	declare exportGameState: () => string;

	constructor(Game: Game | null) {
		//The game is one item (src/savegame.ts); a local save of the format before is three, the
		//scenario, its players and the campaign's progress, read when there's no game item
		var saveName = {
			game: 'openpanzer-game-'+MAJOR_VERSION,
			scenario:'openpanzer-scenario-'+MAJOR_VERSION,
			players: 'openpanzer-players-'+MAJOR_VERSION,
			settings:'openpanzer-settings-'+MAJOR_VERSION,
			campaign:'openpanzer-campaign-'+MAJOR_VERSION,
		};

		//Items read back so far by restoreItem, keyed by save name. Never emptied, so it
		//keeps the items for the lifetime of this GameState: restore() works once per instance
		var restoredItems: { [key: string]: any } = {};

		//The game with its campaign's progress
		this.save = function() {
			saveItem(saveName.game, writeSave(Game.scenario, Game, Game.rules));
		}

		//Saves the game as a public gist on GitHub. inputElement holds the gist id to overwrite,
		//or is empty to create a new one, and receives the new id or status messages.
		//callback(error, gistId) is called when the request completes
		this.saveToCloud = function(inputElement: CloudField, callback: (error: string | null, gistId?: string) => void) {
			const saveData = this.exportGameState();
			//The bundle embeds the author's GitHub token here ("ghp_" + pieces with whitespace
			//stripped out), used to create and update the gists. Not copied into the source
			const token = "";
			//Uses the global game, not the Game this GameState was created with
			const gist: { description: string; public: boolean; files: { [fileName: string]: { content?: string } } } = {
				description: game.scenario.name + "-" + game.scenario.map.turn,
				public: true,
				files: {},
			};
			let overwrite = true;
			const gistId = inputElement.value;

			if (gistId == "" || typeof gistId === "undefined")
				overwrite = false;

			gist.files["openpanzer-save.json"] = {};
			gist.files["openpanzer-save.json"].content = saveData;

			const xhr = new XMLHttpRequest();
			if (overwrite) {
				inputElement.value = "Overwriting cloud save " + gistId + " ...";
				xhr.open("PATCH", "https://api.github.com/gists/" + gistId, true);
			} else {
				inputElement.value = "Creating new cloud save ...";
				xhr.open("POST", "https://api.github.com/gists", true);
			}
			xhr.setRequestHeader("Accept", "application/vnd.github.raw");
			xhr.setRequestHeader("Content-Type", "application/json");
			xhr.setRequestHeader("Authorization", "bearer " + token);
			xhr.onreadystatechange = function() {
				if (this.readyState == 4) {
					if ((this.status >= 200 && this.status < 300) || this.status == 304) {
						const reply: GistReply = JSON.parse(this.responseText);
						if (!reply)
							return callback("Bad response from server");
						inputElement.value = reply.id;
						return callback(null, reply.id);
					}
					inputElement.value = "";
					inputElement.setAttribute("placeholder", "Cannot create save !");
					return callback("Cannot create save");
				}
			};
			xhr.send(JSON.stringify(gist));
		}

		//Restores the settings and the game, or a game of the format before. The items are read one by
		//one (asynchronously in a Chrome app) and the game is rebuilt when all 5 are in.
		//onDone is called when the scenario has been restored, onFail when there is no saved game
		this.restore = function(onDone: () => void, onFail: () => void) {
			restoreItem(saveName.settings, onDone, onFail, 5);
			restoreItem(saveName.game, onDone, onFail, 5);
			restoreItem(saveName.scenario, onDone, onFail, 5);
			restoreItem(saveName.players, onDone, onFail, 5);
			restoreItem(saveName.campaign, onDone, onFail, 5);
		}

		//Restores a game from an exportGameState() string, returns false if it can't be parsed
		this.restoreFromString = function(saveData: string) {
			return restoreFromJSON(saveData);
		}

		//Restores a game from a file exported with exportGameState()
		this.restoreFromFile = function(file: Blob, onDone?: () => void, onFail?: () => void) {
			const reader = new FileReader();
			reader.onloadend = function() {
				if (!restoreFromJSON(this.result as string)) {
					if (typeof onFail === "function")
						onFail();
					return;
				}
				if (typeof onDone === "function")
					onDone();
			};
			reader.readAsText(file);
			return true;
		}

		//Restores a game from a GitHub gist whose id is in inputElement
		this.restoreFromCloud = function(inputElement: CloudField, onDone?: () => void) {
			const gistId = inputElement.value;
			if (gistId == "" || typeof gistId === "undefined") {
				inputElement.setAttribute("placeholder", "No ID specified");
				return false;
			}

			const xhr = new XMLHttpRequest();
			inputElement.value = "Loading ...";
			xhr.open("GET", "https://api.github.com/gists/" + gistId, true);
			xhr.onreadystatechange = function() {
				if (this.readyState == 4) {
					if ((this.status >= 200 && this.status < 300) || this.status == 304) {
						const reply: GistReply = JSON.parse(this.responseText);
						if (!reply || !reply.files.hasOwnProperty("openpanzer-save.json")) {
							inputElement.value = "";
							inputElement.setAttribute("placeholder", "Cannot parse reply !");
							return;
						}
						if (!restoreFromJSON(reply.files["openpanzer-save.json"].content)) {
							inputElement.value = "";
							inputElement.setAttribute("placeholder", "Cannot find game data in the save file");
							return;
						}
						//The bundle has "delete reply;" here: no effect on a var, and a syntax error in a module
						inputElement.value = gistId;
						if (typeof onDone === "function")
							onDone();
					} else {
						inputElement.value = "";
						inputElement.setAttribute("placeholder", "Cannot load game !");
						return;
					}
				}
			};
			xhr.send();
			return true;
		}

		this.clear = function() {
			deleteItem(saveName.game);
			deleteItem(saveName.scenario);
			deleteItem(saveName.players);
			deleteItem(saveName.campaign);
		}

		//Saves only the user settings
		this.saveSettings = function() {
			saveItem(saveName.settings, uiSettings);
		}

		this.restoreSettings = function() {
			restoreItem(saveName.settings, null, function() {}, 1);
		}

		//Returns the game (src/savegame.ts) as a JSON string
		this.exportGameState = function() {
			return JSON.stringify(writeSave(Game.scenario, Game, Game.rules));
		}

		//Private functions
		function saveItem(key: string, object: unknown) {
			if (isChromeApp()) {
				if (object) {
					const item: { [key: string]: unknown } = {};
					item[key] = object;
					chrome.storage.local.get(function() {}); //unused
					chrome.storage.local.set(item);
				}
			} else {
				//Falsy objects (a null campaign) are not saved
				if (localStorage && object)
					localStorage.setItem(key, JSON.stringify(object));
			}
		}

		//Reads one item and hands it to onItemRestored, which acts once itemCount items are in
		function restoreItem(key: string, onDone: (() => void) | null, onFail: () => void, itemCount: number) {
			let object: string = null;

			if (isChromeApp()) {
				chrome.storage.local.get(key, function(items: { [key: string]: any }) {
					//a null items makes onItemRestored throw
					if (chrome.runtime.lastError)
						items = null;
					onItemRestored(onDone, onFail, key, items, itemCount);
				});
			} else {
				if (localStorage)
					object = localStorage.getItem(key);

				return onItemRestored(onDone, onFail, key, JSON.parse(object), itemCount);
			}
		}

		function deleteItem(key: string) {
			if (isChromeApp())
				chrome.storage.local.remove(key);
			else if (localStorage)
				localStorage.removeItem(key);
		}

		//Restores a game from a JSON string, returns false if it isn't a save
		function restoreFromJSON(saveData: string) {
			const read = readSave(saveData);
			if (read === null)
				return false;

			Game.cleanup();
			loadGameState(read, Game.setupGameState.bind(Game));
			return true;
		}

		//Creates the scenario and loads the equipment of all players and supporting countries, and of
		//their core units' countries (#182: by the units' flags, no equipment is loaded to ask)
		function loadGameState(read: ReadSave, onDone: () => void) {
			const { data, state } = read.save;
			Game.rules = read.save.rules;
			Game.scenario = new Scenario(state.scenario.file);
			if (data.equipment)
				Equipment.name = data.equipment;

			const players: EquipmentPlayerCountries[] = state.players.slice();
			for (const p of state.players)
				for (const country of coreCountries(p, state.units, {}))
					players.push({ country, supportCountries: [] });
			Equipment.addPlayersEquipment(players, onEquipmentLoaded.bind(null, read, onDone), loadFailed);
		}

		//Called once for each equipment file, the game is rebuilt after the last one, and after the files
		//of the units' equipment the countries don't have (#286)
		function onEquipmentLoaded(read: ReadSave, onDone: () => void) {
			if (--Equipment.equipmentToLoad)
				return;
			Equipment.addUnitsEquipment(stateEquipment(read.save.state), () => rebuild(read, onDone), loadFailed);
		}

		//An equipment file that doesn't load fails the load as a scenario's does: the game's scenario
		//stays the save's, not loaded, and the game says so and ends (#367: the load waited for good)
		function loadFailed() {
			Game.onScenarioLoadFinished(null, true);
		}

		function rebuild(read: ReadSave, onDone: () => void) {
			Game.scenario = scenarioFromSave(read);

			//Restore campaign state: campaigns are found by file, the id is the fallback
			const c = read.save.state.campaign;
			if (c !== null) {
				let campaignId = Campaign.findCampaignByFile(c.file);
				if (campaignId < 0)
					campaignId = c.id;
				Game.campaign = new Campaign(campaignId, c.difficulty, function() {
					campaignFromSave(read, Game, Game.scenario);
					onDone();
				});
			} else {
				Game.campaign = null;
				onDone();
			}
		}

		//Stores a restored item, when all itemCount items are in restores the settings then the game
		function onItemRestored(onDone: (() => void) | null, onFail: () => void, key: string, object: any, itemCount: number) {
			if (isChromeApp())
				restoredItems[key] = object[key];
			else
				restoredItems[key] = object;

			if (Object.keys(restoredItems).length == itemCount) {
				const settings: UISettings = restoredItems[saveName.settings];

				//Need to restore the settings since some players might be assigned to AI
				if (settings !== undefined && settings) {
					if (itemCount == 1)
						return applySettings(settings);
					applySettings(settings);
				}

				//The game, or the items of the format before
				const read = readSaveObject(restoredItems[saveName.game]) || readSaveObject({
					scenario: restoredItems[saveName.scenario],
					players: restoredItems[saveName.players],
					campaign: restoredItems[saveName.campaign] || null,
				});
				if (read !== null)
					return loadGameState(read, onDone);

				return onFail();
			}
		}

		function applySettings(s: UISettings) {
			//Not all settings need to be restored since some are temp only
			uiSettings.markOwnUnits = s.markOwnUnits;
			uiSettings.markEnemyUnits = s.markEnemyUnits;
			uiSettings.use3D = s.use3D;
			uiSettings.useRetina = s.useRetina;
			uiSettings.hdGraphics = s.hdGraphics !== false; //on unless turned off, also for settings saved before it existed
			uiSettings.showGridTerrain = s.showGridTerrain;
			uiSettings.muteUnitSounds = s.muteUnitSounds;
			uiSettings.noFOW = s.noFOW;
			uiSettings.quickAnimation = s.quickAnimation;
			uiSettings.uiScale = s.uiScale;
			uiSettings.uiSize = s.uiSize;
			uiSettings.zoomLevel = s.zoomLevel;
			uiSettings.shownEndTurnTip = s.shownEndTurnTip;
			uiSettings.showDetailInfoToolTips = s.showDetailInfoToolTips || false;
			uiSettings.showHiddenVictoryHexes = s.showHiddenVictoryHexes || false;
			uiSettings.classicRules = s.classicRules || false;

			uiSettings.lastCloudSave = [];
			if (s.hasOwnProperty("lastCloudSave"))
				for (var i = 0; i < s.lastCloudSave.length; i++)
					uiSettings.lastCloudSave[i] = s.lastCloudSave[i];

			//Restore player AI settings
			for (var i = 0; i < s.isAI.length; i++)
				uiSettings.isAI[i] = s.isAI[i];
		}
	}
}
