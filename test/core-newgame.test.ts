//A new game on the core against the old engine's (docs/CORE.md, #135): the scenario files of the
//scenario list, each started by Game.newScenario (its players human, the streams seeded) and by
//the core's newGame from the same file read by src/scenariofile.ts, the equipment read from its own
//files: the same toData, as JSON (the save's key order, the streams' positions after the leaders'
//draws). CI starts every eighth scenario of the list; CORE_ALL_SCENARIOS=1 starts them all
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";
import { freshGame, mapSizes, startState, until } from "./lifecycle";
import { equipmentCountries, newGame, type GameSetup } from "../src/core/newgame";
import type { EquipmentTable } from "../src/core/types";
import { readScenarioFile } from "../src/core/scenariofile";
import type { EquipmentState } from "../src/state";
import type { EquipmentCountryFile } from "../src/equipment";

const GAME_DIR = process.env.OPENPANZER_GAME_DIR || path.resolve(__dirname, "../game");
const SEEDS = { game: 135, ai: 7 };

//The scenario list's files (a category header has no file)
export const scenarioFiles = () => scenariolist.filter((e) => e.length > 1).map((e) => e[0]);

//The equipment of a set's country files, and their lists by unit class, as Equipment loads them
export function readEquipment(set: string, countries: number[]): { equipment: EquipmentTable; indexes: EquipmentState["indexes"] } {
	const equipment: { [eqid: string]: EquipmentEntry } = {}, indexes: EquipmentState["indexes"] = {};
	for (const c of countries) {
		const file = path.join(GAME_DIR, "resources/equipment", set, "equipment-country-" + (c + 1) + ".json");
		const e = JSON.parse(fs.readFileSync(file, "utf8")) as EquipmentCountryFile;
		indexes[c + 1] = e.indexes;	//(by file: the country + 1)
		for (const [eqid, values] of Object.entries(e.units))
			equipment[eqid] = Object.fromEntries(e.parsehints.map((k, i) => [k, values[i]])) as unknown as EquipmentEntry;
	}
	return { equipment, indexes };
}

//What the core starts a scenario file of the list from
export function setupOf(file: string, rng: GameSetup["rng"], campaign: GameSetup["campaign"] = null, description?: string): GameSetup {
	const xml = fs.readFileSync(path.join(GAME_DIR, "resources/scenarios/data", file), "utf8");
	const scenario = readScenarioFile(new DOMParser().parseFromString(xml, "text/xml"));
	const entry = scenariolist.find((e) => e[0] === file);
	return { file, name: entry ? entry[1] : "", description: description !== undefined ? description : entry ? entry[2] : "",
		scenario, imageSize: mapSizes[scenario.image], isAI: [0, 0, 0, 0], rng, campaign,
		...readEquipment(scenario.equipment || "eqp-adlerkorps", equipmentCountries(scenario)) };
}

//Where two texts first differ
function difference(want: string, got: string): string {
	let d = 0;
	while (d < want.length && want[d] === got[d]) d++;
	return "\n    old  " + want.slice(Math.max(0, d - 150), d + 150) + "\n    core " + got.slice(Math.max(0, d - 150), d + 150);
}

const every = process.env.CORE_ALL_SCENARIOS ? 1 : 8;

test("A scenario file starts the same game on the core as on the old engine", async () => {
	const files = scenarioFiles().filter((_f, i) => i % every === 0);
	const problems: string[] = [];
	let leaders = 0;
	for (const file of files) {
		const game = await freshGame();
		const { Rng } = await import("../src/rng");
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
test("A scenario started against the AI, or the scripted tutorial, starts the same on both engines", async () => {
	const cases: [string, number[]][] = [...scenarioFiles().filter((_f, i) => i % 16 === 5).map((f): [string, number[]] => [f, [0, 1, 0, 0]]),
		["tutorial.xml", [2, 2, 2, 2]]];
	for (const [file, isAI] of cases) {
		const game = await freshGame();
		const { Rng } = await import("../src/rng");
		const { toData } = await import("../src/state");
		const { uiSettings } = await import("../src/prototypes");	//(the fresh modules')
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
