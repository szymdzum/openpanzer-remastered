// @vitest-environment node
//The game host (src/host.ts) without the DOM and without the old UI: a game of plain fields (what Game
//holds), the files read from disk (test/setup.ts, the map images' sizes from test/lifecycle.ts), and a
//screen that only notes what it is asked to show. The host starts the scenarios, plays the campaign's
//chain and tells the end of the game, deciding what follows each
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";
import { fakeMapImages, until } from "./lifecycle";
import { GAME_DIR } from "./corefiles";
import { GameHost, type HostScreen, runGame } from "../src/host";
import type { Game } from "../src/game";
import type { CampaignScenario } from "../src/campaign";
import type { ScenarioOutcome } from "../src/scenario";
import { outcomeNames, uiSettings } from "../src/prototypes";
import { Rng } from "../src/rng";

fakeMapImages();

//The game the host plays: Game's fields, and the members the engine and the core's glue call on it
//(src/coresession.ts, src/coreload.ts, src/mirror.ts), handed on to the host as Game hands them
function headlessGame(screen: (g: Game) => HostScreen): Game {
	let saves = 0;
	const g = { ui: null, state: { save() { saves++; }, clear() {}, saves: () => saves }, campaign: null, scenario: null,
		gameStarted: false, gameEnded: false, waitUIAnimation: false, spotSide: -1, rules: "classic", uiMessageClicked: false,
		session: null } as unknown as Game;
	const host = new GameHost(g, screen(g));
	Object.assign(g, { host,
		getCampaignPlayer: () => host.getCampaignPlayer(),
		getCampaignProgress: () => host.getCampaignProgress(),
		setCampaignProgress: (...args: Parameters<GameHost["setCampaignProgress"]>) => host.setCampaignProgress(...args),
		setCurrentSide: () => host.setCurrentSide() });
	runGame(g);
	return g;
}

//A screen that notes what it was asked to show; the dossier's close and the message's OK pressed at once
function noting(told: string[]) {
	return (g: Game): HostScreen => ({
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
