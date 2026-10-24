//The game's files read from disk, as the old engine loads them over HTTP: the scenario list, a scenario
//file, the equipment of a set's countries, the map images' sizes. The command-line player (#279) and
//the tests (test/corefiles.ts) read them the same way, and start a scenario from them
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { equipmentCountries, type GameSetup } from "../src/core/newgame";
import { readScenarioFile } from "../src/core/scenariofile";
import type { EquipmentTable } from "../src/core/types";
import type { EquipmentCountryFile } from "../src/equipment";
import type { EquipmentState } from "../src/state";

const HERE = path.dirname(fileURLToPath(import.meta.url));

//OPENPANZER_GAME_DIR: Stryker runs the tests in a copy of the repo without game/ (300 MB)
export const GAME_DIR = process.env.OPENPANZER_GAME_DIR || path.resolve(HERE, "../game");

//The scenario list (resources/scenarios/scenariolist.js, a classic script declaring a global), run in a
//context of its own
let scenarios: ScenarioListEntry[] | null = null;
export function scenarioList(): ScenarioListEntry[] {
	if (scenarios === null) {
		const context: { scenariolist?: ScenarioListEntry[] } = {};
		vm.runInNewContext(fs.readFileSync(path.join(GAME_DIR, "resources/scenarios/scenariolist.js"), "utf8"), context);
		scenarios = context.scenariolist;
	}
	return scenarios;
}

export const scenarioXml = (file: string) => fs.readFileSync(path.join(GAME_DIR, "resources/scenarios/data", file), "utf8");

//The map images' pixel sizes (test/mapsizes.json, from the PNG headers): the map is sized from its image,
//and CI checks out without Git LFS, so the images themselves aren't there
export const mapSizes = (): Record<string, [number, number]> =>
	JSON.parse(fs.readFileSync(path.resolve(HERE, "../test/mapsizes.json"), "utf8")) as Record<string, [number, number]>;

//The equipment of a set's country files and their lists by unit class, as Equipment loads them (by
//file: the country + 1)
export function readEquipment(set: string, countries: number[]): { equipment: EquipmentTable; indexes: EquipmentState["indexes"] } {
	const equipment: { [eqid: string]: EquipmentEntry } = {}, indexes: EquipmentState["indexes"] = {};
	for (const c of countries) {
		const file = path.join(GAME_DIR, "resources/equipment", set, "equipment-country-" + (c + 1) + ".json");
		const e = JSON.parse(fs.readFileSync(file, "utf8")) as EquipmentCountryFile;
		indexes[c + 1] = e.indexes;
		for (const [eqid, values] of Object.entries(e.units))
			equipment[eqid] = Object.fromEntries(e.parsehints.map((k, i) => [k, values[i]])) as unknown as EquipmentEntry;
	}
	return { equipment, indexes };
}

//What the core starts a scenario file of the list from; core: the countries of the core units a
//campaign carries in (coreCountries); parser: the DOMParser (the page's, jsdom's in Node)
export function setupOf(file: string, rng: GameSetup["rng"], campaign: GameSetup["campaign"] = null, description?: string,
	core: number[] = [], parser: DOMParser = new DOMParser()): GameSetup {
	const scenario = readScenarioFile(parser.parseFromString(scenarioXml(file), "text/xml"));
	const entry = scenarioList().find((e) => e[0] === file);
	return { file, name: entry ? entry[1] : "", description: description ?? (entry ? entry[2] : ""),
		scenario, imageSize: mapSizes()[scenario.image], isAI: [0, 0, 0, 0], rng, campaign,
		...readEquipment(scenario.equipment || "eqp-adlerkorps", equipmentCountries(scenario, core)) };
}
