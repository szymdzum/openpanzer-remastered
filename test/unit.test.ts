//Unit against its contract: the reference's results on recorded game states
//(test/contracts/record.sh unit records them)
import { describe, expect, test } from "vitest";
import { compareResults, fixtures, runFixture } from "./contracts";

describe("Unit contract", () => {
	test.each(fixtures("unit"))("%s", async (name) => {
		const { expected, actual } = await runFixture("unit", "runUnitContract", name);
		expect(compareResults(expected, actual), "different from the reference").toBeNull();
	});
});
