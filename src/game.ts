/**
 * Game - main game object
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

import {
	actionType, type Cell, DEBUG_AI_MOVES, endGameLossText, endGameType, outcomeNames, playerType,
	uiSettings
} from "./prototypes";
import { GameState, type GameStateConstructor } from "./gamestate";
import { CombatLog } from "./combatlog";
import { defined } from "./dom";
import { AI, type AIAction, type AIConstructor } from "./ai";
import { AIScripted } from "./aiscripted";
import { GameRules } from "./gamerules";
import type { Unit } from "./unit";
import { type GameMap, Player } from "./map";
import { Scenario, type ScenarioOutcome } from "./scenario";
import { Campaign, type CampaignScenario } from "./campaign";
import { UIBuilder } from "./uibuilder";
import { UI } from "./ui";
import { OSGlue } from "./osglue";

//Game keeps the campaign progress in its closure, its methods are assigned in the constructor.
//It stays a function: "var game = new Game()" runs before the declaration, which a class
//(not hoisted) can't do
export interface Game
{
	ui: UI;
	state: GameState;
	campaign: Campaign;
	scenario: Scenario;
	gameStarted: boolean;
	gameEnded: boolean;
	waitUIAnimation: boolean;
	spotSide: number;
	uiMessageClicked: boolean;
	loop: number;
	init(): void;
	processTurn(): void;
	startTurn(): void;
	processAIActions(): void;
	endTurn(): void;
	setupGameState(): void;
	newScenario(scenFile: string, scenIntro?: string): void;
	onScenarioLoadFinished(scenIntro: string | null, isRestore: boolean): false | void;
	newCampaign(campIndex: number, difficulty: number): void;
	onCampaignLoadFinished(): void;
	continueCampaign(outcomeType: ScenarioOutcome, endType?: string): void; //endType: an endGameType value
	getCampaignPlayer(): Player | null;
	setCurrentSide(): void;
	deployReinforcements(turn: number, playerId: number): boolean;
	cleanup(): void;
}

//Game, GameState, Scenario, Campaign, UI and AIScripted are constructor functions, not classes:
//these give `new` on them a type (AIConstructor is ai.ts's)
export interface GameConstructor { new (): Game; }
export interface ScenarioConstructor { new (scenFile: string): Scenario; }
export interface CampaignConstructor { new (campIndex: number, difficulty: number, onLoaded: () => void): Campaign; }
export interface UIConstructor { new (game: Game): UI; }
export interface AIScriptedConstructor { new (player: Player, map: GameMap): AIScripted; }

export var game: Game = new (Game as unknown as GameConstructor)();

export function Game(this: Game)
{
	this.ui = null;
	this.state = null;
	this.campaign = null;
	this.scenario = null;

	this.gameStarted = false; //Game not yet fully initialised
	this.gameEnded = false; //Game ended in victory or defeat
	this.waitUIAnimation = false; //Wait for animation to finish before processing next AI action
	this.spotSide = -1; //currently visible side on map
	this.uiMessageClicked = false; //set to true when user clicks ok on uiMessage window //TODO change to event

	var localPlayingSide = -1; //Which player side plays locally on this computer
	var campaignPlayer: Player = null; //Player that plays campaign locally
	var savedPlayer: Player = null; //Saved copy of the campaign player used between campaign scenarios
	var needScenarioLoad = false; //If a new scenario should be loaded during campaign progress
	var scenData: CampaignScenario = null; //campaign scenario data passed for delayed load during campaign progress
	var shouldRemoveNonCampaignUnits = false; //If we should remove scenario only units from campaign scenarios
	var shouldAwardPrototype = false; //A brilliant victory awards a prototype unit in the next scenario
	var isCampaignStart = false; //First scenario of a campaign: set prestige, dossier and core units

	//Restores the last saved game, or starts the default scenario if there is none
	this.init = function()
	{
		this.state = new (GameState as unknown as GameStateConstructor)(this);
		this.state.restore(this.onScenarioLoadFinished.bind(this, null, true),
			this.newScenario.bind(this, "failRestore"));
	}

	//Called every second by this.loop. Uses the global game, not this
	this.processTurn = function()
	{
		if (!game.gameStarted || game.gameEnded)
			return;
		if (scenData !== null && needScenarioLoad && game.uiMessageClicked) //Load next scenario in campaign chain
		{
			game.newScenario(scenData.scenario, scenData.intro);
		}
		else
		{
			var player = game.scenario.map.currentPlayer;
			//No current player also goes on to process AI actions
			if (!player || player.type == playerType.aiLocal || player.type == playerType.aiScripted)
			{
				if (!game.waitUIAnimation && game.uiMessageClicked)
					game.processAIActions();
			}
		}
	}

	this.startTurn = function() {}

	this.processAIActions = function()
	{
		var action = this.scenario.map.currentPlayer.handler.getAction();

		if (!processAction(this, action))
		{
			UIBuilder.showAIStatus(false);
			game.waitUIAnimation = true;
			game.endTurn();
			setTimeout(function()
			{
				if (!game.gameEnded)
					game.ui.uiEndTurnInfo();
			}, 2500);
		}
	}

	this.endTurn = function()
	{
		var lastSide = this.scenario.map.currentPlayer.side;

		this.waitUIAnimation = false;
		this.scenario.endTurn();

		//Check if game ended in defeat only for human players
		if (this.scenario.checkDefeat(lastSide, localPlayingSide))
		{
			//If in a compaign set the campaign outcome to lost and get next available scenario
			if (this.campaign !== null)
				this.continueCampaign("lose", endGameType.noTurnsLeft);
			else //If single scenario game has ended
				this.gameEnded = true;
		}
		else
		{
			this.state.save();
			if (this.campaign !== null) //Save campaign to remove deployed units from saved list
				game.state.saveCampaign();

			//Set the new visible side on map
			this.setCurrentSide();
			this.deployReinforcements(this.scenario.map.turn, this.scenario.map.currentPlayer.id);
		}
	}

	this.loop = window.setInterval(this.processTurn, 1000); //window.: the browser's, a number (the tests also see Node's)

	//Called by GameState after a game was restored from a save (local, file or cloud)
	this.setupGameState = function()
	{
		savedPlayer = null;
		setupPlayers(this);
		localPlayingSide = getLocalSide(this.scenario.map.getPlayers());
		this.setCurrentSide();

		this.gameStarted = true;
		needScenarioLoad = this.gameEnded = false;

		if (this.campaign !== null)
			this.state.saveCampaign();

		this.state.save();
		this.ui.setNewScenario();
	}

	//scenFile "failRestore" is passed when restoring the last save failed at startup
	this.newScenario = function(scenFile: string, scenIntro?: string)
	{
		if (scenFile === "failRestore")
		{
			for (var i = 0; i < uiSettings.isAI.length; i++)
				uiSettings.isAI[i] = Game.defaultScenarioAI[i];
			scenFile = Game.defaultScenario;
		}

		this.cleanup();

		this.scenario = new (Scenario as unknown as ScenarioConstructor)(scenFile);
		this.scenario.load(this.onScenarioLoadFinished.bind(this, scenIntro, false));
	}

	//isRestore is true when the scenario came from a saved game
	this.onScenarioLoadFinished = function(scenIntro: string | null, isRestore: boolean)
	{
		if (!this.scenario.isLoaded)
		{
			UIBuilder.messageDynamic("Error", "Error Loading scenario " + this.scenario.file);
			game.gameEnded = true;
			return false;
		}

		if (defined(scenIntro)) this.scenario.setDescription(scenIntro); //Set from campaign

		setupPlayers(this);
		var players = this.scenario.map.getPlayers();
		localPlayingSide = getLocalSide(players);
		this.setCurrentSide();

		this.waitUIAnimation = false;
		this.gameStarted = true;
		needScenarioLoad = this.gameEnded = false;

		if (this.campaign !== null)
		{
			if (isCampaignStart) //Only for first scenario
			{
				campaignPlayer.prestige = this.campaign.startprestige;
				campaignPlayer.initDossier();
				this.scenario.map.buildCoreUnitList(campaignPlayer);
			}
			if (shouldRemoveNonCampaignUnits)
				this.scenario.map.removeNonCampaignUnits(campaignPlayer);
			if (shouldAwardPrototype)
			{
				var protoId = this.scenario.getRandomPrototype(campaignPlayer.country + 1);
				if (typeof protoId !== "undefined" && protoId > 0)
				{
					campaignPlayer.acquireUnit(protoId, 0);
					shouldAwardPrototype = false;
					UIBuilder.showPrototypeAwardMessage(protoId);
				}
			}
			this.state.saveCampaign(); //Save progression between scenario loading delays in campaign
		}
		else
		{
			this.scenario.showStatistics();
			//New single scenarios balance players prestige, the tutorial keeps its own
			if (!isRestore && this.scenario.file !== "tutorial.xml")
			{
				for (var i = 0; i < players.length; i++)
				{
					var p = players[i];
					p.prestige = this.scenario.getBalancedPrestige(p.side);
				}
			}
		}

		this.state.save();

		if (this.ui)
		{
			this.ui.setNewScenario();
		}
		else //First scenario after startup
		{
			this.ui = new (UI as unknown as UIConstructor)(this);
			this.ui.mainMenuButton("options"); //Bring up the "Main Menu"
		}
	}

	this.newCampaign = function(campIndex: number, difficulty: number)
	{
		this.campaign = new (Campaign as unknown as CampaignConstructor)(campIndex, difficulty, this.onCampaignLoadFinished.bind(this));
	}

	this.onCampaignLoadFinished = function()
	{
		savedPlayer = null;
		shouldRemoveNonCampaignUnits = false; //For first scenario is not needed
		isCampaignStart = true;

		//Start the first scenario
		var scenData = this.campaign.getCurrentScenario(); //local, shadows the delayed load scenData
		this.newScenario(scenData.scenario, scenData.intro);
	}

	//endType (endGameType) is only given on a loss, it picks the loss reason text
	this.continueCampaign = function(outcomeType: ScenarioOutcome, endType?: string)
	{
		//Add prestige for finishing scenario
		campaignPlayer.prestige += this.campaign.getOutcomePrestige(outcomeType);
		campaignPlayer.addOutcomeToDossier(outcomeType, this.scenario.name);
		OSGlue.reportScore(campaignPlayer.score);
		campaignPlayer.setPlayerToHQ(); //reset player and it's core units
		//Save campaign player //TODO delete/new ?
		savedPlayer.supportCountries = [];
		savedPlayer.prestigePerTurn = [];
		savedPlayer.copy(campaignPlayer);
		shouldRemoveNonCampaignUnits = true;
		isCampaignStart = false;

		var outcomeText = this.campaign.getOutcomeText(outcomeType);
		scenData = this.campaign.loadNextScenario(outcomeType);
		if (scenData == null)
		{
			if (outcomeType == "lose")
				outcomeText = endGameLossText[endType] + outcomeText;
			UIBuilder.showCampaignEnd(outcomeType, outcomeText, function() { game.ui.mainMenuButton("options"); });
			this.gameEnded = true;
			this.gameStarted = false;
			if (outcomeType != "lose")
				OSGlue.reportAchievement(this.campaign.file);
		}
		else
		{
			UIBuilder.message(outcomeNames[outcomeType], outcomeText);
			needScenarioLoad = true; //Wait for user to click to continue to next scenario
			if (outcomeType == "briliant")
				shouldAwardPrototype = true;
		}
	}

	//TODO move to Campaign object
	this.getCampaignPlayer = function()
	{
		if (this.campaign !== null)
			return campaignPlayer;

		return null;
	}

	this.setCurrentSide = function()
	{
		if (localPlayingSide == 2) //Both sides are playing locally in HotSeat mode
			this.spotSide = this.scenario.map.currentPlayer.side;
		else
			this.spotSide = localPlayingSide;
	}

	//Deploys the reinforcements of player playerId for this turn, returns false if there are none
	this.deployReinforcements = function(turn: number, playerId: number)
	{
		var deployed = false;
		var reinforcements = this.scenario.getReinforcements(turn, playerId);

		if (reinforcements.length <= 0)
			return false;

		for (var i = 0; i < reinforcements.length; i++)
		{
			var cell: Cell = null;
			if ((cell = this.scenario.map.deployReinforcement(reinforcements[i].unit,
				reinforcements[i].row, reinforcements[i].col)) !== null)
			{
				deployed = true;
				CombatLog.addReinforcement(reinforcements[i].unit);
				this.scenario.removeReinforcement(reinforcements[i].turn, reinforcements[i].id);
				if (this.scenario.map.map[cell.row][cell.col].isSpotted(this.spotSide))
				{
					var side = this.scenario.map.getPlayer(playerId).side;
					var isOwn = false;
					if (this.spotSide == side)
						isOwn = true;
					this.ui.showAlert(cell.row, cell.col, "Reinforced!", isOwn);
				}
			}
		}
		if (deployed)
			game.ui.handleReinforcementDeployment();

		return true; //also when none of them could be deployed
	}

	this.cleanup = function()
	{
		this.state.clear();

		//Cleanup old state
		if (this.scenario && this.scenario.map !== null)
		{
			this.scenario.map.cleanup();
			delete(this.scenario.map);
			this.scenario.map = null;
		}
		delete(this.scenario);
		this.scenario = null;
	}

	//Set AI, Network or campaign for players. Local player is the default value
	function setupPlayers(game: Game)
	{
		var i;
		var players = game.scenario.map.getPlayers();

		if (players === null)
			return false;
		for (i = 0; i < players.length; i++)
		{
			if (game.campaign !== null) //Campaign mode
			{
				//Assign AI players if not campaign playing country
				if (players[i].country != game.campaign.country)
				{
					players[i].type = playerType.aiLocal;
					players[i].handler = new (AI as unknown as AIConstructor)(players[i], game.scenario.map);
				}
				else //Copy or load the local player for campaign progress (should be only 1 or hell breaks lose see copy)
				{
					campaignPlayer = players[i]; //save a reference

					if (savedPlayer === null) //Campaign just started save player from scenario settings
					{
						savedPlayer = new Player();
						savedPlayer.copy(players[i]);
					}
					else //Campaign in progress restore saved instance
					{
						players[i].copy(savedPlayer, true);
					}
				}
			}
			else //Scenario mode: isAI 1 is the AI, 2 the scripted AI, or as the scenario/save says
			{
				if (uiSettings.isAI[players[i].id] == 1 || players[i].type == playerType.aiLocal)
				{
					players[i].type = playerType.aiLocal;
					players[i].handler = new (AI as unknown as AIConstructor)(players[i], game.scenario.map);
				}
				else if (uiSettings.isAI[players[i].id] == 2 || players[i].type == playerType.aiScripted)
				{
					players[i].type = playerType.aiScripted;
					players[i].handler = new (AIScripted as unknown as AIScriptedConstructor)(players[i], game.scenario.map);
				}
			}
		}
		return true;
	}

	//Plays an AI action on the UI, returns false when the AI turn should end
	function processAction(game: Game, action: AIAction)
	{
		if (!action) return false;
		var p = action.param;
		if (!p) return false;
		switch(action.type)
		{
			case actionType.move:
			{
				game.scenario.map.setMoveRange(p[0] as Unit); //The selection (hashed, saved), the move finds its own path
				game.waitUIAnimation = true;
				if (game.ui.uiUnitMove(p[0] as Unit, (p[1] as Cell).row, (p[1] as Cell).col))
					game.ui.uiSetUnitOnViewPort(p[0] as Unit);
				else
					game.waitUIAnimation = false;
				break;
			}
			case actionType.attack:
			{
				game.waitUIAnimation = true;
				if (GameRules.isInAttackRange(p[0] as Unit, p[1] as Unit) && game.ui.uiUnitAttack(p[0] as Unit, p[1] as Unit))
					game.ui.uiSetUnitOnViewPort(p[0] as Unit);
				else
					game.waitUIAnimation = false;
				break;
			}
			case actionType.resupply:
			{
				game.scenario.map.resupplyUnit(p[0] as Unit);
				break;
			}
			case actionType.reinforce:
			{
				game.scenario.map.reinforceUnit(p[0] as Unit, false);
				break;
			}
			case actionType.mount:
			{
				game.scenario.map.mountUnit(p[0] as Unit);
				break;
			}
			case actionType.umount:
			{
				game.scenario.map.unmountUnit(p[0] as Unit);
				break;
			}
			case actionType.upgrade:
			{
				break;
			}
			case actionType.buy:
			{
				break;
			}
			case actionType.deploy:
			{
				break;
			}
			case actionType.select:
			{
				game.ui.uiSetUnitOnViewPort(p[0] as Unit);
				game.ui.uiUnitSelect(p[0] as Unit);
				break;
			}
			case actionType.endturn:
			{
				return false;
			}
			case actionType.message:
			{
				game.waitUIAnimation = true;
				game.ui.showGameToolTip(p[0] as string, (p[1] as Cell).row, (p[1] as Cell).col);
				game.ui.uiSetCellOnViewPort(p[1] as Cell);
				break;
			}
			case actionType.viewport:
			{
				game.ui.uiSetCellOnViewPort(p[0] as Cell);
				break;
			}
			default:
			{
				return false;
			}
		}
		return true;
	}

	//Returns which sides are played by players on this computer
	//will return -1 no local sides, 0 side 0, 1 side 1, 2 both sides
	//are playing on local computer (hotseat mode). Scripted AI sides count as local
	function getLocalSide(playerList: Player[])
	{
		var nrSides = 1;
		var localSide = -1;
		for (var i = 0; i < playerList.length; i++)
		{
			if (playerList[i].type == playerType.humanLocal || playerList[i].type == playerType.aiScripted)
			{
				if (localSide != -1 && localSide != playerList[i].side)
					nrSides++; //We already found a local playing side
				localSide = playerList[i].side;
			}
		}

		if (nrSides > 1)
			localSide = 2;
		if (DEBUG_AI_MOVES)
			localSide = 2;

		return localSide;
	}
}

Game.defaultScenario = "tutorial.xml";
Game.defaultScenarioAI = [0, 1, 0, 0]; //uiSettings.isAI for the default scenario

export function gameStart()
{
	game.init();
}

window.addEventListener("load", gameStart);
