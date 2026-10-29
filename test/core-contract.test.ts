//The gamerules contract on the core (docs/CORE.md, #133): every recorded call of every fixture,
//answered by the game's GameRules (rulesOn, test/coreadapter.ts) from toData of the same restored
//state, must equal the recording
import { expect, test } from "vitest";
import { compareResults, contract, fixtures, readFixture, recorded, restoreState } from "./contracts";
import { coreGameRules, oldSight } from "./coreadapter";
import { createWorld } from "../src/core/create";
import { unitById } from "../src/core/world";

//The fixture's state restored into the game's objects, and its modules
async function restore(name: string) {
	const fixture = readFixture("gamerules", name);
	const scenario = await restoreState(fixture.state);
	const { Equipment } = await import("../src/legacy/equipment");
	const { toData } = await import("../src/legacy/state");
	const { Rng } = await import("../src/core/random");
	const { terrainType, leaderType } = await import("../src/core/tables");
	const { rulesOn } = await import("../src/legacy/gamerules");
	return { fixture, scenario, Equipment, toData, Rng, terrainType, leaderType, rulesOn };
}

//No describe block: Stryker's Vitest runner picks tests by name and misses names inside one
test.each(fixtures("gamerules"))("GameRules contract on the core %s", async (name) => {
	const { fixture, scenario, Equipment, toData, Rng, terrainType, leaderType, rulesOn } = await restore(name);
	const GameRules = coreGameRules({ rulesOn, scenario, Equipment, toData, game: Rng.game });
	const env = { GameRules, Equipment, terrainType, leaderType, map: scenario.map, fuzzRounds: fixture.fuzzRounds };
	const actual = contract("gamerules", "runGameRulesContract").run(env);
	expect(compareResults(recorded("gamerules", name, fixture, actual), actual), "the core differs from the recording").toBeNull();
});

//The core's state is toData's (docs/STATE.md): a world keeps the data and the state it was given as
//they are, a copy of them (as a save makes) gives the same world, and the index finds every unit.
//The contract reads the hexes' counters (the fuzz changes units under them); the core's own
//sight, computed from the units, equals them on the restored states
test.each(fixtures("gamerules"))("The core's world from toData on %s: the state as given, the sight the counters'", async (name) => {
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
