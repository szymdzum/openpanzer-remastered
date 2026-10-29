//A new game on the core's newGame against the game's (docs/CORE.md, #135; the old engine's until
//#137): the scenario files of the scenario list, each started by Game.newScenario (its players human,
//the streams seeded: the scenario loader's files, src/coreload.ts) and by the core's newGame from the
//same file read by scenariofile.ts, the equipment read from its own files: the same toData, as JSON
//(the save's key order, the streams' positions after the leaders' draws). CI starts every eighth
//scenario of the list; CORE_ALL_SCENARIOS=1 starts them all
import { expect, test } from "vitest";
import { freshGame, startState, until } from "./lifecycle";
import { difference, scenarioFiles, setupOf } from "./corefiles";
import { newGame } from "../src/core/newgame";

const SEEDS = { game: 135, ai: 7 };

const every = process.env.CORE_ALL_SCENARIOS ? 1 : 8;

test("A scenario file starts the same game on the core as in the game", async () => {
	const files = scenarioFiles().filter((_f, i) => i % every === 0);
	const problems: string[] = [];
	let leaders = 0;
	for (const file of files) {
		const game = await freshGame();
		const { Rng } = await import("../src/core/random");
		const { toData } = await import("../src/state");
		Rng.game.state = SEEDS.game;
		Rng.ai.state = SEEDS.ai;
		await startState(game, file);
		const want = JSON.stringify(toData(game.scenario, game));
		const got = JSON.stringify(newGame(setupOf(file, { ...SEEDS })));
		if (want !== got) problems.push(file + ":" + difference(want, got));
		if (Rng.game.state !== SEEDS.game) leaders++;
	}
	expect(problems).toEqual([]);
	expect(files.length).toBeGreaterThan(every === 1 ? 300 : 40);
	expect(leaders, "scenarios whose units drew a leader").toBeGreaterThan(0);
}, 600_000);

//The players the game asks for: the AI on side 1 (its controller sorts nothing at the start), and the
//tutorial with every player the scripted AI
test("A scenario started against the AI, or the scripted tutorial, starts the same on the core and in the game", async () => {
	const cases: [string, number[]][] = [...scenarioFiles().filter((_f, i) => i % 16 === 5).map((f): [string, number[]] => [f, [0, 1, 0, 0]]),
		["tutorial.xml", [2, 2, 2, 2]]];
	for (const [file, isAI] of cases) {
		const game = await freshGame();
		const { Rng } = await import("../src/core/random");
		const { toData } = await import("../src/state");
		const { uiSettings } = await import("../src/app/settings");	//(the fresh modules')
		Rng.game.state = SEEDS.game;
		Rng.ai.state = SEEDS.ai;
		const old = game.scenario;
		uiSettings.isAI = isAI;
		game.campaign = null;
		game.newScenario(file, scenariolist.find((e) => e[0] === file)[2]);
		await until(() => game.scenario !== old && game.scenario.isLoaded && game.gameStarted, file);
		const want = JSON.stringify(toData(game.scenario, game));
		const got = JSON.stringify(newGame({ ...setupOf(file, { ...SEEDS }), isAI }));
		expect(got === want ? "" : difference(want, got), file + " " + isAI.join()).toBe("");
	}
}, 300_000);

test("A unit whose equipment is in a country file the scenario's players don't load is still that unit (#286)", async () => {
	//pc1indi.xml (eqp-pacific): player 0's Afghan units are in the Arab Countries' file, which no player
	//of the scenario has; they started as the first equipment loaded, a Light Cruiser
	const setup = setupOf("pc1indi.xml", { ...SEEDS }), eqids = (us: { eqid: number }[]) => us.map((u) => u.eqid).sort((a, b) => a - b);
	const filed = [...setup.scenario.hexes.flatMap((h) => h.units), ...setup.scenario.reinforcements.map((r) => r.unit)]
		.filter((u) => u.eqid >= 0 && u.owner >= 0);
	const { state } = newGame(setup);
	expect(eqids([...state.units, ...state.reinforcements.map((r) => r.unit)])).toEqual(eqids(filed));
	const game = await freshGame();
	await startState(game, "pc1indi.xml");
	expect(eqids(game.scenario.map.getUnits())).toEqual(eqids(state.units));
}, 60_000);

//Panzer-Verbaende Ostpreussen (drpzop01.xml) is built on SSI's map of PG2's Ciechanow scenario (map_12.png,
//ciechan.xml) and keeps its town names hex for hex (#268: it called Ciechanow "Niedzborz" and Janow "Janon")
test("Panzer-Verbaende Ostpreussen names its towns as the Ciechanow map it is built on does (#268)", () => {
	const names = (file: string) => new Map(setupOf(file, null).scenario.hexes.filter((h) => h.name)
		.map((h) => [h.row + "," + h.col, h.name]));
	const ssi = names("ciechan.xml"), ours = names("drpzop01.xml");
	const different = [...ours].filter(([at, name]) => ssi.has(at) && ssi.get(at) !== name).map(([at, name]) => `${at} ${name}`);
	expect(different).toEqual([]);
	expect(ours.get("28,23")).toBe("Ciechanow");
});
