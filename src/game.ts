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

import { DEFAULT_SCENARIO, uiSettings } from "./prototypes";
import { GameState } from "./gamestate";
import type { Scenario, ScenarioOutcome } from "./scenario";
import type { Campaign } from "./campaign";
import type { Player } from "./map";
import type { UI } from "./ui";
import { oldScreen } from "./oldscreen";
import { GameHost, runGame } from "./host";
import type { Session } from "./core/session";
import type { RulesetName } from "./core/types";
import { game } from "./session";
import type { CampaignProgress } from "./state";

//Game is what the page, the harness and the tests hold of the running game: its fields, and the members that
//hand the game's course and a program's turn to its host (src/host.ts), which keeps the campaign's progress and
//shows the game on the old UI (src/oldscreen.ts). The constructor's body sets up the methods, typed as
//declare fields (docs/TYPES.md rule 3). A class isn't hoisted: the game is made after it
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
		//The old UI still showing a move or an attack: the harness and the command-line player wait on it (#378);
		//the game itself waits on the screen's shown (#375)
		this.waitUIAnimation = false;
		this.spotSide = -1; //currently visible side on map
		//The rules the game plays by (#53): the settings' at a new game, the save's at a load, kept through a
		//campaign; classic until then, as the tests and the contracts play
		this.rules = "classic";
		this.uiMessageClicked = false; //set to true when user clicks ok on uiMessage window, which then tells the host to go on

		//Restores the last saved game, or starts the default scenario if there is none
		this.init = function() {
			this.state = new GameState(this);
			this.state.restore(this.onScenarioLoadFinished.bind(this, null, true),
				this.newScenario.bind(this, "failRestore"));
		}

		//A program's turn is the host's (src/host.ts). processTurn is the harness's turn loop (it ticks it on
		//this.loop, harness/lib/harness.js) and the tests': it uses the global game, an interval calls it unbound
		this.processTurn = function() { game.host.processTurn(); }
		this.startTurn = function() {}
		this.processAIActions = function() { this.host.processAIActions(); }
		this.endTurn = function() { return this.host.endTurn(); }

		this.loop = 0; //the harness's turn loop interval (the game's own went, #375)
		this.session = null;
		this.host = new GameHost(this, oldScreen(this)); //the old UI shows it (src/oldscreen.ts)

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
	}
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
