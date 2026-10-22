// @vitest-environment node
//The new core's rules on hand-built situations (docs/CORE.md, #133): each test reads like the rule
//it tests. That the core answers as the old engine does is test/core-contract.test.ts's and
//test/core-differential.test.ts's
import fc from "fast-check";
import { expect, test } from "vitest";
import { nextRandom } from "../src/rng";
import { Leaders } from "../src/leaders";
import { type Cell, type extendedCell, leaderType, movTableDry, movTableMud, terrainType, unitClass } from "../src/prototypes";
import { attackResult, combatResult } from "../src/core/combat";
import { moveRange, pathTo, shortestPath } from "../src/core/movement";
import { attackCells } from "../src/core/attack";
import { classicRules, moveCosts } from "../src/core/rules";
import { cellsInRange, distance, isPartialEdge } from "../src/core/geometry";
import { spotCells } from "../src/core/sight";
import { hexIndex, isSpotted, isZOC, unitById } from "../src/core/world";
import { step, type Stepped } from "../src/core/step";
import { arriveReinforcements, outcome } from "../src/core/turn";
import { mapSize } from "../src/core/newgame";
import type { Contribution } from "../src/core/types";
import type { Command } from "../src/commands";
import { handWorld } from "./coreworld";

const PZ_IIA = 140, TP7 = 273;

//A Pz IIA on clear ground next to a 7TP entrenched (2) in a forest
function forestFight() {
	return handWorld({ rows: 6, cols: 6, terrain: (r, c) => r === 2 && c === 3 ? terrainType.Forest : terrainType.Clear, units: [
		{ eqid: PZ_IIA, owner: 0, row: 2, col: 2 },
		{ eqid: TP7, owner: 1, row: 2, col: 3, entrenchment: 2 },
	] });
}

test("The combat record says what each step did: a Pz IIA against a 7TP in a forest", () => {
	const w = forestFight();
	const record: Contribution[] = [];
	const cr = attackResult(w, unitById(w, 0), unitById(w, 1), null, record);
	expect(record.map((r) => `${r.name}: ${r.side} ${r.field} ${r.before} -> ${r.after}`)).toEqual([
		"attacker's type: defender dav 0 -> 7",		//the 7TP's hard attack
		"attacker's type: defender ddv 0 -> 7",		//its ground defense
		"defender's type: attacker aav 0 -> 3",		//the Pz IIA's hard attack
		"defender's type: attacker adv 0 -> 7",
		"entrenchment: defender ddv 7 -> 9",
		"range defense: attacker adv 7 -> 9",		//half of 5, next to each other
		"range defense: defender ddv 9 -> 11",		//half of 4
		"initiative: attacker adv 9 -> 13",		//7 against 6
		"initiative: attacker aav 3 -> 4",
		"estimate: attacker kills 0 -> 1",
		"estimate: defender losses 0 -> 1",
	]);
	expect(cr).toMatchObject({ kills: 1, losses: 1, defcanfire: true, isRugged: false, isOverrun: false, atkExpGained: 16, defExpGained: 15 });
});

test("The record is extra output: the result is the same without it", () => {
	const w = forestFight();
	expect(attackResult(w, unitById(w, 0), unitById(w, 1), null, [])).toEqual(attackResult(w, unitById(w, 0), unitById(w, 1), null));
	expect(attackResult(w, unitById(w, 0), unitById(w, 1), { state: 7 }, [])).toEqual(attackResult(w, unitById(w, 0), unitById(w, 1), { state: 7 }));
});

test("The estimate draws nothing; the dice draw one number per strength point, the attacker's first", () => {
	const w = forestFight();
	const random = Math.random;
	Math.random = () => { throw new Error("drew from Math.random"); };
	try {
		const rng = { state: 12345 };
		combatResult(w, unitById(w, 0), unitById(w, 1), false, null);
		const cr = attackResult(w, unitById(w, 0), unitById(w, 1), rng);
		const expected = { state: 12345 };
		for (let i = 0; i < 20; i++) nextRandom(expected); //10 attacker's dice, 10 defender's
		expect(rng.state).toBe(expected.state);
		expect(cr.kills).toBeGreaterThanOrEqual(0);
	} finally {
		Math.random = random;
	}
});

test("A surprised attacker loses its defense and half its attack", () => {
	const w = handWorld({ rows: 6, cols: 6, units: [
		{ eqid: PZ_IIA, owner: 0, row: 2, col: 2, isSurprised: true },
		{ eqid: TP7, owner: 1, row: 2, col: 3 },
	] });
	const record: Contribution[] = [];
	attackResult(w, unitById(w, 0), unitById(w, 1), null, record);
	expect(record.filter((r) => r.name === "surprised").map((r) => [r.field, r.before, r.after])).toEqual([["adv", 13, 0], ["aav", 4, 2]]);
});

test("The ruleset holds the movement tables by ground and the leaders of each class", () => {
	expect(moveCosts(classicRules, 0, 0)).toBe(movTableDry[0]);
	expect(moveCosts(classicRules, 2, 4)).toBe(movTableMud[4]);
	expect(moveCosts(classicRules, 7, 0)).toBe(movTableDry[0]); //an unknown ground moves as dry
	for (let c = 0; c <= unitClass.lightCruiser; c++) {
		expect(classicRules.classLeaders[c], "class " + c).toBe(Leaders.unitClassLeaders[c][0] ?? -1);
		expect(classicRules.leaders[c], "class " + c).toEqual(Leaders.unitClassLeaders[c]);
	}
});

test("A tank's move range stops at an enemy's zone of control, and its path pays one point more (#70)", () => {
	const w = handWorld({ rows: 8, cols: 8, units: [
		{ eqid: PZ_IIA, owner: 0, row: 4, col: 1 },
		{ eqid: TP7, owner: 1, row: 4, col: 3 }, //2 hexes away: the Pz IIA spots it
	] });
	const tank = unitById(w, 0);
	const cells = moveRange(w, tank);
	const at = (r: number, c: number) => cells.find((x) => x.row === r && x.col === c);
	expect(isZOC(w, hexIndex(w, 4, 2), 1)).toBe(true);
	expect(at(4, 2)).toMatchObject({ canMove: true, cost: 254 }); //it can enter, then stops
	expect(at(4, 3)).toBeUndefined(); //the enemy's hex
	expect(at(5, 1)).toMatchObject({ canMove: true, cost: 1, cout: 1 });
	const path = pathTo(w, tank, { row: 5, col: 1 });
	expect(path.map((p) => [p.row, p.col])).toEqual([[4, 1], [5, 1]]);
	expect(path.reduce((sum, p) => sum + p.cost, 0)).toBe(2); //one hex of clear, charged 2 (#70)
});

test("A hidden enemy's hex is in the move range: the move ends in a surprise", () => {
	const w = handWorld({ rows: 8, cols: 8, units: [
		{ eqid: PZ_IIA, owner: 0, row: 4, col: 1 },
		{ eqid: TP7, owner: 1, row: 4, col: 4 }, //3 hexes away, out of the Pz IIA's sight (2)
	] });
	expect(isSpotted(w, hexIndex(w, 4, 4), 0)).toBe(false);
	expect(moveRange(w, unitById(w, 0)).find((x) => x.row === 4 && x.col === 4)).toMatchObject({ canMove: true });
});

test("Column 0 is out of every other column's range (#69)", () => {
	expect(cellsInRange(3, 1, 2, 8, 8).some((c) => c.col === 0)).toBe(false);
	expect(cellsInRange(3, 1, 2, 8, 8).length).toBe(11); //15 hexes within 2, less the unit's and column 0's three
	expect(distance(3, 1, 3, 0)).toBe(1);
	const w = handWorld({ rows: 8, cols: 8, units: [
		{ eqid: PZ_IIA, owner: 0, row: 3, col: 1 },
		{ eqid: TP7, owner: 1, row: 3, col: 0 },
	] });
	expect(spotCells(w, unitById(w, 0)).some((c) => c.col === 0)).toBe(false);
	expect(isSpotted(w, hexIndex(w, 3, 0), 0)).toBe(false);
	expect(attackCells(w, unitById(w, 0))).toEqual([]);
});

//The commands (src/core/step.ts, #134): that they play as the old engine's is test/core-steps.test.ts's

test("A step leaves the world it was given as it was", () => {
	const w = forestFight();
	const before = JSON.stringify(w.state);
	const r = step(w, { type: "move", unit: 0, to: { row: 4, col: 2 } });
	expect(r.ok).toBe(true);
	expect(JSON.stringify(w.state)).toBe(before);
	expect(r.ok && unitById(r.world, 0)).toMatchObject({ row: 4, col: 2 });
	expect(unitById(w, 0)).toMatchObject({ row: 2, col: 2 });
	expect(step(w, { type: "resupply", unit: 7 })).toEqual({ ok: false, refusal: { reason: "no such unit" } });
	expect(step(w, { type: "fly" } as unknown as Command)).toEqual({ ok: false, refusal: { reason: "no such command" } });
});

test("An attack draws the attacker's dice, the defender's, then a leader roll for each, even with no level gained", () => {
	const w = withRng(forestFight(), 12345);
	const r = played(step(w, { type: "attack", unit: 0, target: 1 }));
	const expected = { state: 12345 };
	for (let i = 0; i < 10 + 10 + 2; i++) nextRandom(expected);
	expect(r.world.state.rng).toEqual({ game: expected.state, ai: 7 });
	const fight = r.events.find((e) => e.type === "fight");
	expect(fight).toMatchObject({ support: false, attacker: { unit: 0, before: { strength: 10, ammo: unitById(w, 0).ammo } },
		defender: { unit: 1, before: { strength: 10, entrenchment: 2 } } });
	if (fight.type !== "fight") return;
	expect(fight.record.map((c) => c.name)).toContain("entrenchment");
	expect(unitById(r.world, 1).strength).toBe(10 - fight.result.kills);
	expect(unitById(r.world, 0)).toMatchObject({ hasFired: true, ammo: fight.attacker.before.ammo - 1, tempSpotted: true });
});

test("A move onto an enemy flag takes it, and the undo gives it back", () => {
	const w = handWorld({ rows: 8, cols: 8, units: [{ eqid: PZ_IIA, owner: 0, row: 4, col: 1 }] });
	const flag = { owner: 1, flag: 15, victorySide: -1 };
	Object.assign(w.state.map.hexes[hexIndex(w, 5, 1)], flag);
	const moved = played(step(w, { type: "move", unit: 0, to: { row: 5, col: 1 } }));
	expect(moved.events.map((e) => e.type)).toEqual(["moved", "captured"]);
	expect(moved.world.state.map.hexes[hexIndex(w, 5, 1)]).toMatchObject({ owner: 0, flag: 7 });
	expect(moved.world.state.players[0]).toMatchObject({ prestige: 50, score: 50 });
	expect(moved.world.state.turn.undoable).toMatchObject({ unit: 0, oldOwner: 1, oldFlag: 15, prestigeGain: 50, scoreGain: 50 });
	const undone = played(step(moved.world, { type: "undo", unit: 0 }));
	expect(undone.world.state.map.hexes[hexIndex(w, 5, 1)]).toMatchObject(flag);
	expect(undone.world.state.players[0]).toMatchObject({ prestige: 0, score: 0 });
	expect(unitById(undone.world, 0)).toEqual(unitById(w, 0));
	expect(undone.world.state.turn.undoable).toBeNull();
});

test("A liberator takes a flag for twice the prestige, the score as any unit", () => {
	const w = handWorld({ rows: 8, cols: 8, units: [{ eqid: PZ_IIA, owner: 0, row: 4, col: 1, leader: leaderType.liberator }] });
	Object.assign(w.state.map.hexes[hexIndex(w, 5, 1)], { owner: 1, flag: 15, victorySide: -1 });
	const moved = played(step(w, { type: "move", unit: 0, to: { row: 5, col: 1 } }));
	expect(moved.world.state.players[0]).toMatchObject({ prestige: 100, score: 50 });
	expect(moved.world.state.turn.undoable).toMatchObject({ prestigeGain: 100, scoreGain: 50 });
});

//An SS infantry leaving its Ju-52 on an airfield: selecting it (as a mount does last) puts it back on
//the carrier when no neighbour lets it land (MapSelection.select), and leaves it landing otherwise
test("A unit leaving its carrier gets back on it when selected, unless it can still land", () => {
	const SS_INFANTRY = 108, JU52 = 176;
	for (const [around, carrier] of [[terrainType.Clear, -JU52], [terrainType.Ocean, JU52]]) {
		const w = handWorld({ rows: 5, cols: 5, terrain: (r, c) => r === 2 && c === 2 ? terrainType.Airfield : around,
			units: [{ eqid: SS_INFANTRY, owner: 0, row: 2, col: 2, carrier: -JU52 }] });
		expect(unitById(played(step(w, { type: "mount", unit: 0 })).world, 0).carrier, "around: " + around).toBe(carrier);
	}
});

//The turn (src/core/turn.ts, #135)

//A Pz IIA (side 0) and a 7TP in a forest (side 1) far apart, both seen by the other side after firing
function farApart(spotSide: number) {
	const ocean = (r: number, c: number) => r <= 1 && c >= 10;
	return handWorld({ rows: 12, cols: 12, terrain: (r, c) => r === 9 && c === 9 ? terrainType.Forest : ocean(r, c) ? terrainType.Ocean : terrainType.Clear, units: [
		{ eqid: PZ_IIA, owner: 0, row: 1, col: 1, tempSpotted: true, hasMoved: true, hasFired: true, moveLeft: 0 },
		{ eqid: TP7, owner: 1, row: 9, col: 9, tempSpotted: true },
	] }, undefined, { spotSide });
}

test("The turn passes to the next player; once both played, a new round: points back, entrenchment, the day goes on", () => {
	const w = farApart(0);
	const first = played(step(w, { type: "endTurn" }));
	expect(first.world.state.turn).toEqual({ turn: 1, currentPlayer: 1, undoable: null });
	expect(first.events.map((e) => e.type)).toEqual(["turnEnded", "turnStarted"]);
	expect(unitById(first.world, 0)).toMatchObject({ hasMoved: true, moveLeft: 0 });
	const second = played(step(first.world, { type: "endTurn" }));
	expect(second.world.state.turn).toMatchObject({ turn: 2, currentPlayer: 0 });
	expect(second.world.state.scenario).toMatchObject({ dayTurn: 0, date: "1939-09-02T00:00:00.000Z" });	//2 turns a day
	expect(unitById(second.world, 0)).toMatchObject({ hasMoved: false, hasFired: false, moveLeft: w.equipment[PZ_IIA].movpoints });
	expect(unitById(second.world, 1)).toMatchObject({ entrenchment: 2, entrenchTicks: 0 });		//a forest's at once
	expect(second.world.state.players.map((p) => [p.playedTurn, p.score])).toEqual([[1, -10], [1, -10]]);
});

test("A unit seen after firing hides again at the round's end unless it is the side the screen shows (kept #75)", () => {
	for (const [spotSide, seen] of [[0, [true, false]], [1, [false, true]], [-1, [false, false]]] as const) {
		const ended = played(step(played(step(farApart(spotSide), { type: "endTurn" })).world, { type: "endTurn" })).world;
		expect([unitById(ended, 0).tempSpotted, unitById(ended, 1).tempSpotted], "screen shows " + spotSide).toEqual(seen);
	}
});

test("The side that ended its last turn reaches the turn limit: it lost", () => {
	const w = farApart(0);
	const last = { ...w, state: { ...w.state, scenario: { ...w.state.scenario, maxTurns: 1 } } };
	expect(outcome(last)).toBeNull();
	const ended = played(step(last, { type: "endTurn" }));
	expect(ended.events[ended.events.length - 1]).toEqual({ type: "turnLimit", side: 0 });
	expect(outcome(ended.world, { endedSide: 0 })).toEqual({ kind: "turnLimit", winner: -1, loser: 0, rating: "lose" });
	expect(outcome(ended.world, { endedSide: 1 })).toBeNull();	//side 1 still has turn 1 to play
});

test("A capture of the last objective wins, rated by the turn it was taken on; a side with no unit loses", () => {
	const w = farApart(0);
	const at = (turn: number) => ({ ...w, state: { ...w.state, turn: { ...w.state.turn, turn },
		scenario: { ...w.state.scenario, victoryTurns: [2, 4, 6] } } });
	expect([1, 3, 5, 7].map((turn) => outcome(at(turn), { victorySide: 1 }).rating)).toEqual(["briliant", "victory", "tactical", "lose"]);
	expect(outcome(at(3), { victorySide: 1 })).toMatchObject({ kind: "capture", winner: 1, loser: 0 });
	const alone = { ...w, state: { ...w.state, units: [w.state.units[1]] } };
	expect(outcome(alone)).toMatchObject({ kind: "elimination", winner: 1, loser: 0 });
});

test("Reinforcements arrive at their player's turn start, on the next free hex when theirs is taken; the others wait", () => {
	const w = farApart(0);
	const { id: _id, row: _row, col: _col, ...pz } = unitById(w, 0);
	const unit = { ...pz, owner: 1, tempSpotted: false };
	const due = [{ turn: 1, row: 9, col: 9, unit }, { turn: 2, row: 5, col: 5, unit }, { turn: 1, row: 0, col: 11, unit }];
	const r = arriveReinforcements({ ...w, state: { ...w.state, reinforcements: due, turn: { ...w.state.turn, currentPlayer: 1 } } });
	expect(r.events).toEqual([{ type: "arrived", unit: 2, at: { row: 8, col: 9 } }]);
	expect(unitById(r.world, 2)).toMatchObject({ owner: 1, row: 8, col: 9, flag: 16 });
	expect(r.world.state.reinforcements).toEqual([due[1], due[2]]);		//(the last has no hex it can stand on)
	expect(arriveReinforcements(w).world).toBe(w);		//player 0 has none
});

test("The map's size comes from its image: hexes 60 and 30 pixels wide in turn, 50 high, a half row partial", () => {
	expect(mapSize(0, 0, 150, 125)).toEqual({ rows: 3, cols: 4, lastRowPartial: true, lastColPartial: false });
	expect(mapSize(2, 10, 140, 110)).toEqual({ rows: 2, cols: 4, lastRowPartial: false, lastColPartial: true });	//the file's 2 rows
});

//The step's world and events; a refusal throws
function played(r: Stepped): Extract<Stepped, { ok: true }> {
	if ("refusal" in r) throw new Error(r.refusal.reason);
	return r;
}

//The world with its game stream at seed (the AI's at 7)
function withRng<W extends { state: object }>(w: W, seed: number): W {
	return { ...w, state: { ...w.state, rng: { game: seed, ai: 7 } } };
}

test("Property: the path search with its heap finds the old engine's paths, ties broken the same", async () => {
	const { GameRules } = await import("../src/gamerules");
	const grid: Cell[] = [];
	for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) grid.push({ row: r, col: c } as Cell);
	const cell = fc.constantFrom(...grid);
	//most of a small map in any order, mostly of cost 1: many paths as cheap as each other
	const cells = fc.shuffledSubarray(grid, { minLength: 20 }).chain((list) => fc.tuple(...list.map((c) =>
		fc.constantFrom(1, 1, 1, 2, 254).map((cost) => ({ row: c.row, col: c.col, cost })))));
	fc.assert(fc.property(cell, cell, cells, (start, end, list) => {
		const old = GameRules.getShortestPath(start, end, list as extendedCell[]);
		expect(shortestPath(start, end, list)).toEqual(old.map((p) => ({ row: p.row, col: p.col, cost: p.cost, dist: p.dist })));
	}), { seed: 134, numRuns: 2000 });
});

test("The half hexes of the edges: the first row's even columns, a partial last column and last row's odd columns", () => {
	expect(isPartialEdge(0, 2, 10, 10, false, false)).toBe(true);
	expect(isPartialEdge(0, 3, 10, 10, false, false)).toBe(false);
	expect(isPartialEdge(4, 9, 10, 10, false, true)).toBe(true);
	expect(isPartialEdge(4, 9, 10, 10, false, false)).toBe(false);
	expect(isPartialEdge(9, 3, 10, 10, true, false)).toBe(true);
	expect(isPartialEdge(9, 4, 10, 10, true, false)).toBe(false);
});

test("A unit bought outside a campaign gets the other side's average experience, none when that side had no unit", () => {
	const w = handWorld({ rows: 4, cols: 4, units: [] });
	w.state.players[0].prestige = 10000;
	const bought = (exp: number, count: number) => {
		w.state.scenario.expPerSide = [{ exp: 0, count: 0 }, { exp, count }];
		const p = played(step(w, { type: "buy", eqid: PZ_IIA, transport: -1 })).world.state.players[0];
		return (p.core[0] as { reserve: { experience: number } }).reserve.experience;
	};
	expect(bought(250, 2)).toBe(125);
	expect(bought(0, 0)).toBe(0); //(0 / 0 is NaN)
});
