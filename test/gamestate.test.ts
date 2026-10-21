//GameState: a saved game loaded back. Every engine fixture's state is a save of the reference;
//restoring it and exporting again shows what a save keeps and what it loses. A load is a fixed
//point after one pass (load, save, load gives the same save), but the first load loses fields:
//those tests are test.fails with the issue that describes the loss, a fix flips them
import { expect, test } from "vitest";
import { fixtures, readFixture, restoreState } from "./contracts";

type GameStateConstructor = import("../src/gamestate").GameStateConstructor;
//Saves are parsed JSON, walked freely
type Json = any;

//The export of the game the global game module holds now
async function exportGame()
{
	const { GameState } = await import("../src/gamestate");
	const { game } = await import("../src/game");
	return new (GameState as unknown as GameStateConstructor)(game).exportGameState();
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

//#55: Scenario.copy doesn't copy dayTurn. Two fixtures were saved in the middle of a day
const midDay = ["dr9fr03-t2.json.gz", "ruscam09-t2.json.gz"];
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
test.fails.each(fixtures("engine").filter((f) => f !== "winter-t2.json.gz" && f !== "wdmillazzo-t0.json.gz"))(
	"GameState load keeps the reinforcement list (#55) %s", async (name) => {
		const { saved, again } = await loadFixture(name);
		expect(again.scenario.reinforcements).toEqual(saved.scenario.reinforcements);
	});
//The two scenarios without reinforcements
test.each(["winter-t2.json.gz", "wdmillazzo-t0.json.gz"])("GameState load keeps no reinforcements %s", async (name) => {
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

//Not filed (REFACTOR.md, "a lossless save: stable ids"): Map.addUnit numbers the units again
//in hex order, so after a load a unit has another id. Fixtures before any purchase or
//deployment have them in hex order already
const renumbered = fixtures("engine").filter((f) => f.endsWith("-t2.json.gz"));
test.fails.each(renumbered)("GameState load keeps the unit ids %s", async (name) => {
	const { saved, again } = await loadFixture(name);
	const ids = (s: Json) => [...units(s)].map(([where, u]) => where + " #" + u.id);
	expect(ids(again)).toEqual(ids(saved));
});

//Not filed: tempSpotted isn't saved (Unit.copy), and the spotting a load replays (setHex,
//GameRules.setSpotRange) marks every enemy unit in sight as tempSpotted
test.fails.each(renumbered)("GameState load keeps tempSpotted %s", async (name) => {
	const { saved, again } = await loadFixture(name);
	const spotted = (s: Json) => [...units(s)].filter(([, u]) => u.tempSpotted).map(([where]) => where);
	expect(spotted(again)).toEqual(spotted(saved));
});

//#71: Map.copy doesn't restore currentPlayer, addPlayer sets the first player. The game saves
//right after Scenario.endTurn (Game.endTurn), so a save is usually made on the next player's turn.
//On a fresh fixture both players are human, so endTurn plans no AI turn
test.fails.each(fixtures("engine").filter((f) => f.endsWith("-t0.json.gz")))(
	"GameState load keeps whose turn it is (#71) %s", async (name) => {
		const scenario = await restoreState(readFixture("engine", name).state);
		scenario.endTurn();
		const saved = JSON.parse(await exportGame());
		expect(saved.scenario.map.currentPlayer.id).not.toBe(0);
		const again = JSON.parse(await load(JSON.stringify(saved)));
		expect(again.scenario.map.currentPlayer.id).toBe(saved.scenario.map.currentPlayer.id);
	});

//The local save (GameState.save, plain JSON.stringify of the live objects) read back by
//GameState.restore, as the game does at startup, gives the same game as the exported save
test.each(fixtures("engine"))("GameState local save and restore %s", async (name) => {
	localStorage.clear();
	await restoreState(readFixture("engine", name).state);
	const { GameState } = await import("../src/gamestate");
	const { game } = await import("../src/game");
	game.state = new (GameState as unknown as GameStateConstructor)(game);
	game.state.save();
	const exported = await exportGame();
	const { MAJOR_VERSION } = await import("../src/prototypes");
	expect(localStorage.getItem("openpanzer-scenario-" + MAJOR_VERSION)).not.toBeNull();

	await restoreState(exported); //fresh modules, the local save stays
	const { GameState: FreshGameState } = await import("../src/gamestate");
	const { game: fresh } = await import("../src/game");
	await new Promise<void>((resolve, reject) => {
		new (FreshGameState as unknown as GameStateConstructor)(fresh).restore(resolve, () => reject(new Error("no save")));
	});
	expect(JSON.parse(await exportGame())).toEqual(JSON.parse(exported));
	expect(await exportGame()).toBe(exported);
});
