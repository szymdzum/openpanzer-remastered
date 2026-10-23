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

import { difficultyModifiers } from "./prototypes";
import { Scenario, type ScenarioOutcome } from "./scenario";

//One scenario of a campaign data file (resources/campaigns/data/*.json)
export interface CampaignScenario {
	id: number;
	intro: string;
	scenario: string; //scenario file name, without path
	startprestige: number;
	outcome: { [outcomeType in ScenarioOutcome]: CampaignOutcome };
}

//goto is the next campaign scenario id, 254 and 255 end the campaign
export interface CampaignOutcome {
	goto: number;
	gotoplayed: number[];
	prestige: number;
	text: string;
}

//Loads the campaign data asynchronously, calls onLoaded when done (also on failure).
//A class with its closure body as the constructor: the methods are own properties, as the original
export class Campaign {
	declare static findCampaignByFile: (file: string) => number;

	declare startprestige: number;
	declare name: string;
	declare country: number;
	declare file: string;
	declare id: number;
	declare difficulty: number;
	declare isLoaded: boolean;
	declare setScenarioById: (scenarioID: number) => void;
	declare setScenarioByName: (scenarioName: string) => boolean;
	declare getCurrentScenario: () => CampaignScenario;
	declare loadNextScenario: (outcomeType: ScenarioOutcome) => CampaignScenario;
	declare getOutcomeText: (outcomeType: ScenarioOutcome) => string;
	declare getCampaignFlow: () => string;
	declare getScenarioNameFromId: (id: number) => string;
	declare getCampaignData: () => CampaignScenario[];

	constructor(campIndex: number, difficulty: number, onLoaded: () => void) {
		const campaignInfo = campaignlist[campIndex];

		this.startprestige = (campaignInfo.prestige +
			difficultyModifiers[difficulty].startPrestige * campaignInfo.prestige) >> 0;
		this.name = campaignInfo.title;
		this.country = campaignInfo.flag;
		this.file = campaignInfo.file; //Used as "id" for report score facility
		this.id = campIndex;
		this.difficulty = difficulty;

		var currentScenario = 0;
		var campaignData: CampaignScenario[] = null;
		var campaignPath = "resources/campaigns/data/";

		this.isLoaded = false;

		loadCampaign(campaignInfo.file, onLoaded);

		this.setScenarioById = function(scenarioID: number) {
			if (scenarioID < campaignData.length)
				currentScenario = scenarioID;
		}

		//Lookup scenario name in the campaignData and set currentScenario
		this.setScenarioByName = function(scenarioName: string) {
			let i;
			const hasPath = scenarioName.lastIndexOf('/');
			//strip path
			if (hasPath > -1)
				scenarioName = scenarioName.substring(hasPath + 1);

			for (i = 0; i < campaignData.length; i++) {
				if (campaignData[i].scenario === scenarioName) {
					currentScenario = i;
					return true;
				}
			}

			return false;
		}

		this.getCurrentScenario = function() {
			return campaignData[currentScenario];
		}

		this.loadNextScenario = function(outcomeType: ScenarioOutcome) {
			const o = getOutcome(outcomeType);
			if (o.goto < campaignData.length) {
				currentScenario = o.goto;
				return campaignData[o.goto];
			} else
				return null;
		}

		this.getOutcomeText = function(outcomeType: ScenarioOutcome) {
			const o = getOutcome(outcomeType);
			return o.text || "Continue to the next phase.";
		}

		this.getCampaignFlow = function() {
			let flowText = "";
			const l = "<br/>";
			const t = "&nbsp;&nbsp;&nbsp;&nbsp;";

			for (let i = 0; i < campaignData.length; i++) {
				const currentScenName = this.getScenarioNameFromId(i);
				const lScenName = this.getScenarioNameFromId(campaignData[i].outcome["lose"].goto);
				const tScenName = this.getScenarioNameFromId(campaignData[i].outcome["tactical"].goto);
				const vScenName = this.getScenarioNameFromId(campaignData[i].outcome["victory"].goto);
				const bScenName = this.getScenarioNameFromId(campaignData[i].outcome["briliant"].goto);

				if (tScenName == vScenName && vScenName == bScenName) {
					flowText += "- <b>" + currentScenName + "</b>" + l + t + "Lose: " + lScenName + l + t +
						"Victory: " + tScenName + l + l;
				} else {
					flowText += "- <b>" + currentScenName + "</b>" + l + t + "Lose: " + lScenName + l + t +
						"Tactical: " + tScenName + l + t + "Victory: " + vScenName + l + t + "Brilliant: " + bScenName + l + l;
				}
			}
			return flowText;
		}

		//Scenario name for a campaign scenario id, 255 and 254 are the campaign end outcomes
		this.getScenarioNameFromId = function(id: number) {
			if (id == 255)
				return "Defeat (End Campaign)";
			if (id == 254)
				return "Victory (End Campaign)";
			return Scenario.getScenarioDataByFileName(campaignData[id].scenario)[1];
		}

		this.getCampaignData = function() {
			return campaignData;
		}

		//Private methods
		function getOutcome(outcomeType: ScenarioOutcome) {
			return campaignData[currentScenario].outcome[outcomeType];
		}

		function loadCampaign(jsonFile: string, onFinished: () => void): void {
			if (jsonFile == null || typeof jsonFile === "undefined")
				return null;

			const req = new XMLHttpRequest();
			const onSuccess = function() {
				campaignData = JSON.parse(req.responseText);
				//Bug kept from the bundle: called as a plain function, so this was the
				//global object and the campaign isLoaded stays false (a module is strict, this
				//would be undefined: the global object is named). #27, kept: the harness traces
				//compare campaign.isLoaded with the reference's
				(window as Window & { isLoaded?: boolean }).isLoaded = true;
				onFinished();
			};
			req.onload = function() {
				if (req.readyState === 4) {
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
}

//Returns the campaignlist index of the campaign with this data file or -1. Assigned after the
//class: a class isn't hoisted like the constructor function was
Campaign.findCampaignByFile = function(file: string) {
	for (let i = 0; i < campaignlist.length; i++)
		if (campaignlist[i].file === file)
			return i;
	return -1;
}
