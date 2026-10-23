//The engine (Map, Unit, GameRules, Leaders, AI) against its contract: the AI and random player
//actions playing on recorded game states, every step as on the reference
//(test/contracts/record.sh engine records them). And the core's outcome (src/core/turn.ts, the old
//Actions.checkOutcome) against the same recordings: the capture and wipe-out drills end the game (or
//don't) the way they say (the turn limit is test/outcome.test.ts's)
import { expect, test } from "vitest";
import { compareResults, fixtures, runFixture } from "./contracts";
import type { Outcome } from "../src/core/turn";

//Each fixture's contract played once for its two tests: the results, and the outcome its steps asked
//(env.outcomes: [index of the step, checkOutcome's result])
type Run = Awaited<ReturnType<typeof runFixture>> & { outcomes: [number, Outcome | null][] };
const runs = new Map<string, Promise<Run>>();

function played(name: string): Promise<Run> {
	if (!runs.has(name)) {
		const outcomes: [number, Outcome | null][] = [];
		runs.set(name, runFixture("engine", "runEngineContract", name, { outcomes }).then((r) => ({ ...r, outcomes })));
	}
	return runs.get(name)!;
}

//The end of the game a drill recorded: its move's or attack's `outcome.ended` (the reference's
//first victory), null when it didn't end; undefined when the drill made no move or attack
function recordedEnd(name: string, result: string): { side: number; kind: string; outcome: string } | null | undefined {
	const [r] = JSON.parse(result);
	const step = name === "capture drill" ? (Array.isArray(r) ? r[2] : null) : (Array.isArray(r) ? r[1] : null);
	if (!step || typeof step !== "object" || !step.outcome) return undefined;
	return step.outcome.ended;
}

//No describe block: Stryker's Vitest runner picks tests by name and misses names inside one
test.each(fixtures("engine"))("Engine contract %s", async (name) => {
	const { expected, actual } = await played(name);
	expect(compareResults(expected, actual), "different from the reference").toBeNull();
});

test.each(fixtures("engine"))("The outcome agrees with the drills of %s", async (name) => {
	const { expected, outcomes } = await played(name);
	let compared = 0;
	expected.forEach(([call, context, result], i) => {
		if (call !== "capture drill" && call !== "wipe-out drill") return;
		const want = recordedEnd(call, result);
		if (want === undefined) return;
		const asked = outcomes.filter(([at]) => at === i).map(([, o]) => o);
		expect(asked.length, `${call} (${context}) asked the outcome`).toBeGreaterThan(0);
		const got = asked.find((o) => o !== null) || null;
		expect(got && { side: got.winner, kind: got.kind, outcome: got.rating }, `${call} (${context})`).toEqual(want);
		compared++;
	});
	expect(compared, "drills compared").toBeGreaterThan(0);
});
