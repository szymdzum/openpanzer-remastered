/**
 * GameHost - the game's course outside the screen: a scenario started or loaded, the campaign's chain of
 * scenarios, a program's turn and the end of the game
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 *
 * The host decides; the screen (src/app/screen.ts) only shows. A program's actions play one after the
 * other, each one the screen shows waited for until the screen calls its shown. The host imports no UI
 * module, so a whole campaign and a game's turns play on it without the DOM (test/host.test.ts).
 */

import { actionType, difficultyType, endGameLossText, endGameType } from "../legacy/prototypes";
import { DEBUG_AI_MOVES, DEFAULT_SCENARIO, newGameRules, uiSettings } from "./settings";
import { outcomeNames, playerType, sideNames } from "../core/tables";
import { AI, type AIAction } from "../legacy/ai";
import { GameMap, Player } from "../legacy/map";
import { Scenario } from "../legacy/scenario";
import type { ScenarioOutcome } from "../core/types";
import { Campaign, type CampaignScenario } from "../legacy/campaign";
import { coreDriver, endGameTurn, handlerFor, removeDestroyed, startGameSession } from "./driver";
import { type AttackResult, backAboard, Commands, type Executed, type MoveResult, type ResultOf } from "../legacy/commands";
import type { Command, CommandType, Refusal } from "../core/command";
import { CombatLog } from "../legacy/combatlog";
import { GameRules } from "../legacy/gamerules";
import { MapSelection } from "../legacy/selection";
import { buildOnCore, carriedCountries, carryPlayer, prototypeAwarded } from "./start";
import { applyData, gameInputs, rulesWorld, worldOf } from "../legacy/mirror";
import { ScenarioLoader } from "./loader";
import { endCampaignScenario, scenarioEnded } from "../core/campaign";
import { attackerSide, turnLimitOutcome, turnLimitResult } from "../core/turn";
import type { SessionEnd } from "../core/session";
import { type Knowledge, knowledgeOf } from "../core/remastered/controller";
import type { World } from "../core/types";
import { setEngineContext, touched } from "../legacy/context";
import { defined } from "../legacy/util";
import { Rng } from "../core/random";
import { game, setGame } from "./running";
import type { Game } from "./game";
import type { CampaignProgress } from "../core/state";
import type { CloudReport, CloudSaved } from "./storage";
import type { Screen, ShownCommand } from "./screen";

const endTypes = { capture: endGameType.moveCapture, elimination: endGameType.noEnemyLeft };

/** Game's members hand it what the player and the files do. It keeps what a campaign carries between scenarios. */
export class GameHost {
	declare game: Game;
	declare screen: Screen;
	declare localSide: number;		//the sides played on this screen when the game started (localSideOf)
	declare campaignPlayer: Player | null;	//the player that plays the campaign on this screen
	declare savedPlayer: Player | null;	//its copy kept between the campaign's scenarios
	declare next: CampaignScenario | null;	//the campaign's next scenario, loaded once the player clicks on
	declare needLoad: boolean;		//the next scenario waits for the player's click on the outcome's message
	declare nextLoading: boolean;		//the next scenario asked for and loading (#64)
	declare removeNonCampaignUnits: boolean;	//a later scenario of the campaign: its own units on the deployment hexes go
	declare awardPrototype: boolean;	//a brilliant victory awards a prototype unit in the next scenario
	declare isCampaignStart: boolean;	//the campaign's first scenario: prestige, dossier and core units set
	declare showing: boolean;		//the screen shows a program's action: its next one waits for the shown
	declare requests: number;		//the shown callbacks handed out: only the last one's goes on
	declare going: boolean;		//goOn is running
	declare again: boolean;		//goOn was asked while it ran

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

	//A campaign's next scenario keeps the save of the one before until its own replaces it, so closing the
	//game while it loads, or a load that fails, doesn't lose the campaign (#64)
	newScenario(file: string, intro?: string) {
		const g = this.game;
		this.cleanup(this.nextLoading);
		g.scenario = new Scenario(file);
		g.scenario.load(this.scenarioLoaded.bind(this, intro, false));
	}

	//The scenario loaded, from its file or a save (isRestore): the players set up, the session started, the
	//save, the screen. The core's newGame (src/app/start.ts) already gave the players their prestige.
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

	//A game restored from a save, whatever its source
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

	cleanup(keepSave = false) {
		const g = this.game;
		if (!keepSave)
			g.state.clear();
		//(deleted, then set: the properties end up where the original's cleanup left them)
		if (g.scenario && g.scenario.map !== null) {
			g.scenario.map.cleanup();
			delete g.scenario.map;
			g.scenario.map = null;
		}
		delete g.scenario;
		g.scenario = null;
		g.session = null;
		//No game plays until the next scenario or save loads: a step still shown ends into nothing
		g.gameStarted = false;
		this.stopShowing();
	}

	//A person's player is the default; the others get a handler
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
		touched();
	}

	//In a campaign the other countries are the AI; the campaign's country is its player (there should be one)
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

	//The campaign's start saves the player as the file had it before the start; a load during the campaign
	//copies the saved one over it (kept bug #196)
	carryCampaignPlayer(p: Player, isRestore: boolean) {
		const started = !isRestore;
		if (this.savedPlayer === null) {
			this.savedPlayer = new Player();
			this.savedPlayer.copy(p);
			if (started) {
				this.savedPlayer.prestige = p.prestigePerTurn[0];
				this.savedPlayer.dossier = {};
				this.savedPlayer.getCoreUnitList().length = 0;
			}
		} else if (!started) {
			p.copy(this.savedPlayer, true);
		}
	}

	//---- The campaign

	//The rules are the settings'; the first scenario starts once the campaign's data has loaded
	newCampaign(index: number, difficulty: number) {
		const g = this.game;
		g.rules = newGameRules();
		g.campaign = new Campaign(index, difficulty, this.campaignLoaded.bind(this));
	}

	campaignLoaded() {
		this.savedPlayer = null;
		carryPlayer(null);
		this.removeNonCampaignUnits = false;
		this.isCampaignStart = true;
		const first = this.game.campaign.getCurrentScenario();
		this.newScenario(first.scenario, first.intro);
	}

	//endType (endGameType) is only given on a loss, it picks the loss reason text
	continueCampaign(outcome: ScenarioOutcome, endType?: string) {
		this.endScenario(outcome);
		this.nextScenario(outcome, endType);
	}

	//The player carried into the next scenario, and the ended scenario kept as the original left it until the
	//next one loads (its player sent to HQ in place)
	endScenario(outcome: ScenarioOutcome) {
		const g = this.game;
		const w = worldOf(g.scenario, g, gameInputs(g));
		const ended = endCampaignScenario(w, outcome, g.campaign.getCampaignData());
		carryPlayer(ended.player);
		this.screen.reportScore(ended.player.score);
		g.session.world = { ...w, state: scenarioEnded(w, outcome, g.campaign.getCampaignData(), ended.campaign) };
		applyData(g.scenario, g.session.world, g);
		//(the saved player, which a game loaded during the campaign copies: kept bug #196)
		this.savedPlayer.supportCountries = [];
		this.savedPlayer.prestigePerTurn = [];
		this.savedPlayer.copy(this.campaignPlayer);
	}

	//The next scenario loads once the player has clicked the outcome's message away (loadNextScenario); at the
	//campaign's end the dossier shows, then the main menu
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

	nextScenarioWaiting(): boolean {
		return this.next !== null && this.needLoad;
	}

	//Asked once: a second call while it loads would start it over through the loader's shared scenario,
	//each load adding the players again (#64)
	loadNextScenario() {
		if (this.nextLoading)
			return;
		this.nextLoading = true;
		this.newScenario(this.next.scenario, this.next.intro);
	}

	//---- A new game from the start menu

	//Both sides are played by the tutorial's script, on the classic rules it was planned and checked on (#188).
	//The settings aren't saved.
	startTutorial() {
		const g = this.game;
		g.campaign = null;
		uiSettings.noFOW = false;
		uiSettings.isAI[0] = 2;
		uiSettings.isAI[1] = 2;
		g.rules = "classic";
		this.newScenario(DEFAULT_SCENARIO);
	}

	//isAI: the sides the AI plays, by player. The settings are saved with them.
	startScenario(file: string, intro: string, isAI: number[]) {
		const g = this.game;
		uiSettings.isAI = isAI;
		g.campaign = null;
		g.rules = newGameRules();
		this.newScenario(file, intro);
		g.state.saveSettings();
	}

	//difficulty: a difficultyType value. The settings are saved.
	startCampaign(index: number, difficulty: number) {
		this.newCampaign(index, difficulty);
		this.game.state.saveSettings();
	}

	saveSettings() {
		this.game.state.saveSettings();
	}

	//---- Save and load, through the game's state; the cloud's saves are GitHub gists (#33)

	exportGame(): string {
		return this.game.state.exportGameState();
	}

	//done is called once the file is read (the game then loads), fail when it isn't a save
	loadGame(file: Blob, done: () => void, fail: () => void) {
		this.game.state.restoreFromFile(file, done, fail);
	}

	//An empty id makes a new save. report is told how it goes; saved gets null or the error, and the save's id.
	saveToCloud(id: string, report: CloudReport, saved: CloudSaved) {
		this.game.state.saveToCloud(id, report, saved);
	}

	loadFromCloud(id: string, report: CloudReport, done: () => void) {
		this.game.state.restoreFromCloud(id, report, done);
	}

	//done gets Campaign.getCampaignFlow's text once the campaign's data has loaded
	campaignFlow(index: number, done: (html: string) => void) {
		const c: Campaign = new Campaign(index, difficultyType.historical, () => done(c.getCampaignFlow()));
	}

	getCampaignPlayer(): Player | null {
		return this.game.campaign !== null ? this.campaignPlayer : null;
	}

	getCampaignProgress(): CampaignProgress {
		return { isStart: this.isCampaignStart, removeNonCampaignUnits: this.removeNonCampaignUnits,
			awardPrototype: this.awardPrototype };
	}

	//For a scenario restored from the state: its campaign player is the last player of the campaign's
	//country, as setupPlayers links it
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

	//The campaign's next scenario once the player has clicked its outcome away, else a program's actions, until
	//one the screen shows or the end of its turn. Called again while it runs (a screen that shows at once), it
	//goes on in the same call.
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

	//Nothing before the game has started, after its end, or while a message is open
	goOnce() {
		const g = this.game;
		if (!g.gameStarted || g.gameEnded || !g.uiMessageClicked)
			return;
		if (this.nextScenarioWaiting())
			this.loadNextScenario();
		else if (!this.showing && programPlays(g.scenario.map.currentPlayer))
			this.processAIActions();
	}

	//The harness's turn loop (harness/lib/harness.js ticks it) and the tests': the game goes on unless the screen
	//is still showing a step
	processTurn() {
		if (!this.showingStep())
			this.goOn();
	}

	//The turn loop holds on it; the harness and the command-line player wait on it before they look or play
	//on (#378)
	showingStep(): boolean {
		return this.screen.showingStep !== undefined && this.screen.showingStep();
	}

	//The actions the screen shows wait for its shown, the others play on at once (an action a tick made an AI
	//turn take a minute, #8). No action left ends the turn; the screen then goes on with the next player's.
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

	//False when the program's turn should end
	processAction(action: AIAction | null): boolean {
		if (!action || !action.param) return false;
		return showAction(this, action, () => this.request()) || playCommand(this.game, action);
	}

	//The next action waits until the screen calls the shown returned. Only the last request's counts: a
	//scenario started since makes the one before stale.
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

	stopShowing() {
		this.requests++;
		this.showing = false;
	}

	//True when the turn limit ended the game (src/core/turn.ts endsAtTurnLimit): the host tells the end,
	//whichever side's last turn ended it (#365), and the next turn's info isn't shown over it
	endTurn(): boolean {
		const g = this.game;
		if (!endGameTurn(g))
			return false;
		this.ended(g.session.ended);
		return true;
	}

	//---- What a screen that reads the core and sends the person's commands uses (src/view/)

	//The running game's world, as the screen's rules read it: null while no scenario plays
	world(): World | null {
		const g = this.game;
		return g.session === null ? null : rulesWorld(g.scenario, g, gameInputs(g));
	}

	//What the remastered AI playing the side perceived and made of the map at its last turn, for the debug overlay
	//(src/view/map/aidebug.ts, #611): null when it plays none of the side's players
	aiKnowledge(side: number): Knowledge | null {
		const s = this.game.session;
		return s === null ? null : knowledgeOf(s.controllers, side);
	}

	//A number in [0, 1) of the cosmetic stream, for the screen's sprite and sound picks: never the game's or the
	//AI's, whose order of draws is behavior (src/core/random.ts)
	cosmetic(): number {
		return Rng.cosmeticRandom();
	}

	//The victories it won are told once the screen has shown it (won)
	play<C extends Command>(cmd: C): Executed<C["type"]> {
		return Commands.execute(this.game.scenario, cmd);
	}

	//The command is played whole, then shown by the screen; its victories are told once it has been shown.
	//The command-line player's live mode shows its moves and attacks so too.
	playShown(cmd: ShownCommand, shown: () => void) {
		const done = this.play(cmd);
		this.screen.step(cmd, done, () => {
			if (done.ok) this.won(done.result);
			shown();
		});
	}

	//The first victory victoriesOf gives, once the screen has shown the step: a game ends once, however many
	//ends one step finds (Deliberate #552)
	won(result: ResultOf<CommandType>) {
		const [end] = victoriesOf(result);
		if (end !== undefined) this.ended(end);
	}

	//Refused while a person can't play (personRefusal). The end of turn ends their turn (personEndTurn), the
	//others are played whole (play).
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

	//The combat log starts again before the next turn's start logs its resupplies and reinforcements (#86),
	//then a program's turn plays, unless the turn limit ended the game (#365)
	personEndTurn() {
		CombatLog.reset();
		if (!this.endTurn())
			this.goOn();
	}

	//A message the player clicks away holds the game (a program's turn, the campaign's next scenario) until
	//messageClosed
	holdForMessage() {
		this.game.uiMessageClicked = false;
	}

	messageClosed() {
		this.game.uiMessageClicked = true;
		this.goOn();
	}

	//---- The end of the game

	//What follows is the campaign's next scenario or the main menu
	ended(end: SessionEnd) {
		if (end.kind === "victory") {
			//The screen plays outside the session: its victory is recorded as the session's end (#391)
			this.game.session.ended = end;
			this.victory(end.side, endTypes[end.how]);
		} else if (end.kind === "turnLimit")
			this.turnLimit(end.side);
	}

	//how: an endGameType value. In a campaign the campaign player's outcome goes on to the next scenario. A
	//single scenario's is told as a defeat to a person who played the other side only, as a win to a person
	//who played it (Deliberate #76: the original asked whose turn it was). With no person playing, only who
	//won (#366). Its OK opens the main menu.
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

	//In a campaign the scenario's outcome is the campaign player's, then the next scenario (in the classic
	//rules a loss; in the remaster's a defender that held out wins, #256); a single scenario ends, the screen
	//telling who won.
	turnLimit(endedSide: number) {
		const g = this.game;
		if (g.campaign === null) {
			g.gameEnded = true;
			this.turnLimitMessage(endedSide);
			return;
		}
		this.continueCampaign(turnLimitResult(g.session.world, endedSide, this.getCampaignPlayer().side), endGameType.noTurnsLeft);
	}

	//Told by the sides a person plays now, as a victory is (#385): with no person or both sides played, only
	//who won. In the classic rules the side that ended its last turn lost, as the original said. In the
	//remaster's the defender that held out wins and the attacker that didn't take all its objectives loses
	//(#256); with no attacker the side holding more objectives wins (#231).
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

	//-1 none, a side, or 2 both (hotseat), by the players' types now, not at the session's start: the tutorial
	//hands the Axis to the person and the Allies to the AI past its 5th turn (#366)
	personSides(): number {
		let sides = -1;
		for (const p of this.game.scenario.map.getPlayers())
			if (p.type === playerType.humanLocal)
				sides = sides === -1 || sides === p.side ? p.side : 2;
		return sides;
	}
}

//A move's capture, then its surprise attack's; an attack's retreat that took its side's last objective, then the
//sides whose enemy has no unit left
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

//(no current player also goes on to process a program's actions)
function programPlays(player: Player | null) {
	return !player || player.type === playerType.aiLocal || player.type === playerType.aiScripted;
}

//The actions the screen shows: the next action waits for the shown, asked for (request) before anything else
//is. A unit picked and a look at a hex too (#8). False for an action the screen doesn't show.
function showAction(host: GameHost, a: AIAction, request: () => () => void): boolean {
	switch (a.type) {
		//(the move takes its path in the unit's move range)
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

//The AI's purchases and deployment are its turn start's, its upgrades none: they pass
const commandOf = { [actionType.resupply]: "resupply", [actionType.reinforce]: "reinforce", [actionType.mount]: "mount",
	[actionType.umount]: "unmount" } as const;
const passing: number[] = [actionType.upgrade, actionType.buy, actionType.deploy];

//The scripted tutorial can queue no unit (#80), which the command refuses instead of throwing. False for
//the end of the turn and an unknown action.
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

//isAI 1 is the AI, 2 the scripted AI, else as the scenario or the save says
function setupScenarioPlayer(p: Player, map: GameMap) {
	if (uiSettings.isAI[p.id] === 1 || p.type === playerType.aiLocal) {
		p.type = playerType.aiLocal;
		p.handler = handlerFor(p, map);
	} else if (uiSettings.isAI[p.id] === 2 || p.type === playerType.aiScripted) {
		p.type = playerType.aiScripted;
		p.handler = handlerFor(p, map);
	}
}

//-1 none, 0 or 1, 2 both (hotseat). Scripted AI sides count as local.
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

/**
 * Makes g the running game and wires the engine to it. The engine reads the game's fields when it needs them
 * (src/legacy/context.ts), so what a harness or a test assigns to game.* is seen.
 */
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
