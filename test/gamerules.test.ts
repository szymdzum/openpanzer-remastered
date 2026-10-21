//GameRules against its contract: the reference's results on recorded game states
//(test/contracts/record.sh gamerules records them)
import { expect, test } from "vitest";
import { compareResults, fixtures, runFixture } from "./contracts";

//No describe block: Stryker's Vitest runner picks tests by name and misses names inside one
test.each(fixtures("gamerules"))("GameRules contract %s", async (name) => {
	const { expected, actual } = await runFixture("gamerules", "runGameRulesContract", name);
	expect(compareResults(expected, actual), "different from the reference").toBeNull();
});
