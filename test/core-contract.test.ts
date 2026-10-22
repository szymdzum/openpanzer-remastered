//The gamerules contract on the new core (docs/CORE.md, #133): every recorded call of every fixture,
//answered by the core through test/coreadapter.ts from toData of the same restored state, must
//equal the recording, as the old engine's answers do (test/gamerules.test.ts)
import { expect, test } from "vitest";
import { compareResults, contract, fixtures, readFixture, restoreState } from "./contracts";
import { coreGameRules, oldSight } from "./coreadapter";
import { createWorld } from "../src/core/create";
import { unitById } from "../src/core/world";

//The fixture's state restored into the old engine, and its modules
async function restore(name: string) {
	const fixture = readFixture("gamerules", name);
	const scenario = await restoreState(fixture.state);
	const { Equipment } = await import("../src/equipment");
	const { toData } = await import("../src/state");
	const { Rng } = await import("../src/rng");
	const { terrainType, leaderType } = await import("../src/prototypes");
	return { fixture, scenario, Equipment, toData, Rng, terrainType, leaderType };
}

//No describe block: Stryker's Vitest runner picks tests by name and misses names inside one
test.each(fixtures("gamerules"))("GameRules contract on the core %s", async (name) => {
	const { fixture, scenario, Equipment, toData, Rng, terrainType, leaderType } = await restore(name);
	const GameRules = coreGameRules({ scenario, Equipment, toData, game: Rng.game });
	const env = { GameRules, Equipment, terrainType, leaderType, map: scenario.map, fuzzRounds: fixture.fuzzRounds };
	const actual = contract("gamerules", "runGameRulesContract").run(env);
	expect(compareResults(fixture.results, actual), "the core differs from the recording").toBeNull();
});

//The core's state is toData's (docs/STATE.md): a world keeps the data and the state it was given as
//they are, a copy of them (as a save makes) gives the same world, and the index finds every unit.
//The contract reads the old engine's counters (the fuzz changes units under them); the core's own
//sight, computed from the units, equals them on the restored states
test.each(fixtures("gamerules"))("The core's world from toData on %s: the state as given, the sight the old engine's", async (name) => {
	const { scenario, Equipment, toData } = await restore(name);
	const saved = toData(scenario);
	const before = structuredClone(saved);
	const world = createWorld(saved, Equipment.equipment);
	expect({ data: world.data, state: world.state }).toEqual(before);
	expect(createWorld(JSON.parse(JSON.stringify(saved)) as typeof saved, Equipment.equipment)).toEqual(world);
	expect(world.state.units.every((u) => unitById(world, u.id) === u)).toBe(true);

	const counters = oldSight(scenario);
	for (const side of [0, 1]) {
		expect(Array.from(world.sight.spot[side], (n) => +(n > 0)), "spotting of side " + side).toEqual(Array.from(counters.spot[side]));
		expect(Array.from(world.sight.zoc[side], (n) => +(n > 0)), "zone of control of side " + side).toEqual(Array.from(counters.zoc[side]));
	}
});
