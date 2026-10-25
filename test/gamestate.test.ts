//GameState: saved games loaded back. Every engine fixture's state is a save of the reference in the
//format before (src/savegame.ts GameStateExport): imported, it is what that save had; loaded and
//saved again, it shows what a load keeps and what it loses. A load is a fixed point after one pass
//(load, save, load gives the same save), but the first load loses fields: those tests are test.fails
//with the issue that describes the loss, a fix flips them
import { expect, test, vi } from "vitest";
import { fixtures, readFixture, restoreState } from "./contracts";
import { failRequests, fakeMapImages, freshGame, messagesShown, startState, until } from "./lifecycle";
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
//are in
test("GameState load numbers the reinforcements of each turn from 1", async () => {
	const scenario = await restoreState(readFixture("engine", "ruscam09-t2.json.gz").state);
	const turns = Object.keys(scenario.reinforcements);
	expect(turns.length).toBeGreaterThan(0);
	for (const t of turns)
		expect(scenario.reinforcements[t].map((r) => r.id)).toEqual(scenario.reinforcements[t].map((_, i) => i + 1));
});

//A command played as the game sends it, on the game the global game module holds now; it must be
//allowed
async function play(cmd: import("../src/commands").Command) {
	const { Commands } = await import("../src/commands");
	const { game } = await import("../src/game");
	const r = Commands.execute(game.scenario, cmd);
	if ("refusal" in r) throw new Error(JSON.stringify(cmd) + " refused: " + r.refusal.reason);
}

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

//#55: the load keeps the time of day (dayTurn): the date moves on when the saved game's would have
test.each(midDay)("GameState load keeps the time of day (#55) %s", async (name) => {
	const { saved, again } = await loadFixture(name);
	expect(saved.state.scenario.dayTurn).not.toBe(0);
	expect(again.state.scenario.dayTurn).toBe(saved.state.scenario.dayTurn);
});
test.each(fixtures("engine").filter((f) => !midDay.includes(f)))("GameState load keeps dayTurn 0 %s", async (name) => {
	const { saved, again } = await loadFixture(name);
	expect(saved.state.scenario.dayTurn).toBe(0);
	expect(again.state.scenario.dayTurn).toBe(0);
});

//#83: the load keeps expPerSide and unitsCostPerSide (filled only by the scenario loader): units
//bought after a load get the enemy side's average experience, as before it
test.each(fixtures("engine"))("GameState load keeps the experience and cost per side (#83) %s", async (name) => {
	const { saved, again } = await loadFixture(name);
	expect([again.state.scenario.expPerSide, again.state.scenario.unitsCostPerSide])
		.toEqual([saved.state.scenario.expPerSide, saved.state.scenario.unitsCostPerSide]);
});

//#85: the load keeps the unit ids and the units' order (the AI walks them in it), where it numbered
//them again in hex order. The fixtures after purchases and deployments have them in another order
const renumbered = fixtures("engine").filter((f) => f.endsWith("-t2.json.gz"));
test.each(renumbered)("GameState load keeps the unit ids %s (#85)", async (name) => {
	const { saved, again } = await loadFixture(name);
	const ids = (s: SaveFile) => s.state.units.map((u) => where(u) + " #" + u.id);
	expect(ids(again)).toEqual(ids(saved));
});

//#84: the load keeps tempSpotted (an enemy unit that fired from hiding stays attackable until the
//round ends) and doesn't mark the enemy units in sight with it as the spotting it replays used to.
//Whether a fixture shows it depends on where its units stand: one test over all of them
test("GameState load keeps tempSpotted (#84)", async () => {
	const spotted = (s: SaveFile) => s.state.units.filter((u) => u.tempSpotted).map(where).sort();
	for (const name of fixtures("engine")) {
		const { saved, again } = await loadFixture(name);
		expect(spotted(again), name).toEqual(spotted(saved));
	}
});

//#71: the turn stays with the player who had it. The game saves right after the end of turn
//(Game.endTurn), so a save is usually made on the next player's turn. The end of turn alone here:
//no player plans
test.each(fixtures("engine").filter((f) => f.endsWith("-t0.json.gz")))(
	"GameState load keeps whose turn it is (#71) %s", async (name) => {
		await restoreState(readFixture("engine", name).state);
		await play({ type: "endTurn" });
		const saved = JSON.parse(await exportGame()) as SaveFile;
		expect(saved.state.turn.currentPlayer).not.toBe(0);
		const again = await load(JSON.stringify(saved));
		expect(again.state.turn.currentPlayer).toBe(saved.state.turn.currentPlayer);
	});

//#71: a game loaded on an AI player's turn has the AI plan it, as the end of the turn before had it
//plan: the game (Game.setupGameState) gives the player its AI and the AI its turn
test("GameState load on the AI's turn has the AI play it (#71)", async () => {
	const scenario = await restoreState(readFixture("engine", "drpzop01-t0.json.gz").state);
	await play({ type: "endTurn" });
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

//#142: the load keeps the campaign player's core list as it was, where it rebuilt it from the map
//in hex order and dropped its destroyed units: the campaign fixture with its first core unit
//disbanded (it stays in the list until the player goes to HQ), saved and loaded
test("GameState load keeps the campaign's core list (#142)", async () => {
	await restoreState(readFixture("engine", "campaign-3-1-t0.json.gz").state);
	const { game } = await import("../src/game");
	await play({ type: "disband", unit: game.getCampaignPlayer().getCoreUnitList()[0].id });
	const saved = JSON.parse(await exportGame()) as SaveFile;
	expect(coreLists(saved).flat(), "a destroyed core unit").toContain("lost 539");
	expect(coreLists(await load(JSON.stringify(saved)))).toEqual(coreLists(saved));
});

//#128: the scenario's description is the save's: a campaign's scenario has the campaign's intro
//(Game.onScenarioLoadFinished), where the load took the scenario list's again
test("GameState load keeps the scenario's description (#128)", async () => {
	const scenario = await restoreState(readFixture("engine", "campaign-3-1-t0.json.gz").state);
	scenario.setDescription("The campaign's intro to this scenario");
	const again = await load(await exportGame());
	expect(again.data.description).toBe("The campaign's intro to this scenario");
});

//#128: a game saved right after a human player's move can still take the move back once loaded
test("GameState load keeps the undo of the last move (#128)", async () => {
	const scenario = await restoreState(readFixture("engine", "drpzop01-t0.json.gz").state);
	const { GameRules } = await import("../src/gamerules");
	const m = scenario.map;
	const { Commands } = await import("../src/commands");
	const moved = m.getUnits().filter((u) => u.player === m.currentPlayer && u.getHex()).find((u) => {
		const cell = GameRules.getMoveRange(m, u).find((c) => c.canMove);
		if (!cell) return false;
		Commands.execute(scenario, { type: "move", unit: u.id, to: { row: cell.row, col: cell.col } });
		return m.canUndoMove(u);
	});
	const saved = JSON.parse(await exportGame()) as SaveFile;
	expect(saved.state.turn.undoable).not.toBeNull();
	const again = await load(JSON.stringify(saved));
	expect(again.state.turn.undoable).toEqual(saved.state.turn.undoable);
	const { game } = await import("../src/game");
	const u = game.scenario.map.getUnitById(moved.id);
	await play({ type: "undo", unit: u.id });
	expect([u.getPos().row, u.getPos().col]).toEqual([saved.state.turn.undoable.before.row, saved.state.turn.undoable.before.col]);
});

//#128: a loaded game rolls the dice and plays the AI the saved one would have (docs/STATE.md D8): the
//game's and the AI's streams are where the save left them, the cosmetic one isn't the save's
test("GameState load puts the random streams where the save left them (#128)", async () => {
	await restoreState(readFixture("engine", "drpzop01-t2.json.gz").state);
	const { Rng } = await import("../src/rng");
	Rng.seed(11);
	const save = await exportGame();
	const draws = (rng: typeof Rng) => [rng.random(), rng.random(), rng.aiRandom(), rng.aiRandom()];
	const want = draws(Rng);
	await restoreState(save);
	const { Rng: after } = await import("../src/rng");
	expect(draws(after)).toEqual(want);
});

//#128: the equipment lists are the save's (docs/STATE.md D9): the purchase window sorts them, which
//decides what the AI buys next (the old AI's purchases removed from them too, #22). Loaded in a new
//page, the game has the lists as the save had them, not as the equipment files have them
test("GameState load keeps the equipment lists (#128)", async () => {
	await restoreState(readFixture("engine", "drpzop01-t2.json.gz").state);
	const { Equipment } = await import("../src/equipment");
	const country = Object.keys(Equipment.equipmentIndexes)[0], lists = Equipment.equipmentIndexes[country].unitclass;
	const uclass = Object.keys(lists).find((c) => lists[c].length > 1);
	lists[uclass].splice(0, 1); //as the old AI's purchases did (#22)
	lists[uclass].reverse(); //as the purchase window's sorting does
	const saved = JSON.parse(await exportGame()) as SaveFile;
	expect((await load(JSON.stringify(saved))).state.equipment).toEqual(saved.state.equipment);
	const { Equipment: after } = await import("../src/equipment");
	expect(after.equipmentIndexes[country].unitclass[uclass]).toEqual(lists[uclass]);
});

//#128: a campaign's progress between its scenarios is the save's (Game keeps it in its closure),
//and the game started from the save (Game.init, onScenarioLoadFinished) doesn't apply it again: the
//first scenario's prestige, dossier and core list, the removal of the scenario's own units and the
//prototype award were the save's already
test("GameState load keeps a campaign's progress and doesn't apply it again (#128)", async () => {
	localStorage.clear();
	const scenario = await restoreState(readFixture("engine", "campaign-3-1-t0.json.gz").state);
	const { GameState } = await import("../src/gamestate");
	const { game } = await import("../src/game");
	game.setCampaignProgress({ isStart: true, removeNonCampaignUnits: true, awardPrototype: true }, scenario);
	game.state = new GameState(game);
	game.state.save();
	const saved = JSON.parse(await exportGame()) as SaveFile;
	expect(await startup()).toEqual(saved);
});

//The campaign fixture with a unit of the AI bought and deployed on its turn, saved and loaded
async function aiBoughtUnit() {
	const scenario = await restoreState(readFixture("engine", "campaign-3-1-t0.json.gz").state);
	const { game } = await import("../src/game");
	const m = scenario.map, ai = m.getPlayers().find((p) => p.country !== game.campaign.country);
	const eqid = m.getUnits().find((u) => u.player === ai).eqid;
	while (m.currentPlayer !== ai) await play({ type: "endTurn" });
	ai.prestige += 10000;
	(await import("../src/context")).touched();
	await play({ type: "buy", eqid, transport: -1 });
	const free = m.map.flat().find((h) => h.isDeployment > -1 && m.getPlayer(h.isDeployment).side === ai.side && h.unit === null
		&& h.airunit === null);
	const { row, col } = free.getPos();
	await play({ type: "deploy", index: ai.getCoreUnitList().length - 1, to: { row, col } });
	const saved = JSON.parse(await exportGame()) as SaveFile;
	return { saved, again: await load(JSON.stringify(saved)), at: row + "," + col + " " + eqid, ai: ai.id };
}

//#150: the load gave the campaign player every core unit on the map, the AI's bought ones too: they
//stay the AI's
test("GameState load keeps the AI's bought units the AI's (#150)", async () => {
	const { saved, again, at, ai } = await aiBoughtUnit();
	expect(coreLists(saved)[ai]).toContain(at);
	expect(coreLists(again).filter((_, i) => i !== ai).flat()).not.toContain(at);
});

//#149: a unit bought and not deployed outside a campaign was in no saved list a load read: the load
//keeps every player's core list
test("GameState load keeps the units bought outside a campaign (#149)", async () => {
	const scenario = await restoreState(readFixture("engine", "drpzop01-t0.json.gz").state);
	const p = scenario.map.currentPlayer;
	p.prestige += 10000;
	await play({ type: "buy", eqid: scenario.map.getUnits().find((u) => u.player === p).eqid, transport: -1 });
	const saved = JSON.parse(await exportGame()) as SaveFile;
	expect(coreLists(saved)[p.id]).toHaveLength(1);
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

//The campaign player's core list of a save of the format before, as it had it: the units on the map
//by id, a destroyed one lost, a bought one waiting (the campaign fixture with its first core unit
//disbanded and a unit bought)
test("GameState import keeps the campaign's core list of a save of the format before", async () => {
	const scenario = await restoreState(readFixture("engine", "campaign-3-1-t0.json.gz").state);
	const { game } = await import("../src/game");
	const player = game.getCampaignPlayer(), list = player.getCoreUnitList();
	expect(scenario.map.currentPlayer).toBe(player);
	await play({ type: "disband", unit: list[0].id });
	player.prestige += 10000;
	(await import("../src/context")).touched();
	await play({ type: "buy", eqid: list[1].eqid, transport: -1 });
	const { importSave } = await import("../src/savegame");
	const { save } = importSave(JSON.parse(oldExport(game)));
	expect(save.state.players[player.id].core).toEqual(list.map((u, i) => i === 0 ? { lost: expect.objectContaining({ eqid: u.eqid }) }
		: i === list.length - 1 ? { reserve: expect.objectContaining({ eqid: u.eqid }) } : { onMap: u.id }));
});

//Not a save: unreadable, another format or a later version
test("GameState refuses what isn't a save", async () => {
	const { readSave } = await import("../src/savegame");
	const { GameState } = await import("../src/gamestate");
	for (const text of ["not a save", "{}", "null", JSON.stringify({ version: 4, data: {}, state: {} }), JSON.stringify({ scenario: {} })]) {
		expect(readSave(text), text).toBeNull();
		expect(new GameState(null).restoreFromString(text), text).toBe(false);
	}
});

//Restarts the game as a new page does (Game.init: GameState.restore, then onScenarioLoadFinished)
//with the local save there is, returns its save
async function startup() {
	vi.resetModules(); //a new page, the local save stays
	const { game: fresh } = await import("../src/game");
	fresh.ui = { setNewScenario() {}, handleReinforcementDeployment() {} } as unknown as typeof fresh.ui;
	fresh.init();
	await until(() => fresh.gameStarted && fresh.scenario !== null && fresh.scenario.isLoaded, "the startup restore");
	return JSON.parse(await exportGame()) as SaveFile;
}

//A first start, no save there: the turn loop's ticks do nothing until a game has started, and the default
//scenario starts with the AI on the Allies (Game.newScenario's "failRestore")
test("A start without a save plays the default scenario, the AI on the Allies, the turn loop idle until then", async () => {
	localStorage.clear();
	vi.resetModules();
	fakeMapImages();
	const { game: fresh } = await import("../src/game");
	const { DEFAULT_SCENARIO, uiSettings } = await import("../src/prototypes");
	fresh.ui = { setNewScenario() {}, handleReinforcementDeployment() {}, mainMenuButton() {}, showingStep: () => false } as unknown as typeof fresh.ui;
	fresh.init();
	fresh.host.processTurn(); //(no scenario yet: a tick that went on would throw)
	await until(() => fresh.gameStarted && fresh.scenario !== null && fresh.scenario.isLoaded, "the default scenario");
	expect([fresh.scenario.file, uiSettings.isAI]).toEqual([DEFAULT_SCENARIO, [0, 1, 0, 0]]);
});

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

//#367: a save whose equipment file doesn't come fails to load as a scenario does (the game says it couldn't
//load the scenario and ends), where it waited for good: a player's country's file, and a file a unit alone
//needs (#286: pc1indi.xml's units of none of its countries are in file 31)
test.each(["equipment-country-0.json", "equipment-country-31.json"])(
	"GameState load of a save whose equipment file %s doesn't load fails, it doesn't wait for good (#367)", async (file) => {
		const game = await freshGame();
		await startState(game, "pc1indi.xml");
		const saved = await exportGame();
		const shown = await messagesShown();
		const restore = failRequests(file, "error");
		try {
			expect(game.state.restoreFromString(saved)).toBe(true);
			await until(() => shown.length > 0, "the load to fail", 5000);
			await new Promise((r) => setTimeout(r, 50)); //the other files come in
			expect(shown).toEqual(["Error Loading scenario pc1indi.xml"]);
			expect([game.scenario.isLoaded, game.gameEnded]).toEqual([false, true]);
		} finally {
			restore();
		}
	});

//#93: the save the game writes at a turn's start (the local save) is written once that turn's
//reinforcements have arrived, so a reload during the turn has them (they arrive only once)
test("The turn-start save has the reinforcements that arrived that turn (#93)", async () => {
	const game = await playing("ruscam09-t2.json.gz");
	const { Game } = await import("../src/game");
	Object.assign(game.ui, { showAlert() {} });
	game.setupGameState = new Game().setupGameState; //Game's own: it starts the session the turns end on
	const old = game.scenario;
	game.state.restoreFromString(readFixture("engine", "ruscam09-t2.json.gz").state);
	await loadedAfter(old);
	const { MAJOR_VERSION } = await import("../src/prototypes");
	const pending = async () => (JSON.parse(await exportGame()) as SaveFile).state.reinforcements.length;
	let arrived = 0;
	for (let i = 0; i < 12 && arrived === 0 && !game.gameEnded; i++) {
		const before = await pending();
		game.endTurn();
		arrived = before - await pending();
	}
	expect(arrived, "reinforcements arrived").toBeGreaterThan(0);
	const local = JSON.parse(localStorage.getItem("openpanzer-game-" + MAJOR_VERSION)) as SaveFile;
	const now = JSON.parse(await exportGame()) as SaveFile;
	expect([local.state.reinforcements.length, local.state.units.length]).toEqual([now.state.reinforcements.length, now.state.units.length]);
	expect(local).toEqual(now);
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

//The screen's end at the turn limit (#256): in the remaster rules once both sides have played their last
//turn, the attacker losing. A single scenario ends; a campaign goes on with its player's outcome
test("On the screen the remaster's turn limit ends the game once both sides have played their last turn, a campaign with its player's outcome (#256)", async () => {
	for (const name of ["drpzop01-t2.json.gz", "campaign-3-1-t0.json.gz"]) {
		const game = await playing(name);
		const { Game } = await import("../src/game");
		game.setupGameState = new Game().setupGameState;
		const save = JSON.parse(await exportGame()) as SaveFile;
		const turn = save.state.turn.turn, old = game.scenario;
		save.rules = "remaster";
		save.data.startObjectives = [save.state.objectives[0].length, save.state.objectives[1].length];
		save.state.scenario = { ...save.state.scenario, maxTurns: turn, victoryTurns: [0, 0, turn] };
		save.state.players.forEach((p) => {
			p.playedTurn = turn - 1;
			if (save.state.campaign === null) p.type = 0; //(both sides a person's: no AI plays)
		});
		game.state.restoreFromString(JSON.stringify(save));
		await loadedAfter(old);
		const outcomes: string[] = [];
		game.host.continueCampaign = (o) => { outcomes.push(o); };
		const { UIBuilder } = await import("../src/uibuilder"); //(this load's modules)
		Object.assign(UIBuilder, { message() {} });
		const attacker = save.data.startObjectives[0] > save.data.startObjectives[1] ? 0 : 1;
		game.endTurn();
		expect([game.gameEnded, game.session.ended], name + ", the first side's last turn").toEqual([false, null]);
		game.endTurn();
		const players = game.scenario.map.getPlayers();
		expect(game.session.ended, name).toEqual({ kind: "turnLimit", side: players[players.length - 1].side });
		if (save.state.campaign === null) expect([game.gameEnded, outcomes], name).toEqual([true, []]);
		else expect(outcomes, name).toEqual([game.getCampaignPlayer().side === attacker ? "lose" : "tactical"]);
	}
}, 60_000);

//The turn limit's end told once, from Game.endTurn, whichever side's last turn ended it, and the next
//turn's info (the combat log) not shown over the message: a campaign's next scenario waits for its OK
//with the game not ended, so the AI's turn showed the log over it 2.5 s later (#365)
test("The turn limit's end is told once and the combat log stays closed over it, after the AI's last turn too (#365)", async () => {
	for (const name of ["drpzop01-t2.json.gz", "campaign-3-1-t0.json.gz"]) {
		const game = await playing(name);
		const { Game } = await import("../src/game");
		const { UIBuilder } = await import("../src/uibuilder"); //(this load's modules)
		Object.assign(UIBuilder, { showAIStatus() {} });
		game.setupGameState = new Game().setupGameState;
		const save = JSON.parse(await exportGame()) as SaveFile;
		const turn = save.state.turn.turn, old = game.scenario;
		save.rules = "remaster";
		save.data.startObjectives = [save.state.objectives[0].length, save.state.objectives[1].length];
		save.state.scenario = { ...save.state.scenario, maxTurns: turn, victoryTurns: [0, 0, turn] };
		save.state.players.forEach((p) => { p.playedTurn = turn - 1; });
		game.state.restoreFromString(JSON.stringify(save));
		await loadedAfter(old);
		const screen: string[] = [];
		game.host.continueCampaign = () => { screen.push("outcome"); }; //(the next scenario waits: not ended)
		Object.assign(UIBuilder, { message() { screen.push("turn limit"); } });
		Object.assign(game.ui, { uiEndTurnInfo() { screen.push("turn info"); } });
		game.endTurn();
		const last = game.scenario.map.currentPlayer;
		last.handler = { getAction: (): null => null } as unknown as typeof last.handler; //(the AI's last turn: it ends it at once)
		vi.useFakeTimers();
		try {
			game.host.processAIActions();
			vi.advanceTimersByTime(3000);
		} finally {
			vi.useRealTimers();
		}
		expect(screen, name).toEqual([save.state.campaign === null ? "turn limit" : "outcome"]);
	}
}, 60_000);
