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
	actionType, type Cell, DEBUG_AI_MOVES, DEFAULT_SCENARIO, endGameLossText, endGameType, outcomeNames, playerType,
	uiSettings
} from "./prototypes";
import { GameState } from "./gamestate";
import { defined } from "./dom";
import { AI, type AIAction } from "./ai";
import { AIScripted } from "./aiscripted";
import type { Unit } from "./unit";
import { GameMap, Player } from "./map";
import { Scenario, type ScenarioOutcome } from "./scenario";
import { Campaign, type CampaignScenario } from "./campaign";
import { UIBuilder } from "./uibuilder";
import { UI } from "./ui";
import { OSGlue } from "./osglue";
import { Commands } from "./commands";
import { GameRules } from "./gamerules";
import { coreDriver, endGameTurn, removeDestroyed, startGameSession } from "./coresession";
import { buildOnCore, carriedCountries, carryPlayer, prototypeAwarded } from "./coreload";
import { applyData, rulesWorld, worldOf } from "./mirror";
import { ScenarioLoader } from "./scenarioloader";
import { endCampaignScenario, scenarioEnded } from "./core/campaign";
import type { Session } from "./core/session";
import { setEngineContext, touched } from "./context";
import { game, setGame } from "./session";
import type { CampaignProgress } from "./state";

//UI is a constructor function, not a class: this gives `new` on it a type
export interface UIConstructor { new (game: Game): UI; }

//Game keeps the campaign progress in its closure: the constructor's body sets up the methods,
//typed as declare fields (docs/TYPES.md rule 3). A class isn't hoisted: the game is made after it
export class Game {
	declare ui: UI;
	declare state: GameState;
	declare campaign: Campaign;
	declare scenario: Scenario;
	declare gameStarted: boolean;
	declare gameEnded: boolean;
	declare waitUIAnimation: boolean;
	declare spotSide: number;
	declare uiMessageClicked: boolean;
	declare loop: number;
	declare session: Session | null; //the core's session the game plays on (src/coresession.ts), null before a scenario
	declare init: () => void;
	declare processTurn: () => void;
	declare startTurn: () => void;
	declare processAIActions: () => void;
	declare endTurn: () => void;
	declare setupGameState: () => void;
	declare newScenario: (scenFile: string, scenIntro?: string) => void;
	declare onScenarioLoadFinished: (scenIntro: string | null, isRestore: boolean) => void;
	declare newCampaign: (campIndex: number, difficulty: number) => void;
	declare onCampaignLoadFinished: () => void;
	declare continueCampaign: (outcomeType: ScenarioOutcome, endType?: string) => void; //endType: an endGameType value
	declare getCampaignPlayer: () => Player | null;
	declare getCampaignProgress: () => CampaignProgress;
	declare setCampaignProgress: (progress: CampaignProgress, scenario: Scenario) => void;
	declare setCurrentSide: () => void;
	declare cleanup: (keepSave?: boolean) => void;

	declare static defaultScenario: string;
	declare static defaultScenarioAI: number[];

	constructor() {
		this.ui = null;
		this.state = null;
		this.campaign = null;
		this.scenario = null;

		this.gameStarted = false; //Game not yet fully initialised
		this.gameEnded = false; //Game ended in victory or defeat
		this.waitUIAnimation = false; //Wait for animation to finish before processing next AI action
		this.spotSide = -1; //currently visible side on map
		this.uiMessageClicked = false; //set to true when user clicks ok on uiMessage window //TODO change to event

		let localPlayingSide = -1; //Which player side plays locally on this computer
		var campaignPlayer: Player = null; //Player that plays campaign locally
		var savedPlayer: Player = null; //Saved copy of the campaign player used between campaign scenarios
		let needScenarioLoad = false; //If a new scenario should be loaded during campaign progress
		let nextScenarioLoading = false; //The campaign's next scenario asked for and loading (#64)
		let scenData: CampaignScenario = null; //campaign scenario data passed for delayed load during campaign progress
		let shouldRemoveNonCampaignUnits = false; //If we should remove scenario only units from campaign scenarios
		let shouldAwardPrototype = false; //A brilliant victory awards a prototype unit in the next scenario
		let isCampaignStart = false; //First scenario of a campaign: set prestige, dossier and core units

		//Restores the last saved game, or starts the default scenario if there is none
		this.init = function() {
			this.state = new GameState(this);
			this.state.restore(this.onScenarioLoadFinished.bind(this, null, true),
				this.newScenario.bind(this, "failRestore"));
		}

		//Called every tick of this.loop (src/main.ts). Uses the global game, not this
		this.processTurn = function() {
			if (!game.gameStarted || game.gameEnded)
				return;
			if (scenData !== null && needScenarioLoad && game.uiMessageClicked) //Load next scenario in campaign chain
				loadNextScenario();
			else if (aiPlays(game.scenario.map.currentPlayer) && !game.waitUIAnimation && game.uiMessageClicked)
				game.processAIActions();
		}

		//Asked once: the ticks while it loads would start it over through the loader's shared scenario,
		//each load adding the players again (#64)
		function loadNextScenario() {
			if (nextScenarioLoading)
				return;
			nextScenarioLoading = true;
			game.newScenario(scenData.scenario, scenData.intro);
		}

		//No current player also goes on to process AI actions
		function aiPlays(player: Player | null) {
			return !player || player.type == playerType.aiLocal || player.type == playerType.aiScripted;
		}

		this.startTurn = function() {}

		//The actions the screen doesn't animate play on in the same tick: the AI's turn waits only for what
		//the player watches, a unit picked, moving or attacking, a message (#8)
		const unanimated = [actionType.resupply, actionType.reinforce, actionType.upgrade, actionType.buy,
			actionType.deploy, actionType.mount, actionType.umount];

		this.processAIActions = function() {
			let action: AIAction;
			do {
				action = this.scenario.map.currentPlayer.handler.getAction();
				if (!processAction(this, action)) {
					UIBuilder.showAIStatus(false);
					game.waitUIAnimation = true;
					game.endTurn();
					setTimeout(function() {
						if (!game.gameEnded)
							game.ui.uiEndTurnInfo();
					}, 2500);
					return;
				}
			} while (unanimated.includes(action.type));
		}

		//The turn ends on the session (src/coresession.ts): the next player's turn start, the save, the side
		//shown, the reinforcements; or the defeat at the turn limit, only for a side that plays here
		this.endTurn = function() {
			this.waitUIAnimation = false;
			if (endGameTurn(this)) defeated(this);
		}

		//The side that ended its turn lost at the turn limit (only a side that plays on this screen): in a
		//campaign the outcome is lost and the next scenario follows, a single scenario ends
		function defeated(game: Game) {
			if (game.campaign !== null)
				game.continueCampaign("lose", endGameType.noTurnsLeft);
			else
				game.gameEnded = true;
		}

		this.loop = 0; //the turn loop's interval: src/main.ts starts it, not the module's loading
		this.session = null;

		//Called by GameState after a game was restored from a save (local, file or cloud)
		this.setupGameState = function() {
			savedPlayer = null;
			this.session = null;
			setupPlayers(this, true);
			localPlayingSide = getLocalSide(this.scenario.map.getPlayers());
			this.setCurrentSide();
			startGameSession(this, true, localPlayingSide);

			this.gameStarted = true;
			needScenarioLoad = nextScenarioLoading = this.gameEnded = false;

			this.state.save();
			this.ui.setNewScenario();
		}

		//scenFile "failRestore" is passed when restoring the last save failed at startup
		this.newScenario = function(scenFile: string, scenIntro?: string) {
			if (scenFile === "failRestore") {
				for (let i = 0; i < uiSettings.isAI.length; i++)
					uiSettings.isAI[i] = Game.defaultScenarioAI[i];
				scenFile = Game.defaultScenario;
			}

			//(a campaign's next scenario keeps the save of the one before until its own replaces it: closing
			//the game while it loads, or a load that fails, doesn't lose the campaign #64)
			this.cleanup(nextScenarioLoading);

			this.scenario = new Scenario(scenFile);
			this.scenario.load(this.onScenarioLoadFinished.bind(this, scenIntro, false));
		}

		//isRestore is true when the scenario came from a saved game
		this.onScenarioLoadFinished = function(scenIntro: string | null, isRestore: boolean) {
			if (!this.scenario.isLoaded) {
				UIBuilder.messageDynamic("Error", "Error Loading scenario " + this.scenario.file);
				game.gameEnded = true;
				return;
			}

			if (defined(scenIntro)) this.scenario.setDescription(scenIntro); //Set from campaign

			this.session = null;
			setupPlayers(this, isRestore);
			const players = this.scenario.map.getPlayers();
			localPlayingSide = getLocalSide(players);
			this.setCurrentSide();
			startGameSession(this, isRestore, localPlayingSide);

			this.waitUIAnimation = false;
			this.gameStarted = true;
			needScenarioLoad = nextScenarioLoading = this.gameEnded = false;

			//(the scenario's start gave the players their prestige and a campaign's start its player: the core's
			//newGame, src/coreload.ts)
			if (this.campaign === null)
				this.scenario.showStatistics();
			else if (!isRestore && prototypeAwarded !== null)
				UIBuilder.showPrototypeAwardMessage(prototypeAwarded);

			this.state.save();

			if (this.ui) {
				this.ui.setNewScenario();
			} else { //First scenario after startup
				this.ui = new (UI as unknown as UIConstructor)(this);
				this.ui.mainMenuButton("options"); //Bring up the "Main Menu"
			}
		}

		this.newCampaign = function(campIndex: number, difficulty: number) {
			this.campaign = new Campaign(campIndex, difficulty, this.onCampaignLoadFinished.bind(this));
		}

		this.onCampaignLoadFinished = function() {
			savedPlayer = null;
			carryPlayer(null);
			shouldRemoveNonCampaignUnits = false; //For first scenario is not needed
			isCampaignStart = true;

			//Start the first scenario
			const scenData = this.campaign.getCurrentScenario(); //local, shadows the delayed load scenData
			this.newScenario(scenData.scenario, scenData.intro);
		}

		//endType (endGameType) is only given on a loss, it picks the loss reason text
		this.continueCampaign = function(outcomeType: ScenarioOutcome, endType?: string) {
			endScenario(this, outcomeType);
			nextScenario(this, outcomeType, endType);
		}

		//The scenario's end (src/core/campaign.ts): the player carried into the next scenario, and the
		//scenario as the old game left it until the next one loads (its player sent to HQ in place)
		function endScenario(game: Game, outcomeType: ScenarioOutcome) {
			const w = worldOf(game.scenario, game, { spotSide: game.spotSide, noFOW: !!uiSettings.noFOW });
			const ended = endCampaignScenario(w, outcomeType, game.campaign.getCampaignData());
			carryPlayer(ended.player);
			OSGlue.reportScore(ended.player.score);
			game.session.world = { ...w, state: scenarioEnded(w, outcomeType, game.campaign.getCampaignData(), ended.campaign) };
			applyData(game.scenario, game.session.world, game);
			//(the saved player, which a game loaded during the campaign copies, kept #196)
			savedPlayer.supportCountries = [];
			savedPlayer.prestigePerTurn = [];
			savedPlayer.copy(campaignPlayer);
		}

		//The campaign's next scenario, or its end: the outcome told, the next one loaded when the
		//player clicks on (processTurn)
		function nextScenario(game: Game, outcomeType: ScenarioOutcome, endType?: string) {
			let outcomeText = game.campaign.getOutcomeText(outcomeType);
			scenData = game.campaign.loadNextScenario(outcomeType);
			if (scenData == null) {
				if (outcomeType == "lose")
					outcomeText = endGameLossText[endType] + outcomeText;
				UIBuilder.showCampaignEnd(outcomeType, outcomeText, function() { game.ui.mainMenuButton("options"); });
				game.gameEnded = true;
				game.gameStarted = false;
				if (outcomeType != "lose")
					OSGlue.reportAchievement(game.campaign.file);
			} else {
				UIBuilder.message(outcomeNames[outcomeType], outcomeText);
				needScenarioLoad = true; //Wait for user to click to continue to next scenario
				nextScenarioLoading = false;
				if (outcomeType == "briliant")
					shouldAwardPrototype = true;
			}
		}

		//TODO move to Campaign object
		this.getCampaignPlayer = function() {
			if (this.campaign !== null)
				return campaignPlayer;

			return null;
		}

		//The campaign's progress between scenarios, for the state (src/state.ts)
		this.getCampaignProgress = function() {
			return { isStart: isCampaignStart, removeNonCampaignUnits: shouldRemoveNonCampaignUnits,
				awardPrototype: shouldAwardPrototype };
		}
		//And back, for a scenario restored from the state: its campaign player is the last player of
		//the campaign's country, as setupPlayers links it
		this.setCampaignProgress = function(progress: CampaignProgress, scenario: Scenario) {
			isCampaignStart = progress.isStart;
			shouldRemoveNonCampaignUnits = progress.removeNonCampaignUnits;
			shouldAwardPrototype = progress.awardPrototype;
			const players = scenario.map.getPlayers();
			for (let i = 0; i < players.length; i++)
				if (this.campaign !== null && players[i].country == this.campaign.country)
					campaignPlayer = players[i];
		}

		this.setCurrentSide = function() {
			if (localPlayingSide == 2) //Both sides are playing locally in HotSeat mode
				this.spotSide = this.scenario.map.currentPlayer.side;
			else
				this.spotSide = localPlayingSide;
		}

		this.cleanup = function(keepSave = false) {
			if (!keepSave)
				this.state.clear();

			//Cleanup old state
			if (this.scenario && this.scenario.map !== null) {
				this.scenario.map.cleanup();
				delete(this.scenario.map);
				this.scenario.map = null;
			}
			delete(this.scenario);
			this.scenario = null;
			this.session = null;
		}

		//Set AI, Network or campaign for players. Local player is the default value
		function setupPlayers(game: Game, isRestore: boolean) {
			let i;
			const players = game.scenario.map.getPlayers();

			if (players === null)
				return false;
			for (i = 0; i < players.length; i++) {
				if (game.campaign !== null) { //Campaign mode
					//Assign AI players if not campaign playing country
					if (players[i].country != game.campaign.country) {
						players[i].type = playerType.aiLocal;
						players[i].handler = new AI(players[i], game.scenario.map);
					} else { //Copy or load the local player for campaign progress (should be only 1 or hell breaks lose see copy)
						campaignPlayer = players[i]; //save a reference
						carryCampaignPlayer(players[i], isRestore);
					}
				} else { //Scenario mode: isAI 1 is the AI, 2 the scripted AI, or as the scenario/save says
					if (uiSettings.isAI[players[i].id] == 1 || players[i].type == playerType.aiLocal) {
						players[i].type = playerType.aiLocal;
						players[i].handler = new AI(players[i], game.scenario.map);
					} else if (uiSettings.isAI[players[i].id] == 2 || players[i].type == playerType.aiScripted) {
						players[i].type = playerType.aiScripted;
						players[i].handler = new AIScripted(players[i], game.scenario.map);
					}
				}
			}
			touched(); //(the players' types, a campaign player carried)
			return true;
		}

		//The campaign player: the scenario's start carried it already (src/coreload.ts). Saved when the
		//campaign starts, as the file had it before the campaign's start; a load during the campaign copies
		//the saved one over it (kept #196)
		function carryCampaignPlayer(p: Player, isRestore: boolean) {
			const started = !isRestore;
			if (savedPlayer === null) { //Campaign just started save player from scenario settings
				savedPlayer = new Player();
				savedPlayer.copy(p);
				if (started) {
					savedPlayer.prestige = p.prestigePerTurn[0];
					savedPlayer.dossier = {};
					savedPlayer.getCoreUnitList().length = 0;
				}
			} else if (!started) { //Campaign in progress restore saved instance (also on a load, kept #196)
				p.copy(savedPlayer, true);
			}
		}

		//An AI action's unit as a command's: the scripted tutorial can queue no unit (#80), which the
		//command refuses where the engine threw
		function unitId(unit: Unit | null) {
			return unit ? unit.id : -1;
		}

		//Plays an AI action on the UI as the player's commands (the move and the attack through the UI's
		//uiUnitMove and uiUnitAttack, animated), returns false when the AI turn should end
		function processAction(game: Game, action: AIAction) {
			if (!action) return false;
			const p = action.param;
			if (!p) return false;
			switch(action.type) {
				case actionType.move: {
					//The selection (hashed, saved); the move takes its path from that same range
					game.scenario.map.setMoveRange(p[0] as Unit);
					game.waitUIAnimation = true;
					if (game.ui.uiUnitMove(p[0] as Unit, (p[1] as Cell).row, (p[1] as Cell).col, game.scenario.map.getCurrentMoveRange()))
						game.ui.uiSetUnitOnViewPort(p[0] as Unit);
					else
						game.waitUIAnimation = false;
					break;
				}
				case actionType.attack: {
					game.waitUIAnimation = true;
					if (GameRules.isInAttackRange(p[0] as Unit, p[1] as Unit) && game.ui.uiUnitAttack(p[0] as Unit, p[1] as Unit))
						game.ui.uiSetUnitOnViewPort(p[0] as Unit);
					else
						game.waitUIAnimation = false;
					break;
				}
				case actionType.resupply: {
					Commands.execute(game.scenario, { type: "resupply", unit: unitId(p[0] as Unit) });
					break;
				}
				case actionType.reinforce: {
					Commands.execute(game.scenario, { type: "reinforce", unit: unitId(p[0] as Unit) });
					break;
				}
				case actionType.mount: {
					Commands.execute(game.scenario, { type: "mount", unit: unitId(p[0] as Unit) });
					break;
				}
				case actionType.umount: {
					Commands.execute(game.scenario, { type: "unmount", unit: unitId(p[0] as Unit) });
					break;
				}
				case actionType.upgrade: {
					break;
				}
				case actionType.buy: {
					break;
				}
				case actionType.deploy: {
					break;
				}
				case actionType.select: {
					game.ui.uiSetUnitOnViewPort(p[0] as Unit);
					game.ui.uiUnitSelect(p[0] as Unit);
					break;
				}
				case actionType.endturn: {
					return false;
				}
				case actionType.message: {
					game.waitUIAnimation = true;
					game.ui.showGameToolTip(p[0] as string, (p[1] as Cell).row, (p[1] as Cell).col);
					game.ui.uiSetCellOnViewPort(p[1] as Cell);
					break;
				}
				case actionType.viewport: {
					game.ui.uiSetCellOnViewPort(p[0] as Cell);
					break;
				}
				default: {
					return false;
				}
			}
			return true;
		}

		//Returns which sides are played by players on this computer
		//will return -1 no local sides, 0 side 0, 1 side 1, 2 both sides
		//are playing on local computer (hotseat mode). Scripted AI sides count as local
		function getLocalSide(playerList: Player[]) {
			let nrSides = 1;
			let localSide = -1;
			for (let i = 0; i < playerList.length; i++) {
				if (playerList[i].type == playerType.humanLocal || playerList[i].type == playerType.aiScripted) {
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
}

Game.defaultScenario = DEFAULT_SCENARIO;
Game.defaultScenarioAI = [0, 1, 0, 0]; //uiSettings.isAI for the default scenario

//The running game lives in session.ts, where the UI reads it; game.ts makes it and re-exports it
//for main.ts, the harness and the tests
setGame(new Game());
export { game };

//The programs are the session's controllers (src/coresession.ts) and the scenarios start on the core
//(src/coreload.ts)
AI.driver = coreDriver;
ScenarioLoader.build = buildOnCore;
ScenarioLoader.coreCountries = carriedCountries;
GameMap.removeDestroyed = removeDestroyed;

//What the engine reads of the game (src/context.ts): this game's fields, read at the moment the
//engine needs them, so what a harness or a test assigns to game.* is seen as before
setEngineContext({
	scenario: function() { return game.scenario; },
	campaign: function() { return game.campaign; },
	campaignPlayer: function() { return game.getCampaignPlayer(); },
	spotSide: function() { return game.spotSide; },
	host: function() { return game; },
	world: function() { return rulesWorld(game.scenario, game, { spotSide: game.spotSide, noFOW: !!uiSettings.noFOW }); }
});

export function gameStart() {
	game.init();
}
