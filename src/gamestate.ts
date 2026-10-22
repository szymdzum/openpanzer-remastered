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
import { Equipment } from "./equipment";
import { defined, isChromeApp } from "./dom";
import type { Unit } from "./unit";
import { Player } from "./map";
import { Scenario } from "./scenario";
import { Campaign } from "./campaign";
import type { Game } from "./game";
import { game } from "./session";

//The campaign progress kept in a save, see getCampaignSave
export interface CampaignSave {
	id: number;
	file: string;
	scenario: number;
	country: number;
	difficulty: number;
	coreUnits: Unit[];
}

//A game as exportGameState writes it (and the scenario and players items of a local save):
//the JSON of the objects, read back into new ones with their copy()
export interface GameStateExport {
	scenario: Scenario;
	players: Player[];
	campaign: CampaignSave | null;
}

//What saveToCloud and restoreFromCloud read from the GitHub gists API
export interface GistReply {
	id: string;
	files: { [fileName: string]: { content: string } };
}

//GameState keeps its save names and restored items in the closure, its methods are
//assigned in the constructor: a class with its closure body as the constructor, as the original
export class GameState {
	declare save: () => void;
	declare saveToCloud: (inputElement: HTMLInputElement, callback: (error: string | null, gistId?: string) => void) => void;
	declare restore: (onDone: () => void, onFail: () => void) => void;
	declare restoreFromString: (saveData: string) => boolean;
	declare restoreFromFile: (file: Blob, onDone?: () => void, onFail?: () => void) => boolean;
	declare restoreFromCloud: (inputElement: HTMLInputElement, onDone?: () => void) => boolean;
	declare clear: () => void;
	declare saveCampaign: () => void;
	declare saveSettings: () => void;
	declare restoreSettings: () => void;
	declare exportGameState: () => string;

	constructor(Game: Game | null) {
		var saveName = {
			scenario:'openpanzer-scenario-'+MAJOR_VERSION,
			players: 'openpanzer-players-'+MAJOR_VERSION,
			settings:'openpanzer-settings-'+MAJOR_VERSION,
			campaign:'openpanzer-campaign-'+MAJOR_VERSION,
		};

		//Items read back so far by restoreItem, keyed by save name. Never emptied, so it
		//keeps the items for the lifetime of this GameState: restore() works once per instance
		var restoredItems: { [key: string]: any } = {};

		this.save = function() {
			saveItem(saveName.scenario, Game.scenario);
			saveItem(saveName.players, Game.scenario.map.getPlayers());
		}

		//Saves the game as a public gist on GitHub. inputElement holds the gist id to overwrite,
		//or is empty to create a new one, and receives the new id or status messages.
		//callback(error, gistId) is called when the request completes
		this.saveToCloud = function(inputElement: HTMLInputElement, callback: (error: string | null, gistId?: string) => void) {
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

		//Restores settings, scenario, players and campaign. The items are read one by one
		//(asynchronously in a Chrome app) and the game is rebuilt when all 4 are in.
		//onDone is called when the scenario has been restored, onFail when there is no saved game
		this.restore = function(onDone: () => void, onFail: () => void) {
			restoreItem(saveName.settings, onDone, onFail, 4);
			restoreItem(saveName.scenario, onDone, onFail, 4);
			restoreItem(saveName.players, onDone, onFail, 4);
			restoreItem(saveName.campaign, onDone, onFail, 4);
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
		this.restoreFromCloud = function(inputElement: HTMLInputElement, onDone?: () => void) {
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
			deleteItem(saveName.scenario);
			deleteItem(saveName.players);
			deleteItem(saveName.campaign);
		}

		//Save campaign settings
		this.saveCampaign = function() {
			//saveItem skips null, so without a campaign the previous campaign save stays
			saveItem(saveName.campaign, getCampaignSave());
		}

		//Saves only the user settings
		this.saveSettings = function() {
			saveItem(saveName.settings, uiSettings);
		}

		this.restoreSettings = function() {
			restoreItem(saveName.settings, null, function() {}, 1);
		}

		//Returns the game (scenario, players, campaign) as a JSON string
		this.exportGameState = function() {
			const state = {} as GameStateExport;
			//A hex with these values holds nothing worth saving and is written as {}
			const emptyHex: { [p: string]: unknown } = {
				unit: null,
				airunit: null,
				terrain: 0,
				road: 0,
				owner: -1,
				flag: -1,
				isDeployment: -1,
				victorySide: -1,
				name: "",
				isMoveSel: false,
				isAttackSel: false,
			};

			state.scenario = Game.scenario;
			state.players = Game.scenario.map.getPlayers();
			state.campaign = getCampaignSave();

			return JSON.stringify(state, function(key, value) {
				//Drop the player reference of units (objects with an eqid)
				if (key === "player" && this.hasOwnProperty("eqid"))
					return undefined;

				//terrain is checked twice in the bundle
				if (value && value.hasOwnProperty("terrain") && value.hasOwnProperty("terrain")) {
					let isEmpty = true;
					for (const p in emptyHex) {
						if (!value.hasOwnProperty(p) || value[p] !== emptyHex[p]) {
							isEmpty = false;
							break;
						}
					}
					if (isEmpty)
						return {};
				}
				return value;
			});
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

		//Restores a game from a JSON string, returns false if it doesn't hold a scenario
		function restoreFromJSON(saveData: string) {
			let state: GameStateExport = null;
			try {
				state = JSON.parse(saveData);
			} catch (e) {
				return false;
			}

			if (!state || !state.hasOwnProperty("scenario"))
				return false;

			Game.cleanup();
			loadGameState(state.scenario, state.players, state.campaign, Game.setupGameState.bind(Game));
			return true;
		}

		//Creates the scenario and loads the equipment of all players and supporting countries
		function loadGameState(scenarioData: Scenario, playersData: Player[], campaignData: CampaignSave | null, onDone: () => void) {
			Game.scenario = new Scenario(scenarioData.file);
			if (scenarioData.eqp)
				Equipment.name = scenarioData.eqp;

			Equipment.addPlayersEquipment(playersData, onEquipmentLoaded.bind(null, scenarioData, playersData, campaignData, onDone));
		}

		//Called once for each equipment file, the game is rebuilt after the last one
		function onEquipmentLoaded(scenarioData: Scenario, playersData: Player[], campaignData: CampaignSave | null, onDone: () => void) {
			if (--Equipment.equipmentToLoad)
				return;

			for (let i = 0; i < playersData.length; i++) {
				const player = new Player();
				player.copy(playersData[i]);
				Game.scenario.map.addPlayer(player);
			}

			Game.scenario.copy(scenarioData);
			Game.scenario.isLoaded = true;

			//Restore campaign state
			if (defined(campaignData)) {
				let campaignId = campaignData.id;
				//Campaigns are found by file when the save has it, the id is the fallback
				if (campaignData.hasOwnProperty("file")) {
					campaignId = Campaign.findCampaignByFile(campaignData.file);
					if (campaignId < 0)
						campaignId = campaignData.id;
				}
				Game.campaign = new Campaign(campaignId, campaignData.difficulty || 0, restoreCampaign.bind(null, campaignData, onDone));
			} else {
				Game.campaign = null;
				onDone();
			}
		}

		//Called when the campaign has loaded
		function restoreCampaign(campaignData: CampaignSave, onDone: () => void) {
			const map = Game.scenario.map;
			Game.campaign.setScenarioById(campaignData.scenario);
			const player = map.getPlayersByCountry(campaignData.country)[0]; //Get first player of a country
			map.restoreCoreUnitList(player, campaignData.coreUnits);
			onDone();
		}

		//Stores a restored item, when all itemCount items are in restores the settings then the game
		function onItemRestored(onDone: (() => void) | null, onFail: () => void, key: string, object: any, itemCount: number) {
			if (isChromeApp())
				restoredItems[key] = object[key];
			else
				restoredItems[key] = object;

			if (Object.keys(restoredItems).length == itemCount) {
				const s: Scenario = restoredItems[saveName.scenario];
				const p: Player[] = restoredItems[saveName.players];
				const c: CampaignSave | null = restoredItems[saveName.campaign];
				const settings: UISettings = restoredItems[saveName.settings];

				//Need to restore the settings since some players might be assigned to AI
				if (settings !== undefined && settings) {
					if (itemCount == 1)
						return applySettings(settings);
					applySettings(settings);
				}

				if (s !== undefined && p !== undefined && s !== null && p !== null && s.file)
					return loadGameState(s, p, c, onDone);

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

			uiSettings.lastCloudSave = [];
			if (s.hasOwnProperty("lastCloudSave"))
				for (var i = 0; i < s.lastCloudSave.length; i++)
					uiSettings.lastCloudSave[i] = s.lastCloudSave[i];

			//Restore player AI settings
			for (var i = 0; i < s.isAI.length; i++)
				uiSettings.isAI[i] = s.isAI[i];
		}

		//Returns the campaign state to save, null when not playing a campaign
		function getCampaignSave(): CampaignSave | null {
			let campaignSave: CampaignSave | null = null;

			if (Game.campaign !== null) {
				campaignSave = {
					id: Game.campaign.id,
					file: Game.campaign.file,
					scenario: Game.campaign.getCurrentScenario().id,
					country: Game.campaign.country,
					difficulty: Game.campaign.difficulty,
					coreUnits: Game.getCampaignPlayer().getCoreUnitList(),
				};
			}

			return campaignSave;
		}
	}
}
