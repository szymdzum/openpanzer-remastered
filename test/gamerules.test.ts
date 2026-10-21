//GameRules against its contract: the reference's results on recorded game states
//(test/contracts/record.sh gamerules records them)
import { describe, expect, test } from "vitest";
import { compareResults, contract, fixtures, readFixture, restoreState, type ContractFixture } from "./contracts";

type Run = (env: object) => ContractFixture["results"];
const runGameRulesContract = contract<Run>("gamerules", "runGameRulesContract");

describe("GameRules contract", () => {
	test.each(fixtures("gamerules"))("%s", async (name) => {
		const fixture = readFixture("gamerules", name);
		const scenario = await restoreState(fixture.state);
		const { GameRules } = await import("../src/gamerules");
		const { Equipment } = await import("../src/equipment");
		const { terrainType, leaderType } = await import("../src/prototypes");
		const results = runGameRulesContract({ GameRules, Equipment, terrainType, leaderType,
			map: scenario.map, fuzzRounds: fixture.fuzzRounds });
		expect(compareResults(fixture.results, results), "different from the reference").toBeNull();
	});
});
