/**
 * GameHost - the game's course outside the screen (#373): a scenario started or loaded, the campaign's
 * chain of scenarios (the outcome's prestige and dossier, the next scenario, the prototype, the core
 * units carried), and the end of the game with what follows it, decided from how the game ended (the
 * core's SessionEnd, src/core/session.ts)
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 *
 * The host decides; the screen only shows. It tells the screen what to show through the few calls of
 * HostScreen (a scenario ready, a message, the campaign's dossier, the main menu, a failed load, a
 * prototype awarded, the platform's reports), which the old UI answers for now (src/game.ts) and which
 * become the screen interface (#374). The timing is the old game's: a victory is told when the screen
 * says the step that won it has ended (the old UI's animation end), the end at the turn limit when the
 * turn ends (Game.endTurn), the campaign's next scenario loads once the player has clicked its message
 * away (the turn loop's tick, Game.processTurn), and the saves come where they came. Imports no UI
 * module, so a whole campaign plays on it without the DOM (test/host.test.ts).
 */

import { DEBUG_AI_MOVES, endGameLossText, endGameType, newGameRules, outcomeNames, playerType, sideNames, uiSettings
} from "./prototypes";
import { AI } from "./ai";
import { GameMap, Player } from "./map";
import { Scenario, type ScenarioOutcome } from "./scenario";
import { Campaign, type CampaignScenario } from "./campaign";
import { coreDriver, handlerFor, removeDestroyed, startGameSession } from "./coresession";
import { buildOnCore, carriedCountries, carryPlayer, prototypeAwarded } from "./coreload";
import { applyData, gameInputs, rulesWorld, worldOf } from "./mirror";
import { ScenarioLoader } from "./scenarioloader";
import { endCampaignScenario, scenarioEnded } from "./core/campaign";
import { attackerSide, turnLimitOutcome, turnLimitResult } from "./core/turn";
import type { SessionEnd } from "./core/session";
import { setEngineContext, touched } from "./context";
import { defined } from "./util";
import { game, setGame } from "./session";
import type { Game } from "./game";
import type { CampaignProgress } from "./state";

//What the host asks the screen to show, named for what the game needs. Each call only shows: what
//follows (then) is the host's
export interface HostScreen {
	//The scenario started or loaded is ready: the screen set up for it (the first one builds the screen
	//and opens the main menu)
	showScenario(): void;
	//The scenario's files didn't load: the game can't go on
	loadFailed(file: string): void;
	//A campaign's scenario starts with the prototype the brilliant victory before awarded (its eqid)
	showPrototype(eqid: number): void;
	//A message the player clicks away; then: what its OK does instead of closing it
	message(title: string, text: string, then?: () => void): void;
	//The campaign's end: the dossier with its outcome; then: what its close does
	campaignEnd(outcome: ScenarioOutcome, text: string, then: () => void): void;
	//The main menu, once a game has ended
	mainMenu(): void;
	//The platform's score board and achievements (OSGlue)
	reportScore(score: number): void;
	reportAchievement(campaignFile: string): void;
}

//How a victory was won, as the loss texts and the campaign name it (endGameType)
const endTypes = { capture: endGameType.moveCapture, elimination: endGameType.noEnemyLeft };

//The game's course: Game's members hand it what the player and the files do (src/game.ts), the screen
//shows what it says. What a campaign keeps between its scenarios is here, as Game's closure kept it
export class GameHost {
	declare game: Game;
	declare screen: HostScreen;
	declare localSide: number;		//which sides play on this screen when the game started (localSideOf)
	declare campaignPlayer: Player | null;	//the player that plays the campaign on this screen
	declare savedPlayer: Player | null;	//its copy kept between the campaign's scenarios
	declare next: CampaignScenario | null;	//the campaign's next scenario, loaded once the player clicks on
	declare needLoad: boolean;		//the next scenario waits for the player's click on the outcome's message
	declare nextLoading: boolean;		//the next scenario asked for and loading (#64)
	declare removeNonCampaignUnits: boolean;	//a later scenario of the campaign: its own units on the deployment hexes go
	declare awardPrototype: boolean;	//a brilliant victory awards a prototype unit in the next scenario
	declare isCampaignStart: boolean;	//the campaign's first scenario: prestige, dossier and core units set

	constructor(g: Game, screen: HostScreen) {
		this.game = g;
		this.screen = screen;
		this.localSide = -1;
		this.campaignPlayer = null;
		this.savedPlayer = null;
		this.next = null;
		this.needLoad = false;
		this.nextLoading = false;
		this.removeNonCampaignUnits = false;
		this.awardPrototype = false;
		this.isCampaignStart = false;
	}

	//---- A scenario started or loaded

	//A scenario file started (a campaign's next scenario keeps the save of the one before until its own
	//replaces it: closing the game while it loads, or a load that fails, doesn't lose the campaign #64)
	newScenario(file: string, intro?: string) {
		const g = this.game;
		this.cleanup(this.nextLoading);
		g.scenario = new Scenario(file);
		g.scenario.load(this.scenarioLoaded.bind(this, intro, false));
	}

	//The scenario loaded, from its file or a save (isRestore): the players set up, the session started,
	//the save, the screen. The scenario's start gave the players their prestige and a campaign's start its
	//player (the core's newGame, src/coreload.ts)
	scenarioLoaded(intro: string | null | undefined, isRestore: boolean) {
		const g = this.game;
		if (!g.scenario.isLoaded) {
			this.screen.loadFailed(g.scenario.file);
			g.gameEnded = true;
			return;
		}
		if (defined(intro)) g.scenario.setDescription(intro); //Set from campaign
		g.session = null;
		this.startPlaying(isRestore);
		g.waitUIAnimation = false;
		g.gameStarted = true;
		this.needLoad = this.nextLoading = g.gameEnded = false;
		if (g.campaign === null)
			g.scenario.showStatistics();
		else if (!isRestore && prototypeAwarded !== null)
			this.screen.showPrototype(prototypeAwarded);
		g.state.save();
		this.screen.showScenario();
	}

	//A game restored from a save (local, file or cloud: GameState)
	gameLoaded() {
		const g = this.game;
		this.savedPlayer = null;
		g.session = null;
		this.startPlaying(true);
		g.gameStarted = true;
		this.needLoad = this.nextLoading = g.gameEnded = false;
		g.state.save();
		this.screen.showScenario();
	}

	//The players set up, the sides played here, the side shown, the session started
	startPlaying(isRestore: boolean) {
		const g = this.game;
		this.setupPlayers(isRestore);
		this.localSide = localSideOf(g.scenario.map.getPlayers());
		this.setCurrentSide();
		startGameSession(g, isRestore, this.localSide);
	}

	//The side the map shows: the current player's in hotseat, else the side played here
	setCurrentSide() {
		const g = this.game;
		g.spotSide = this.localSide === 2 ? g.scenario.map.currentPlayer.side : this.localSide;
	}

	//The scenario before gone, and its save unless keepSave
	cleanup(keepSave = false) {
		const g = this.game;
		if (!keepSave)
			g.state.clear();
		//(deleted, then set: the properties end up where the old game's cleanup left them)
		if (g.scenario && g.scenario.map !== null) {
			g.scenario.map.cleanup();
			delete g.scenario.map;
			g.scenario.map = null;
		}
		delete g.scenario;
		g.scenario = null;
		g.session = null;
	}

	//The AI, the scripted tutorial or the campaign for the players; a person's player is the default
	setupPlayers(isRestore: boolean) {
		const g = this.game, players = g.scenario.map.getPlayers();
		if (players === null)
			return;
		for (const p of players) {
			if (g.campaign !== null)
				this.setupCampaignPlayer(p, isRestore);
			else
				setupScenarioPlayer(p, g.scenario.map);
		}
		touched(); //(the players' types, a campaign player carried)
	}

	//In a campaign the other countries are the AI; the campaign's country is its player (should be only 1)
	setupCampaignPlayer(p: Player, isRestore: boolean) {
		const g = this.game;
		if (p.country !== g.campaign.country) {
			p.type = playerType.aiLocal;
			p.handler = handlerFor(p, g.scenario.map);
			return;
		}
		this.campaignPlayer = p;
		this.carryCampaignPlayer(p, isRestore);
	}

	//The campaign player: the scenario's start carried it already (src/coreload.ts). Saved when the
	//campaign starts, as the file had it before the campaign's start; a load during the campaign copies
	//the saved one over it (kept #196)
	carryCampaignPlayer(p: Player, isRestore: boolean) {
		const started = !isRestore;
		if (this.savedPlayer === null) { //Campaign just started save player from scenario settings
			this.savedPlayer = new Player();
			this.savedPlayer.copy(p);
			if (started) {
				this.savedPlayer.prestige = p.prestigePerTurn[0];
				this.savedPlayer.dossier = {};
				this.savedPlayer.getCoreUnitList().length = 0;
			}
		} else if (!started) { //Campaign in progress restore saved instance (also on a load, kept #196)
			p.copy(this.savedPlayer, true);
		}
	}

	//---- The campaign

	//A campaign started: the rules of the settings, its data loaded, then its first scenario
	newCampaign(index: number, difficulty: number) {
		const g = this.game;
		g.rules = newGameRules();
		g.campaign = new Campaign(index, difficulty, this.campaignLoaded.bind(this));
	}

	campaignLoaded() {
		this.savedPlayer = null;
		carryPlayer(null);
		this.removeNonCampaignUnits = false; //For first scenario is not needed
		this.isCampaignStart = true;
		const first = this.game.campaign.getCurrentScenario();
		this.newScenario(first.scenario, first.intro);
	}

	//The campaign's scenario ended with an outcome: the scenario's end, then the next scenario or the
	//campaign's end. endType (endGameType) is only given on a loss, it picks the loss reason text
	continueCampaign(outcome: ScenarioOutcome, endType?: string) {
		this.endScenario(outcome);
		this.nextScenario(outcome, endType);
	}

	//The scenario's end (src/core/campaign.ts): the player carried into the next scenario, and the
	//scenario as the old game left it until the next one loads (its player sent to HQ in place)
	endScenario(outcome: ScenarioOutcome) {
		const g = this.game;
		const w = worldOf(g.scenario, g, gameInputs(g));
		const ended = endCampaignScenario(w, outcome, g.campaign.getCampaignData());
		carryPlayer(ended.player);
		this.screen.reportScore(ended.player.score);
		g.session.world = { ...w, state: scenarioEnded(w, outcome, g.campaign.getCampaignData(), ended.campaign) };
		applyData(g.scenario, g.session.world, g);
		//(the saved player, which a game loaded during the campaign copies, kept #196)
		this.savedPlayer.supportCountries = [];
		this.savedPlayer.prestigePerTurn = [];
		this.savedPlayer.copy(this.campaignPlayer);
	}

	//The campaign's next scenario, or its end: the outcome told, the next one loaded once the player has
	//clicked its message away (loadNextScenario); at the end the dossier, then the main menu
	nextScenario(outcome: ScenarioOutcome, endType?: string) {
		const g = this.game;
		let text = g.campaign.getOutcomeText(outcome);
		this.next = g.campaign.loadNextScenario(outcome);
		if (this.next === null) {
			if (outcome === "lose")
				text = endGameLossText[endType] + text;
			this.screen.campaignEnd(outcome, text, () => this.screen.mainMenu());
			g.gameEnded = true;
			g.gameStarted = false;
			if (outcome !== "lose")
				this.screen.reportAchievement(g.campaign.file);
		} else {
			this.screen.message(outcomeNames[outcome], text);
			this.needLoad = true; //Wait for user to click to continue to next scenario
			this.nextLoading = false;
			if (outcome === "briliant")
				this.awardPrototype = true;
		}
	}

	//The campaign's next scenario waits for the player's click on the outcome's message
	nextScenarioWaiting(): boolean {
		return this.next !== null && this.needLoad;
	}

	//The player clicked on: the next scenario loads. Asked once: the turn loop's ticks while it loads
	//would start it over through the loader's shared scenario, each load adding the players again (#64)
	loadNextScenario() {
		if (this.nextLoading)
			return;
		this.nextLoading = true;
		this.newScenario(this.next.scenario, this.next.intro);
	}

	//The campaign menu's debug buttons: the scenario ended with the outcome they name
	skipScenario(outcome: ScenarioOutcome) {
		this.continueCampaign(outcome);
	}

	//The campaign's player, null outside a campaign
	getCampaignPlayer(): Player | null {
		return this.game.campaign !== null ? this.campaignPlayer : null;
	}

	//The campaign's progress between scenarios, for the state (src/state.ts)
	getCampaignProgress(): CampaignProgress {
		return { isStart: this.isCampaignStart, removeNonCampaignUnits: this.removeNonCampaignUnits,
			awardPrototype: this.awardPrototype };
	}

	//And back, for a scenario restored from the state: its campaign player is the last player of the
	//campaign's country, as setupPlayers links it
	setCampaignProgress(progress: CampaignProgress, scenario: Scenario) {
		const g = this.game;
		this.isCampaignStart = progress.isStart;
		this.removeNonCampaignUnits = progress.removeNonCampaignUnits;
		this.awardPrototype = progress.awardPrototype;
		for (const p of scenario.map.getPlayers())
			if (g.campaign !== null && p.country === g.campaign.country)
				this.campaignPlayer = p;
	}

	//---- The end of the game

	//The game ended as the session says (a victory when the step that won it has been shown, the turn
	//limit when the turn ended): told, and what follows, the campaign's next scenario or the main menu
	ended(end: SessionEnd) {
		if (end.kind === "victory")
			this.victory(end.side, endTypes[end.how]);
		else if (end.kind === "turnLimit")
			this.turnLimit(end.side);
	}

	//The scenario won by side, how (an endGameType value). In a campaign the campaign player's outcome
	//goes on to the next scenario. A single scenario's is told as a defeat to a person who played the
	//other side only, as a win to a person who played it, with the winner's country and score (#76: the
	//old game asked whose turn it was, so a person whose last unit fell attacking was told they won, and
	//it always said the hexes were captured). With no person playing, only who won (#366). Its OK opens
	//the main menu
	victory(side: number, how: string) {
		const g = this.game, map = g.scenario.map;
		const rating = g.scenario.checkVictory();
		if (g.campaign !== null) {
			this.continueCampaign(this.getCampaignPlayer().side === side ? rating : "lose", how);
			return;
		}
		const winner = map.getPlayers().find((p) => p.side === side) || map.currentPlayer;
		const person = this.personSides();
		let title = outcomeNames[rating], text = "You have won this scenario ! ";
		if (person === (~side & 1)) {
			title = "DEFEAT";
			text = "You have lost ! Your enemy ";
		} else if (person === -1) {
			text = "";
		}
		const reason = how === endGameType.noEnemyLeft ? "destroying all the enemy units" : "capturing all victory hexes";
		this.screen.message(title, "<br/><br/><br/><br/>" + text + winner.getCountryName() + " on " + sideNames[side]
			+ " side wins by " + reason + " with a final score of <b>" + winner.score + "</b>. ", () => this.screen.mainMenu());
		g.gameEnded = true;
	}

	//The game ended at the turn limit, whichever side's last turn ended it (the person's end turn button or
	//the AI's turn, #365): in a campaign the scenario's outcome for the campaign player and the next
	//scenario (in the classic rules a loss; in the remaster's a defender that held out wins, #256); a
	//single scenario ends, the screen telling who won
	turnLimit(endedSide: number) {
		const g = this.game;
		if (g.campaign === null) {
			g.gameEnded = true;
			this.turnLimitMessage(endedSide);
			return;
		}
		this.continueCampaign(turnLimitResult(g.session.world, endedSide, this.getCampaignPlayer().side), endGameType.noTurnsLeft);
	}

	//The turn limit's outcome (src/core/turn.ts turnLimitOutcome), told by the sides a person plays now as a
	//victory is (#385: it was told by the session's start, DEFEAT to a game of AIs, and the tutorial's person
	//after the hand-over wasn't told their own): with no person or both sides played, only who won. In the
	//classic rules the side that ended its last turn lost, as the original said. In the remaster's the
	//defender that held out wins and the attacker that didn't take all its objectives loses (#256); with
	//no attacker the side holding more objectives wins (#231)
	turnLimitMessage(endedSide: number) {
		const w = this.game.session.world, person = this.personSides();
		const o = turnLimitOutcome(w, endedSide);
		if (o.winner === -1) {
			if (w.rules.defenderHoldsOut) this.screen.message("DRAW", "<br><br>Neither side holds more objectives");
			else this.screen.message("DEFEAT", "<br><br>You didn't capture the objectives in time");
			return;
		}
		const heldOut = attackerSide(w) === o.loser;
		const held = heldOut ? " held the objectives to the end" : " held more objectives to the end";
		if (person === 2 || person === -1) this.screen.message(outcomeNames[o.rating], "<br><br>The " + sideNames[o.winner] + " side" + held);
		else if (person === o.winner) this.screen.message(outcomeNames[o.rating], "<br><br>You" + held);
		else this.screen.message("DEFEAT", "<br><br>" + (heldOut ? "You didn't capture all the objectives in time"
			: "The enemy held more objectives to the end"));
	}

	//The sides a person plays now, by the players' types: -1 none, a side, or 2 both (hotseat). Not the
	//session's start: the tutorial hands the Axis to the person and the Allies to the AI past its 5th turn (#366)
	personSides(): number {
		let sides = -1;
		for (const p of this.game.scenario.map.getPlayers())
			if (p.type === playerType.humanLocal)
				sides = sides === -1 || sides === p.side ? p.side : 2;
		return sides;
	}
}

//A single scenario's player: isAI 1 is the AI, 2 the scripted AI, or as the scenario or the save says
function setupScenarioPlayer(p: Player, map: GameMap) {
	if (uiSettings.isAI[p.id] === 1 || p.type === playerType.aiLocal) {
		p.type = playerType.aiLocal;
		p.handler = handlerFor(p, map);
	} else if (uiSettings.isAI[p.id] === 2 || p.type === playerType.aiScripted) {
		p.type = playerType.aiScripted;
		p.handler = handlerFor(p, map);
	}
}

//Which sides are played on this computer: -1 none, 0 or 1, 2 both (hotseat). Scripted AI sides count as
//local
function localSideOf(players: Player[]): number {
	let sides = 1, side = -1;
	for (const p of players) {
		if (p.type === playerType.humanLocal || p.type === playerType.aiScripted) {
			if (side !== -1 && side !== p.side)
				sides++; //We already found a local playing side
			side = p.side;
		}
	}
	return sides > 1 || DEBUG_AI_MOVES ? 2 : side;
}

//The game the engine plays in, made the running one: the programs are the session's controllers
//(src/coresession.ts), the scenarios start on the core (src/coreload.ts), and the engine reads the game's
//fields at the moment it needs them (src/context.ts), so what a harness or a test assigns to game.* is
//seen as before
export function runGame(g: Game) {
	setGame(g);
	AI.driver = coreDriver;
	ScenarioLoader.build = buildOnCore;
	ScenarioLoader.coreCountries = carriedCountries;
	GameMap.removeDestroyed = removeDestroyed;
	setEngineContext({
		scenario: function() { return game.scenario; },
		campaign: function() { return game.campaign; },
		campaignPlayer: function() { return game.getCampaignPlayer(); },
		spotSide: function() { return game.spotSide; },
		rules: function() { return game.rules; },
		host: function() { return game; },
		world: function() { return rulesWorld(game.scenario, game, gameInputs(game)); }
	});
}
