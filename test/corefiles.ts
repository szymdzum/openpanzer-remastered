//What the core starts a game from, read from the game's files as the old engine reads them: the
//scenario files of the list, the equipment of a set's countries (test/core-newgame.test.ts,
//test/core-campaign.test.ts)
import fs from "node:fs";
import path from "node:path";
import { mapSizes } from "./lifecycle";
import { equipmentCountries, type GameSetup } from "../src/core/newgame";
import type { EquipmentTable } from "../src/core/types";
import { readScenarioFile } from "../src/core/scenariofile";
import type { EquipmentState } from "../src/state";
import type { EquipmentCountryFile } from "../src/equipment";

export const GAME_DIR = process.env.OPENPANZER_GAME_DIR || path.resolve(__dirname, "../game");

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

//What the core starts a scenario file of the list from; core: the countries of the core units a
//campaign carries in (coreCountries)
export function setupOf(file: string, rng: GameSetup["rng"], campaign: GameSetup["campaign"] = null, description?: string,
	core: number[] = []): GameSetup {
	const xml = fs.readFileSync(path.join(GAME_DIR, "resources/scenarios/data", file), "utf8");
	const scenario = readScenarioFile(new DOMParser().parseFromString(xml, "text/xml"));
	const entry = scenariolist.find((e) => e[0] === file);
	return { file, name: entry ? entry[1] : "", description: description !== undefined ? description : entry ? entry[2] : "",
		scenario, imageSize: mapSizes[scenario.image], isAI: [0, 0, 0, 0], rng, campaign,
		...readEquipment(scenario.equipment || "eqp-adlerkorps", equipmentCountries(scenario, core)) };
}

//Where two texts first differ
export function difference(want: string, got: string): string {
	let d = 0;
	while (d < want.length && want[d] === got[d]) d++;
	return "\n    old  " + want.slice(Math.max(0, d - 150), d + 150) + "\n    core " + got.slice(Math.max(0, d - 150), d + 150);
}
