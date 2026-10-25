//Drives the game's own lifecycle (Game.newScenario, Game.newCampaign, GameState) in jsdom, the
//way test/contracts/record.js drives it on the reference, without the UI
import fs from "node:fs";
import path from "node:path";
import { vi } from "vitest";

type Game = import("../src/game").Game;

//The map images' pixel sizes (test/mapsizes.json, from the PNG headers): ScenarioLoader sizes
//the map from its image. CI checks out without Git LFS, so the images themselves aren't there
export const mapSizes: Record<string, [number, number]> =
	JSON.parse(fs.readFileSync(path.join(__dirname, "mapsizes.json"), "utf8"));

//An Image that "loads" a map image with its real size; any other image never loads, like
//jsdom's own Image without a canvas package
class MapImage {
	width = 0;
	height = 0;
	onload: ((e: unknown) => void) | null = null;
	onerror: ((e: unknown) => void) | null = null;
	private source = "";

	get src() { return this.source; }
	set src(value: string) {
		this.source = value;
		const size = mapSizes[value];
		if (!size) return;
		queueMicrotask(() => {
			[this.width, this.height] = size;
			this.onload?.({ target: this });
		});
	}
}

//The map images "loaded" so, in jsdom and in Node
export function fakeMapImages() {
	(globalThis as unknown as { Image: unknown }).Image = MapImage;
}

//The pseudo-random generator record.js seeds Math.random with (harness.js mulberry32)
export function mulberry32(a: number) {
	return function() {
		a |= 0; a = a + 0x6D2B79F5 | 0;
		let t = Math.imul(a ^ a >>> 15, 1 | a);
		t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
		return ((t ^ t >>> 14) >>> 0) / 4294967296;
	};
}

//Polls cond until it holds (the loads are chains of microtasks), throws after ms
export async function until(cond: () => boolean, what: string, ms = 20_000) {
	const end = Date.now() + ms;
	while (!cond()) {
		if (Date.now() > end) throw new Error("timed out waiting for " + what);
		await new Promise((r) => setTimeout(r, 1));
	}
}

//Fresh modules and an empty localStorage, then the game as index.html has it after start, minus
//the UI: a GameState, no turn loop (record.js runs the loop only to let the AI play), and a UI
//stub with the two calls the lifecycle makes on it
export async function freshGame(): Promise<Game> {
	vi.resetModules();
	localStorage.clear();
	fakeMapImages();
	const { game } = await import("../src/game");
	const { GameState } = await import("../src/gamestate");
	clearInterval(game.loop);
	game.state = new GameState(game);
	game.ui = { setNewScenario() {}, mainMenuButton() {}, handleReinforcementDeployment() {},
		showAlert() {} } as unknown as Game["ui"];
	return game;
}

//Starts a state of record.sh the way record.js does, before the AI plays: Math.random seeded, then
//Game.newScenario (a scenario file, its players human, or as isAI says; "scripted:<file>", every
//player the scripted AI) or Game.newCampaign ("campaign:<index>:<difficulty>"). Resolves when it has
//loaded
export async function startState(game: Game, item: string, isAI = [0, 0, 0, 0]) {
	const { uiSettings } = await import("../src/prototypes");
	//New games play the original's rules, which the contracts pin, as the harness has them (#53)
	uiSettings.classicRules = true;
	Math.random = mulberry32(1);
	const old = game.scenario;
	if (item.startsWith("campaign:")) {
		const [, index, difficulty] = item.split(":");
		game.newCampaign(+index, +difficulty);
	} else {
		const scripted = item.startsWith("scripted:");
		const file = scripted ? item.slice("scripted:".length) : item;
		uiSettings.isAI = scripted ? [2, 2, 2, 2] : isAI;
		game.campaign = null;
		const entry = scenariolist.find((x) => x[0] === file);
		game.newScenario(file, entry ? entry[2] : "");
	}
	await until(() => game.scenario !== old && game.scenario !== null && game.scenario.isLoaded && game.gameStarted,
		item + " to load");
	return game.scenario;
}

//The "-t0" fixtures: their state is the reference's export right after startState
export function freshFixtures(module: string): string[] {
	return fs.readdirSync(path.join(__dirname, "contracts", module)).filter((f) => f.endsWith("-t0.json.gz")).sort();
}

//Makes the requests for a file of game/ fail as a browser's can (#367): "error" a network error, "empty"
//the empty body with status 0 of a missing local file. Returns the function that takes it away
export function failRequests(file: string, how: "error" | "empty"): () => void {
	type Request = XMLHttpRequest & { failing?: boolean };
	type Method = (this: Request, ...args: unknown[]) => void;
	const proto = XMLHttpRequest.prototype;
	const real = { open: Object.getOwnPropertyDescriptor(proto, "open"), send: Object.getOwnPropertyDescriptor(proto, "send") };
	const passed = (k: "open" | "send", request: Request, args: unknown[]) => (real[k].value as Method).apply(request, args);
	proto.open = function(this: Request, ...args: unknown[]) {
		this.failing = (args[1] as string).split("?")[0].endsWith("/" + file);
		passed("open", this, args);
	};
	proto.send = function(this: Request, ...args: unknown[]) {
		if (!this.failing) return passed("send", this, args);
		queueMicrotask(() => {
			Object.assign(this, { readyState: 4, status: 0, responseText: "" });
			if (how === "error") this.onerror?.(new ProgressEvent("error"));
			else this.onload?.(new ProgressEvent("load"));
		});
	};
	return () => {
		Object.defineProperty(proto, "open", real.open);
		Object.defineProperty(proto, "send", real.send);
	};
}

//The texts of the messages the game shows (UIBuilder.messageDynamic), from now on: a load that fails says so
export async function messagesShown(): Promise<string[]> {
	const { UIBuilder } = await import("../src/uibuilder");
	const shown: string[] = [];
	UIBuilder.messageDynamic = (_title: string, message: string) => { shown.push(message); };
	return shown;
}
