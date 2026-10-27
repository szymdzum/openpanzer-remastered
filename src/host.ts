/**
 * GameHost - the game's course outside the screen (#373): a scenario started or loaded, the campaign's
 * chain of scenarios (the outcome's prestige and dossier, the next scenario, the prototype, the core
 * units carried), and the end of the game with what follows it, decided from how the game ended (the
 * core's SessionEnd, src/core/session.ts)
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 *
 * The host decides; the screen only shows. It tells the screen what to show through the screen
 * interface (src/screen.ts), which the UI implements (src/view/screen.tsx) and a program that shows
 * nothing too (src/nullscreen.ts). It also plays a program's turn: its actions one after the other, each
 * one the screen shows waited for until the screen calls its shown (#375: there is no turn loop ticking
 * any more), then the end of its turn. What goes on is told: the screen's shown, the message the player
 * clicked away (goOn: then the campaign's next scenario loads), the person's end of turn, the screen once
 * it has shown the next player's turn. A victory is told when the screen says the step that won it has
 * been shown (the UI's animation end), the end at the turn limit when the turn ends (endTurn), and the
 * saves come where they came. Imports no UI module, so a whole campaign and a game's turns play on it
 * without the DOM (test/host.test.ts).
 */

import { actionType, DEBUG_AI_MOVES, DEFAULT_SCENARIO, difficultyType, endGameLossText, endGameType, newGameRules, outcomeNames, playerType, sideNames,
	uiSettings } from "./prototypes";
import { AI, type AIAction } from "./ai";
import { GameMap, Player } from "./map";
import { Scenario, type ScenarioOutcome } from "./scenario";
import { Campaign, type CampaignScenario } from "./campaign";
import { coreDriver, endGameTurn, handlerFor, removeDestroyed, startGameSession } from "./coresession";
import { type AttackResult, backAboard, type Command, type CommandType, Commands, type Executed, type MoveResult, type Refusal,
	type ResultOf } from "./commands";
import { CombatLog } from "./combatlog";
import { GameRules } from "./gamerules";
import { MapSelection } from "./selection";
import { buildOnCore, carriedCountries, carryPlayer, prototypeAwarded } from "./coreload";
import { applyData, gameInputs, rulesWorld, worldOf } from "./mirror";
import { ScenarioLoader } from "./scenarioloader";
import { endCampaignScenario, scenarioEnded } from "./core/campaign";
import { attackerSide, turnLimitOutcome, turnLimitResult } from "./core/turn";
import type { SessionEnd } from "./core/session";
import type { World } from "./core/types";
import { setEngineContext, touched } from "./context";
import { defined } from "./util";
import { Rng } from "./rng";
import { game, setGame } from "./session";
import type { Game } from "./game";
import type { CampaignProgress } from "./state";
import type { CloudField } from "./gamestate";
import type { Screen, ShownCommand } from "./screen";

//How a victory was won, as the loss texts and the campaign name it (endGameType)
const endTypes = { capture: endGameType.moveCapture, elimination: endGameType.noEnemyLeft };

//The game's course: Game's members hand it what the player and the files do (src/game.ts), the screen
//shows what it says. What a campaign keeps between its scenarios is here, as Game's closure kept it
export class GameHost {
	declare game: Game;
	declare screen: Screen;		//what shows the game (src/screen.ts)
	declare localSide: number;		//which sides play on this screen when the game started (localSideOf)
	declare campaignPlayer: Player | null;	//the player that plays the campaign on this screen
	declare savedPlayer: Player | null;	//its copy kept between the campaign's scenarios
	declare next: CampaignScenario | null;	//the campaign's next scenario, loaded once the player clicks on
	declare needLoad: boolean;		//the next scenario waits for the player's click on the outcome's message
	declare nextLoading: boolean;		//the next scenario asked for and loading (#64)
	declare removeNonCampaignUnits: boolean;	//a later scenario of the campaign: its own units on the deployment hexes go
	declare awardPrototype: boolean;	//a brilliant victory awards a prototype unit in the next scenario
	declare isCampaignStart: boolean;	//the campaign's first scenario: prestige, dossier and core units set
	declare showing: boolean;		//the screen shows a program's action: its next one waits for the shown
	declare requests: number;		//the screen's requests made: only the last one's shown goes on
	declare going: boolean;		//the game going on now (goOn)
	declare again: boolean;		//asked to go on while it went on

	constructor(g: Game, screen: Screen) {
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
		this.showing = false;
		this.requests = 0;
		this.going = false;
		this.again = false;
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
		this.stopShowing();
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
		this.stopShowing();
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

	//---- A new game from the start menu (the new UI's menus, #349): as the old UI's start menu starts them (src/ui.ts
	//startMenuButton, src/uibuilder.ts buildStartMenu)

	//The tutorial: no campaign, the fog of war on, both sides played by its script, on the classic rules its script
	//was planned and checked on (#188). The settings aren't saved, as the old menu didn't
	startTutorial() {
		const g = this.game;
		g.campaign = null;
		uiSettings.noFOW = false;
		uiSettings.isAI[0] = 2;
		uiSettings.isAI[1] = 2;
		g.rules = "classic";
		this.newScenario(DEFAULT_SCENARIO);
	}

	//A single scenario, its file and the briefing to show (the scenario list's), and the sides the AI plays (isAI, by
	//player): no campaign, the rules of the settings, and the settings saved with those sides
	startScenario(file: string, intro: string, isAI: number[]) {
		const g = this.game;
		uiSettings.isAI = isAI;
		g.campaign = null;
		g.rules = newGameRules();
		this.newScenario(file, intro);
		g.state.saveSettings();
	}

	//A campaign, its index in the campaign list and its difficulty (difficultyType), and the settings saved
	startCampaign(index: number, difficulty: number) {
		this.newCampaign(index, difficulty);
		this.game.state.saveSettings();
	}

	//The settings saved (uiSettings), as the old settings window's OK and the start menu's starts saved them
	saveSettings() {
		this.game.state.saveSettings();
	}

	//---- Save and load (the new UI's save and load window, #349), as the old one's buttons do them (src/uibuilder.ts
	//gameStateButton): through the game's state, the cloud's on GitHub gists as they work today (#33)

	//The game as the JSON a file keeps (GameState.exportGameState)
	exportGame(): string {
		return this.game.state.exportGameState();
	}

	//A game loaded from a file: done once it is read (the game then loads and is shown), fail when it isn't a save
	loadGame(file: Blob, done: () => void, fail: () => void) {
		this.game.state.restoreFromFile(file, done, fail);
	}

	//Saved to the cloud under the field's id, a new save when it is empty: the field tells how it goes, then saved (null)
	//or the error, and the save's id
	saveToCloud(field: CloudField, saved: (error: string | null, id?: string) => void) {
		this.game.state.saveToCloud(field, saved);
	}

	//Loaded from the cloud save of the field's id: done once it is read
	loadFromCloud(field: CloudField, done: () => void) {
		this.game.state.restoreFromCloud(field, done);
	}

	//The scenario flow of a campaign of the list, its index there: its data loaded, then the text the old campaign menu's
	//flow button showed (Campaign.getCampaignFlow), for done
	campaignFlow(index: number, done: (html: string) => void) {
		const c: Campaign = new Campaign(index, difficultyType.historical, () => done(c.getCampaignFlow()));
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

	//---- A program's turn

	//The game goes on: the campaign's next scenario once the player has clicked its outcome away, else a
	//program's actions, until one the screen shows (its shown goes on) or the end of its turn (the screen goes
	//on with the next player's, turnChanged). Nothing while the screen shows a program's action or a message
	//is open. Called again while it goes on (a screen that shows at once), it goes on in the same call
	goOn() {
		if (this.going) {
			this.again = true;
			return;
		}
		this.going = true;
		try {
			do {
				this.again = false;
				this.goOnce();
			} while (this.again);
		} finally {
			this.going = false;
		}
	}

	//One round of goOn: nothing before the game has started, after its end, or while a message is open
	goOnce() {
		const g = this.game;
		if (!g.gameStarted || g.gameEnded || !g.uiMessageClicked)
			return;
		if (this.nextScenarioWaiting()) //Load next scenario in campaign chain
			this.loadNextScenario();
		else if (!this.showing && programPlays(g.scenario.map.currentPlayer))
			this.processAIActions();
	}

	//The harness's turn loop (harness/lib/harness.js ticks it, as the game's own did until #375) and the tests':
	//the game goes on unless the screen is still showing a step (the old UI's animation of a move or an
	//attack, a program's or one a harness script plays)
	processTurn() {
		if (!this.showingStep())
			this.goOn();
	}

	//The screen still shows a step, a program's or the person's (the old UI animating a move or an attack):
	//what the turn loop holds on, and what the harness and the command-line player wait on before they look
	//or play on (#378). A screen that shows each step at once has no showingStep
	showingStep(): boolean {
		return this.screen.showingStep !== undefined && this.screen.showingStep();
	}

	//The program's actions: those the screen shows wait for its shown, the others play on at once (#8: an AI
	//turn took a minute at an action a tick). No action left ends its turn, and the screen goes on with the
	//next player's once it has shown it
	processAIActions() {
		const g = this.game;
		while (!this.showing && !g.gameEnded && !this.nextScenarioWaiting()) {
			const action = g.scenario.map.currentPlayer.handler.getAction();
			if (!this.processAction(action)) {
				this.screen.aiTurnEnded();
				if (!this.endTurn())
					this.screen.turnChanged(() => this.goOn());
				return;
			}
		}
	}

	//Plays a program's action: the move and the attack played and shown by the screen, the view events
	//shown, the others as the player's commands. False when the program's turn should end
	processAction(action: AIAction | null): boolean {
		if (!action || !action.param) return false;
		return showAction(this, action, () => this.request()) || playCommand(this.game, action);
	}

	//What the program's next action waits for, until the screen calls the shown returned (once, and only the
	//last request's: a scenario started since makes the one before stale)
	request(): () => void {
		const made = ++this.requests;
		this.showing = true;
		return () => {
			if (made !== this.requests || !this.showing)
				return;
			this.showing = false;
			if (!this.going)
				this.goOn();
		};
	}

	//Nothing is shown of a scenario that starts: what the screen still shows of the one before is stale
	stopShowing() {
		this.requests++;
		this.showing = false;
	}

	//The turn ends on the session (src/coresession.ts): the next player's turn start, the save, the side
	//shown, the reinforcements; or the game's end at the turn limit (src/core/turn.ts endsAtTurnLimit), true
	//then: the host tells the end (whichever side's last turn ended it, the person's end turn button or the
	//program's turn, #365), and the next turn's info isn't shown over it
	endTurn(): boolean {
		const g = this.game;
		if (!endGameTurn(g))
			return false;
		this.ended(g.session.ended);
		return true;
	}

	//---- A screen that reads the core and sends the person's commands (the new UI, src/view/, #380)

	//The running game's world, as the screen's rules read it: null while no scenario plays
	world(): World | null {
		const g = this.game;
		return g.session === null ? null : rulesWorld(g.scenario, g, gameInputs(g));
	}

	//A number in [0, 1) of the cosmetic stream, for the screen's sprite and sound picks: never the game's or the
	//AI's, whose order of draws is behavior (src/rng.ts)
	cosmetic(): number {
		return Rng.cosmeticRandom();
	}

	//A command played whole on the core (Commands.execute): a program's move or attack the screen shows, a
	//person's command. The victories it won are told once the screen has shown it (won)
	play<C extends Command>(cmd: C): Executed<C["type"]> {
		return Commands.execute(this.game.scenario, cmd);
	}

	//A program's move or attack played whole, then shown by the screen; its victories told once it has been shown,
	//then shown (a program's next action). The command-line player's live mode shows its moves and attacks so too
	playShown(cmd: ShownCommand, shown: () => void) {
		const done = this.play(cmd);
		this.screen.step(cmd, done, () => {
			if (done.ok) this.won(done.result);
			shown();
		});
	}

	//The victories a step won, told once the screen has shown the step (the old UI at its animation's end):
	//a move's capture, then its surprise attack's; an attack's retreat that took its side's last objective,
	//then the sides whose enemy has no unit left
	won(result: ResultOf<CommandType>) {
		for (const end of victoriesOf(result))
			this.ended(end);
	}

	//A person's command from the screen, refused while a person can't play (personRefusal). The end of turn
	//ends their turn (personEndTurn), the others are played whole (play)
	command(cmd: Command): Executed<CommandType> {
		const refusal = this.personRefusal();
		if (refusal !== null) return { ok: false, refusal };
		if (cmd.type !== "endTurn") return this.play(cmd);
		this.personEndTurn();
		return { ok: true, result: null };
	}

	//Why a person can't send a command now, null when they can: no game playing, a program's turn (or its
	//action still shown), a message to click away first
	personRefusal(): Refusal | null {
		const g = this.game;
		if (g.session === null || !g.gameStarted || g.gameEnded) return { reason: "No game is playing" };
		if (this.showing || programPlays(g.scenario.map.currentPlayer)) return { reason: "Not your turn" };
		return g.uiMessageClicked ? null : { reason: "Read the message first" };
	}

	//The person's end of turn (as the old UI's End turn did, src/ui.ts before #351): the combat log starts again
	//before the next turn's start logs its resupplies and reinforcements (#86), then a program's turn plays,
	//unless the turn limit ended the game (#365)
	personEndTurn() {
		CombatLog.reset();
		if (!this.endTurn())
			this.goOn();
	}

	//A message the player clicks away holds the game (a program's turn, the campaign's next scenario) until
	//they do (the old UI's UIBuilder.message sets the same flag); then it goes on
	holdForMessage() {
		this.game.uiMessageClicked = false;
	}

	messageClosed() {
		this.game.uiMessageClicked = true;
		this.goOn();
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

//The victories a step won (the host's won), in the old UI's order: a move's capture, then its surprise
//attack's; an attack's retreat that took its side's last objective, then the sides whose enemy has no unit left
function victoriesOf(result: ResultOf<CommandType>): SessionEnd[] {
	if (result === null || typeof result !== "object") return [];
	if ("move" in result) return moveVictories(result);
	return "attacking" in result ? attackVictories(result) : [];
}

function moveVictories(r: MoveResult): SessionEnd[] {
	const capture: SessionEnd[] = r.victorySide >= 0 ? [{ kind: "victory", side: r.victorySide, how: "capture" }] : [];
	return r.surprise === null ? capture : [...capture, ...attackVictories(r.surprise.attack)];
}

function attackVictories(r: AttackResult | null): SessionEnd[] {
	if (r === null) return [];
	const retreat = r.retreatMove;
	const capture: SessionEnd[] = retreat !== null && retreat.isVictorySide >= 0
		? [{ kind: "victory", side: retreat.isVictorySide, how: "capture" }] : [];
	return [...capture, ...r.victorySides.map((side): SessionEnd => ({ kind: "victory", side, how: "elimination" }))];
}

//No current player also goes on to process a program's actions
function programPlays(player: Player | null) {
	return !player || player.type === playerType.aiLocal || player.type === playerType.aiScripted;
}

//The actions a program's turn shows on the screen, played and shown there: the program's next action waits for its
//shown, asked for (request) before anything else is. A unit picked and a look at a hex too: the screen shows them a
//moment before the next action (#8). False for an action the screen doesn't show
function showAction(host: GameHost, a: AIAction, request: () => () => void): boolean {
	switch (a.type) {
		//(the move takes its path in the unit's move range, which the old UI shows)
		case actionType.move: {
			const shown = request(), [unit, to] = a.param;
			const cells = GameRules.getMoveRange(host.game.scenario.map, unit);
			host.playShown({ type: "move", unit: unit.id, to: { row: to.row, col: to.col }, cells }, shown);
			return true;
		}
		//(the range asked after the wait: a missing unit throws there and the turn waits for good, #80)
		case actionType.attack: {
			const shown = request(), [attacker, target] = a.param;
			if (GameRules.isInAttackRange(attacker, target)) host.playShown({ type: "attack", unit: attacker.id, target: target.id }, shown);
			else shown();
			return true;
		}
		case actionType.select: {
			const shown = request();
			host.screen.view({ type: "select", unit: a.param[0] ? a.param[0].id : null }, shown);
			return true;
		}
		case actionType.message: host.screen.view({ type: "message", text: a.param[0], at: a.param[1] }, request()); return true;
		case actionType.viewport: host.screen.view({ type: "viewport", at: a.param[0] }, request()); return true;
		default: return false;
	}
}

//The commands a program's actions send as the player's (the AI's purchases and deployment are its turn
//start's, its upgrades none: they pass)
const commandOf = { [actionType.resupply]: "resupply", [actionType.reinforce]: "reinforce", [actionType.mount]: "mount",
	[actionType.umount]: "unmount" } as const;
const passing: number[] = [actionType.upgrade, actionType.buy, actionType.deploy];

//A program's action other than a move, an attack and a view event: its command, on the core. The scripted
//tutorial can queue no unit (#80), which the command refuses where the engine threw. False for the end of
//its turn and an action unknown
function playCommand(g: Game, a: AIAction): boolean {
	if (a.type === actionType.resupply || a.type === actionType.reinforce || a.type === actionType.mount || a.type === actionType.umount) {
		const unit = a.param[0];
		const cmd = { type: commandOf[a.type], unit: unit ? unit.id : -1 };
		const done = Commands.execute(g.scenario, cmd);
		if (g.host.screen.played) g.host.screen.played(cmd, done);
		return true;
	}
	return passing.includes(a.type);
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
//(src/coresession.ts), the scenarios start on the core (src/coreload.ts), the selection puts a unit back
//aboard by the game's embark, and the engine reads the game's fields at the moment it needs them
//(src/context.ts), so what a harness or a test assigns to game.* is seen as before
export function runGame(g: Game) {
	setGame(g);
	AI.driver = coreDriver;
	ScenarioLoader.build = buildOnCore;
	ScenarioLoader.coreCountries = carriedCountries;
	GameMap.removeDestroyed = removeDestroyed;
	MapSelection.backAboard = (u, counters) => backAboard(game.scenario, u.id, counters);
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
