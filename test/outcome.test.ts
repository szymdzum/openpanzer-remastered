//The core's outcome (src/core/turn.ts, the old Actions.checkOutcome) at the turn limit: the side's last
//turn played, whichever side. In the classic rules the side that ended it loses, as in the original; in the
//remaster's the attacker loses unless it took all its objectives, the defender holding out wins (#256)
//(the capture and wipe-out drills are test/engine.test.ts's, on the engine contract's run)
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

//The outcome at the turn limit when side ended its last turn, in the classic rules the fixtures play by:
//the side that ended loses, nobody wins, whatever each holds (#256: the original's rule)
function turnLimitOf(_scenario: Awaited<ReturnType<typeof restoreState>>) {
	return (side: number) => ({ kind: "turnLimit", winner: -1, loser: side, rating: "lose" });
}

//Panzer-Verbaende Ostpreussen at its last turn, the objectives Polish but one: #231 made the side holding more
//win in every game; the classic rules went back to the original's (#256)
test("In the classic rules the side that ended its last turn loses at the turn limit, whatever it holds, as in the original (#256)", async () => {
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
	expect([world.rules.name, objectives.length]).toEqual(["classic", 7]);
	expect(outcome(world, { endedSide: 1 })).toEqual({ kind: "turnLimit", winner: -1, loser: 1, rating: "lose" });
	expect(outcome(world, { endedSide: 0 })).toEqual({ kind: "turnLimit", winner: -1, loser: 0, rating: "lose" });
});

//A Pz IIA (player 0) and a 7TP (player 1) on the hand-built map at the turn limit (turn 1, both sides played
//it), three objectives: A (0,5) and B (0,6) for the attacker to take, C (11,5) for the defender. The attacker
//took A: it holds A and C, the defender only B. starts: the objectives each side had to take at the start
async function turnLimitWorld(rules: import("../src/core/types").Ruleset, attacker: number, starts?: [number, number]) {
	const { handWorld } = await import("./coreworld");
	const { createWorld } = await import("../src/core/create");
	const defender = ~attacker & 1;
	const w = handWorld({ rows: 12, cols: 12, units: [{ eqid: 140, owner: 0, row: 4, col: 4 }, { eqid: 273, owner: 1, row: 8, col: 8 }],
		startObjectives: starts || (attacker === 0 ? [2, 1] : [1, 2]) });
	const s = structuredClone(w.state);
	const objective = (row: number, col: number, owner: number, taker: number) => {
		s.map.hexes[row * 12 + col] = { ...s.map.hexes[row * 12 + col], owner, victorySide: taker };
		s.objectives[taker].push({ row, col });
	};
	objective(0, 6, defender, attacker);	//B, still the defender's
	objective(11, 5, attacker, defender);	//C, the attacker's own
	objective(0, 5, attacker, defender);	//A, taken: the defender's to take back
	s.scenario = { ...s.scenario, maxTurns: 1, victoryTurns: [0, 0, 1] };
	s.players = s.players.map((p) => ({ ...p, playedTurn: 1 }));
	return createWorld({ data: w.data, state: s }, w.equipment, { rules });
}

//The playtest of Panzer-Verbaende Ostpreussen (#256): Germany took 2 of its 5 objectives and won at the turn
//limit by holding more than Poland. PG2's rule: the attacker must take them all
test("In the remaster rules the attacker that didn't take all its objectives loses at the turn limit, the defender that held out wins (#256)", async () => {
	const { classicRules, remasterRules } = await import("../src/core/rules");
	const { attackerSide, outcome } = await import("../src/core/turn");
	for (const attacker of [0, 1]) {
		const defender = ~attacker & 1;
		const w = await turnLimitWorld(remasterRules, attacker);
		expect(attackerSide(w)).toBe(attacker);
		for (const ended of [0, 1])
			expect(outcome(w, { endedSide: ended }), `attacker ${attacker}, ended ${ended}`)
				.toEqual({ kind: "turnLimit", winner: defender, loser: attacker, rating: "tactical" });
		expect(outcome(await turnLimitWorld(classicRules, attacker), { endedSide: attacker }))
			.toEqual({ kind: "turnLimit", winner: -1, loser: attacker, rating: "lose" });
	}
});

test("With no attacker in the remaster rules, as many objectives each at the start or a save from before they were kept, the side holding more wins at the turn limit (#256, #231)", async () => {
	const { remasterRules } = await import("../src/core/rules");
	const { attackerSide, outcome } = await import("../src/core/turn");
	for (const known of [true, false])
		for (const holder of [0, 1]) {
			const w = await turnLimitWorld(remasterRules, holder, [2, 2]);
			const unknown = known ? w : { ...w, data: { ...w.data, startObjectives: null } };
			expect(attackerSide(unknown)).toBe(-1);
			expect(outcome(unknown, { endedSide: 1 })).toEqual({ kind: "turnLimit", winner: holder, loser: ~holder & 1, rating: "tactical" });
		}
});

test("In a campaign the defender that held out to the turn limit wins its scenario in the remaster rules and loses it in the classic ones (#256)", async () => {
	const { classicRules, remasterRules } = await import("../src/core/rules");
	const { turnLimitResult } = await import("../src/core/turn");
	const remaster = await turnLimitWorld(remasterRules, 0), classic = await turnLimitWorld(classicRules, 0);
	expect([turnLimitResult(remaster, 1, 1), turnLimitResult(remaster, 1, 0)]).toEqual(["tactical", "lose"]);
	expect([turnLimitResult(classic, 1, 1), turnLimitResult(classic, 1, 0)]).toEqual(["lose", "lose"]);
});

//A person defending on side 0 against the AI's side 1: the old game ended at the person's last turn, before
//the attacker's (and made the person lose)
test("In the remaster rules the game ends at the turn limit once both sides have played their last turn, whichever side plays on the screen (#256)", async () => {
	const { classicRules, remasterRules } = await import("../src/core/rules");
	const { advance, startSession } = await import("../src/core/session");
	for (const local of [0, 1, 2]) {
		const start = await turnLimitWorld(remasterRules, 1);
		const unplayed = { ...start, state: { ...start.state, players: start.state.players.map((p) => ({ ...p, playedTurn: 0 })) } };
		const s = startSession(unplayed, () => null, { localSide: local });
		advance(s);
		expect(s.ended, "local " + local).toBeNull();
		advance(s);
		expect(s.ended, "local " + local).toEqual({ kind: "turnLimit", side: 1 });
		const classic = startSession({ ...unplayed, rules: classicRules }, () => null, { localSide: local });
		advance(classic);
		expect(classic.ended, "classic, local " + local).toEqual(local === 1 ? null : { kind: "turnLimit", side: 0 });
	}
});

//A German tank and a Soviet tank, the last unit of each side, both at strength 1 on the small game: an
//attack that destroys both. The old game ran the victory once for each side, so a campaign ended the
//scenario twice, its prestige counted twice and the next scenario loaded twice (#92)
test("When an attack destroys the last unit of both sides the game ends once, as the outcome says (#92)", async () => {
	const { smallGameData } = await import("./smallgame");
	const { createWorld } = await import("../src/core/create");
	const { classicRules, remasterRules } = await import("../src/core/rules");
	const { step } = await import("../src/core/step");
	const { outcome } = await import("../src/core/turn");
	const { Equipment } = await import("../src/equipment");
	for (const rules of [classicRules, remasterRules]) {
		let both = 0;
		for (let seed = 1; seed <= 300; seed++) {
			const saved = smallGameData([[142, 0, 4, 4], [511, 1, 4, 5]]);
			saved.state.units.forEach((u) => { u.strength = 1; });
			saved.state.rng = { game: seed, ai: 2 };
			const r = step(createWorld(saved, Equipment.equipment, { rules }), { type: "attack", unit: 0, target: 1 });
			if (r.ok === false) throw new Error(r.refusal.reason);
			if (r.world.state.units.length > 0) continue;
			both++;
			const victories = r.events.filter((e) => e.type === "victory");
			expect(victories, rules.name + " seed " + seed).toEqual([{ type: "victory", side: 1, kind: "elimination" }]);
			expect(outcome(r.world)).toMatchObject({ kind: "elimination", winner: 1 });
		}
		expect(both, rules.name).toBeGreaterThan(0);
	}
});

//The small game with the Soviet side's units off the map but one: the others wait in player 1's reserve,
//to deploy, or as a reinforcement due on turn 3
async function waiting(how: "reserve" | "reinforcement", rules: import("../src/core/types").Ruleset) {
	const { smallGameData } = await import("./smallgame");
	const { createWorld } = await import("../src/core/create");
	const { Equipment } = await import("../src/equipment");
	const saved = smallGameData([[142, 0, 4, 4], [504, 1, 4, 5], [511, 1, 8, 6]]);
	const { id: _id, row: _row, col: _col, ...off } = saved.state.units.pop()!;
	saved.state.map.hexes[8 * 12 + 6].unit = null;
	if (how === "reserve") saved.state.players[1].core.push({ reserve: off });
	else saved.state.reinforcements.push({ turn: 3, row: 8, col: 6, unit: off });
	saved.state.units[1].strength = 1;
	return (seed: number) => {
		saved.state.rng = { game: seed, ai: 2 };
		return createWorld(structuredClone(saved), Equipment.equipment, { rules });
	};
}

//The German tank's attack, at the first seed of the game stream that destroys the last Soviet unit on the map
async function lastUnitDestroyed(world: (seed: number) => import("../src/core/types").World) {
	const { step } = await import("../src/core/step");
	for (let seed = 1; seed <= 100; seed++) {
		const r = step(world(seed), { type: "attack", unit: 0, target: 1 });
		if (r.ok && !r.world.state.units.some((u) => u.owner === 1)) return r;
	}
	throw new Error("no seed destroys it");
}

//PG2 lets a side deploy its units waiting in the reserve or arriving later: the original counted only the
//units on the map, so a side whose units all waited lost by elimination (#115). The classic rules keep it
test("In the remaster rules a side with units waiting to deploy or arrive isn't eliminated (#115)", async () => {
	const { classicRules, remasterRules } = await import("../src/core/rules");
	const { outcome } = await import("../src/core/turn");
	for (const how of ["reserve", "reinforcement"] as const)
		for (const rules of [classicRules, remasterRules]) {
			const r = await lastUnitDestroyed(await waiting(how, rules));
			const eliminated = rules === classicRules, label = how + " " + rules.name;
			expect(r.events.filter((e) => e.type === "victory"), label)
				.toEqual(eliminated ? [{ type: "victory", side: 0, kind: "elimination" }] : []);
			expect(outcome(r.world), label).toEqual(eliminated ? { kind: "elimination", winner: 0, loser: 1, rating: "briliant" } : null);
		}
});

//The attacker must be known all game (#256): the objectives' lists change with every capture
test("A new game keeps how many objectives each side had to take at the start, and its save keeps them; a save from before has none (#256)", async () => {
	const { setupOf } = await import("./corefiles");
	const { newGame } = await import("../src/core/newgame");
	const { readSaveObject, SAVE_VERSION } = await import("../src/savegame");
	const created = newGame(setupOf("drpzop01.xml", { game: 1, ai: 2 }));
	const keys = ["name", "description", "equipment", "image", "startObjectives", "hexes"];
	expect([created.data.startObjectives, Object.keys(created.data)]).toEqual([[5, 2], keys]);
	const saved = (version: number, data: object) => readSaveObject(JSON.parse(JSON.stringify({ version, rules: "remaster", data,
		state: created.state })))?.save;
	expect(saved(SAVE_VERSION, created.data)?.data.startObjectives).toEqual([5, 2]);
	const { startObjectives: _start, ...before } = created.data;
	const old = saved(2, before);
	expect([old?.version, old?.rules, old?.data.startObjectives, Object.keys(old?.data || {})]).toEqual([3, "remaster", null, keys]);
});
