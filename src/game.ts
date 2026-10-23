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
import { GameRules } from "./gamerules";
import type { Unit } from "./unit";
import { Player } from "./map";
import { Scenario, type ScenarioOutcome } from "./scenario";
import { Campaign, type CampaignScenario } from "./campaign";
import { UIBuilder } from "./uibuilder";
import { UI } from "./ui";
import { OSGlue } from "./osglue";
import { Actions } from "./actions";
import { Commands } from "./commands";
import { CorePlay } from "./coreplay";
import { coreDriver, endGameTurn, startGameSession } from "./coresession";
import type { Session } from "./core/session";
import { setEngineContext } from "./context";
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
	declare deployReinforcements: (turn: number, playerId: number) => boolean;
	declare cleanup: () => void;

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
		let scenData: CampaignScenario = null; //campaign scenario data passed for delayed load during campaign progress
		let shouldRemoveNonCampaignUnits = false; //If we should remove scenario only units from campaign scenarios
		let shouldAwardPrototype = false; //A brilliant victory awards a prototype unit in the next scenario
		let isCampaignStart = false; //First scenario of a campaign: set prestige, dossier and core units

		//Restores the last saved game, or starts the default scenario if there is none. The game plays on
		//the core (#137): its programs are the session's controllers (a test that doesn't init plays the
		//old engine's)
		this.init = function() {
			AI.onUnitsDeployed = function() { game.ui.handleReinforcementDeployment(); };
			AI.driver = AIScripted.driver = coreDriver;
			this.state = new GameState(this);
			this.state.restore(this.onScenarioLoadFinished.bind(this, null, true),
				this.newScenario.bind(this, "failRestore"));
		}

		//Called every second by this.loop. Uses the global game, not this
		this.processTurn = function() {
			if (!game.gameStarted || game.gameEnded)
				return;
			if (scenData !== null && needScenarioLoad && game.uiMessageClicked) { //Load next scenario in campaign chain
				game.newScenario(scenData.scenario, scenData.intro);
			} else {
				const player = game.scenario.map.currentPlayer;
				//No current player also goes on to process AI actions
				if (!player || player.type == playerType.aiLocal || player.type == playerType.aiScripted) {
					if (!game.waitUIAnimation && game.uiMessageClicked)
						game.processAIActions();
				}
			}
		}

		this.startTurn = function() {}

		this.processAIActions = function() {
			const action = this.scenario.map.currentPlayer.handler.getAction();

			if (!processAction(this, action)) {
				UIBuilder.showAIStatus(false);
				game.waitUIAnimation = true;
				game.endTurn();
				setTimeout(function() {
					if (!game.gameEnded)
						game.ui.uiEndTurnInfo();
				}, 2500);
			}
		}

		this.endTurn = function() {
			this.waitUIAnimation = false;
			if (this.session !== null) {
				if (endGameTurn(this)) defeated(this);
				return;
			}

			//Check if game ended in defeat only for human players
			const ended = Commands.execute(this.scenario, { type: "endTurn" }, { localSide: localPlayingSide });
			if (ended.ok && ended.result) {
				defeated(this);
			} else {
				this.state.save(); //with the campaign's progress

				//Set the new visible side on map
				this.setCurrentSide();
				this.deployReinforcements(this.scenario.map.turn, this.scenario.map.currentPlayer.id);
			}
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
			setupPlayers(this);
			localPlayingSide = getLocalSide(this.scenario.map.getPlayers());
			this.setCurrentSide();
			startLoadedTurn(this, true);

			this.gameStarted = true;
			needScenarioLoad = this.gameEnded = false;

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

			this.cleanup();

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
			setupPlayers(this);
			const players = this.scenario.map.getPlayers();
			localPlayingSide = getLocalSide(players);
			this.setCurrentSide();
			startLoadedTurn(this, isRestore);

			this.waitUIAnimation = false;
			this.gameStarted = true;
			needScenarioLoad = this.gameEnded = false;

			if (this.campaign !== null) {
				startCampaignScenario(this, isRestore);
			} else {
				this.scenario.showStatistics();
				//New single scenarios balance players prestige, the tutorial keeps its own
				if (!isRestore && this.scenario.file !== "tutorial.xml") {
					for (let i = 0; i < players.length; i++) {
						const p = players[i];
						p.prestige = this.scenario.getBalancedPrestige(p.side);
					}
				}
			}

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
			shouldRemoveNonCampaignUnits = false; //For first scenario is not needed
			isCampaignStart = true;

			//Start the first scenario
			const scenData = this.campaign.getCurrentScenario(); //local, shadows the delayed load scenData
			this.newScenario(scenData.scenario, scenData.intro);
		}

		//endType (endGameType) is only given on a loss, it picks the loss reason text
		this.continueCampaign = function(outcomeType: ScenarioOutcome, endType?: string) {
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

			let outcomeText = this.campaign.getOutcomeText(outcomeType);
			scenData = this.campaign.loadNextScenario(outcomeType);
			if (scenData == null) {
				if (outcomeType == "lose")
					outcomeText = endGameLossText[endType] + outcomeText;
				UIBuilder.showCampaignEnd(outcomeType, outcomeText, function() { game.ui.mainMenuButton("options"); });
				this.gameEnded = true;
				this.gameStarted = false;
				if (outcomeType != "lose")
					OSGlue.reportAchievement(this.campaign.file);
			} else {
				UIBuilder.message(outcomeNames[outcomeType], outcomeText);
				needScenarioLoad = true; //Wait for user to click to continue to next scenario
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

		//Deploys the reinforcements of player playerId for this turn, returns false if there are none
		this.deployReinforcements = function(turn: number, playerId: number) {
			const self = this;
			const deployed = Actions.deployReinforcements(this.scenario, turn, playerId, function(cell: Cell) {
				if (self.scenario.map.map[cell.row][cell.col].isSpotted(self.spotSide)) {
					const side = self.scenario.map.getPlayer(playerId).side;
					let isOwn = false;
					if (self.spotSide == side)
						isOwn = true;
					self.ui.showAlert(cell.row, cell.col, "Reinforced!", isOwn);
				}
			});

			if (deployed === null)
				return false;
			if (deployed.length > 0)
				game.ui.handleReinforcementDeployment();

			return true; //also when none of them could be deployed
		}

		this.cleanup = function() {
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
		function setupPlayers(game: Game) {
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

						if (savedPlayer === null) { //Campaign just started save player from scenario settings
							savedPlayer = new Player();
							savedPlayer.copy(players[i]);
						} else { //Campaign in progress restore saved instance
							players[i].copy(savedPlayer, true);
						}
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
			return true;
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
					CorePlay.execute(game.scenario, { type: "resupply", unit: unitId(p[0] as Unit) });
					break;
				}
				case actionType.reinforce: {
					CorePlay.execute(game.scenario, { type: "reinforce", unit: unitId(p[0] as Unit) });
					break;
				}
				case actionType.mount: {
					CorePlay.execute(game.scenario, { type: "mount", unit: unitId(p[0] as Unit) });
					break;
				}
				case actionType.umount: {
					CorePlay.execute(game.scenario, { type: "unmount", unit: unitId(p[0] as Unit) });
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

		//A campaign's scenario loaded: the first one sets the campaign player's prestige, dossier and
		//core units, a later one removes the scenario's own units on the deployment hexes, and a
		//brilliant victory before awards a prototype unit. Not a restored one: the save was made after
		//(its progress is the save's, #128), a prototype still to award waits for the next scenario
		function startCampaignScenario(game: Game, isRestore: boolean) {
			if (isRestore)
				return;
			if (isCampaignStart) { //Only for first scenario
				campaignPlayer.prestige = game.campaign.startprestige;
				campaignPlayer.initDossier();
				game.scenario.map.buildCoreUnitList(campaignPlayer);
			}
			if (shouldRemoveNonCampaignUnits)
				game.scenario.map.removeNonCampaignUnits(campaignPlayer);
			if (shouldAwardPrototype) {
				const protoId = game.scenario.getRandomPrototype(campaignPlayer.country + 1);
				if (typeof protoId !== "undefined" && protoId > 0) {
					campaignPlayer.acquireUnit(protoId, 0);
					shouldAwardPrototype = false;
					UIBuilder.showPrototypeAwardMessage(protoId);
				}
			}
		}

		//The players' programs start: on the core, the session (its controllers join, a loaded game's AI
		//plans the turn again). On the old engine, a game loaded on an AI player's turn (#71): the AI plans
		//the turn again, its plan isn't saved (docs/STATE.md D6). Its turn's start (the purchases and the
		//deployment) was before the save. The scripted AI queues its turn when it's made (setupPlayers)
		function startLoadedTurn(game: Game, loaded: boolean) {
			if (AI.driver !== null) {
				startGameSession(game, loaded, localPlayingSide);
				return;
			}
			if (!loaded)
				return;
			const player = game.scenario.map.currentPlayer;
			if (player && player.type == playerType.aiLocal)
				(player.handler as AI).planTurn();
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

//What the engine reads of the game (src/context.ts): this game's fields, read at the moment the
//engine needs them, so what a harness or a test assigns to game.* is seen as before
setEngineContext({
	scenario: function() { return game.scenario; },
	campaign: function() { return game.campaign; },
	campaignPlayer: function() { return game.getCampaignPlayer(); },
	spotSide: function() { return game.spotSide; },
	host: function() { return game; }
});

export function gameStart() {
	game.init();
}
