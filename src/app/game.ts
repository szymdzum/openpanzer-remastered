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

import { DEFAULT_SCENARIO, uiSettings } from "./settings";
import { GameState } from "./storage";
import type { Scenario } from "../legacy/scenario";
import type { ScenarioOutcome } from "../core/types";
import type { Campaign } from "../legacy/campaign";
import type { Player } from "../legacy/map";
import { nullScreen } from "./nullscreen";
import { GameHost, runGame } from "./host";
import type { Session } from "../core/session";
import type { RulesetName } from "../core/types";
import { game } from "./running";
import type { CampaignProgress } from "../core/state";

/**
 * What the page, the harness and the tests hold of the running game: its fields, and the members that hand the
 * game's course and a program's turn to its host (src/app/host.ts). The screen is a null screen until
 * src/main.ts gives the host the UI's.
 */
//The constructor's body sets up the methods, typed as declare fields (docs/TYPES.md rule 3). A class isn't
//hoisted: the game is made after it
export class Game {
	declare state: GameState;
	declare campaign: Campaign;
	declare scenario: Scenario;
	declare gameStarted: boolean;
	declare gameEnded: boolean;
	declare spotSide: number;
	declare rules: RulesetName;
	declare uiMessageClicked: boolean;
	declare session: Session | null; //null before a scenario
	declare host: GameHost;
	declare init: () => void;
	declare endTurn: () => boolean; //true when the turn limit ended the game
	declare setupGameState: () => void;
	declare newScenario: (scenFile: string, scenIntro?: string) => void;
	declare onScenarioLoadFinished: (scenIntro: string | null, isRestore: boolean) => void;
	declare newCampaign: (campIndex: number, difficulty: number) => void;
	declare continueCampaign: (outcomeType: ScenarioOutcome, endType?: string) => void; //endType: an endGameType value
	declare getCampaignPlayer: () => Player | null;
	declare getCampaignProgress: () => CampaignProgress;
	declare setCampaignProgress: (progress: CampaignProgress, scenario: Scenario) => void;
	declare setCurrentSide: () => void;
	declare cleanup: (keepSave?: boolean) => void;

	declare static defaultScenario: string;
	declare static defaultScenarioAI: number[];

	constructor() {
		this.state = null;
		this.campaign = null;
		this.scenario = null;

		this.gameStarted = false;
		this.gameEnded = false; //in victory or defeat
		this.spotSide = -1; //the side visible on the map
		//The settings' at a new game, the save's at a load, kept through a campaign (#53); classic until then, as
		//the tests and the contracts play
		this.rules = "classic";
		this.uiMessageClicked = false; //set when the player clicks OK on a message, which then tells the host to go on

		//Restores the last saved game, or starts the default scenario if there is none
		this.init = function() {
			this.state = new GameState(this);
			this.state.restore(this.onScenarioLoadFinished.bind(this, null, true),
				this.newScenario.bind(this, "failRestore"));
		}

		this.endTurn = function() { return this.host.endTurn(); }

		this.session = null;
		this.host = new GameHost(this, nullScreen(this));

		//GameState calls setupGameState after a game was restored from a save
		this.setupGameState = function() { this.host.gameLoaded(); }

		//"failRestore" is passed when restoring the last save failed at startup
		this.newScenario = function(scenFile: string, scenIntro?: string) {
			if (scenFile === "failRestore") {
				for (let i = 0; i < uiSettings.isAI.length; i++)
					uiSettings.isAI[i] = Game.defaultScenarioAI[i];
				scenFile = Game.defaultScenario;
			}
			this.host.newScenario(scenFile, scenIntro);
		}

		this.onScenarioLoadFinished = function(scenIntro: string | null, isRestore: boolean) {
			this.host.scenarioLoaded(scenIntro, isRestore);
		}
		this.newCampaign = function(campIndex: number, difficulty: number) { this.host.newCampaign(campIndex, difficulty); }
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

//The running game lives in running.ts; it is re-exported for main.ts, the harness and the tests
runGame(new Game());
export { game };

export function gameStart() {
	game.init();
}
