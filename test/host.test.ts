// @vitest-environment node
//The game host (src/host.ts) without the DOM and without the old UI: a game of plain fields (what Game
//holds), the files read from disk (test/setup.ts, the map images' sizes from test/lifecycle.ts), and a
//screen that shows nothing (src/nullscreen.ts) or only notes what it is asked to show. The host starts the
//scenarios, plays the campaign's chain, plays the programs' turns and tells the end of the game, deciding
//what follows each
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";
import { fakeMapImages, until } from "./lifecycle";
import { GAME_DIR } from "./corefiles";
import { GameHost } from "../src/host";
import { headlessGame } from "./headlessgame";
import type { Screen } from "../src/screen";
import { nullScreen } from "../src/nullscreen";
import type { Game } from "../src/game";
import type { CampaignScenario } from "../src/campaign";
import type { ScenarioOutcome } from "../src/scenario";
import { outcomeNames, playerType, sideNames, uiSettings } from "../src/prototypes";
import { touched } from "../src/context";
import { turnLimitOutcome } from "../src/core/turn";
import { Rng } from "../src/rng";

fakeMapImages();

//A screen that notes what the host asked it to show about the game's course; the dossier's close and the
//message's OK pressed at once. The rest shows nothing
function noting(told: string[]) {
	return (g: Game): Screen => ({ ...nullScreen(g),
		showScenario() { told.push("scenario " + g.scenario.file); },
		loadFailed(file) { told.push("failed " + file); },
		showPrototype() { told.push("prototype"); },
		message(title, _text, then) { told.push("message " + title); if (then) then(); },
		campaignEnd(outcome, _text, then) { told.push("dossier " + outcome); then(); },
		mainMenu() { told.push("main menu"); },
		reportScore() { told.push("score"); },
		reportAchievement(file) { told.push("achievement " + file); },
	});
}

const loaded = (g: Game, before: unknown) => g.scenario !== before && g.scenario !== null && g.scenario.isLoaded && g.gameStarted;

test("The game host plays a campaign's chain of scenarios without the DOM: each victory's outcome told, the next scenario on the player's OK, the dossier and the main menu at the end (#373)", async () => {
	expect([typeof window, typeof document]).toEqual(["undefined", "undefined"]);
	uiSettings.classicRules = true;
	Rng.seed(373);
	const told: string[] = [];
	const g = headlessGame(noting(told));
	g.host.newCampaign(0, 1);
	await until(() => loaded(g, null), "the campaign's first scenario");
	const data = JSON.parse(fs.readFileSync(path.join(GAME_DIR, "resources/campaigns/data", g.campaign.file), "utf8")) as CampaignScenario[];
	//The chain the campaign's data says each outcome leads to, against the one played
	const want: string[] = [], played: string[] = [];
	let at = 0, before: ScenarioOutcome | null = null, prototypes = 0;
	for (let step = 0; step < 40; step++) {
		const file = g.scenario.file;
		want.push(data[at].scenario);
		played.push(file);
		//(the prototype a brilliant victory awarded, before the scenario is shown)
		const started = told.splice(0);
		expect(started.filter((t) => t !== "prototype"), file).toEqual(["scenario " + file]);
		if (started[0] === "prototype") {
			expect(before, file).toBe("briliant");
			prototypes++;
		}
		const won = g.scenario.checkVictory();
		g.host.ended({ kind: "victory", side: g.host.getCampaignPlayer().side, how: "capture" });
		const goto = data[at].outcome[won].goto;
		if (goto >= data.length) {
			expect(told).toEqual(["score", "dossier " + won, "main menu", "achievement " + g.campaign.file]);
			expect([g.gameEnded, g.gameStarted, g.host.nextScenarioWaiting()]).toEqual([true, false, false]);
			break;
		}
		expect(told.splice(0), file).toEqual(["score", "message " + outcomeNames[won]]);
		expect([g.gameEnded, g.host.nextScenarioWaiting()], "the next scenario waits for the player's OK").toEqual([false, true]);
		const scenario = g.scenario;
		g.host.loadNextScenario();
		g.host.loadNextScenario(); //(asked again while it loads: it loads once, #64)
		await until(() => loaded(g, scenario), data[goto].scenario);
		[at, before] = [goto, won];
	}
	expect(played).toEqual(want);
	expect([played.length > 2, prototypes > 0]).toEqual([true, true]);
	expect((g.state as unknown as { saves: () => number }).saves(), "a save at each scenario's start").toBe(played.length);
}, 120_000);

//A single scenario started on the host, by the remaster's rules (the turn limit has a winner there, #256)
async function remasterScenario(file: string, isAI: number[], told: string[][]): Promise<Game> {
	uiSettings.isAI = isAI;
	const g = headlessGame((game) => ({ ...noting([])(game), message(title, text) { told.push([title, text.replace(/<[^>]*>/g, "")]); } }));
	g.rules = "remaster";
	g.host.newScenario(file);
	await until(() => loaded(g, null), file);
	return g;
}

//The turn limit's outcome is told by the sides a person plays now, as the victory is since #366: nobody
//is told they won or lost in a game of AIs, and past the tutorial's hand-over the person who plays the
//Axis is told their own outcome. It was told by the sides the session started with: DEFEAT to a game of
//AIs, the neutral message to the tutorial's person (#385)
test("The turn limit's outcome is told by the sides a person plays now: neutral in a game of AIs, the person's own after the tutorial's hand-over (#385)", async () => {
	const byAI: string[][] = [];
	const ais = await remasterScenario("drpzop01.xml", [1, 1, 1, 1], byAI);
	const players = ais.scenario.map.getPlayers(), last = players[players.length - 1].side;
	const o = turnLimitOutcome(ais.session.world, last);
	expect(o.winner, "the turn limit has a winner").not.toBe(-1);
	ais.host.ended({ kind: "turnLimit", side: last });
	expect(ais.gameEnded).toBe(true);
	expect(byAI, "a game of AIs").toEqual([[outcomeNames[o.rating], "The " + sideNames[o.winner] + " side held the objectives to the end"]]);

	const byPerson: string[][] = [];
	const tutorial = await remasterScenario("tutorial.xml", [2, 2, 2, 2], byPerson);
	//The hand-over (src/core/tutorial.ts handOver): the Axis to the person, the Allies to the AI
	for (const p of tutorial.scenario.map.getPlayers()) p.type = p.side === 0 ? playerType.humanLocal : playerType.aiLocal;
	touched();
	//(the Axis attacks there: holding out, the Allies win)
	expect(turnLimitOutcome(tutorial.session.world, 1).winner).toBe(1);
	tutorial.host.ended({ kind: "turnLimit", side: 1 });
	expect(byPerson, "the tutorial's person, the Axis").toEqual([["DEFEAT", "You didn't capture all the objectives in time"]]);
});

//The scenario won by a side, each told by the sides a person plays now: a defeat to the person who played the other
//side, a win to the one who played it, with the winner's country, side and why; nobody told they won or lost in a game
//of AIs; past the tutorial's hand-over the person plays the Axis. The old game asked whose turn it was, so the person
//whose last unit fell attacking was told they won by capturing all the victory hexes (#76), and the tutorial's Allied
//victory was told as the person's win (#366). (These were the old UI's tests until #351)
test("A victory is told by the sides a person plays now, with the winner and why: a defeat, a win, nobody's in a game of AIs (#76, #366)", async () => {
	const country = (g: Game, side: number) => g.scenario.map.getPlayers().find((p) => p.side === side)!.getCountryName();
	const won = (g: Game, side: number, how: "elimination" | "capture", told: string[][]) => {
		g.host.ended({ kind: "victory", side, how });
		g.gameEnded = false;
		return told.splice(0)[0];
	};
	const told: string[][] = [];
	const person = await remasterScenario("drpzop01.xml", [0, 1, 1, 1], told);
	expect(won(person, 1, "elimination", told)).toEqual(["DEFEAT", "You have lost ! Your enemy " + country(person, 1)
		+ " on Allies side wins by destroying all the enemy units with a final score of " + person.scenario.map.getPlayers()[1].score + ". "]);
	const [title, text] = won(person, 0, "capture", told);
	expect(title).not.toBe("DEFEAT");
	expect(text).toContain("You have won this scenario ! " + country(person, 0) + " on Axis side wins by capturing all victory hexes");

	const ais = await remasterScenario("drpzop01.xml", [1, 1, 1, 1], told);
	for (const side of [1, 0]) {
		const [t, said] = won(ais, side, "elimination", told);
		expect([t === "DEFEAT", said.includes("You have")], "a game of AIs").toEqual([false, false]);
		expect(said).toContain(country(ais, side) + " on " + sideNames[side] + " side wins by destroying all the enemy units");
	}

	const tutorial = await remasterScenario("tutorial.xml", [2, 2, 2, 2], told);
	//The hand-over (src/core/tutorial.ts handOver): the Axis to the person, the Allies to the AI
	for (const p of tutorial.scenario.map.getPlayers()) p.type = p.side === 0 ? playerType.humanLocal : playerType.aiLocal;
	touched();
	expect(won(tutorial, 1, "elimination", told)[0]).toBe("DEFEAT");
});

//The game's turns on the host with a screen that shows nothing (#374): the turn loop's ticks play the AI's
//actions, each move and attack played and shown at once, and end its turns, as the old UI's game plays
//them, with no window and no document
test("A scenario's turns play through the game host on a screen that shows nothing (#374)", async () => {
	expect([typeof window, typeof document]).toEqual(["undefined", "undefined"]);
	uiSettings.classicRules = true;
	uiSettings.isAI = [1, 1, 1, 1];
	Rng.seed(374);
	const played = { move: 0, attack: 0, shown: 0 };
	const told: string[] = [];
	const g = headlessGame((game) => {
		const screen = nullScreen(game);
		const counted = (shown: () => void) => () => { played.shown++; shown(); };
		return { ...screen, turnEvents(events) { told.push(...events.map((e) => e.type)); },
			step(cmd, done, shown) { played[cmd.type]++; screen.step(cmd, done, counted(shown)); } };
	});
	g.host.newScenario("drpzop01.xml");
	await until(() => loaded(g, null), "drpzop01.xml");
	expect(g.uiMessageClicked, "the briefing clicked away at once").toBe(true);
	const m = g.scenario.map, start = m.turn, turns = 3;
	for (let tick = 0; tick < 5000 && m.turn < start + turns && !g.gameEnded; tick++) {
		g.host.processTurn();
		expect(g.host.showing, "each action shown at once").toBe(false);
	}
	expect([m.turn, g.gameEnded]).toEqual([start + turns, false]);
	expect(played.move > 0 && played.attack > 0, JSON.stringify(played)).toBe(true);
	expect(played.shown).toBe(played.move + played.attack);
	//each turn's start told the screen what it did (#348): the start's own events (the automatic resupplies among
	//them), the reinforcements' arrivals
	expect(told.filter((t) => t === "turnStarted").length).toBeGreaterThanOrEqual(turns);
	expect(told.includes("arrived"), told.join()).toBe(true);
	expect((g.state as unknown as { saves: () => number }).saves(), "a save at the start and at each turn's start")
		.toBeGreaterThan(turns);
}, 60_000);

//The tutorial's script on the same screen: its messages pointing at hexes, each clicked away at once, its
//selections and looks at hexes, played through the host to the hand-over past its 5th turn; then its end told
test("The tutorial's script plays through the game host on a screen that shows nothing (#374)", async () => {
	uiSettings.classicRules = true;
	uiSettings.isAI = [2, 2, 2, 2];
	Rng.seed(374);
	const views: string[] = [];
	const g = headlessGame((game) => {
		const screen = nullScreen(game);
		return { ...screen, view(event, shown) { views.push(event.type); screen.view(event, shown); } };
	});
	g.host.newScenario("tutorial.xml");
	await until(() => loaded(g, null), "tutorial.xml");
	const m = g.scenario.map;
	for (let tick = 0; tick < 5000 && m.turn < 6 && !g.gameEnded; tick++) {
		g.host.processTurn();
		expect(g.host.showing, "each action shown at once").toBe(false);
	}
	expect([m.turn, g.gameEnded]).toEqual([6, false]);
	expect(["message", "select", "mainMenu"].filter((v) => !views.includes(v)), "the view events shown").toEqual([]);
	g.host.ended({ kind: "victory", side: 0, how: "capture" });
	expect([g.gameEnded, g.uiMessageClicked]).toEqual([true, true]);
}, 60_000);

//The start menu's new games (#349), as the old UI's start menu starts them: the tutorial on the classic rules with both
//sides scripted and the fog on, a scenario and a campaign on the settings' rules, the settings saved but for the tutorial
test("The start menu's tutorial, scenario and campaign start through the game host as the old menu starts them (#349)", async () => {
	const settingsSaves = (g: Game) => (g.state as unknown as { settingsSaves: () => number }).settingsSaves();
	uiSettings.classicRules = false;
	uiSettings.noFOW = true;
	uiSettings.isAI = [0, 1, 0, 0];
	const g = headlessGame(nullScreen);
	g.host.startTutorial();
	await until(() => loaded(g, null), "the tutorial");
	expect([g.scenario.file, g.rules, g.campaign, uiSettings.noFOW, uiSettings.isAI, settingsSaves(g)])
		.toEqual(["tutorial.xml", "classic", null, false, [2, 2, 0, 0], 0]);
	expect(g.scenario.map.getPlayers().map((p) => p.type)).toEqual([playerType.aiScripted, playerType.aiScripted]);

	//(the sides the AI plays are the window's, given to the host, which keeps them in the settings it saves)
	uiSettings.isAI = [0, 0, 0, 0];
	let before = g.scenario;
	const entry = scenariolist.find((s) => s[0] === "tutorial.xml")!;
	g.host.startScenario(entry[0], entry[2]!, [0, 1, 0, 0]);
	expect(uiSettings.isAI).toEqual([0, 1, 0, 0]);
	await until(() => loaded(g, before), "a scenario");
	expect([g.scenario.file, g.rules, g.campaign, g.scenario.getDescription(), settingsSaves(g)]).toEqual(["tutorial.xml", "remaster", null, entry[2], 1]);
	expect(g.scenario.map.getPlayers().map((p) => p.type)).toEqual([playerType.humanLocal, playerType.aiLocal]);

	uiSettings.classicRules = true;
	before = g.scenario;
	g.host.startCampaign(1, 2);
	await until(() => loaded(g, before), "a campaign");
	expect([g.campaign.id, g.campaign.difficulty, g.rules, settingsSaves(g)]).toEqual([1, 2, "classic", 2]);
	expect(g.scenario.file).toBe(g.campaign.getCampaignData()[0].scenario);
}, 60_000);

//The settings window's OK (#349): the settings saved through the game's state
test("The game host saves the settings, as the old settings window's OK did (#349)", () => {
	const g = headlessGame(nullScreen);
	g.host.saveSettings();
	expect((g.state as unknown as { settingsSaves: () => number }).settingsSaves()).toBe(1);
});

//The save and load window's (#349): through the game's state, as the old window's buttons
test("The game host saves and loads through the game's state, as the old save and load window did (#349)", () => {
	const g = headlessGame(nullScreen);
	const calls: unknown[][] = [];
	const field = { value: "", setAttribute() {} };
	const done = () => {}, fail = () => {}, saved = () => {};
	g.state = { exportGameState: () => "the game", restoreFromFile: (...a: unknown[]) => calls.push(["file", ...a]),
		saveToCloud: (...a: unknown[]) => calls.push(["save", ...a]), restoreFromCloud: (...a: unknown[]) => calls.push(["load", ...a]) } as never;
	const file = new Blob(["{}"]);
	expect(g.host.exportGame()).toBe("the game");
	g.host.loadGame(file, done, fail);
	g.host.saveToCloud(field, saved);
	g.host.loadFromCloud(field, done);
	expect(calls).toEqual([["file", file, done, fail], ["save", field, saved], ["load", field, done]]);
});

//The campaign menu's flow (#349): the campaign's scenarios, each with where its outcomes lead, as the old menu showed it
test("The game host gives a campaign's scenario flow, as the old campaign menu's flow button showed it (#349)", async () => {
	const g = headlessGame(nullScreen);
	let flow: string | null = null;
	g.host.campaignFlow(1, (html) => { flow = html; });
	await until(() => flow !== null, "the campaign's data");
	const data = JSON.parse(fs.readFileSync(path.join(GAME_DIR, "resources/campaigns/data", campaignlist[1].file), "utf8")) as CampaignScenario[];
	const first = scenariolist.find((s) => s[0] === data[0].scenario)![1]!;
	expect(flow!.startsWith("- <b>" + first + "</b><br/>&nbsp;&nbsp;&nbsp;&nbsp;Lose: ")).toBe(true);
	expect(flow!.split("- <b>").length - 1).toBe(data.length);
	expect(g.campaign).toBeNull();
});

//A program's turn waits for the screen's shown, not for a tick (#375): a move or an attack held by the
//screen holds the turn, the game told to go on meanwhile does nothing, the shown goes on to the next one.
//A shown left from before a scenario started goes on with nothing. A screen that goes on with the next
//player's turn at once plays it in the same call
test("A program's next action waits for the screen's shown, and only the last request's (#375)", async () => {
	uiSettings.classicRules = true;
	uiSettings.isAI = [1, 1, 1, 1];
	Rng.seed(375);
	const held: (() => void)[] = [];
	const log: string[] = [];
	let turns = 0;
	const g = headlessGame((game) => {
		const screen = nullScreen(game);
		const hold = (shown: () => void) => () => { held.push(shown); };
		return { ...screen,
			step(cmd, done, shown) { screen.step(cmd, done, hold(shown)); },
			turnChanged(next) {
				log.push("changed");
				if (turns++ < 1) next();
			} };
	});
	g.host.newScenario("drpzop01.xml");
	await until(() => loaded(g, null), "drpzop01.xml");
	const m = g.scenario.map, first = m.currentPlayer;
	for (const p of m.getPlayers()) {
		const getAction = p.handler.getAction.bind(p.handler);
		p.handler.getAction = () => {
			log.push("player " + p.id);
			return getAction();
		};
	}
	g.host.processTurn();
	expect([held.length, g.host.showing], "the first move or attack held").toEqual([1, true]);
	g.host.processTurn();
	g.host.goOn();
	expect(held.length, "nothing goes on while it is held").toBe(1);
	held.shift()!();
	expect(held.length, "its shown goes on to the next one").toBe(1);
	const stale = held.shift()!;
	g.host.stopShowing();
	stale();
	expect([held.length, g.host.showing], "a shown from before goes on with nothing").toEqual([0, false]);
	//On to the end of the first player's turn, and at once through the next player's
	for (let n = 0; n < 500 && turns === 0; n++) {
		g.host.processTurn();
		while (held.length > 0) held.shift()!();
	}
	const changed = log.indexOf("changed");
	expect([log[changed - 1], log[changed + 1]], "the next player's turn played on in the same call")
		.toEqual(["player " + first.id, "player " + m.getPlayers().find((p) => p !== first)!.id]);
}, 60_000);

//A look at a hex the program asks for is shown, and its next action waits for it as for a unit it picks
test("A program's look at a hex is shown on the screen and waited for (#375)", async () => {
	const views: string[] = [];
	let shown: (() => void) | undefined;
	const g = headlessGame((game) => ({ ...nullScreen(game), view(event, s) { views.push(event.type); shown = s; } }));
	const { actionType } = await import("../src/prototypes");
	expect(g.host.processAction({ type: actionType.viewport, param: [{ row: 1, col: 2 }] } as never)).toBe(true);
	expect([views, g.host.showing]).toEqual([["viewport"], true]);
	shown!();
	expect(g.host.showing).toBe(false);
});

//The host plays a program's move and attack whole, the screen that shows nothing shows them at once, and the host
//tells the victories they won then, in the old UI's order (#375, review A12): a move that took its side's last objective, an attack that
//left the other side with no unit. Its messages are clicked away at once
test("The screen that shows nothing tells the host the victories a move and an attack won (#375)", async () => {
	const { smallGame } = await import("./smallgame");
	const ended: string[] = [];
	//(the host's own play and won, its end noted)
	const fake = (scenario: unknown) => {
		const g = { scenario, uiMessageClicked: false } as unknown as Game;
		g.host = Object.assign(Object.create(GameHost.prototype) as GameHost, { game: g, screen: nullScreen(g),
			ended(e: { side: number; how: string }) { ended.push(e.how + " " + e.side); } });
		return g;
	};
	//A German tank next to its side's objective, at (10, 10)
	let game = fake(smallGame([[142, 0, 9, 10], [504, 1, 1, 1]]).scenario);
	let shown = 0;
	const screen = () => nullScreen(game);
	const m = () => game.scenario.map;
	m().setMoveRange(m().getUnitById(0));
	game.host.playShown({ type: "move", unit: 0, to: { row: 10, col: 10 }, cells: m().getCurrentMoveRange() }, () => { shown++; });
	expect([ended.splice(0), shown]).toEqual([["capture 0"], 1]);
	//A German tank against the last Soviet unit, left with one strength point
	game = fake(smallGame([[142, 0, 5, 5], [504, 1, 5, 6]]).scenario);
	m().getUnitById(1).strength = 1;
	touched();
	game.host.playShown({ type: "attack", unit: 0, target: 1 }, () => { shown++; });
	expect([ended.splice(0), shown]).toEqual([["elimination 0"], 2]);
	const s = screen();
	s.message("title", "text");
	let closed = false;
	s.campaignEnd("victory", "text", () => { closed = true; });
	expect([game.uiMessageClicked, closed]).toEqual([true, true]);
});

test("The screen's sprite and sound picks come from the cosmetic stream: the dice and the AI's draws don't move (#347)", () => {
	Rng.seed(347);
	const g = headlessGame(noting([]));
	const game = Rng.game.state, ai = Rng.ai.state, cosmetic = Rng.cosmetic.state;
	const n = g.host.cosmetic();
	expect(n).toBeGreaterThanOrEqual(0);
	expect(n).toBeLessThan(1);
	expect([Rng.game.state, Rng.ai.state]).toEqual([game, ai]);
	expect(Rng.cosmetic.state).not.toBe(cosmetic);
});
