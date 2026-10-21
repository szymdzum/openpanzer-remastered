//GameRules against its contract: the reference's results on recorded game states
//(test/contracts/record.sh gamerules records them)
import { describe, expect, test } from "vitest";
import { compareResults, fixtures, runFixture } from "./contracts";

describe("GameRules contract", () => {
	test.each(fixtures("gamerules"))("%s", async (name) => {
		const { expected, actual } = await runFixture("gamerules", "runGameRulesContract", name);
		expect(compareResults(expected, actual), "different from the reference").toBeNull();
	});
});
