//GameState: saved games loaded back. Every engine fixture's state is a save of the reference in the
//format before (src/savegame.ts GameStateExport): imported, it is what that save had; loaded and
//saved again, it shows what a load keeps and what it loses. A load is a fixed point after one pass
//(load, save, load gives the same save), but the first load loses fields: those tests are test.fails
//with the issue that describes the loss, a fix flips them
import { expect, test, vi } from "vitest";
import { fixtures, readFixture, restoreState } from "./contracts";
import { until } from "./lifecycle";
import { oldExport, oldLocalItems, withoutLosses, withoutUnknown } from "./saves";
import type { SaveFile } from "../src/savegame";
import type { UnitState } from "../src/state";

//The save of the game the global game module holds now
async function exportGame() {
	const { GameState } = await import("../src/gamestate");
	const { game } = await import("../src/game");
	return new GameState(game).exportGameState();
}

//A save restored the way the contracts restore it (GameState.restoreFromString), saved again
async function load(save: string): Promise<SaveFile> {
	await restoreState(save);
	return JSON.parse(await exportGame()) as SaveFile;
}

//The fixture's save as imported, what it never stored, and the save loaded and saved again
const loaded = new Map<string, Promise<{ saved: SaveFile; unknown: import("../src/savegame").UnknownPart[]; again: SaveFile }>>();
function loadFixture(name: string) {
	if (!loaded.has(name)) {
		const state = readFixture("engine", name).state;
		loaded.set(name, (async () => {
			const { readSave } = await import("../src/savegame");
			const { save: saved, unknown } = readSave(state);
			return { saved, unknown, again: await load(state) };
		})());
	}
	return loaded.get(name);
}

//A unit by where it stands: what stays when the ids don't (#85)
const where = (u: UnitState) => u.row + "," + u.col + " " + u.eqid;

//No describe block: Stryker's Vitest runner picks tests by name and misses names inside one

test.each(fixtures("engine"))("GameState load is a fixed point %s", async (name) => {
	const { again } = await loadFixture(name);
	expect(await load(JSON.stringify(again)), "loading the loaded save again changes it").toEqual(again);
});

test.each(fixtures("engine"))("GameState load keeps the rest %s", async (name) => {
	const { saved, unknown, again } = await loadFixture(name);
	expect(withoutLosses(withoutUnknown(again, unknown))).toEqual(withoutLosses(withoutUnknown(saved, unknown)));
});

test.each(fixtures("engine"))("GameState load keeps the reinforcements %s", async (name) => {
	const { saved, again } = await loadFixture(name);
	expect(again.state.reinforcements).toEqual(saved.state.reinforcements);
});

//The save has no reinforcement ids: a loaded scenario numbers each turn's from 1, the order they
//are in, and removing one by a turn or an id it doesn't have changes nothing
test("GameState load numbers the reinforcements of each turn from 1", async () => {
	const scenario = await restoreState(readFixture("engine", "ruscam09-t2.json.gz").state);
	const turns = Object.keys(scenario.reinforcements);
	expect(turns.length).toBeGreaterThan(0);
	for (const t of turns)
		expect(scenario.reinforcements[t].map((r) => r.id)).toEqual(scenario.reinforcements[t].map((_, i) => i + 1));
	const count = Object.values(scenario.reinforcements).flat().length;
	expect(scenario.removeReinforcement(1e6, 1)).toBe(false);
	expect(scenario.removeReinforcement(+turns[0], 1e6)).toBe(false);
	expect(Object.values(scenario.reinforcements).flat()).toHaveLength(count);
});

//#54: the load keeps the half hexes at the map's edges (isLastRowPartial, isLastColPartial), which
//keep the units off them (GameRules.getMoveRange)
test.each(fixtures("engine"))("GameState load keeps the partial map edges (#54) %s", async (name) => {
	const { saved, again } = await loadFixture(name);
	const edges = (s: SaveFile) => [s.state.map.lastRowPartial, s.state.map.lastColPartial];
	expect(edges(saved), "a fixture without a partial edge proves nothing").toContain(true);
	expect(edges(again)).toEqual(edges(saved));
});

//The fixtures whose save has something a load can lose
const savedState = (name: string) => JSON.parse(readFixture("engine", name).state) as { scenario: { dayTurn: number } };
const midDay = fixtures("engine").filter((f) => savedState(f).scenario.dayTurn !== 0);

//#55: the load doesn't keep dayTurn
test.fails.each(midDay)("GameState load keeps the time of day (#55) %s", async (name) => {
	const { saved, again } = await loadFixture(name);
	expect(saved.state.scenario.dayTurn).not.toBe(0);
	expect(again.state.scenario.dayTurn).toBe(saved.state.scenario.dayTurn);
});
test.each(fixtures("engine").filter((f) => !midDay.includes(f)))("GameState load keeps dayTurn 0 %s", async (name) => {
	const { saved, again } = await loadFixture(name);
	expect(saved.state.scenario.dayTurn).toBe(0);
	expect(again.state.scenario.dayTurn).toBe(0);
});

//#83: the load doesn't keep expPerSide and unitsCostPerSide (filled only by the loader), so units
//bought after a load get 0 experience
test.fails.each(fixtures("engine"))("GameState load keeps the experience and cost per side (#83) %s", async (name) => {
	const { saved, again } = await loadFixture(name);
	expect([again.state.scenario.expPerSide, again.state.scenario.unitsCostPerSide])
		.toEqual([saved.state.scenario.expPerSide, saved.state.scenario.unitsCostPerSide]);
});

//#85: the load numbers the units again in hex order, so after a load a unit has another id.
//Fixtures before any purchase or deployment have them in hex order already
const renumbered = fixtures("engine").filter((f) => f.endsWith("-t2.json.gz"));
test.fails.each(renumbered)("GameState load keeps the unit ids %s (#85)", async (name) => {
	const { saved, again } = await loadFixture(name);
	const ids = (s: SaveFile) => s.state.units.map((u) => where(u) + " #" + u.id);
	expect(ids(again)).toEqual(ids(saved));
});

//#84: the load doesn't keep tempSpotted, and the spotting it replays marks every enemy unit in
//sight as tempSpotted. Whether a fixture shows it depends on where its units stand: one test over
//all of them
test.fails("GameState load keeps tempSpotted (#84)", async () => {
	const spotted = (s: SaveFile) => s.state.units.filter((u) => u.tempSpotted).map(where).sort();
	for (const name of fixtures("engine")) {
		const { saved, again } = await loadFixture(name);
		expect(spotted(again), name).toEqual(spotted(saved));
	}
});

//#71: the turn stays with the player who had it. The game saves right after Scenario.endTurn
//(Game.endTurn), so a save is usually made on the next player's turn. The AI players (of a
//campaign) plan nothing here: Map.endTurn asks their handler
test.each(fixtures("engine").filter((f) => f.endsWith("-t0.json.gz")))(
	"GameState load keeps whose turn it is (#71) %s", async (name) => {
		const scenario = await restoreState(readFixture("engine", name).state);
		for (const p of scenario.map.getPlayers())
			p.handler = { buildActions() {}, getAction() { return null; } };
		scenario.endTurn();
		const saved = JSON.parse(await exportGame()) as SaveFile;
		expect(saved.state.turn.currentPlayer).not.toBe(0);
		const again = await load(JSON.stringify(saved));
		expect(again.state.turn.currentPlayer).toBe(saved.state.turn.currentPlayer);
	});

//#71: a game loaded on an AI player's turn has the AI plan it, as the end of the turn before had it
//plan: the game (Game.setupGameState) gives the player its AI and the AI its turn
test("GameState load on the AI's turn has the AI play it (#71)", async () => {
	const scenario = await restoreState(readFixture("engine", "drpzop01-t0.json.gz").state);
	for (const p of scenario.map.getPlayers())
		p.handler = { buildActions() {}, getAction() { return null; } };
	scenario.endTurn();
	const ai = scenario.map.currentPlayer.id, save = await exportGame();
	const game = await playing("drpzop01-t0.json.gz");
	const { Game } = await import("../src/game");
	const { uiSettings, playerType } = await import("../src/prototypes");
	game.setupGameState = new Game().setupGameState; //Game's own, restoreState's stand-in only waits
	uiSettings.isAI[ai] = 1;
	try {
		const old = game.scenario;
		game.state.restoreFromString(save);
		await loadedAfter(old);
		const player = game.scenario.map.currentPlayer;
		expect([player.id, player.type]).toEqual([ai, playerType.aiLocal]);
		expect(player.handler.getAction(), "the AI planned its turn").not.toBeNull();
	} finally {
		uiSettings.isAI[ai] = 0;
	}
});

//The core lists by where their units stand: what stays when the ids don't (#85)
function coreLists(s: SaveFile) {
	const byId = new Map(s.state.units.map((u) => [u.id, u]));
	return s.state.players.map((p) => p.core.map((c) => "onMap" in c ? where(byId.get(c.onMap))
		: "lost" in c ? "lost " + c.lost.eqid : "reserve " + c.reserve.eqid));
}

//#142: the load rebuilds the campaign player's core list from the map, in hex order, and drops its
//destroyed units: the campaign fixture with its first core unit disbanded (it stays in the list
//until the player goes to HQ), saved and loaded
test.fails("GameState load keeps the campaign's core list (#142)", async () => {
	const scenario = await restoreState(readFixture("engine", "campaign-3-1-t0.json.gz").state);
	const { game } = await import("../src/game");
	scenario.map.disbandUnit(game.getCampaignPlayer().getCoreUnitList()[0].id);
	const saved = JSON.parse(await exportGame()) as SaveFile;
	expect(coreLists(saved).flat(), "a destroyed core unit").toContain("lost 539");
	expect(coreLists(await load(JSON.stringify(saved)))).toEqual(coreLists(saved));
});

//The campaign fixture with a unit of the AI bought and deployed, saved and loaded
async function aiBoughtUnit() {
	const scenario = await restoreState(readFixture("engine", "campaign-3-1-t0.json.gz").state);
	const { game } = await import("../src/game");
	const m = scenario.map, ai = m.getPlayers().find((p) => p.country !== game.campaign.country);
	const eqid = m.getUnits().find((u) => u.player === ai).eqid;
	ai.acquireUnit(eqid, 0);
	const free = m.map.flat().find((h) => h.unit === null && h.airunit === null && h.terrain === 0);
	const { row, col } = free.getPos();
	expect(m.deployPlayerUnit(ai, ai.getCoreUnitList().length - 1, row, col)).not.toBe(false);
	const saved = JSON.parse(await exportGame()) as SaveFile;
	return { saved, again: await load(JSON.stringify(saved)), at: row + "," + col + " " + eqid, ai: ai.id };
}

//#150: the load gives the campaign player every core unit on the map, the AI's bought ones too
test.fails("GameState load keeps the AI's bought units the AI's (#150)", async () => {
	const { saved, again, at, ai } = await aiBoughtUnit();
	expect(coreLists(saved)[ai]).toContain(at);
	expect(coreLists(again).filter((_, i) => i !== ai).flat()).not.toContain(at);
});

//#149: a unit bought and not deployed outside a campaign is in no saved list a load reads
test.fails("GameState load keeps the units bought outside a campaign (#149)", async () => {
	const scenario = await restoreState(readFixture("engine", "drpzop01-t0.json.gz").state);
	const p = scenario.map.getPlayers()[0];
	p.acquireUnit(scenario.map.getUnits().find((u) => u.player === p).eqid, 0);
	const saved = JSON.parse(await exportGame()) as SaveFile;
	expect(coreLists(saved)[0]).toHaveLength(1);
	expect(coreLists(await load(JSON.stringify(saved)))).toEqual(coreLists(saved));
});

//A save of the format before, written by the game as it was, loads as the save of the same game: it
//only lacks what it never stored. A campaign's too
test.each(["drpzop01-t2.json.gz", "campaign-3-1-t0.json.gz", "ruscam09-t2.json.gz"])(
	"GameState loads a save of the format before %s", async (name) => {
		await restoreState(readFixture("engine", name).state);
		const { game } = await import("../src/game");
		const old = oldExport(game), save = await exportGame();
		const { readSave } = await import("../src/savegame");
		const { unknown } = readSave(old);
		expect(withoutUnknown(await load(old), unknown)).toEqual(withoutUnknown(await load(save), unknown));
	});

//Not a save: unreadable, another format or a later version
test("GameState refuses what isn't a save", async () => {
	const { readSave } = await import("../src/savegame");
	const { GameState } = await import("../src/gamestate");
	for (const text of ["not a save", "{}", "null", JSON.stringify({ version: 2, data: {}, state: {} }), JSON.stringify({ scenario: {} })]) {
		expect(readSave(text), text).toBeNull();
		expect(new GameState(null).restoreFromString(text), text).toBe(false);
	}
});

//Restarts the game as a new page does (Game.init: GameState.restore, then onScenarioLoadFinished)
//with the local save there is, returns its save
async function startup() {
	vi.resetModules(); //a new page, the local save stays
	const { game: fresh } = await import("../src/game");
	clearInterval(fresh.loop);
	fresh.ui = { setNewScenario() {}, handleReinforcementDeployment() {} } as unknown as typeof fresh.ui;
	fresh.init();
	await until(() => fresh.gameStarted && fresh.scenario !== null && fresh.scenario.isLoaded, "the startup restore");
	return JSON.parse(await exportGame()) as SaveFile;
}

//The local save (GameState.save) read back at startup gives the same game as the exported save
test.each(fixtures("engine"))("GameState local save and startup restore %s", async (name) => {
	localStorage.clear();
	await restoreState(readFixture("engine", name).state);
	const { GameState } = await import("../src/gamestate");
	const { game } = await import("../src/game");
	game.state = new GameState(game);
	game.state.save();
	const exported = await exportGame();
	const { MAJOR_VERSION } = await import("../src/prototypes");
	expect(localStorage.getItem("openpanzer-game-" + MAJOR_VERSION)).not.toBeNull();
	const restored = await startup();
	expect(restored.state.scenario.file, "restored, not the default scenario").toBe(JSON.parse(exported).state.scenario.file);
	expect(restored).toEqual(JSON.parse(exported));
});

//A local save of the format before (three items) is read back at startup when there's no game item
test.each(["drpzop01-t2.json.gz", "campaign-3-1-t0.json.gz"])("GameState startup restore of a local save of the format before %s", async (name) => {
	await restoreState(readFixture("engine", name).state);
	const { game } = await import("../src/game");
	const items = oldLocalItems(game), old = oldExport(game);
	const { readSave } = await import("../src/savegame");
	const { unknown } = readSave(old);
	const want = withoutUnknown(await load(old), unknown);
	localStorage.clear();
	const { MAJOR_VERSION } = await import("../src/prototypes");
	for (const key of ["scenario", "players", "campaign"] as const)
		if (items[key] !== null) localStorage.setItem("openpanzer-" + key + "-" + MAJOR_VERSION, items[key]);
	expect(withoutUnknown(await startup(), unknown)).toEqual(want);
});

//The game restored from the fixture with a real GameState and Game.cleanup (restoreState stubs
//it), the UI stubbed: a load from a file or the cloud starts from here
async function playing(name: string) {
	await restoreState(readFixture("engine", name).state);
	const { GameState } = await import("../src/gamestate");
	const { game, Game } = await import("../src/game");
	game.cleanup = new Game().cleanup; //Game's own: the methods are its constructor's closures
	game.state = new GameState(game);
	game.ui = { setNewScenario() {}, handleReinforcementDeployment() {} } as unknown as typeof game.ui;
	return game;
}

//Waits for the game to load another scenario than old and returns its save
async function loadedAfter(old: unknown) {
	const { game } = await import("../src/game");
	await until(() => game.scenario !== old && game.scenario !== null && game.scenario.isLoaded, "the load");
	return JSON.parse(await exportGame()) as SaveFile;
}

test("GameState restores a save from a file, and refuses a file that isn't one", async () => {
	const game = await playing("drpzop01-t2.json.gz");
	const saved = await exportGame(), old = game.scenario;
	const done: string[] = [];
	expect(game.state.restoreFromFile(new Blob(["not a save"]), () => done.push("done"), () => done.push("fail"))).toBe(true);
	await until(() => done.length === 1, "the broken file");
	expect(done).toEqual(["fail"]);
	expect(game.scenario).toBe(old);
	game.state.restoreFromFile(new Blob([saved]), () => done.push("done"));
	expect(await loadedAfter(old)).toEqual(JSON.parse(saved));
	expect(done).toEqual(["fail", "done"]);
});

//A fake GitHub gists API: reply answers each request GameState sends to it, at once; the other
//requests (the equipment files) go through. Returns the function that takes it away
function fakeGists(reply: (method: string, url: string, body: string) => { status: number; body: unknown }) {
	type Request = XMLHttpRequest & { gist?: { method: string; url: string } | null };
	const proto = XMLHttpRequest.prototype;
	const real = Object.fromEntries(["open", "send", "setRequestHeader"].map((k) => [k, Object.getOwnPropertyDescriptor(proto, k)]));
	const passed = (k: string, request: Request, args: IArguments) => (real[k].value as (...a: unknown[]) => void).apply(request, [...args]);
	proto.open = function(this: Request, method: string, url: string) {
		this.gist = /api\.github\.com/.test(url) ? { method, url } : null;
		if (!this.gist) passed("open", this, arguments);
	};
	proto.setRequestHeader = function(this: Request) {
		if (!this.gist) passed("setRequestHeader", this, arguments);
	};
	proto.send = function(this: Request, body: string) {
		if (!this.gist) return passed("send", this, arguments);
		const r = reply(this.gist.method, this.gist.url, body);
		Object.defineProperty(this, "readyState", { value: 4 });
		Object.defineProperty(this, "status", { value: r.status });
		Object.defineProperty(this, "responseText", { value: JSON.stringify(r.body) });
		this.onreadystatechange(new Event("readystatechange"));
	};
	return () => { for (const k of Object.keys(real)) Object.defineProperty(proto, k, real[k]); };
}

test("GameState saves to the cloud and loads the save back", async () => {
	const game = await playing("drpzop01-t2.json.gz");
	const gists: Record<string, string> = {};
	const unfake = fakeGists((method, url, body) => {
		if (url.endsWith("/fail")) return { status: 500, body: null };
		if (method === "GET") {
			const id = url.split("/").pop();
			if (id === "nofile") return { status: 200, body: { files: {} } };
			return id in gists ? { status: 200, body: { files: { "openpanzer-save.json": { content: gists[id] } } } } : { status: 404, body: null };
		}
		const id = method === "POST" ? "g" + (Object.keys(gists).length + 1) : url.split("/").pop();
		gists[id] = (JSON.parse(body) as { files: Record<string, { content: string }> }).files["openpanzer-save.json"].content;
		return { status: 200, body: { id } };
	});
	try {
		const input = document.createElement("input");
		const replies: [string | null, string?][] = [];
		game.state.saveToCloud(input, (error, id) => replies.push([error, id]));
		game.state.saveToCloud(input, (error, id) => replies.push([error, id])); //overwrites it
		input.value = "fail";
		game.state.saveToCloud(input, (error, id) => replies.push([error, id]));
		expect(replies).toEqual([[null, "g1"], [null, "g1"], ["Cannot create save", undefined]]);
		expect(JSON.parse(gists.g1)).toEqual(JSON.parse(await exportGame()));

		input.value = "";
		expect(game.state.restoreFromCloud(input)).toBe(false);
		for (const id of ["missing", "nofile"]) {
			input.value = id;
			expect(game.state.restoreFromCloud(input)).toBe(true);
			expect(input.value).toBe("");
		}
		gists.broken = "{}";
		input.value = "broken";
		game.state.restoreFromCloud(input);
		expect(input.getAttribute("placeholder")).toBe("Cannot find game data in the save file");
		const old = game.scenario;
		let done = false;
		input.value = "g1";
		expect(game.state.restoreFromCloud(input, () => { done = true; })).toBe(true);
		expect(await loadedAfter(old)).toEqual(JSON.parse(gists.g1));
		expect([done, input.value]).toEqual([true, "g1"]);
	} finally {
		unfake();
	}
});

//The saves go when a new game starts (Game.cleanup); the settings stay
test("GameState clear removes the saves, the settings stay", async () => {
	localStorage.clear();
	const game = await playing("drpzop01-t0.json.gz");
	const { MAJOR_VERSION } = await import("../src/prototypes");
	for (const key of ["scenario", "players", "campaign"])
		localStorage.setItem("openpanzer-" + key + "-" + MAJOR_VERSION, "{}");
	game.state.save();
	game.state.saveSettings();
	game.state.clear();
	expect(Object.keys(localStorage)).toEqual(["openpanzer-settings-" + MAJOR_VERSION]);
	game.state.restoreSettings();
});
