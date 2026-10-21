//The engine (Map, Unit, GameRules, Leaders, AI) against its contract: the AI and random player
//actions playing on recorded game states, every step as on the reference
//(test/contracts/record.sh engine records them)
import { expect, test } from "vitest";
import { compareResults, fixtures, runFixture } from "./contracts";

//No describe block: Stryker's Vitest runner picks tests by name and misses names inside one
test.each(fixtures("engine"))("Engine contract %s", async (name) => {
	const { expected, actual } = await runFixture("engine", "runEngineContract", name);
	expect(compareResults(expected, actual), "different from the reference").toBeNull();
});
