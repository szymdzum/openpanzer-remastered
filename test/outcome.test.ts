//The core's outcome (src/core/turn.ts, the old Actions.checkOutcome) against the engine contract's
//recordings: the capture and wipe-out drills end the game (or don't) the way it says, and the turn
//limit is the side's last turn played, whichever side
import { expect, test } from "vitest";
import { fixtures, readFixture, restoreState, runFixture } from "./contracts";
import type { Outcome } from "../src/core/turn";

//The end of the game a drill recorded: its move's or attack's `outcome.ended` (the reference's
//first victory), null when it didn't end; undefined when the drill made no move or attack
function recordedEnd(name: string, result: string): { side: number; kind: string; outcome: string } | null | undefined {
	const [r] = JSON.parse(result);
	const step = name == "capture drill" ? (Array.isArray(r) ? r[2] : null) : (Array.isArray(r) ? r[1] : null);
	if (!step || typeof step !== "object" || !step.outcome) return undefined;
	return step.outcome.ended;
}

//No describe block: Stryker's Vitest runner picks tests by name and misses names inside one
test.each(fixtures("engine"))("The outcome agrees with the drills of %s", async (name) => {
	const outcomes: [number, Outcome | null][] = [];
	const { expected } = await runFixture("engine", "runEngineContract", name, { outcomes });
	let compared = 0;
	expected.forEach(([call, context, result], i) => {
		if (call != "capture drill" && call != "wipe-out drill") return;
		const want = recordedEnd(call, result);
		if (want === undefined) return;
		const asked = outcomes.filter(([at]) => at == i).map(([, o]) => o);
		expect(asked.length, `${call} (${context}) asked the outcome`).toBeGreaterThan(0);
		const got = asked.find((o) => o !== null) || null;
		expect(got && { side: got.winner, kind: got.kind, outcome: got.rating }, `${call} (${context})`).toEqual(want);
		compared++;
	});
	expect(compared, "drills compared").toBeGreaterThan(0);
});

test.each(fixtures("engine"))("The outcome at the turn limit of %s", async (name) => {
	const scenario = await restoreState(readFixture("engine", name).state);
	const { game } = await import("../src/game");
	const { worldOf } = await import("../src/mirror");
	const { outcome, reachedTurnLimit } = await import("../src/core/turn");
	const world = () => worldOf(scenario, game, { spotSide: game.spotSide, noFOW: false });
	const m = scenario.map;
	let defeats = 0;
	//Without a move there is no capture, even for a side without objectives left (campaign-3-1).
	//Elimination is the state's: a campaign at its start (ruscam09-t0) has the player's core units
	//still to deploy, so the player's side has none on the map. It comes first
	const before = outcome(world());
	expect(before === null || before.kind == "elimination").toBe(true);
	for (const turn of [m.maxTurns - 1, m.maxTurns])
		for (const played of [turn - 1, turn]) {
			m.turn = turn;
			m.getPlayers().forEach((p) => { p.playedTurn = played; });
			for (const side of [0, 1]) {
				const defeat = reachedTurnLimit(world(), side);
				if (defeat) defeats++;
				expect(outcome(world(), { endedSide: side }), `turn ${turn} played ${played} side ${side}`)
					.toEqual(before ? { ...before, rating: scenario.checkVictory() }
						: defeat ? { kind: "turnLimit", winner: -1, loser: side, rating: "lose" } : null);
			}
		}
	expect(defeats, "defeats at the turn limit").toBeGreaterThan(0);
});
