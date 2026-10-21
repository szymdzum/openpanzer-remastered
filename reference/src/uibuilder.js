/**
 * UIBuilder- Creates UI windows
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

var UIBuilder = (function(UIBuilder) { //Module start

//Path to menu image assets
UIBuilder.startMenuImgPath = "resources/ui/dialogs/startmenu/images/";
UIBuilder.menuImgPath = "resources/ui/menu/images/";
UIBuilder.eqImgPath = "resources/ui/dialogs/equipment/images/";

//The prestige "currency" icon
UIBuilder.currencyIcon = "<img src='" + UIBuilder.eqImgPath + "currency.png'/>";
//Icon shown for naval units replacements
UIBuilder.navalReplacementIcon = "resources/units/images/le211.png";

//Build the class selection buttons "unitClass.id from equipment.js": [button glyph, description]
//The glyphs are characters of the openpanzer font
UIBuilder.eqClassButtons =
{
	"9": ["*", "Air defence"], "4": ["/", "Anti-tank"], "8": [")", "Artillery"],
	"1": ["(", "Infantry"], "3": ["=", "Recon"], "2": ["]", "Tank"],
	"10": ["%", "Air Fighter"], "11": ["4", "Air Bomber"]
};

//Glyphs of the unit context buttons
UIBuilder.unitContextButtons =
{
	mount: "[", embark: "2", resupply: "!", reinforce: "#", overstrength: "J", undo: "_"
};

//Unit stats that will be listed on the window format
//<id>, <title>, <isSortKey>, <sortKeyName>, <glyph>, <placed on the top row>
UIBuilder.unitstats =
[
	["uCost", "Unit price", 1, "cost", "B", 0], ["uStr", "Unit strength", 0, null, ":", 0],
	["uFuel", "Unit fuel", 0, "fuel", ";", 0], ["uAmmo", "Unit Ammo", 1, "ammo", "<", 0],
	["uGunRange", "Firing range", 1, "gunrange", ">", 0], ["uMovement", "Movement range", 1, "movpoints", "?", 0],
	["uExp", "Combat Experience", 0, null, "@", 0], ["uEnt", "Entrenchment", 0, null, '"', 0],
	["uIni", "Combat initiative", 1, "initiative", "|", 0], ["uSpot", "Spotting range", 1, "spotrange", "'", 0],
	["uAHard", "Power vs Hard targets", 1, "hardatk", "{", 0], ["uASoft", "Power vs Soft targets", 1, "softatk", "$", 0],
	["uAAir", "Power vs Air targets", 1, "airatk", "&", 0], ["uANaval", "Power vs Naval targets", 1, "navalatk", "}", 0],
	["uDHard", "Defence vs ground attacker", 1, "grounddef", "5", 0], ["uDAir", "Defence vs air attacker", 1, "airdef", "3", 0],
	["uDClose", "Defence in close combat", 1, "closeddef", "6", 0], ["uDRange", "Defence in ranged combat", 1, "rangedefmod", "7", 0],
	["uMoveType", "Movement type", 0, null, "~", 0], ["uTarget", "Target type", 0, null, "`", 0],
	["uLeader", "See unit leader", 0, null, null, 1], ["uTransport", "See unit/transport", 0, null, null, 1],
	["uCarrier", "See naval/air carrier", 0, null, null, 1], ["uNext", "Go to next unit", 0, null, null, 1],
	["uFlag", "country flag", 0, null, null, 0]
];

//Ids of the small tooltips shown on the map
UIBuilder.smallToolTipList = [];

//Elements that are scaled by scaleUI: <id>, <top offset at scale 1 or negative margin top or null>
var scaledElements =
[
	["gameToolTip", null], ["ui-message", null], ["startmenu", null], ["statusbar", 0],
	["statusbar-extension", 25], ["menu", null], ["unit-context", -95], ["unit-info", -70],
	["container-unitlist", 30], ["equipment", 125], ["combatLog", 25], ["combatLogButton", 25],
	["statusBarButton", 15], ["unitsBarButton", 95], ["dossier", 25], ["uiToolTip", null]
];

//The stylesheets that use the country flags image of the equipment set
UIBuilder.flagStyleSheets = [];

//Builds the start menu/options menu
UIBuilder.buildStartMenu = function()
{
	//menu buttons divs with id and title
	var menubuttons = [["newgame", "New Game"], ["settings", "Settings"], ["saveload", "Save / Load"],
			   ["continuegame", "Continue Game"]];
	//New game buttons with id, title and description
	var newgamebuttons =
	[
		["newcampaign", "Campaigns", "Lead your troops to victory over multiple scenarios. Troops gain experience and leaders which will carry over next scenarios. Campaign flow depends on how quickly player conquers all objectives. "],
		["newscenario", "Scenarios", "Play a single scenario. Most scenarios are designed  for campaign mode, this mode is recommended for players that want to learn the specifics of scenarios or try different things. "],
		["tutorial", "Tutorial", "Learn the basic mechanics of the game. First turns are automatically played by the computer but later the control is given to the player."]
	];
	//Campaign difficulties with value, name and if it's the selected option
	var difficulties = [[difficultyType.historical, "Historical", 0], [difficultyType.tactical, "Tactical", 1],
			    [difficultyType.operational, "Operational", 0]];
	//Settings with key in uiSettings and Title
	var settings = [["showGridTerrain", "Show terrain with Hex Grid"], ["quickAnimation", "Quick combat and move animations"],
			["muteUnitSounds", "Mute unit combat sounds"], ["noFOW", "Disable Fog of War"],
			["useRetina", "Zoom to full device resolution"], ["markOwnUnits", "Mark own units on map"],
			["markEnemyUnits", "Mark enemy strength in red"], ["showDetailInfoToolTips", "Show optional objectives tooltips"],
			["showHiddenVictoryHexes", "Show hidden victory hexes"]];

	var i, b, div, container;
	var exitFunction = getDesktopExitFunction();

	//Desktop builds (nw.js, wails) get a close button
	if (exitFunction)
	{
		$('smClose').style.display = "inline";
		$('smClose').onclick = function() { exitFunction(); };
	}

	//Add main buttons
	for (b = 0; b < menubuttons.length; b++)
	{
		div = addTag('smButtons', 'div');
		div.id = menubuttons[b][0];
		div.title = menubuttons[b][1];
		div.className = "smMainButton";
		div.textContent = menubuttons[b][1];
		div.onclick = function() { game.ui.startMenuButton(this.id); };
	}

	//Add new game buttons each in its own container
	for (b = 0; b < newgamebuttons.length; b++)
	{
		container = addTag('smNewGameContent', 'div');
		container.className = "newGameContainer";
		if (b < newgamebuttons.length - 1)
			container.style.marginRight = "15px";
		div = addTag(container, 'div');
		div.id = newgamebuttons[b][0];
		div.title = newgamebuttons[b][1];
		div.className = "smMainButtonLight";
		div.textContent = newgamebuttons[b][1];
		div.style.margin = "0px auto";
		div.onclick = function() { game.ui.startMenuButton(this.id); };
	}

	$('smLogoText').innerHTML = "version " + VERSION;
	$('smCredits').innerHTML = "Copyright Nicu Pavel";

	//Add new campaign options (campaign list, difficulty, description)
	var camSel = addTag('smCampSel', 'select');
	for (i = 0; i < campaignlist.length; i++)
	{
		var camOpt = addTag(camSel, 'option');
		camOpt.value = i;
		camOpt.text = campaignlist[i].title;
	}

	var difSel = addTag($('smCampDif'), 'select');
	difSel.id = "smCampDifSel";
	difSel.style.fontSize = "14px";
	difSel.style.fontWeight = "normal";
	difSel.style.color = "#f8e064";
	difSel.style.height = "26px";
	for (i = 0; i < difficulties.length; i++)
		addSelectOption(difSel, difficulties[i][1], difficulties[i][0], difficulties[i][2]);

	$('smCampDifHelp').onclick = function()
	{
		var help;
		help = "Historical - Highest difficulty<br>Tactical - Medium difficulty +20% starting prestige, +10% starting prestige per turn, +20% extra turns, -20% score.<br>Operational - Lowest difficulty + 50% starting prestige, +25% starting prestige per turn, +50% extra turns. -50% score";
		$('smCampDesc').innerHTML = help;
	};

	camSel.onchange = function()
	{
		var v = this.options[this.selectedIndex].value;
		$('smCampDesc').innerHTML = campaignlist[v].desc;
		$('smCampCountry').innerHTML = "<b>Country</b><br/>" + Equipment.getCountryNameByEqp(campaignlist[v].flag, campaignlist[v].eqp);
		$('smCampScenarios').innerHTML = "<b>Scenarios</b><br/>" + campaignlist[v].scenarios;
		$('smCampPrestige').innerHTML = "<b>Start prestige</b><br/>" + campaignlist[v].prestige + "&nbsp;" + UIBuilder.currencyIcon;

		$('smCamp').selectedCampaign = v; //save index to campaign from campaignlist //TODO move to userSel
	};
	$('smCBackBut').onclick = function()
	{
		makeHidden('smCamp');
		makeVisible('smMain');
	};
	$('smCPlayBut').onclick = function()
	{
		var s = $('smCamp').selectedCampaign;
		var sel = $('smCampDifSel');
		var difficulty = sel.options[sel.selectedIndex].value;
		//selectedCampaign is the option value string, so "0" passes; it's undefined until a campaign is picked
		if (!s)	return;
		game.newCampaign(s, difficulty);
		makeHidden('gameToolTip');
		makeHidden('smCamp');
		makeHidden('startmenu');
		toggleButton($('options'), false);
		game.state.saveSettings();
	};
	//Shows the scenario flow of the selected campaign in the description
	$('smCFlowBut').onclick = function()
	{
		var s = $('smCamp').selectedCampaign;
		var flowCampaign = new Campaign(s, difficultyType.historical, function()
		{
			$('smCampDesc').innerHTML = flowCampaign.getCampaignFlow();
		});
	};

	/* Campaign debug button */
	if (DEBUG_CAMPAIGN)
	{
		$('smCV').onclick = function() { makeHidden('smCamp'); makeHidden('startmenu'); game.continueCampaign("victory"); };
		$('smCVB').onclick = function() { makeHidden('smCamp'); makeHidden('startmenu'); game.continueCampaign("briliant"); };
		$('smCVT').onclick = function() { makeHidden('smCamp'); makeHidden('startmenu'); game.continueCampaign("tactical"); };
		$('smCL').onclick = function() { makeHidden('smCamp'); makeHidden('startmenu'); game.continueCampaign("lose"); };
	}

	//Add new scenario options(scenario list, description, players)
	//scenariolist entries with a single element are group headers
	var scnSel = addTag('smScenSel', 'select');
	for (i = 0; i < scenariolist.length; i++)
	{
		var scnOpt = addTag(scnSel, 'option');
		if (scenariolist[i].length == 1)
		{
			scnOpt.disabled = true;
			scnOpt.text = "\u00bb\u00a0" + scenariolist[i][0];
		}
		else
		{
			scnOpt.value = i;
			scnOpt.text = "\u00a0\u00a0\u00a0\u00a0" + scenariolist[i][1];
		}
	}
	scnSel.onchange = function()
	{
		var v = this.options[this.selectedIndex].value;
		$('smScenDesc').innerHTML = scenariolist[v][2];

		clearTag('smSide0');
		$('smVS').innerHTML = "VS";
		clearTag('smSide1');
		UIBuilder.setEquipmentFlags(scenariolist[v][5]);

		//Add players for side 0 and 1
		for (var s = 0; s <= 1; s++)
		{
			var data = scenariolist[v][3 + s];
			var sideID = "smSide" + s;
			var sideHeader = addTag(sideID, 'div');
			sideHeader.className = "smSideHeader";
			sideHeader.innerHTML = sideNames[s];
			var sideImg = addTag(sideHeader, 'img');
			sideImg.src = UIBuilder.startMenuImgPath + "side" + s + ".png";

			for (var i = 0; i < data.length; i++)
			{
				var containerDiv = addTag(sideID, 'div');
				containerDiv.className = "smPlayerContainer";
				var flagDiv = addTag(containerDiv, 'div');
				flagDiv.className = "playerCountry";
				flagDiv.style.backgroundPosition = "" + data[i]["country"] * -21 + "px 0px"; //Update flag
				var contentDiv = addTag(containerDiv, 'div');
				contentDiv.className = "playerName";
				contentDiv.innerHTML = Equipment.getCountryNameByEqp(data[i]["country"], scenariolist[v][5]);
				var smAIBut = addTag(containerDiv, 'div');
				//The previous AI settings are kept, a truthy value is normalised to 1
				if (uiSettings.isAI[data[i]["id"]])
				{
					smAIBut.innerHTML = "d";
					uiSettings.isAI[data[i]["id"]] = 1;
				}
				else
				{
					smAIBut.innerHTML = "D";
				}
				smAIBut.id = "ai" + data[i]["id"];
				smAIBut.playerid = data[i]["id"];
				smAIBut.className = "smallButton right";
				smAIBut.style.marginRight = "5px";
				smAIBut.onclick = function()
				{
					uiSettings.isAI[this.playerid] = uiSettings.isAI[this.playerid] ? 0 : 1;
					toggleCheckbox(this);
				};
			}
		}
		$('smScen').selectedScenario = v; //TODO move to userSel
	};
	$('smSBackBut').onclick = function()
	{
		makeHidden('smScen');
		makeVisible('smMain');
		//Selecting scenarios changed the flags to their equipment sets
		UIBuilder.setEquipmentFlags(game.scenario.eqp);
	};
	$('smSPlayBut').onclick = function()
	{
		var s = $('smScen').selectedScenario;
		if (!s)	return;
		game.campaign = null; //New scenario delete campaign
		game.newScenario(scenariolist[s][0], scenariolist[s][2]);
		makeHidden('gameToolTip');
		makeHidden('smScen');
		makeHidden('startmenu');
		toggleButton($('options'), false);
		game.state.saveSettings();
	};

	UIBuilder.resizeUI(uiSettings.uiSize);
	UIBuilder.scaleUI(uiSettings.uiScale);
	UIBuilder.setLayoutConstrains(false);

	//The settings window
	container = addTag('smSettingsContainer', 'div');
	container.className = "settingContainer left";
	div = addTag(container, 'div');
	div.className = "settingText left";
	div.textContent = "Interface width (px)";
	div = addTag(container, 'div');
	div.style.float = "right";
	UIBuilder.createSlider(div, "uiresize", uiSettings.uiSize, 10, uiSettings.uiSmallSize, 1920,
		function() { UIBuilder.resizeUI($('uiresize').value); });

	container = addTag('smSettingsContainer', 'div');
	container.className = "settingContainer left";
	div = addTag(container, 'div');
	div.className = "settingText left";
	div.textContent = "Interface scale";
	div = addTag(container, 'div');
	div.style.float = "right";
	UIBuilder.createSlider(div, "uiscale", uiSettings.uiScale, 0.1, 0.5, 3,
		function() { UIBuilder.scaleUI($('uiscale').value); });

	container = addTag('smSettingsContainer', 'div');
	container.className = "settingContainer left";
	div = addTag(container, 'div');
	div.className = "settingText left";
	div.textContent = "Game Map scale";
	div = addTag(container, 'div');
	div.style.float = "right";
	UIBuilder.createSlider(div, "mapscale", uiSettings.zoomLevel, 0.1, 1, 3,
		function() { game.ui.scaleMap($('mapscale').value); });

	for (b = 0; b < settings.length; b++)
	{
		container = addTag('smSettingsContainer', 'div');
		container.className = "settingContainer left";
		div = addTag(container, 'div');
		div.title = settings[b][1];
		div.className = "settingText left";
		div.textContent = settings[b][1];
		div = addTag(container, 'div');
		div.id = settings[b][0];
		div.className = "settingValue right";
		div.innerHTML = uiSettings[settings[b][0]] ? "C" : "c";
		div.onclick = function()
		{
			uiSettings[this.id] = !uiSettings[this.id];
			toggleCheckbox(this);
			if (this.id == "useRetina")
			{
				$('smSettings').needPageReload = true;
				//Suggest a matching interface scale (applied when the settings are closed)
				if (window.devicePixelRatio >= 1)
				{
					if (uiSettings.useRetina && uiSettings.uiScale <= 1)
						$('uiscale').value = 1.6;
					if (!uiSettings.useRetina && uiSettings.uiScale >= 1.5)
						$('uiscale').value = 1;
				}
			}
		};
	}
	$('smSetOkBut').onclick = function()
	{
		makeHidden('smSettings');
		makeVisible('startmenu');
		UIBuilder.resizeUI($('uiresize').value);
		UIBuilder.scaleUI($('uiscale').value);
		game.state.saveSettings();

		if ($('smSettings').needPageReload)
			location.reload(true);
		if ($('smSettings').messageHidden)
			makeVisible('ui-message');
	};

	UIBuilder.buildGameStateMenu();
};

//Builds the save/load window of the start menu
UIBuilder.buildGameStateMenu = function()
{
	var row, div;
	//Buttons with id and html, two on a row
	var buttons = [["disksave", "Save to Disk <a id='savedata' hidden download='none'></a>"],
		       ["diskload", OSGlue.diskloadHTML], ["cloudsave", "Cloud Save"], ["cloudload", "Cloud Load"]];
	//Description shown below each row of buttons
	var descriptions =
	[
		"<b>Last saved to disk</b> <div id='disksaveupdate'> none</div><hr>",
		"<input type='text' id='cloudid' style='-webkit-user-select:text;' placeholder='Enter numeric ID to Load from Cloud'><br><b>Last known cloud saves</b><div class='hcenter blackBoxBorder' id='cloudid_lastsaves'></div><div id='diskloaderror' class='smStateDesc'></div>"
	];

	for (var b = 0; b < buttons.length; b++)
	{
		if (b % 2 == 0)
		{
			row = addTag('smState', 'div');
			row.className = "smCenter";
		}
		div = addTag(row, 'div');
		div.id = buttons[b][0];
		div.className = "smMainButton";
		div.innerHTML = buttons[b][1];
		//The platform decides which event loads the file
		if (div.id == "diskload")
			OSGlue.diskloadEvent(div, function() { UIBuilder.gameStateButton("diskload"); });
		else
			div.onclick = function() { UIBuilder.gameStateButton(this.id); };

		if (b % 2 == 1)
		{
			div = addTag('smState', 'div');
			div.className = "smStateDesc";
			div.innerHTML = descriptions[(b - 1) / 2];
		}
	}
	UIBuilder.fillCloudSavesList();

	$('smStOkBut').onclick = function()
	{
		makeHidden('smState');
		makeVisible('smMain');
		$('diskloaderror').textContent = "";
	};
};

//Lists the last 3 cloud saves, clicking one puts its id in the cloud id input
UIBuilder.fillCloudSavesList = function()
{
	clearTag('cloudid_lastsaves');
	if (defined(uiSettings.lastCloudSave) && uiSettings.lastCloudSave.length > 0)
		$('cloudid').value = uiSettings.lastCloudSave[uiSettings.lastCloudSave.length - 1].id;

	for (var i = 0; i < 3; i++)
	{
		div = addTag($('cloudid_lastsaves'), 'div'); //implicit global div, kept as in the bundle
		div.style.height = "22px";
		if (defined(uiSettings.lastCloudSave) && uiSettings.lastCloudSave.length > i)
		{
			div.textContent = uiSettings.lastCloudSave[i].name;
			div.cloudid = uiSettings.lastCloudSave[i].id;
			div.onclick = function() { $('cloudid').value = this.cloudid; };
		}
		else
		{
			div.textContent = "";
			div.onclick = function() { $('cloudid').value = ""; };
		}
	}
};

//Called when a cloud save finished, error is set when it failed, id is the cloud save id.
//Remembers the last 3 cloud saves in the settings
function onCloudSaved(error, id)
{
	if (error) return false;

	var found = false;
	var name = "(Scenario) ";
	if (game.campaign !== null)
		name = "(Campaign) ";
	name += game.scenario.name + " Turn " + game.scenario.map.turn;

	for (var i = 0; i < uiSettings.lastCloudSave.length; i++)
	{
		if (uiSettings.lastCloudSave[i].id == id)
		{
			uiSettings.lastCloudSave[i].name = name;
			found = true;
			break;
		}
	}
	if (!found)
	{
		if (uiSettings.lastCloudSave.length > 2)
			uiSettings.lastCloudSave.shift();
		uiSettings.lastCloudSave.push({ name: name, id: id });
	}
	game.state.saveSettings();
	UIBuilder.fillCloudSavesList();
	return true;
}

function onDiskLoadError()
{
	$('diskloaderror').textContent = "Error loading game. Cannot parse save game data.";
}

//A saved game was loaded, continue it
function onGameLoaded()
{
	makeHidden('smState');
	makeHidden('smMain');
	$('diskloaderror').textContent = "";
	game.ui.startMenuButton("continuegame");
}

UIBuilder.gameStateButton = function(id)
{
	switch (id)
	{
		case "disksave":
		{
			var date = new Date();
			var dateString = date.toDateString() + " " + date.toLocaleTimeString();
			var fileName;
			fileName = (game.campaign !== null) ? "(Campaign) " : "(Scenario) ";
			fileName += game.scenario.name + " Turn " + game.scenario.map.turn + " " + dateString + ".json";
			OSGlue.disksave(fileName);
			break;
		}
		case "diskload":
			OSGlue.diskload(onGameLoaded, onDiskLoadError);
			break;
		case "cloudsave":
			game.state.saveToCloud($('cloudid'), onCloudSaved);
			break;
		case "cloudload":
			game.state.restoreFromCloud($('cloudid'), onGameLoaded);
			break;
	}
};

//Builds the in game right side menu
UIBuilder.buildMainMenu = function()
{
	//menu buttons divs with id and glyph
	//format is <id>, <title>, <glyph>, <has a selected glyph>, <0/1 if should be placed in slide div or not>
	var menubuttons = [["inspectunit", "Inspect Unit", "i", 0, 0], ["endturn", "End Turn", "t", 0, 0],
		["mainmenu", "Main  Menu", "o", 1, 0], ["buy", "Upgrade/Buy Units", "w", 0, 1],
		["hex", "Toggle Hex Grid", "h", 0, 1], ["air", "Toggle Air Mode On", "p", 0, 1],
		["zoom", "Strategic Map", "m", 0, 1], ["options", "Options", "s", 0, 1]];

	for (var b = 0; b < menubuttons.length; b++)
	{
		var div;

		if (menubuttons[b][4])	//should be placed on slide div
			div = addTag('slidemenu', 'div');
		else
			div = insertTag('menu', 'div', 'slidemenu');

		div.id = menubuttons[b][0];
		div.title = menubuttons[b][1];
		div.className = "smallButtonMenu";
		if (menubuttons[b][0] === "endturn")
			div.className += " smallButtonEndTurn";
		div.style.marginTop = "3px";
		div.innerHTML = menubuttons[b][2];
		div.onclick = function() { game.ui.mainMenuButton(this.id); };
		if (menubuttons[b][3])
			div.hasSelectedGlyph = true;
	}

	//Make the status bar clickable and show the combat log
	$('combatLogButton').hasSelectedGlyph = true;
	$('statusbar').onclick = $('combatLogButton').onclick = function() { UICombatLog.toggleCombatLog(false, true); };
	$('statusBarButton').onclick = function() { game.ui.toggleUnitsAndEquipmentWindow(false); };
	$('unitsBarButton').onclick = function()
	{
		makeHidden('unitsBarButton');
		makeVisible('equipment');
	};
};

UIBuilder.setDefaultUserSelections = function()
{
	//The default selected country in the div
	$('eqSelCountry').country = 0;
	$('eqSelCountry').owner = 0;

	//No user selections by default
	$('eqUserSel').deployunit = -1;
	$('eqUserSel').userunit = -1;
	$('eqUserSel').equnit = -1;
	$('eqUserSel').eqtransport = -1;

	//Sorting options
	$('eqUserSel').sortorder = 0;
	$('eqUserSel').sortproperty = 'cost';
};

UIBuilder.buildEquipmentWindow = function()
{
	UIBuilder.setDefaultUserSelections();

	//Top Sorting buttons
	$('eqSortOrderBut').title = 'Click to change sorting order ascending/descenting';
	$('eqSortOrderBut').hasSelectedGlyph = true;
	$('eqSortOrderBut').onclick = function()
	{
		var order = $('eqUserSel').sortorder || 0;
		order = ~order & 1;
		$('eqUserSel').sortorder = order;
		game.ui.updateEquipmentWindow($('eqUserSel').eqclass);
		toggleButton($('eqSortOrderBut'), order);
	};

	$('eqSortOptionsBut').title = 'Click to change sort category';
	$('eqSortOptionsBut').hasSelectedGlyph = true;
	$('eqSortOptionsBut').onclick = function()
	{
		if (isVisible('eqSortOptions'))
		{
			makeHidden('eqSortOptions');
			makeVisible('eqButtonsContainer');
			toggleButton($('eqSortOptionsBut'), false);
		}
		else
		{
			makeHidden('eqButtonsContainer');
			makeVisible('eqSortOptions');
			toggleButton($('eqSortOptionsBut'), true);
		}
	};

	//Unit Class buttons
	for (var b in UIBuilder.eqClassButtons)
	{
		var div = addTag('eqSelClass', 'div');
		div.className = "smallButtonSubMenu";
		div.title = UIBuilder.eqClassButtons[b][1];
		div.id = "eqclass-" + b;
		div.eqclass = b;
		div.innerHTML = UIBuilder.eqClassButtons[b][0];
		div.onclick = function()
		{
			$('eqUserSel').userunit = -1; //Clear existing unit selections when changing class
			$('eqUserSel').equnit = -1;
			$('eqUserSel').eqtransport = -1;
			game.ui.updateEquipmentWindow(this.eqclass);
		};
	}

	//Bottom buttons
	$('eqSelCountry').title = 'Click to change country';
	$('eqSelCountry').onclick = function() { game.ui.equipmentWindowButtons('changecountry'); };
	$('eqNewBut').title = "Buy unit as a new unit";
	$('eqNewBut').onclick = function() { game.ui.equipmentWindowButtons('buy'); };
	$('eqUpgradeBut').title = "Upgrade selected unit to this unit";
	$('eqUpgradeBut').onclick = function() { game.ui.equipmentWindowButtons('upgrade'); };
	$('eqSellBut').title = "Disband and sell this unit";
	$('eqSellBut').onclick = function() { game.ui.equipmentWindowButtons('sell'); };
	$('eqCloseBut').title = "Close";
	$('eqCloseBut').onclick = function()
	{
		makeHidden('equipment');
		if (isVisible('container-unitlist'))
			makeVisible('unitsBarButton');
	};
};

//Builds the sorting options on equipment
UIBuilder.buildEquipmentSortOptions = function()
{
	$('eqSortInfo').innerHTML = "Sort equipment by: ";

	for (var s = 0; s < UIBuilder.unitstats.length; s++)
	{
		if (!UIBuilder.unitstats[s][2] || !UIBuilder.unitstats[s][3])
			continue;

		div = addTag('eqSortOptionsContainer', 'div'); //implicit global div, kept as in the bundle
		div.title = UIBuilder.unitstats[s][1];
		div.id = "eqsort-" + UIBuilder.unitstats[s][3];
		div.className = "smallButtonSubMenu";
		div.style.marginRight = "0px";
		div.sortproperty = UIBuilder.unitstats[s][3];
		div.innerHTML = UIBuilder.unitstats[s][4];
		div.onclick = function()
		{
			$('eqSortOptions').style.display = "none";
			var oldProperty = $('eqUserSel').sortproperty || "cost";
			toggleButton($('eqsort-' + oldProperty), false);
			$('eqUserSel').sortproperty = this.sortproperty;
			toggleButton($('eqsort-' + this.sortproperty), true);
			game.ui.updateEquipmentWindow($('eqUserSel').eqclass);
			$('eqSortInfo').innerHTML = "Sorted by: " + this.title;
			$('eqSortOptions').style.display = "inline";
		};
	}
	$('eqSortCloseBut').title = "Close sorting options";
	$('eqSortCloseBut').onclick = function() { makeHidden('eqSortOptions'); makeVisible('eqButtonsContainer'); };
};

//Builds the unit stats info window
UIBuilder.buildUnitInfoWindow = function()
{
	var div = addTag('statsRow', 'div');
	div.id = "uImageBg";
	div = addTag('uImageBg', 'div');
	div.id = "uImage";

	for (var s = 0; s < UIBuilder.unitstats.length; s++)
	{
		if (UIBuilder.unitstats[s][0] == "uCost") //Don't show cost on info window
			continue;

		if (UIBuilder.unitstats[s][5])
			div = addTag('statsRowTop', 'div');
		else
			div = addTag('statsRow', 'div');

		//Stats with a glyph get the glyph div with the text div inside
		if (UIBuilder.unitstats[s][4] !== null)
		{
			div.title = UIBuilder.unitstats[s][1];
			div.className = "statsGlyph";
			div.textContent = UIBuilder.unitstats[s][4];
			div = addTag(div, 'div');
		}
		div.id = UIBuilder.unitstats[s][0];
		div.className = "statsText";
	}
};

UIBuilder.showEquipmentCosts = function(prestige, buyCost, upCost, sellCost)
{
	var diff;

	if (buyCost > 0 && buyCost <= prestige)
	{
		$('eqNewText').innerHTML = "Buy ";
		$('eqNewCost').innerHTML = buyCost + UIBuilder.currencyIcon;
		$('eqNewBut').style.display = "inline";
	}
	else
	{
		if (buyCost > prestige)
		{
			diff = buyCost - prestige;
			$('eqNewText').innerHTML = "<span style='color:#BB7575'>Need " + diff + " more prestige to buy.</span>";
		}
		else
		{
			$('eqNewText').textContent = "";
		}
		$('eqNewBut').style.display = "none";
		$('eqNewCost').textContent = "";
	}

	if (upCost > 0 && upCost <= prestige)
	{
		$('eqUpgradeText').innerHTML = " Upgrade ";
		$('eqUpgradeCost').innerHTML = upCost + UIBuilder.currencyIcon;
		$('eqUpgradeBut').style.display = "inline";
	}
	else
	{
		if (upCost > prestige)
		{
			diff = upCost - prestige;
			$('eqUpgradeText').innerHTML = "<span style='color:#BB7575'>Need " + diff + " more prestige to upgrade.</span>";
		}
		else
		{
			$('eqUpgradeText').textContent = "";
		}
		$('eqUpgradeBut').style.display = "none";
		$('eqUpgradeCost').textContent = "";
	}

	if (sellCost > 0)
	{
		$('eqSellText').innerHTML = " Sell ";
		$('eqSellCost').innerHTML = sellCost + UIBuilder.currencyIcon;
		$('eqSellBut').style.display = "inline";
	}
	else
	{
		$('eqSellBut').style.display = "none";
		$('eqSellCost').textContent = "";
		$('eqSellText').textContent = "";
	}

	if (window.innerWidth >= 800)
		$('currentPrestige').textContent = "Available Prestige: ";
	else
		$('currentPrestige').textContent = "Now: ";
	$('currentPrestigeAmount').innerHTML = prestige + UIBuilder.currencyIcon;
};

UIBuilder.showAttackInfo = function(atkunit, defunit)
{
	var ad = atkunit.unitData();
	var dd = defunit.unitData();
	var tmpdiv;

	clearTag($('statusmsg'));
	tmpdiv = addTag($('statusmsg'), 'div');
	tmpdiv.className = "playerCountry";
	tmpdiv.style.marginTop = "0px";
	tmpdiv.style.backgroundPosition = "" + (atkunit.flag - 1) * -21 + "px 0px"; //Update flag

	tmpdiv = addTag($('statusmsg'), 'div');
	tmpdiv.className = "combatInfoStatusBar";
	tmpdiv.innerHTML = "<b>" + ad.name + "</b> " + unitClassNames[ad.uclass];

	//The "attacking" glyph
	tmpdiv = addTag($('statusmsg'), 'div');
	tmpdiv.style.cssFloat = "left";
	tmpdiv.style.fontFamily = "openpanzer";
	tmpdiv.style.fontSize = "18px";
	tmpdiv.innerHTML = "&nbsp!&nbsp;";

	tmpdiv = addTag($('statusmsg'), 'div');
	tmpdiv.className = "playerCountry";
	tmpdiv.style.marginTop = "0px";
	tmpdiv.style.backgroundPosition = "" + (defunit.flag - 1) * -21 + "px 0px"; //Update flag

	tmpdiv = addTag($('statusmsg'), 'div');
	tmpdiv.className = "combatInfoStatusBar";
	tmpdiv.innerHTML = "<b>" + dd.name + "</b> " + unitClassNames[dd.uclass];
};

//Shows on the status bar extension that the computer turn started (true) or finished (false)
UIBuilder.showAIStatus = function(isPlaying)
{
	if (isPlaying)
	{
		makeVisible('statusbar-extension');
		$('statusbar-extension').className = "statusbar-extension-animation";
		$('statusbar-extension').innerHTML = "Computer turn in progress";
	}
	else
	{
		makeVisible('statusbar-extension');
		$('statusbar-extension').className = "statusbar-extension-animation-reverse";
		$('statusbar-extension').style.top = "-20px";
		$('statusbar-extension').innerHTML = "<span style='color: #33ccff'> Finished computer turn ! </span>";
	}
};

//Scales the UI windows with css zoom or with a css transform where zoom isn't supported
UIBuilder.scaleUI = function(scale)
{
	var i;
	if ("zoom" in document.body.style)
	{
		for (i = 0; i < scaledElements.length; i++)
			$(scaledElements[i][0]).style.zoom = scale;
	}
	else
	{
		for (i = 0; i < scaledElements.length; i++)
		{
			var e = $(scaledElements[i][0]);
			var transform = "scale(" + scale + "," + scale + ")";
			e.style.webkitTransform = transform;
			e.style.MozTransform = transform;
			e.style.transform = transform;
			if (scaledElements[i][0] == "menu" || scaledElements[i][0] == "startmenu" || scaledElements[i][0] == "ui-message")
			{
				e.style.webkitTransformOrigin = "50% 50%";
				e.style.mozTransformOrigin = "50% 50%";
				e.style.transformOrigin = "50% 50%";
			}
			else
			{
				e.style.webkitTransformOrigin = "50% 0";
				e.style.mozTransformOrigin = "50% 0";
				e.style.transformOrigin = "50% 0";
			}
			//Scaled position: top when the offset is positive, margin top when negative
			var offset = Math.round(scaledElements[i][1] * scale);
			if (scaledElements[i][1] !== null && scaledElements[i][1] >= 0)
				e.style.top = offset + "px";
			if (scaledElements[i][1] !== null && scaledElements[i][1] < 0)
				e.style.marginTop = offset + "px";
		}
	}
	uiSettings.uiScale = scale;
};

//Creates a - value + slider in parent, the value is in an input with id
//and changes by step between min and max. onChange is called after a button changed it
UIBuilder.createSlider = function(parent, id, value, step, min, max, onChange)
{
	function changeValue(delta)
	{
		var v = parseFloat($(id).value);
		v = v + delta;
		if (v < min) v = min;
		if (v > max) v = max;
		if (v % 1 != 0)
			v = v.toFixed(1);
		$(id).value = v;
	}

	var div;
	div = addTag(parent, 'div');
	div.className = "smallButton";
	div.style.cssFloat = "left";
	div.style.marginBottom = "5px";
	div.innerHTML = "-";
	div.onclick = function()
	{
		changeValue(-step);
		if (onChange) onChange();
	};

	div = addTag(parent, 'div');
	div.style.cssFloat = "left";
	div.style.marginTop = "5px";
	div.innerHTML = "<input type='text' id='" + id + "' style='-webkit-user-select:text; width:80px;' value='" + value + "'>";

	div = addTag(parent, 'div');
	div.className = "smallButton";
	div.style.cssFloat = "left";
	div.innerHTML = "+";
	div.onclick = function()
	{
		changeValue(step);
		if (onChange) onChange();
	};
};

//Sets the width of the UI windows and centers them
UIBuilder.resizeUI = function(width)
{
	var elements = ["statusbar", "unit-info", "container-unitlist", "equipment", "combatLog", "dossier"];
	var w = width;
	for (var i = 0; i < elements.length; i++)
	{
		var e = $(elements[i]);
		//combat log is narrower, the reduced width carries over to the dossier after it
		if (elements[i] == "combatLog")
			w = (w * 0.95) >> 0;
		e.style.width = w + "px";
		e.style.marginLeft = -((w / 2) >> 0) + "px";
	}
	uiSettings.uiSize = width;
};

//Adjusts the layout for small screens, isStartup switches the default sizes to the small ones
UIBuilder.setLayoutConstrains = function(isStartup)
{
	if (window.innerWidth < 800)
	{
		$('eqInfoText').style.width = "0px";
		$('eqSortInfo').style.width = "0px";
		$('eqSortInfo').style.height = "0px";
		$('eqSelClass').style.marginLeft = "0px";
		$('menu').style.right = "1px";
		scaledElements[9][1] = 112; //equipment top
		$('equipment').style.top = "112px";
		$('eqUpgradeText').style.display = "none";
		$('eqNewText').style.display = "none";
		$('eqSellText').style.display = "none";
		if (isStartup && uiSettings.uiSize == 840 && uiSettings.uiScale == 1)
		{
			uiSettings.uiSize = uiSettings.uiSmallSize;
			uiSettings.uiScale = 0.9;
		}
	}
};

//Shows a message window, onOk replaces the default handler of the ok button
UIBuilder.message = function(title, message, onOk)
{
	$('title').innerHTML = title;
	$('message').innerHTML = message;
	makeVisible('ui-message');
	$('message').scrollTop = 0;
	//TODO change to an event
	game.uiMessageClicked = false;
	if (typeof onOk !== "function")
		$('uiokbut').onclick = function() { makeHidden('ui-message'); game.uiMessageClicked = true; };
	else
		$('uiokbut').onclick = onOk;
};

//Shows a message window created on the fly, removed when closed
UIBuilder.messageDynamic = function(title, message)
{
	var body = $('mainbody');
	var box = addTag(body, 'div');
	var titleDiv = addTag(box, 'div');
	var messageDiv = addTag(box, 'div');
	var okBut = addTag(box, 'div');

	box.className = "uiMessageBox";
	box.id = "uiMessageBoxDynamic";
	box.style.zIndex = "98";
	titleDiv.className = "uiMessageBoxTitle";
	messageDiv.className = "uiMessageBoxBody";
	okBut.className = "smallButton uiMessageBoxButton";
	titleDiv.innerHTML = title;
	messageDiv.innerHTML = message;
	okBut.innerHTML = "1";
	makeVisible('uiMessageBoxDynamic');
	okBut.onclick = function()
	{
		clearTag(box);
		delTag(box);
	};
};

UIBuilder.showPrototypeAwardMessage = function(eqid)
{
	var msg = "<br>Due to your brilliant tactical performance on previous battle High Command awarded you a prototype core unit available for deployment.";
	var ud = Equipment.equipment[eqid];
	if (typeof ud !== "undefined" && ud)
		msg += "<div class='uImageAnimation' style='margin-left: 120px;background-image: url(" + ud.icon + ")'></div><b>"
			+ ud.name + " " + unitClassNames[ud.uclass] + "</b>";
	UIBuilder.messageDynamic("You have been awarded a prototype unit", msg);
};

//Tooltip with an ok button shown next to a map position, used by the tutorial
UIBuilder.gameToolTip = function(text, x, y)
{
	var tt = $('gameToolTip');
	tt.setAttribute("type", "game");
	tt.style.top = y - 55 + "px";
	tt.style.left = x + 55 + "px";
	$('gameToolTipMessage').innerHTML = text;
	tt.setAttribute("orientation", "left");
	makeVisible('gameToolTip');
	$('gameToolTipOk').onclick = function()
	{
		makeHidden('gameToolTip');
		game.waitUIAnimation = false;
	};
};

//Small tooltip on the map, removed when clicked
UIBuilder.gameSmallToolTip = function(text, x, y, color, id, style)
{
	var tt = $('game');
	tt = addTag(tt, 'div');
	if (!defined(id))
		id = "gstt" + UIBuilder.smallToolTipList.length;
	tt.id = id;
	tt.className = "smallToolTip";
	tt.setAttribute("orientation", "bottom");
	if (defined(color) && color == tooltipColor.enemy)
		tt.style.color = "#F8F864";
	if (defined(style) && style == tooltipStyle.pin)
	{
		tt.setAttribute("shape", "pin");
		tt.style.top = y - 15 + "px";
		tt.style.left = x - 8 + "px";
	}
	else
	{
		tt.style.top = y - 15 + "px";
		tt.style.left = x - 38 + "px";
	}
	tt.style.display = "inline";
	tt.innerHTML = text;
	UIBuilder.smallToolTipList.push(id);
	tt.onclick = function()
	{
		var i = UIBuilder.smallToolTipList.indexOf(this.id);
		UIBuilder.smallToolTipList.splice(i, 1);
		delTag(this);
	};
};

//Tooltip for UI elements, closed when clicked
UIBuilder.uiToolTip = function(text, x, y, isRightOriented)
{
	var tt = $('uiToolTip');
	tt.setAttribute("type", "ui");
	tt.style.top = y + "px";
	tt.style.left = x + "px";
	$('uiToolTipMessage').innerHTML = text;
	if (isRightOriented)
		tt.setAttribute("orientation", "right");
	else
		tt.setAttribute("orientation", "left");
	makeVisible('uiToolTip');
	tt.onclick = function() { makeHidden('uiToolTip'); };
};

//Shows the ui tooltip left of an element, shown once first to get its width
UIBuilder.uiToolTipAtElement = function(element, text, isRightOriented)
{
	var tt = $('uiToolTip');
	UIBuilder.uiToolTip(text, 0, 0, isRightOriented);
	var pos = getCoordinates(element);
	UIBuilder.uiToolTip(text, pos.x - tt.clientWidth - 5, pos.y, isRightOriented);
};

//Unit id as an ordinal number for the unit name, id 0 is shown as 101st
UIBuilder.unitIDToOrdinal = function(id)
{
	var lastDigit = id % 10;
	if (id < 0) return "";
	if (id == 0) return "101st";
	if (lastDigit == 1 && id != 11) return id + "st";
	if (lastDigit == 2 && id != 12) return id + "nd";
	if (lastDigit == 3 && id != 13) return id + "rd";
	return id + "th";
};

//Debug: fills the current player dossier with random destroyed units and scenario outcomes
UIBuilder.simulateDossier = function()
{
	var player = game.scenario.map.currentPlayer;
	var dossier = player.dossier;
	var units = game.scenario.map.getUnits();
	var i;

	for (i = 0; i < units.length; i++)
		if (Math.random() > 0.5)
			player.addDestroyedUnitToDossier(units[i]);

	var data = game.campaign.getCampaignData();
	for (i = 0; i < data.length; i++)
	{
		var outcome = Math.floor(Math.random() * 3);
		outcome = (outcome == 0) ? "victory" : ((outcome == 1) ? "tactical" : "briliant");
		var scenarioName = game.campaign.getScenarioNameFromId(i);
		player.addOutcomeToDossier(outcome, scenarioName);
	}
	return dossier;
};

//Shows the dossier with the campaign outcome on top, onClose is called when it's closed
UIBuilder.showCampaignEnd = function(outcome, message, onClose)
{
	if (!UIBuilder.showDossier(false, onClose))
		return false;

	var parent = $('dossierCampaign');
	var outcomeDiv = addTag(parent, 'div');
	var titleDiv = addTag(parent, 'div');
	var messageDiv = addTag(parent, 'div');
	addTag(parent, 'br');
	var bgImage = "resources/ui/dossier/campaign_victory.png";

	outcomeDiv.style.fontSize = "40px";
	outcomeDiv.style.fontWeight = "bold";
	titleDiv.style.letterSpacing = "10px";
	titleDiv.style.marginBottom = "10px";
	titleDiv.style.fontSize = "12px";
	titleDiv.textContent = "CAMPAIGN FINISHED";

	if (outcome === "lose")
	{
		outcomeDiv.textContent = "Defeat";
		outcomeDiv.style.color = "red";
		bgImage = "resources/ui/dossier/campaign_defeat.png";
	}
	else
	{
		outcomeDiv.textContent = "Victory";
		outcomeDiv.style.color = "white";
	}
	messageDiv.className = "hcenter";
	messageDiv.style.color = "white";
	messageDiv.style.width = "80%";
	messageDiv.innerHTML = message;

	$('dossier').style.backgroundImage = "url('" + bgImage + "')";
	$('dossier').style.backgroundRepeat = "no-repeat";
	$('dossier').style.backgroundSize = "cover";
	return true;
};

//Shows the campaign dossier: units destroyed and lost by class and the medals for the outcomes.
//isInGame shows it under the combat log, otherwise it's a scrollable window with a close button
//that calls onClose. Returns false when not playing a campaign
UIBuilder.showDossier = function(isInGame, onClose)
{
	if (game.campaign === null) return false;

	var dossierDiv = $('dossier');
	clearTag(dossierDiv);
	if (isInGame)
	{
		insertTemplate("template__dossier", dossierDiv);
		dossierDiv.style.top = "25px";
		dossierDiv.style.borderTopLeftRadius = "0";
		dossierDiv.style.borderTopRightRadius = "0";
		dossierDiv.style.zIndex = "200";
	}
	else
	{
		insertTemplate("template__dossier_scroll", dossierDiv);
		insertTemplate("template__dossier", $('dossierScroll'));
		dossierDiv.style.top = "50%";
		dossierDiv.style.borderRadius = "5px";
		dossierDiv.style.zIndex = "290";
	}
	dossierDiv.style.display = "block";

	var player = game.getCampaignPlayer();
	var dossier = player.dossier;
	if (!dossier.hasOwnProperty("units"))
		player.initDossier();

	$('dossierTitle').textContent = game.campaign.name + " " + player.getCountryName() + " Campaign";
	$('dossierTitle').className = "combatLogHeader";
	game.campaign.getCurrentScenario(); //unused
	game.campaign.getCampaignData(); //unused

	//Units destroyed, lost core and lost auxiliary per class
	var td;
	for (var c in UIBuilder.eqClassButtons)
	{
		td = addTag('dossierClasses', 'td');
		td.className = "combatLogHeader";
		td.style.fontFamily = "openpanzer-menu";
		td.style.fontWeight = "bold";
		td.style.fontSize = "26px";
		td.title = UIBuilder.eqClassButtons[c][1];
		td.textContent = UIBuilder.eqClassButtons[c][0];
		addTag('dossierDestroyed', 'td').textContent = dossier.units.killed[c];
		addTag('dossierLostCore', 'td').textContent = dossier.units.lostcore[c];
		addTag('dossierLostAux', 'td').textContent = dossier.units.lostaux[c];
	}

	//Medals with the scenarios won with each outcome
	var hasMedals = false;
	for (var outcome in { briliant: 0, victory: 1, tactical: 2, lose: 3 })
	{
		if (dossier.outcomes[outcome].length < 1)
			continue;

		var div = addTag('dossierMedals', 'div');
		div.textContent = outcomeNames[outcome];
		div.style.fontSize = "16px";
		div.style.textAlign = "left";
		div.style.paddingLeft = "10%";
		addTag('dossierMedals', 'hr');

		var row = addTag('dossierMedals', 'div');
		var medalDiv = addTag(row, 'div');
		var textDiv = addTag(row, 'div');
		medalDiv.style.display = "inline-block";
		medalDiv.style.width = "40%";
		medalDiv.style.verticalAlign = "top";
		//No medal for lost scenarios
		if (outcome !== "lose")
		{
			hasMedals = true;
			var img = addTag(medalDiv, 'img');
			var counter = addTag(medalDiv, 'div');
			counter.className = "counterBox";
			counter.textContent = dossier.outcomes[outcome].length;
			img.src = "resources/ui/dossier/" + game.campaign.country + "_" + outcome + ".png";
			img.style.height = "150px";
		}
		textDiv.style.display = "inline-block";
		textDiv.style.color = "#33ccff";
		textDiv.style.fontSize = "12px";
		textDiv.style.textAlign = "justify";
		textDiv.style.width = "55%";
		var scenarios = "";
		for (var i = 0; i < dossier.outcomes[outcome].length; i++)
			scenarios += dossier.outcomes[outcome][i] + "<br>";
		textDiv.innerHTML = scenarios;
	}
	if (!hasMedals)
		$('dossierMedals').innerHTML = "You have no medals awarded yet. <br><br>";

	//Height limited by the unit info window position and by the content height
	var pos = getPosition("unit-info");
	var height, content;
	if (isInGame)
	{
		height = Math.round((pos.top - 30) / uiSettings.uiScale);
		content = dossierDiv;
	}
	else
	{
		content = $('dossierScroll');
		height = Math.round((pos.bottom - 70) / uiSettings.uiScale);
		$('dossierCloseBut').onclick = function()
		{
			UIBuilder.closeDossier();
			if (defined(onClose))
				onClose();
		};
	}
	var last = content.childNodes[content.childNodes.length - 1];
	var contentHeight = last.offsetTop + last.offsetHeight;
	if (height > contentHeight)
		height = contentHeight;

	dossierDiv.style.marginTop = isInGame ? "0" : ((-height / 2 + 15) >> 0) + "px";
	dossierDiv.style.height = height + "px";
	return true;
};

UIBuilder.closeDossier = function()
{
	$('dossier').style.display = "none";
};

//Sets the flags image of an equipment set (Equipment.defaultName if none)
//on the stylesheets that show country flags
UIBuilder.setEquipmentFlags = function(eqp)
{
	if (!defined(eqp))
		eqp = Equipment.defaultName;

	if (UIBuilder.flagStyleSheets.length == 0)
	{
		UIBuilder.flagStyleSheets.push(getStyleSheet("#eqSelCountry"));
		UIBuilder.flagStyleSheets.push(getStyleSheet(".playerCountry"));
		UIBuilder.flagStyleSheets.push(getStyleSheet(".uSmallFlag"));
	}
	for (var i = 0; i < UIBuilder.flagStyleSheets.length; i++)
		UIBuilder.flagStyleSheets[i].backgroundImage = "url('../resources/ui/flags/" + eqp + "/flags_med.png')";
};

//In deploy mode the status bar shows the units/equipment buttons and the weather
//message opens the combat log, otherwise the status bar opens the combat log
UIBuilder.setDeployOrCombatLogState = function(isDeploy)
{
	if (isDeploy)
	{
		makeHidden('combatLogButton');
		makeVisible('statusBarButton');
		makeVisible('unitsBarButton');
		$('statusbar').onclick = null;
		$('weathermsg').onclick = $('combatLogButton').onclick;
	}
	else
	{
		$('statusbar').onclick = $('combatLogButton').onclick;
		$('weathermsg').onclick = null;
		makeHidden('statusBarButton');
		makeHidden('unitsBarButton');
		makeVisible('combatLogButton');
	}
};

//------------------------ MODULE END ----------------------
return UIBuilder; }(UIBuilder || {})); //Module end giberish

//Mouse drag state
var curDown = false, curYPos = 0, curXPos = 0;
