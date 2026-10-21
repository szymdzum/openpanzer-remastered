//GameState: a saved game loaded back. Every engine fixture's state is a save of the reference;
//restoring it and exporting again shows what a save keeps and what it loses. A load is a fixed
//point after one pass (load, save, load gives the same save), but the first load loses fields:
//those tests are test.fails with the issue that describes the loss, a fix flips them
import { expect, test, vi } from "vitest";
import { fixtures, readFixture, restoreState } from "./contracts";
import { until } from "./lifecycle";

//Saves are parsed JSON, walked freely
type Json = any;

//The export of the game the global game module holds now
async function exportGame()
{
	const { GameState } = await import("../src/gamestate");
	const { game } = await import("../src/game");
	return new GameState(game).exportGameState();
}

//A save restored the way the contracts restore it (GameState.restoreFromString), exported again
async function load(state: string)
{
	await restoreState(state);
	return exportGame();
}

//The fixture's save and that save loaded and saved again, parsed
const loaded = new Map<string, Promise<{ saved: Json; again: Json }>>();
function loadFixture(name: string)
{
	if (!loaded.has(name))
	{
		const state = readFixture("engine", name).state;
		loaded.set(name, load(state).then((again) => ({ saved: JSON.parse(state), again: JSON.parse(again) })));
	}
	return loaded.get(name);
}

//Every unit of a save: on the hexes (ground and air) and in the reinforcements
function* units(save: Json): Generator<[string, Json]>
{
	const map = save.scenario.map;
	for (let r = 0; r < map.rows; r++)
		for (let c = 0; c < map.cols; c++)
			for (const k of ["unit", "airunit"])
				if (map.map[r][c][k]) yield [r + "," + c + " " + k, map.map[r][c][k]];
	for (const t of Object.keys(save.scenario.reinforcements))
		for (const [i, x] of save.scenario.reinforcements[t].entries())
			yield ["reinforcement " + t + "/" + i, x.unit];
}

//A save without what a load is known to lose or rebuild, the rest must survive a load:
//dayTurn and the reinforcement list's turn keys and ids (#55), the partial map edges (#54),
//the units' experience and cost per side (#83), unit ids (renumbered in hex order) and
//tempSpotted (set again by the spotting a load replays), the AI handlers (built again by
//setupPlayers), the typo field hasRessuplied (only ever written) and the move and attack
//selection
function withoutLosses(save: Json): Json
{
	const s = structuredClone(save);
	const scenario = s.scenario, map = scenario.map;
	for (const [, u] of units(s))
	{
		delete u.id;
		delete u.tempSpotted;
		delete u.hasRessuplied;
	}
	delete scenario.dayTurn;
	delete scenario.expPerSide;
	delete scenario.unitsCostPerSide;
	delete map.isLastRowPartial;
	delete map.isLastColPartial;
	const reinforcements: Json[] = [];
	for (const t of Object.keys(scenario.reinforcements).sort((a, b) => +a - +b))
		for (const x of scenario.reinforcements[t])
			reinforcements.push({ ...x, turn: +x.turn, id: undefined });
	scenario.reinforcements = reinforcements;
	for (const row of map.map)
		for (const hex of row)
		{
			delete hex.isMoveSel;
			delete hex.isAttackSel;
		}
	for (const p of [...s.players, map.currentPlayer])
		if (p) delete p.handler;
	return s;
}

//No describe block: Stryker's Vitest runner picks tests by name and misses names inside one

test.each(fixtures("engine"))("GameState load is a fixed point %s", async (name) => {
	const { again } = await loadFixture(name);
	expect(JSON.parse(await load(JSON.stringify(again))), "loading the loaded save again changes it").toEqual(again);
});

test.each(fixtures("engine"))("GameState load keeps the rest %s", async (name) => {
	const { saved, again } = await loadFixture(name);
	expect(withoutLosses(again)).toEqual(withoutLosses(saved));
});

test.each(fixtures("engine"))("GameState load keeps the units in the reinforcements %s", async (name) => {
	const { saved, again } = await loadFixture(name);
	const count = (s: Json) => Object.values(s.scenario.reinforcements).flat().length;
	expect(count(again)).toBe(count(saved));
});

//#54: Map.copy doesn't copy isLastRowPartial and isLastColPartial
test.fails.each(fixtures("engine"))("GameState load keeps the partial map edges (#54) %s", async (name) => {
	const { saved, again } = await loadFixture(name);
	const edges = (s: Json) => [s.scenario.map.isLastRowPartial, s.scenario.map.isLastColPartial];
	expect(edges(saved), "a fixture without a partial edge proves nothing").toContain(true);
	expect(edges(again)).toEqual(edges(saved));
});

//The fixtures whose save has something a load can lose
const savedState = (name: string): Json => JSON.parse(readFixture("engine", name).state);
const midDay = fixtures("engine").filter((f) => savedState(f).scenario.dayTurn !== 0);
const withReinforcements = fixtures("engine").filter((f) => Object.keys(savedState(f).scenario.reinforcements).length);

//#55: Scenario.copy doesn't copy dayTurn
test.fails.each(midDay)("GameState load keeps the time of day (#55) %s", async (name) => {
	const { saved, again } = await loadFixture(name);
	expect(saved.scenario.dayTurn).not.toBe(0);
	expect(again.scenario.dayTurn).toBe(saved.scenario.dayTurn);
});
test.each(fixtures("engine").filter((f) => !midDay.includes(f)))("GameState load keeps dayTurn 0 %s", async (name) => {
	const { saved, again } = await loadFixture(name);
	expect(saved.scenario.dayTurn).toBe(0);
	expect(again.scenario.dayTurn).toBe(0);
});

//#55: Scenario.copy adds the reinforcements again: the turn becomes the key string, the ids are
//renumbered from 1 and turns whose list was emptied by deployments are dropped
test.fails.each(withReinforcements)("GameState load keeps the reinforcement list (#55) %s", async (name) => {
	const { saved, again } = await loadFixture(name);
	expect(again.scenario.reinforcements).toEqual(saved.scenario.reinforcements);
});
test.each(fixtures("engine").filter((f) => !withReinforcements.includes(f)))(
	"GameState load keeps no reinforcements %s", async (name) => {
		const { saved, again } = await loadFixture(name);
		expect(saved.scenario.reinforcements).toEqual({});
		expect(again.scenario.reinforcements).toEqual({});
	});

//#83: Scenario.copy doesn't copy expPerSide and unitsCostPerSide (filled only by the loader), so
//units bought after a load get 0 experience
test.fails.each(fixtures("engine"))("GameState load keeps the experience and cost per side (#83) %s", async (name) => {
	const { saved, again } = await loadFixture(name);
	expect([again.scenario.expPerSide, again.scenario.unitsCostPerSide])
		.toEqual([saved.scenario.expPerSide, saved.scenario.unitsCostPerSide]);
});

//#85: Map.addUnit numbers the units again
//in hex order, so after a load a unit has another id. Fixtures before any purchase or
//deployment have them in hex order already
const renumbered = fixtures("engine").filter((f) => f.endsWith("-t2.json.gz"));
test.fails.each(renumbered)("GameState load keeps the unit ids %s (#85)", async (name) => {
	const { saved, again } = await loadFixture(name);
	const ids = (s: Json) => [...units(s)].map(([where, u]) => where + " #" + u.id);
	expect(ids(again)).toEqual(ids(saved));
});

//#84: tempSpotted isn't saved (Unit.copy), and the spotting a load replays (setHex,
//GameRules.setSpotRange) marks every enemy unit in sight as tempSpotted. Whether a fixture shows
//it depends on where its units stand: one test over all of them
test.fails("GameState load keeps tempSpotted (#84)", async () => {
	const spotted = (s: Json) => [...units(s)].filter(([, u]) => u.tempSpotted).map(([where]) => where);
	for (const name of fixtures("engine"))
	{
		const { saved, again } = await loadFixture(name);
		expect(spotted(again), name).toEqual(spotted(saved));
	}
});

//#71: Map.copy doesn't restore currentPlayer, addPlayer sets the first player. The game saves
//right after Scenario.endTurn (Game.endTurn), so a save is usually made on the next player's turn.
//The AI players (of a campaign) plan nothing here: Map.endTurn asks their handler
test.fails.each(fixtures("engine").filter((f) => f.endsWith("-t0.json.gz")))(
	"GameState load keeps whose turn it is (#71) %s", async (name) => {
		const scenario = await restoreState(readFixture("engine", name).state);
		for (const p of scenario.map.getPlayers())
			p.handler = { buildActions() {}, getAction() { return null; } };
		scenario.endTurn();
		const saved = JSON.parse(await exportGame());
		expect(saved.scenario.map.currentPlayer.id).not.toBe(0);
		const again = JSON.parse(await load(JSON.stringify(saved)));
		expect(again.scenario.map.currentPlayer.id).toBe(saved.scenario.map.currentPlayer.id);
	});

//The local save (GameState.save, plain JSON.stringify of the live objects) read back at startup
//(Game.init: GameState.restore, then onScenarioLoadFinished) gives the same game as the exported
//save, apart from the AI handlers the startup builds (setupPlayers)
test.each(fixtures("engine"))("GameState local save and startup restore %s", async (name) => {
	localStorage.clear();
	await restoreState(readFixture("engine", name).state);
	const { GameState } = await import("../src/gamestate");
	const { game } = await import("../src/game");
	game.state = new GameState(game);
	game.state.save();
	const exported = await exportGame();
	const { MAJOR_VERSION } = await import("../src/prototypes");
	expect(localStorage.getItem("openpanzer-scenario-" + MAJOR_VERSION)).not.toBeNull();

	vi.resetModules(); //a new page, the local save stays
	const { game: fresh } = await import("../src/game");
	clearInterval(fresh.loop);
	fresh.ui = { setNewScenario() {} } as unknown as typeof fresh.ui;
	fresh.init();
	await until(() => fresh.gameStarted && fresh.scenario !== null && fresh.scenario.isLoaded, "the startup restore");
	expect(fresh.scenario.file, "restored, not the default scenario").toBe(JSON.parse(exported).scenario.file);
	const withoutHandlers = (state: string) => {
		const o = JSON.parse(state);
		for (const p of [...o.players, o.scenario.map.currentPlayer])
			if (p) delete p.handler;
		return JSON.stringify(o);
	};
	const restored = withoutHandlers(await exportGame());
	expect(JSON.parse(restored)).toEqual(JSON.parse(withoutHandlers(exported)));
	expect(restored).toBe(withoutHandlers(exported));
});
