//Scenario and ScenarioLoader against the reference: the state of every "-t0" engine fixture is
//the reference's export right after Game.newScenario or Game.newCampaign (test/contracts/record.js),
//in the format before #128, the JSON of the game's objects. Loading the same XML here, with
//Math.random seeded the same way, must give the same objects (written the same way)
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";
import { readFixture } from "./contracts";
import { setupOf } from "./corefiles";
import { freshFixtures, freshGame, mapSizes, startState } from "./lifecycle";
import { oldExport } from "./saves";

//The reference's export with the deliberate fixes to the loading since: in a campaign, a player of
//another country than the campaign's (the AI's) gets the scenario file's prestige per turn, not the
//difficulty's minimum (#15); a unit whose equipment is in a country file the players don't have is
//that equipment, not the first one loaded (#286: the reference's eqid is then the key, a string); a hex's
//name is the file's (#268 corrected town names of drpzop01.xml)
function withFixes(reference: string): string {
	const state = JSON.parse(reference) as OldExport;
	const setup = setupOf(state.scenario.file, null);
	for (const h of setup.scenario.hexes)
		if (h.name !== null) state.scenario.map.map[h.row][h.col].name = h.name;
	state.scenario.map.map.forEach((row, r) => row.forEach((hex, c) => {
		for (const u of [hex.unit, hex.airunit]) {
			if (!u || typeof u.eqid !== "string") continue;
			const other = [hex.unit, hex.airunit].find((x) => x && x !== u);
			const filed = setup.scenario.hexes.find((h) => h.row === r && h.col === c).units
				.find((f) => !other || f.eqid !== other.eqid);
			const e = setup.equipment[filed.eqid];
			Object.assign(u, { eqid: filed.eqid, moveLeft: e.movpoints, ammo: e.ammo, fuel: e.fuel });
		}
	}));
	if (state.campaign === null) return JSON.stringify(state);
	const filePlayers = setup.scenario.players;
	state.players.forEach((p, i) => {
		if (p.country === state.campaign.country) return;
		p.prestigePerTurn = filePlayers[i].prestigePerTurn.slice();
		p.prestige = p.prestigePerTurn[0];
	});
	return JSON.stringify(state);
}

interface OldExport {
	scenario: { file: string; map: { map: { name: string; unit?: OldUnit | null; airunit?: OldUnit | null }[][] } };
	players: { country: number; prestige: number; prestigePerTurn: number[] }[];
	campaign: { country: number } | null;
}

interface OldUnit {
	eqid: number | string;
	moveLeft: number;
	ammo: number;
	fuel: number;
}

//No describe block: Stryker's Vitest runner picks tests by name and misses names inside one
test.each(freshFixtures("engine"))("ScenarioLoader contract %s", async (name) => {
	const fixture = readFixture("engine", name);
	const game = await freshGame();
	await startState(game, fixture.file);
	const actual = oldExport(game), expected = withFixes(fixture.state);
	expect(JSON.parse(actual), "a different scenario than the reference loaded").toEqual(JSON.parse(expected));
	expect(actual, "same data, different key order").toBe(expected);
});

//test/mapsizes.json stands in for the map images (Git LFS, not checked out in CI): it must match
//the images where they are there
test("Map image sizes match the images", () => {
	const dir = process.env.OPENPANZER_GAME_DIR || path.resolve(__dirname, "../game");
	for (const [file, [width, height]] of Object.entries(mapSizes)) {
		const image = path.join(dir, file);
		if (!fs.existsSync(image)) continue;
		const b = fs.readFileSync(image);
		if (b.toString("latin1", 1, 4) !== "PNG") continue; //a Git LFS pointer
		expect([b.readUInt32BE(16), b.readUInt32BE(20)], file).toEqual([width, height]);
	}
	const images = fs.existsSync(path.join(dir, "resources/maps/images"))
		? fs.readdirSync(path.join(dir, "resources/maps/images")).filter((f) => f.endsWith(".png")).length : 0;
	expect(Object.keys(mapSizes).length, "every map image listed").toBe(images || Object.keys(mapSizes).length);
});
