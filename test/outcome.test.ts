//The core's outcome (src/core/turn.ts, the old Actions.checkOutcome) at the turn limit: the side's last
//turn played, whichever side (the capture and wipe-out drills are test/engine.test.ts's, on the engine
//contract's run)
import { expect, test } from "vitest";
import { fixtures, readFixture, restoreState } from "./contracts";

//No describe block: Stryker's Vitest runner picks tests by name and misses names inside one
test.each(fixtures("engine"))("The outcome at the turn limit of %s", async (name) => {
	const scenario = await restoreState(readFixture("engine", name).state);
	const { game } = await import("../src/game");
	const { mirrorOptions, worldOf } = await import("../src/mirror");
	const { outcome, reachedTurnLimit } = await import("../src/core/turn");
	mirrorOptions.cache = false; //(the turn and the players written by hand below)
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
