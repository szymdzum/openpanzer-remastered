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

import { actionType, type Cell, DEFAULT_SCENARIO, playerType, uiSettings } from "./prototypes";
import { GameState } from "./gamestate";
import type { AIAction } from "./ai";
import type { Unit } from "./unit";
import type { Player } from "./map";
import type { Scenario, ScenarioOutcome } from "./scenario";
import type { Campaign } from "./campaign";
import { UIBuilder } from "./uibuilder";
import { UI } from "./ui";
import { OSGlue } from "./osglue";
import { Commands } from "./commands";
import { GameRules } from "./gamerules";
import { endGameTurn } from "./coresession";
import { GameHost, type HostScreen, runGame } from "./host";
import type { Session } from "./core/session";
import type { RulesetName } from "./core/types";
import { game } from "./session";
import type { CampaignProgress } from "./state";

//UI is a constructor function, not a class: this gives `new` on it a type
export interface UIConstructor { new (game: Game): UI; }

//Game is what the page, the harness and the tests hold of the running game: its fields, the turn loop that
//plays the AI's turns on the old UI, and the members that hand the game's course to its host (src/host.ts),
//which keeps the campaign's progress. The constructor's body sets up the methods, typed as declare fields
//(docs/TYPES.md rule 3). A class isn't hoisted: the game is made after it
export class Game {
	declare ui: UI;
	declare state: GameState;
	declare campaign: Campaign;
	declare scenario: Scenario;
	declare gameStarted: boolean;
	declare gameEnded: boolean;
	declare waitUIAnimation: boolean;
	declare spotSide: number;
	declare rules: RulesetName;
	declare uiMessageClicked: boolean;
	declare loop: number;
	declare session: Session | null; //the core's session the game plays on (src/coresession.ts), null before a scenario
	declare host: GameHost; //the game's course: scenarios, the campaign, the end (src/host.ts)
	declare init: () => void;
	declare processTurn: () => void;
	declare startTurn: () => void;
	declare processAIActions: () => void;
	declare endTurn: () => boolean; //true when the turn limit ended the game (the end announced)
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
		this.waitUIAnimation = false; //A move or an attack still playing: the next AI action and the end turn button wait
		this.spotSide = -1; //currently visible side on map
		//The rules the game plays by (#53): the settings' at a new game, the save's at a load, kept through a
		//campaign; classic until then, as the tests and the contracts play
		this.rules = "classic";
		this.uiMessageClicked = false; //set to true when user clicks ok on uiMessage window //TODO change to event

		//Restores the last saved game, or starts the default scenario if there is none
		this.init = function() {
			this.state = new GameState(this);
			this.state.restore(this.onScenarioLoadFinished.bind(this, null, true),
				this.newScenario.bind(this, "failRestore"));
		}

		//Called every tick of this.loop (src/main.ts). Uses the global game, not this: the campaign's next
		//scenario once the player clicked its outcome away, else the AI's next actions
		this.processTurn = function() {
			if (!game.gameStarted || game.gameEnded)
				return;
			if (game.host.nextScenarioWaiting() && game.uiMessageClicked) //Load next scenario in campaign chain
				game.host.loadNextScenario();
			else if (aiPlays(game.scenario.map.currentPlayer) && !game.waitUIAnimation && game.uiMessageClicked)
				game.processAIActions();
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
					if (game.endTurn())
						return;
					setTimeout(function() {
						if (!game.gameEnded)
							game.ui.uiEndTurnInfo();
					}, 2500);
					return;
				}
			} while (unanimated.includes(action.type));
		}

		//The turn ends on the session (src/coresession.ts): the next player's turn start, the save, the side
		//shown, the reinforcements; or the game's end at the turn limit (src/core/turn.ts endsAtTurnLimit), true
		//then: the host tells the end (whichever side's last turn ended it, the person's end turn button or the
		//AI's turn, #365), and the next turn's info isn't shown over it
		this.endTurn = function() {
			this.waitUIAnimation = false;
			if (!endGameTurn(this))
				return false;
			this.host.ended(this.session.ended);
			return true;
		}

		this.loop = 0; //the turn loop's interval: src/main.ts starts it, not the module's loading
		this.session = null;
		this.host = new GameHost(this, oldScreen(this));

		//The game's course is the host's: what the page, GameState, the harness and the tests call hands it on.
		//setupGameState: called by GameState after a game was restored from a save (local, file or cloud)
		this.setupGameState = function() { this.host.gameLoaded(); }

		//scenFile "failRestore" is passed when restoring the last save failed at startup
		this.newScenario = function(scenFile: string, scenIntro?: string) {
			if (scenFile === "failRestore") {
				for (let i = 0; i < uiSettings.isAI.length; i++)
					uiSettings.isAI[i] = Game.defaultScenarioAI[i];
				scenFile = Game.defaultScenario;
			}
			this.host.newScenario(scenFile, scenIntro);
		}

		//isRestore is true when the scenario came from a saved game
		this.onScenarioLoadFinished = function(scenIntro: string | null, isRestore: boolean) {
			this.host.scenarioLoaded(scenIntro, isRestore);
		}
		this.newCampaign = function(campIndex: number, difficulty: number) { this.host.newCampaign(campIndex, difficulty); }
		this.onCampaignLoadFinished = function() { this.host.campaignLoaded(); }
		this.continueCampaign = function(outcomeType: ScenarioOutcome, endType?: string) { this.host.continueCampaign(outcomeType, endType); }
		this.getCampaignPlayer = function() { return this.host.getCampaignPlayer(); }
		this.getCampaignProgress = function() { return this.host.getCampaignProgress(); }
		this.setCampaignProgress = function(progress: CampaignProgress, scenario: Scenario) { this.host.setCampaignProgress(progress, scenario); }
		this.setCurrentSide = function() { this.host.setCurrentSide(); }
		this.cleanup = function(keepSave = false) { this.host.cleanup(keepSave); }

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
	}
}

//The old UI as the host's screen (src/host.ts): its messages and windows, looked up when the host calls
//(the tests put their own in), and the platform's reports
function oldScreen(g: Game): HostScreen {
	return {
		showScenario() {
			if (g.ui) {
				g.ui.setNewScenario();
			} else { //First scenario after startup
				g.ui = new (UI as unknown as UIConstructor)(g);
				g.ui.mainMenuButton("options"); //Bring up the "Main Menu"
			}
		},
		loadFailed(file: string) { UIBuilder.messageDynamic("Error", "Error Loading scenario " + file); },
		showPrototype(eqid: number) { UIBuilder.showPrototypeAwardMessage(eqid); },
		message(title: string, text: string, then?: () => void) { UIBuilder.message(title, text, then); },
		campaignEnd(outcome: ScenarioOutcome, text: string, then: () => void) { UIBuilder.showCampaignEnd(outcome, text, then); },
		mainMenu() { g.ui.mainMenuButton("options"); },
		reportScore(score: number) { OSGlue.reportScore(score); },
		reportAchievement(campaignFile: string) { OSGlue.reportAchievement(campaignFile); },
	};
}

Game.defaultScenario = DEFAULT_SCENARIO;
Game.defaultScenarioAI = [0, 1, 0, 0]; //uiSettings.isAI for the default scenario

//The running game lives in session.ts, where the UI reads it; game.ts makes it, the host wires the engine
//to it (src/host.ts runGame), and it is re-exported for main.ts, the harness and the tests
runGame(new Game());
export { game };

export function gameStart() {
	game.init();
}
