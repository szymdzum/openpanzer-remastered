/**
 * Campaign - handles campaign related tasks
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

//Returns the campaignlist index of the campaign with this data file or -1
Campaign.findCampaignByFile = function(file)
{
	for (var i = 0; i < campaignlist.length; i++)
		if (campaignlist[i].file === file)
			return i;
	return -1;
}

//Loads the campaign data asynchronously, calls onLoaded when done (also on failure)
function Campaign(campIndex, difficulty, onLoaded)
{
	var campaignInfo = campaignlist[campIndex];

	this.startprestige = (campaignInfo.prestige +
		difficultyModifiers[difficulty].startPrestige * campaignInfo.prestige) >> 0;
	this.name = campaignInfo.title;
	this.country = campaignInfo.flag;
	this.file = campaignInfo.file; //Used as "id" for report score facility
	this.id = campIndex;
	this.difficulty = difficulty;

	var currentScenario = 0;
	var campaignData = null;
	var campaignPath = "resources/campaigns/data/";

	this.isLoaded = false;

	loadCampaign(campaignInfo.file, onLoaded);

	this.setScenarioById = function(scenarioID)
	{
		if (scenarioID < campaignData.length)
			currentScenario = scenarioID;
	}

	//Lookup scenario name in the campaignData and set currentScenario
	this.setScenarioByName = function(scenarioName)
	{
		var i;
		var hasPath = scenarioName.lastIndexOf('/');
		//strip path
		if (hasPath > -1)
			scenarioName = scenarioName.substring(hasPath + 1);

		for (i = 0; i < campaignData.length; i++)
		{
			if (campaignData[i].scenario === scenarioName)
			{
				currentScenario = i;
				return true;
			}
		}

		return false;
	}

	this.getCurrentScenario = function()
	{
		return campaignData[currentScenario];
	}

	this.loadNextScenario = function(outcomeType)
	{
		var o = getOutcome(outcomeType);
		if (o.goto < campaignData.length)
		{
			currentScenario = o.goto;
			return campaignData[o.goto];
		}
		else
			return null;
	}

	this.getOutcomePrestige = function(outcomeType)
	{
		var o = getOutcome(outcomeType);
		return o.prestige;
	}

	this.getOutcomeText = function(outcomeType)
	{
		var o = getOutcome(outcomeType);
		return o.text || "Continue to the next phase.";
	}

	this.getCampaignFlow = function()
	{
		var flowText = "";
		var l = "<br/>";
		var t = "&nbsp;&nbsp;&nbsp;&nbsp;";

		for (var i = 0; i < campaignData.length; i++)
		{
			var currentScenName = this.getScenarioNameFromId(i);
			var lScenName = this.getScenarioNameFromId(campaignData[i].outcome["lose"].goto);
			var tScenName = this.getScenarioNameFromId(campaignData[i].outcome["tactical"].goto);
			var vScenName = this.getScenarioNameFromId(campaignData[i].outcome["victory"].goto);
			var bScenName = this.getScenarioNameFromId(campaignData[i].outcome["briliant"].goto);

			if (tScenName == vScenName && vScenName == bScenName)
			{
				flowText += "- <b>" + currentScenName + "</b>" + l + t + "Lose: " + lScenName + l + t +
					"Victory: " + tScenName + l + l;
			}
			else
			{
				flowText += "- <b>" + currentScenName + "</b>" + l + t + "Lose: " + lScenName + l + t +
					"Tactical: " + tScenName + l + t + "Victory: " + vScenName + l + t + "Brilliant: " + bScenName + l + l;
			}
		}
		return flowText;
	}

	//Scenario name for a campaign scenario id, 255 and 254 are the campaign end outcomes
	this.getScenarioNameFromId = function(id)
	{
		if (id == 255)
			return "Defeat (End Campaign)";
		if (id == 254)
			return "Victory (End Campaign)";
		return Scenario.getScenarioDataByFileName(campaignData[id].scenario)[1];
	}

	this.getCampaignData = function()
	{
		return campaignData;
	}

	//Private methods
	function getOutcome(outcomeType)
	{
		return campaignData[currentScenario].outcome[outcomeType];
	}

	function loadCampaign(jsonFile, onFinished)
	{
		if (jsonFile == null || typeof jsonFile === "undefined")
			return null;

		var req = new XMLHttpRequest();
		var onSuccess = function()
		{
			campaignData = JSON.parse(req.responseText);
			//Bug kept from the bundle: called as a plain function, so this is the
			//global object and the campaign isLoaded stays false
			this.isLoaded = true;
			onFinished();
		};
		req.onload = function()
		{
			if (req.readyState === 4)
			{
				if (req.status === 200 || req.status === 0)
					onSuccess();
				else
					onFinished();
			}
		};
		req.open("GET", campaignPath + jsonFile, true);
		req.send(null);
	}
}
