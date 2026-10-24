//The core's outcome (src/core/turn.ts, the old Actions.checkOutcome) at the turn limit: the side's last
//turn played, whichever side, and the side holding more objectives wins it (#231; the capture and
//wipe-out drills are test/engine.test.ts's, on the engine contract's run)
import { expect, test } from "vitest";
import { fixtures, readFixture, restoreState } from "./contracts";

//No describe block: Stryker's Vitest runner picks tests by name and misses names inside one
test.each(fixtures("engine"))("The outcome at the turn limit of %s", async (name) => {
	const scenario = await restoreState(readFixture("engine", name).state);
	const { game } = await import("../src/game");
	const { gameInputs, mirrorOptions, worldOf } = await import("../src/mirror");
	const { outcome, reachedTurnLimit } = await import("../src/core/turn");
	mirrorOptions.cache = false; //(the turn and the players written by hand below)
	const world = () => worldOf(scenario, game, gameInputs(game));
	const m = scenario.map;
	let defeats = 0;
	//Without a move there is no capture, even for a side without objectives left (campaign-3-1).
	//Elimination is the state's: a campaign at its start (ruscam09-t0) has the player's core units
	//still to deploy, so the player's side has none on the map. It comes first
	const before = outcome(world());
	const atLimit = turnLimitOf(scenario);
	expect(before === null || before.kind == "elimination").toBe(true);
	for (const turn of [m.maxTurns - 1, m.maxTurns])
		for (const played of [turn - 1, turn]) {
			m.turn = turn;
			m.getPlayers().forEach((p) => { p.playedTurn = played; });
			for (const side of [0, 1]) {
				const defeat = reachedTurnLimit(world(), side);
				if (defeat) defeats++;
				expect(outcome(world(), { endedSide: side }), `turn ${turn} played ${played} side ${side}`)
					.toEqual(before ? { ...before, rating: scenario.checkVictory() } : defeat ? atLimit(side) : null);
			}
		}
	expect(defeats, "defeats at the turn limit").toBeGreaterThan(0);
});

//The outcome at the turn limit when side ended its last turn: the side holding more objectives wins
//(#231), with as many each the side that ended loses
function turnLimitOf(scenario: Awaited<ReturnType<typeof restoreState>>) {
	const held = [0, 0];
	for (const row of scenario.map.map)
		for (const h of row)
			if (h.victorySide !== -1 && h.owner !== -1) held[scenario.map.getPlayer(h.owner).side]++;
	const holder = held[0] === held[1] ? -1 : held[0] > held[1] ? 0 : 1;
	return (side: number) => holder === -1 ? { kind: "turnLimit", winner: -1, loser: side, rating: "lose" }
		: { kind: "turnLimit", winner: holder, loser: ~holder & 1, rating: scenario.checkVictory() };
}

//Panzer-Verbaende Ostpreussen played to its last turn as Poland, the objectives held against the German
//AI: the old game told Poland "DEFEAT" (#231)
test("At the turn limit the side holding more objectives wins, a defender who held them included (#231)", async () => {
	const scenario = await restoreState(readFixture("engine", "drpzop01-t0.json.gz").state);
	const { game } = await import("../src/game");
	const { gameInputs, mirrorOptions, worldOf } = await import("../src/mirror");
	const { outcome } = await import("../src/core/turn");
	mirrorOptions.cache = false;
	const m = scenario.map;
	//The objectives Polish (player 1) but one German (player 0)
	const objectives = m.map.flat().filter((h) => h.victorySide !== -1);
	objectives.forEach((h, i) => { h.owner = i === 0 ? 0 : 1; });
	m.turn = m.maxTurns;
	m.getPlayers().forEach((p) => { p.playedTurn = m.maxTurns; });
	const world = worldOf(scenario, game, gameInputs(game));
	expect(objectives.length).toBeGreaterThan(2);
	expect(outcome(world, { endedSide: 1 })).toEqual({ kind: "turnLimit", winner: 1, loser: 0, rating: scenario.checkVictory() });
	expect(outcome(world, { endedSide: 0 })).toEqual({ kind: "turnLimit", winner: 1, loser: 0, rating: scenario.checkVictory() });
});
