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

function GameState(Game)
{
	var saveName =
	{
		scenario:'openpanzer-scenario-'+MAJOR_VERSION,
		players: 'openpanzer-players-'+MAJOR_VERSION,
		settings:'openpanzer-settings-'+MAJOR_VERSION,
		campaign:'openpanzer-campaign-'+MAJOR_VERSION,
	};

	//Items read back so far by restoreItem, keyed by save name. Never emptied, so it
	//keeps the items for the lifetime of this GameState: restore() works once per instance
	var restoredItems = {};

	this.save = function()
	{
		saveItem(saveName.scenario, Game.scenario);
		saveItem(saveName.players, Game.scenario.map.getPlayers());
	}

	//Saves the game as a public gist on GitHub. inputElement holds the gist id to overwrite,
	//or is empty to create a new one, and receives the new id or status messages.
	//callback(error, gistId) is called when the request completes
	this.saveToCloud = function(inputElement, callback)
	{
		var saveData = this.exportGameState();
		//The bundle embeds the author's GitHub token here ("ghp_" + pieces with whitespace
		//stripped out), used to create and update the gists. Not copied into the source
		var token = "";
		//Uses the global game, not the Game this GameState was created with
		var gist =
		{
			description: game.scenario.name + "-" + game.scenario.map.turn,
			public: true,
			files: {},
		};
		var overwrite = true;
		var gistId = inputElement.value;

		if (gistId == "" || typeof gistId === "undefined")
			overwrite = false;

		gist.files["openpanzer-save.json"] = {};
		gist.files["openpanzer-save.json"].content = saveData;

		var xhr = new XMLHttpRequest();
		if (overwrite)
		{
			inputElement.value = "Overwriting cloud save " + gistId + " ...";
			xhr.open("PATCH", "https://api.github.com/gists/" + gistId, true);
		}
		else
		{
			inputElement.value = "Creating new cloud save ...";
			xhr.open("POST", "https://api.github.com/gists", true);
		}
		xhr.setRequestHeader("Accept", "application/vnd.github.raw");
		xhr.setRequestHeader("Content-Type", "application/json");
		xhr.setRequestHeader("Authorization", "bearer " + token);
		xhr.onreadystatechange = function()
		{
			if (this.readyState == 4)
			{
				if ((this.status >= 200 && this.status < 300) || this.status == 304)
				{
					var reply = JSON.parse(this.responseText);
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
	this.restore = function(onDone, onFail)
	{
		restoreItem(saveName.settings, onDone, onFail, 4);
		restoreItem(saveName.scenario, onDone, onFail, 4);
		restoreItem(saveName.players, onDone, onFail, 4);
		restoreItem(saveName.campaign, onDone, onFail, 4);
	}

	//Restores a game from an exportGameState() string, returns false if it can't be parsed
	this.restoreFromString = function(saveData)
	{
		return restoreFromJSON(saveData);
	}

	//Restores a game from a file exported with exportGameState()
	this.restoreFromFile = function(file, onDone, onFail)
	{
		var reader = new FileReader();
		reader.onloadend = function()
		{
			if (!restoreFromJSON(this.result))
			{
				if (typeof onFail === "function")
					onFail();
				return false;
			}
			if (typeof onDone === "function")
				onDone();
		};
		reader.readAsText(file);
		return true;
	}

	//Restores a game from a GitHub gist whose id is in inputElement
	this.restoreFromCloud = function(inputElement, onDone)
	{
		var gistId = inputElement.value;
		if (gistId == "" || typeof gistId === "undefined")
		{
			inputElement.setAttribute("placeholder", "No ID specified");
			return false;
		}

		var xhr = new XMLHttpRequest();
		inputElement.value = "Loading ...";
		xhr.open("GET", "https://api.github.com/gists/" + gistId, true);
		xhr.onreadystatechange = function()
		{
			if (this.readyState == 4)
			{
				if ((this.status >= 200 && this.status < 300) || this.status == 304)
				{
					var reply = JSON.parse(this.responseText);
					if (!reply || !reply.files.hasOwnProperty("openpanzer-save.json"))
					{
						inputElement.value = "";
						inputElement.setAttribute("placeholder", "Cannot parse reply !");
						return false;
					}
					if (!restoreFromJSON(reply.files["openpanzer-save.json"].content))
					{
						inputElement.value = "";
						inputElement.setAttribute("placeholder", "Cannot find game data in the save file");
						return false;
					}
					delete reply; //no effect, a var can't be deleted
					inputElement.value = gistId;
					if (typeof onDone === "function")
						onDone();
				}
				else
				{
					inputElement.value = "";
					inputElement.setAttribute("placeholder", "Cannot load game !");
					return false;
				}
			}
		};
		xhr.send();
		return true;
	}

	this.clear = function()
	{
		deleteItem(saveName.scenario);
		deleteItem(saveName.players);
		deleteItem(saveName.campaign);
	}

	//Save campaign settings
	this.saveCampaign = function()
	{
		//saveItem skips null, so without a campaign the previous campaign save stays
		saveItem(saveName.campaign, getCampaignSave());
	}

	//Saves only the user settings
	this.saveSettings = function()
	{
		saveItem(saveName.settings, uiSettings);
	}

	this.restoreSettings = function()
	{
		restoreItem(saveName.settings, null, function() {}, 1);
	}

	//Returns the game (scenario, players, campaign) as a JSON string
	this.exportGameState = function()
	{
		var state = {};
		//A hex with these values holds nothing worth saving and is written as {}
		var emptyHex =
		{
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

		return JSON.stringify(state, function(key, value)
		{
			//Drop the player reference of units (objects with an eqid)
			if (key === "player" && this.hasOwnProperty("eqid"))
				return undefined;

			//terrain is checked twice in the bundle
			if (value && value.hasOwnProperty("terrain") && value.hasOwnProperty("terrain"))
			{
				var isEmpty = true;
				for (var p in emptyHex)
				{
					if (!value.hasOwnProperty(p) || value[p] !== emptyHex[p])
					{
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
	function saveItem(key, object)
	{
		if (isChromeApp())
		{
			if (object)
			{
				var item = {};
				item[key] = object;
				chrome.storage.local.get(function(items) {}); //unused
				chrome.storage.local.set(item);
			}
		}
		else
		{
			//Falsy objects (a null campaign) are not saved
			if (localStorage && object)
				localStorage.setItem(key, JSON.stringify(object));
		}
	}

	//Reads one item and hands it to onItemRestored, which acts once itemCount items are in
	function restoreItem(key, onDone, onFail, itemCount)
	{
		var object = null;

		if (isChromeApp())
		{
			chrome.storage.local.get(key, function(items)
			{
				//a null items makes onItemRestored throw
				if (chrome.runtime.lastError)
					items = null;
				onItemRestored(onDone, onFail, key, items, itemCount);
			});
		}
		else
		{
			if (localStorage)
				object = localStorage.getItem(key);

			return onItemRestored(onDone, onFail, key, JSON.parse(object), itemCount);
		}
	}

	function deleteItem(key)
	{
		if (isChromeApp())
			chrome.storage.local.remove(key);
		else if (localStorage)
			localStorage.removeItem(key);
	}

	//Restores a game from a JSON string, returns false if it doesn't hold a scenario
	function restoreFromJSON(saveData)
	{
		var state = null;
		try
		{
			state = JSON.parse(saveData);
		}
		catch (e)
		{
			return false;
		}

		if (!state || !state.hasOwnProperty("scenario"))
			return false;

		Game.cleanup();
		loadGameState(state.scenario, state.players, state.campaign, Game.setupGameState.bind(Game));
		return true;
	}

	//Creates the scenario and loads the equipment of all players and supporting countries
	function loadGameState(scenarioData, playersData, campaignData, onDone)
	{
		Game.scenario = new Scenario(scenarioData.file);
		if (scenarioData.eqp)
			Equipment.name = scenarioData.eqp;

		Equipment.addPlayersEquipment(playersData, onEquipmentLoaded.bind(null, scenarioData, playersData, campaignData, onDone));
	}

	//Called once for each equipment file, the game is rebuilt after the last one
	function onEquipmentLoaded(scenarioData, playersData, campaignData, onDone)
	{
		if (--Equipment.equipmentToLoad)
			return;

		for (var i = 0; i < playersData.length; i++)
		{
			var player = new Player();
			player.copy(playersData[i]);
			Game.scenario.map.addPlayer(player);
		}

		Game.scenario.copy(scenarioData);
		Game.scenario.isLoaded = true;

		//Restore campaign state
		if (defined(campaignData))
		{
			var campaignId = campaignData.id;
			//Campaigns are found by file when the save has it, the id is the fallback
			if (campaignData.hasOwnProperty("file"))
			{
				campaignId = Campaign.findCampaignByFile(campaignData.file);
				if (campaignId < 0)
					campaignId = campaignData.id;
			}
			Game.campaign = new Campaign(campaignId, campaignData.difficulty || 0, restoreCampaign.bind(null, campaignData, onDone));
		}
		else
		{
			Game.campaign = null;
			onDone();
		}
	}

	//Called when the campaign has loaded
	function restoreCampaign(campaignData, onDone)
	{
		var map = Game.scenario.map;
		Game.campaign.setScenarioById(campaignData.scenario);
		var player = map.getPlayersByCountry(campaignData.country)[0]; //Get first player of a country
		map.restoreCoreUnitList(player, campaignData.coreUnits);
		onDone();
	}

	//Stores a restored item, when all itemCount items are in restores the settings then the game
	function onItemRestored(onDone, onFail, key, object, itemCount)
	{
		if (isChromeApp())
			restoredItems[key] = object[key];
		else
			restoredItems[key] = object;

		if (Object.keys(restoredItems).length == itemCount)
		{
			var s = restoredItems[saveName.scenario];
			var p = restoredItems[saveName.players];
			var c = restoredItems[saveName.campaign];
			var settings = restoredItems[saveName.settings];

			//Need to restore the settings since some players might be assigned to AI
			if (settings !== undefined && settings)
			{
				if (itemCount == 1)
					return applySettings(settings);
				applySettings(settings);
			}

			if (s !== undefined && p !== undefined && s !== null && p !== null && s.file)
				return loadGameState(s, p, c, onDone);

			return onFail();
		}
	}

	function applySettings(s)
	{
		//Not all settings need to be restored since some are temp only
		uiSettings.markOwnUnits = s.markOwnUnits;
		uiSettings.markEnemyUnits = s.markEnemyUnits;
		uiSettings.use3D = s.use3D;
		uiSettings.useRetina = s.useRetina;
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
	function getCampaignSave()
	{
		var campaignSave = null;

		if (Game.campaign !== null)
		{
			campaignSave =
			{
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
