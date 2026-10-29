// @vitest-environment node
//The new core's rules on hand-built situations (docs/CORE.md, #133): each test reads like the rule
//it tests. That the core answers as the old engine did is the contracts' (test/core-contract.test.ts,
//test/engine.test.ts; test/core-differential.test.ts's until #137)
import fc from "fast-check";
import { expect, test } from "vitest";
import { nextRandom } from "../src/core/random";
import { Leaders } from "../src/legacy/leaders";
import { type Cell } from "../src/legacy/prototypes";
import { leaderType, movMethod, movTableDry, movTableMud, roadType, terrainType, unitClass } from "../src/core/tables";
import { attackResult, combatResult, inRiver } from "../src/core/combat";
import { leaderMoves, moveRange, pathTo, shortestPath, unitMoveRange } from "../src/core/movement";
import { attackCells } from "../src/core/attack";
import { resupplyValue } from "../src/core/supply";
import { captureAt } from "../src/core/moves";
import { classicRules, moveCosts } from "../src/core/rules";
import { cellsInRange, distance, isPartialEdge } from "../src/core/geometry";
import { spotCells } from "../src/core/sight";
import { hexIndex, isSpotted, isZOC, unitById } from "../src/core/world";
import { begin, resume, step, type Stepped } from "../src/core/step";
import { arriveReinforcements, outcome } from "../src/core/turn";
import { mapSize } from "../src/core/newgame";
import type { Contribution, UnitState, World } from "../src/core/types";
import type { Command } from "../src/core/command";
import { createWorld } from "../src/core/create";
import { type HandUnit, handWorld } from "./coreworld";
import { deployedAs } from "../src/core/commands/units";
import type { OffMapUnit } from "../src/core/state";
import { Equipment } from "../src/legacy/equipment";
import { smallGameData } from "./smallgame";

const PZ_IIA = 140, TP7 = 273, INFANTERIE = 115, WZ97 = 264, ME_109 = 159, P11 = 280, PSW_222 = 117;

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

//The share of d20 rolls that kill a strength point: 1 misses, 20 hits, the others with the kill fraction added
function hitChance(kF: number, threshold: number): number {
	let hits = 0;
	for (let roll = 1; roll <= 20; roll++)
		if (roll === 20 || (roll > 1 && roll + kF >= threshold)) hits++;
	return hits / 20;
}

test("The estimate is the dice's expected kills rounded once, PG2's integer division: no half point more (#90)", () => {
	//a Pz IIA against a 7TP in the open, each at strengths 1 to 10: no leader, kill fractions of 4 or less
	for (let strength = 1; strength <= 10; strength++) {
		const w = handWorld({ rows: 6, cols: 6, units: [
			{ eqid: PZ_IIA, owner: 0, row: 2, col: 2, strength },
			{ eqid: TP7, owner: 1, row: 2, col: 3, strength },
		] });
		const record: Contribution[] = [];
		const cr = attackResult(w, unitById(w, 0), unitById(w, 1), null, record);
		const last = (side: string, field: string) => {
			const steps = record.filter((r) => r.side === side && r.field === field);
			return steps[steps.length - 1].after;
		};
		const kills = strength * hitChance(last("attacker", "aav") - last("defender", "ddv"), 15);
		const losses = strength * hitChance(last("defender", "dav") - last("attacker", "adv"), 15);
		expect([cr.kills, cr.losses], "strength " + strength).toEqual([Math.floor(kills + 0.5), Math.floor(losses + 0.5)]);
	}
});

test("The attack's estimate counts as kills only the target's losses, not the support fire's on the attacker (#87)", () => {
	//a Pz IIA next to a 7TP in the open, a Polish 75mm A wz.97 next to the tank: it fires in support,
	//the tank fires back at it, and those hits fall on the gun, not on the 7TP
	const w = handWorld({ rows: 6, cols: 6, units: [
		{ eqid: PZ_IIA, owner: 0, row: 2, col: 2 },
		{ eqid: TP7, owner: 1, row: 2, col: 3 },
		{ eqid: WZ97, owner: 1, row: 3, col: 2, tempSpotted: true },
	] });
	const tank = unitById(w, 0), target = unitById(w, 1), gun = unitById(w, 2);
	const alone = attackResult(w, tank, target, null), support = attackResult(w, gun, tank, null);
	expect(support.losses).toBeGreaterThan(0); //the tank's return fire on the gun
	for (const withHidden of [false, true]) {
		const cr = combatResult(w, tank, target, withHidden, null);
		expect([cr.kills, cr.losses], "with hidden units: " + withHidden).toEqual([alone.kills, alone.losses + support.kills]);
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

test("A towed unit pays 2 to enter a fortification in mud, as the other ground units do, not 21 (#23)", () => {
	const mud = moveCosts(classicRules, 2, movMethod.towed);
	expect(mud[terrainType.Fortification]).toBe(2);
	//(a towed gun in its transport moves by the transport's table: a fortification in mud is 2 for tracks, legs and half-tracks)
	expect([movMethod.tracked, movMethod.halfTracked, movMethod.leg].map((m) => moveCosts(classicRules, 2, m)[terrainType.Fortification]))
		.toEqual([2, 2, 2]);
});

test("A tank's move range stops at an enemy's zone of control, and its path costs what the range shows (#70)", () => {
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
	expect(path.reduce((sum, p) => sum + p.cost, 0)).toBe(1); //one hex of clear: the start hex costs nothing
});

test("A move pays the hexes it enters, not the one it leaves: a recon car's 3 road hexes use 3 points and 3 fuel (#70)", () => {
	const w = handWorld({ rows: 8, cols: 8, road: () => roadType.north, units: [{ eqid: PSW_222, owner: 0, row: 4, col: 1 }] });
	const car = unitById(w, 0);
	const r = played(step(w, { type: "move", unit: 0, to: { row: 4, col: 4 } }));
	expect(unitById(r.world, 0)).toMatchObject({ row: 4, col: 4, moveLeft: car.moveLeft - 3, fuel: car.fuel - 3, hasMoved: false });
	//the rest of its move, split: what the range showed is what it can still reach
	const again = played(step(r.world, { type: "move", unit: 0, to: { row: 4, col: 7 } }));
	expect(unitById(again.world, 0)).toMatchObject({ row: 4, col: 7, moveLeft: car.moveLeft - 6, fuel: car.fuel - 6 });
});

//A strip of land in the sea: the tank at 4,4, clear at 3,5, 4,5 and 6,5, a forest at 5,5
function landStrip() {
	const land = (r: number, c: number) => (r === 3 && c === 5) || (r === 4 && c === 5) || (r === 6 && c === 5);
	return handWorld({ rows: 9, cols: 9, units: [{ eqid: PZ_IIA, owner: 0, row: 4, col: 4, moveLeft: 4 }],
		terrain: (r, c) => r === 4 && c === 4 || land(r, c) ? terrainType.Clear : r === 5 && c === 5 ? terrainType.Forest : terrainType.Ocean });
}

test("A hex next to the unit costs only its own entry, whatever its neighbours cost: 4 points reach clear, forest, clear (#167)", () => {
	const w = landStrip();
	const cells = moveRange(w, unitById(w, 0));
	const at = (r: number, c: number) => cells.find((x) => x.row === r && x.col === c);
	expect(at(4, 5)).toMatchObject({ cin: 0, cout: 1 }); //entered from the unit's hex, though the sea next to it costs 255
	expect(at(5, 5)).toMatchObject({ cin: 1, cout: 3 });
	expect(at(6, 5)).toMatchObject({ cin: 3, canMove: true });
	expect(pathTo(w, unitById(w, 0), { row: 6, col: 5 }).map((p) => [p.row, p.col])).toEqual([[4, 4], [4, 5], [5, 5], [6, 5]]);
});

//A Pz IIA at 4,1 with moveLeft points left (more: its other fields), on the terrain given, with the units given; its move range
function tankWith(moveLeft: number, terrain: (r: number, c: number) => number, more: Partial<UnitState> = {}, units: HandUnit[] = []) {
	const w = handWorld({ rows: 8, cols: 8, terrain, units: [{ eqid: PZ_IIA, owner: 0, row: 4, col: 1, moveLeft, ...more }, ...units] });
	const cells = moveRange(w, unitById(w, 0));
	return { w, at: (r: number, c: number) => cells.find((x) => x.row === r && x.col === c && x.canMove) };
}

test("A unit enters a hex only with the points to pay for it: a Pz IIA with 1 point left can't enter a forest (#205)", () => {
	const { w, at } = tankWith(1, (r, c) => r === 4 && c === 2 ? terrainType.Forest : terrainType.Clear);
	expect(at(4, 2)).toBeUndefined(); //the forest costs 2
	expect(at(5, 1)).toMatchObject({ cin: 0, cout: 1 }); //clear costs 1
	expect(step(w, { type: "move", unit: 0, to: { row: 4, col: 2 } })).toEqual({ ok: false, refusal: { reason: "can't get there" } });
	expect(unitById(played(step(w, { type: "move", unit: 0, to: { row: 5, col: 1 } })).world, 0)).toMatchObject({ moveLeft: 0, fuel: 49 });
});

test("A unit enters a hex only with the fuel to pay for it: a Pz IIA with 1 fuel can't enter a forest, nor go further with a leader (#205)", () => {
	const forest = (r: number, c: number) => r === 4 && c === 2 ? terrainType.Forest : terrainType.Clear;
	expect(tankWith(5, forest, { fuel: 1 }).at(4, 2)).toBeUndefined();
	expect(tankWith(5, forest, { fuel: 1 }).at(5, 1)).toBeDefined();
	//the leader's extra hex is a movement point too, paid in fuel
	const { at } = tankWith(5, () => terrainType.Clear, { fuel: 2, leader: leaderType.aggressiveManeuver });
	expect(at(4, 3)).toBeDefined();
	expect(at(4, 4)).toBeUndefined();
});

test("The leaders' extra moves: a tank with any leader has its class leader's hex, Aggressive Maneuver one more (#346)", () => {
	const tank = (leader: number) => handWorld({ rows: 8, cols: 8, units: [{ eqid: PZ_IIA, owner: 0, row: 4, col: 1, leader }] });
	const moves = (leader: number) => { const w = tank(leader); return [leaderMoves(w, unitById(w, 0)), unitMoveRange(w, unitById(w, 0))]; };
	const points = tank(-1).equipment[PZ_IIA].movpoints;
	expect(classicRules.classLeaders[unitClass.tank]).toBe(leaderType.aggressiveTankManeuver);
	expect(moves(-1)).toEqual([0, points]);
	expect(moves(leaderType.tankKiller)).toEqual([1, points + 1]);
	expect(moves(leaderType.aggressiveManeuver)).toEqual([2, points + 2]);
});

test("A hex that uses all the points (a mountain for a tank) takes any points left, at least one (#205)", () => {
	const mountain = (_: number, c: number) => c === 3 ? terrainType.Mountain : terrainType.Clear;
	const two = tankWith(2, mountain);
	expect(two.at(4, 3)).toMatchObject({ cin: 1, cost: 254 }); //1 point left after the clear hex
	const moved = unitById(played(step(two.w, { type: "move", unit: 0, to: { row: 4, col: 3 } })).world, 0);
	expect(moved).toMatchObject({ row: 4, col: 3, hasMoved: true });
	expect(moved.moveLeft).toBeGreaterThanOrEqual(0);
	expect(moved.fuel).toBeGreaterThanOrEqual(0);
	//no point left after a forest
	expect(tankWith(2, (r, c) => c === 2 ? terrainType.Forest : mountain(r, c)).at(4, 3)).toBeUndefined();
	expect(tankWith(1, (r, c) => r === 4 && c === 2 ? terrainType.Mountain : terrainType.Clear).at(4, 2)).toMatchObject({ cin: 0 });
});

test("An enemy's zone of control stops a unit on a hex it can pay for: a Pz IIA with 2 points can't enter a forest there after a clear hex (#205)", () => {
	const forest = (r: number, c: number) => r === 4 && c === 3 ? terrainType.Forest : terrainType.Clear;
	const enemy: HandUnit[] = [{ eqid: TP7, owner: 1, row: 4, col: 4 }];
	const two = tankWith(2, forest, {}, enemy);
	expect(isZOC(two.w, hexIndex(two.w, 4, 3), 1)).toBe(true);
	expect(two.at(4, 3)).toBeUndefined(); //1 + 2
	expect(tankWith(3, forest, {}, enemy).at(4, 3)).toMatchObject({ cin: 1, cost: 254 });
});

test("A unit in a river or a stream without a road fights worse; a road over it, or other terrain, doesn't (#346)", () => {
	expect([inRiver(terrainType.River, roadType.none), inRiver(terrainType.Stream, roadType.none), inRiver(terrainType.River, roadType.north),
		inRiver(terrainType.Clear, roadType.none)]).toEqual([true, true, false, false]);
});

test("A hex that uses all the points uses them all, in points and fuel: a recon car entering a river with points left can't move on (#214)", () => {
	//a Psw 222 (9 points, 55 fuel, wheeled: clear costs 2) at 4,1, a river at 4,3
	const w = handWorld({ rows: 8, cols: 8, terrain: (r, c) => r === 4 && c === 3 ? terrainType.River : terrainType.Clear,
		units: [{ eqid: PSW_222, owner: 0, row: 4, col: 1 }] });
	const moved = unitById(played(step(w, { type: "move", unit: 0, to: { row: 4, col: 3 } })).world, 0);
	expect(moved).toMatchObject({ row: 4, col: 3, moveLeft: 0, fuel: 55 - 9, hasMoved: true });
});

test("An enemy's zone of control stops the move but costs the hex's terrain: a recon car entering a forest there pays 4 and can't move on (#214)", () => {
	//a Psw 222 at 4,1: clear at 4,2 (2), a forest at 4,3 (4) next to a 7TP at 4,4
	const w = handWorld({ rows: 8, cols: 8, terrain: (r, c) => r === 4 && c === 3 ? terrainType.Forest : terrainType.Clear,
		units: [{ eqid: PSW_222, owner: 0, row: 4, col: 1 }, { eqid: TP7, owner: 1, row: 4, col: 4 }] });
	expect(isZOC(w, hexIndex(w, 4, 3), 1)).toBe(true);
	const moved = unitById(played(step(w, { type: "move", unit: 0, to: { row: 4, col: 3 } })).world, 0);
	expect(moved).toMatchObject({ row: 4, col: 3, moveLeft: 0, fuel: 55 - 6, hasMoved: true });
});

test("A resupply gives only what is missing: a tank with full ammo gets fuel, no ammo, and stays at its maximum (#95)", () => {
	//a Pz IIA (8 ammo, 50 fuel) at 20 fuel in the open, and an infantry (no fuel) short of ammo
	const w = handWorld({ rows: 6, cols: 6, units: [
		{ eqid: PZ_IIA, owner: 0, row: 2, col: 2, fuel: 20 },
		{ eqid: INFANTERIE, owner: 0, row: 4, col: 4, ammo: 2 },
	] });
	expect(resupplyValue(w, unitById(w, 0))).toEqual({ ammo: 0, fuel: 23, transportAmmo: 0, transportFuel: 0 }); //30 / 1.3
	expect(resupplyValue(w, unitById(w, 1))).toEqual({ ammo: 3, fuel: 0, transportAmmo: 0, transportFuel: 0 }); //4 / 1.3
	const tank = unitById(played(step(w, { type: "resupply", unit: 0 })).world, 0);
	expect([tank.ammo, tank.fuel]).toEqual([8, 43]);
	//a little missing still gets at least 1
	const low = handWorld({ rows: 6, cols: 6, units: [{ eqid: PZ_IIA, owner: 0, row: 2, col: 2, ammo: 7, fuel: 49 },
		{ eqid: TP7, owner: 1, row: 2, col: 3 }, { eqid: TP7, owner: 1, row: 1, col: 2 }, { eqid: TP7, owner: 1, row: 3, col: 2 }] });
	expect(resupplyValue(low, unitById(low, 0))).toMatchObject({ ammo: 1, fuel: 1 });
});

test("A unit's range doesn't go through an enemy it sees: a 7TP next to a Pz IIA doesn't reach the hex behind it with 2 points (#205)", () => {
	//a Polish 7TP (spotting 1) next to a Pz IIA: the hexes beside both are in its zone of control and
	//seen, the hex behind it isn't seen
	const w = handWorld({ rows: 8, cols: 8, units: [
		{ eqid: TP7, owner: 1, row: 4, col: 2, moveLeft: 2 },
		{ eqid: PZ_IIA, owner: 0, row: 4, col: 3 },
	] });
	const cells = moveRange(w, unitById(w, 0));
	expect(isSpotted(w, hexIndex(w, 4, 4), 1)).toBe(false);
	expect(cells.find((x) => x.row === 4 && x.col === 3)).toBeUndefined(); //the enemy's hex
	expect(cells.find((x) => x.row === 4 && x.col === 4)).toBeUndefined(); //only through it for 2 points
});

test("A reinforcement worth no strength is refused and changes nothing: 1 point missing next to three enemies outside a city (#147)", () => {
	const w = handWorld({ rows: 6, cols: 6, units: [{ eqid: PZ_IIA, owner: 0, row: 2, col: 2, strength: 9 },
		{ eqid: TP7, owner: 1, row: 2, col: 3 }, { eqid: TP7, owner: 1, row: 1, col: 2 }, { eqid: TP7, owner: 1, row: 3, col: 2 }] });
	w.state.players[0].prestige = 1000;
	expect(step(w, { type: "reinforce", unit: 0 })).toEqual({ ok: false, refusal: { reason: "can't reinforce" } }); //1 / 1.3 / 3
	//two enemies around: 1 / 1.3 / 1.5 rounds to 1
	const two = handWorld({ rows: 6, cols: 6, units: [{ eqid: PZ_IIA, owner: 0, row: 2, col: 2, strength: 9 },
		{ eqid: TP7, owner: 1, row: 2, col: 3 }, { eqid: TP7, owner: 1, row: 1, col: 2 }] });
	two.state.players[0].prestige = 1000;
	expect(unitById(played(step(two, { type: "reinforce", unit: 0 })).world, 0)).toMatchObject({ strength: 10, hasMoved: true });
});

test("A hidden enemy's hex is in the move range: the move ends in a surprise", () => {
	const w = handWorld({ rows: 8, cols: 8, units: [
		{ eqid: PZ_IIA, owner: 0, row: 4, col: 1 },
		{ eqid: TP7, owner: 1, row: 4, col: 4 }, //3 hexes away, out of the Pz IIA's sight (2)
	] });
	expect(isSpotted(w, hexIndex(w, 4, 4), 0)).toBe(false);
	expect(moveRange(w, unitById(w, 0)).find((x) => x.row === 4 && x.col === 4)).toMatchObject({ canMove: true });
});

test("Column 0 is a column like the others: a unit next to it reaches, spots and attacks it (#69)", () => {
	expect(cellsInRange(3, 1, 2, 8, 8).filter((c) => c.col === 0).length).toBe(4);
	expect(cellsInRange(3, 1, 2, 8, 8).length).toBe(15); //the 18 hexes within 2, less the three off the map's left edge
	expect(distance(3, 1, 3, 0)).toBe(1);
	const w = handWorld({ rows: 8, cols: 8, units: [
		{ eqid: PZ_IIA, owner: 0, row: 3, col: 1 },
		{ eqid: TP7, owner: 1, row: 3, col: 0 },
	] });
	expect(spotCells(w, unitById(w, 0)).some((c) => c.row === 3 && c.col === 0)).toBe(true);
	expect(isSpotted(w, hexIndex(w, 3, 0), 0)).toBe(true);
	expect(attackCells(w, unitById(w, 0))).toEqual([{ row: 3, col: 0 }]);
	expect(moveRange(w, unitById(w, 0)).find((c) => c.row === 5 && c.col === 0)).toMatchObject({ canMove: true });
	expect(played(step(w, { type: "move", unit: 0, to: { row: 5, col: 0 } })).world.state.units[0]).toMatchObject({ row: 5, col: 0 });
});

//The commands (src/core/step.ts, #134): that they play as the old engine's was test/core-steps.test.ts's
//until #137, the engine contract's since

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

test("An air unit's range counts the steps around the enemy aircraft it sees and over its own: every hex in it is a path within its points (#217)", () => {
	//a Me 109 (15 points) at 2,2 and a wall of P.11s it sees (they fired) at 0,4 to 5,4: the way east goes around below them
	const w = handWorld({ rows: 8, cols: 20, units: [{ eqid: ME_109, owner: 0, row: 2, col: 2 },
		...[0, 1, 2, 3, 4, 5].map((row) => ({ eqid: P11, owner: 1, row, col: 4, tempSpotted: true }))] });
	const fighter = unitById(w, 0);
	expect(fighter.moveLeft).toBe(15);
	const cells = moveRange(w, fighter).filter((c) => c.canMove);
	const steps = cells.map((c) => ({ at: [c.row, c.col], steps: pathTo(w, fighter, c).length - 1 }));
	expect(steps.filter((s) => s.steps < 0 || s.steps > 15)).toEqual([]);
	expect(cells.some((c) => c.row === 2 && c.col === 17)).toBe(false); //15 hexes away, more steps around the wall
	//the farthest east on its row, 15 steps away: the move uses all the points, no more
	expect(Math.max(...cells.filter((c) => c.row === 2).map((c) => c.col))).toBe(14);
	const moved = unitById(played(step(w, { type: "move", unit: 0, to: { row: 2, col: 14 } })).world, 0);
	expect(moved).toMatchObject({ row: 2, col: 14, moveLeft: 0 });
	//over a wall of its own fighters: they are hexes it passes, not stops on, and 2,17 is 15 steps away
	const own = handWorld({ rows: 8, cols: 20, units: [{ eqid: ME_109, owner: 0, row: 2, col: 2 },
		...[0, 1, 2, 3, 4, 5].map((row) => ({ eqid: ME_109, owner: 0, row, col: 4 }))] });
	const over = moveRange(own, unitById(own, 0));
	expect(over.find((c) => c.row === 2 && c.col === 4)).toMatchObject({ canMove: false, canPass: true });
	expect(over.find((c) => c.row === 2 && c.col === 17)).toMatchObject({ canMove: true });
	const flown = unitById(played(step(own, { type: "move", unit: 0, to: { row: 2, col: 17 } })).world, 0);
	expect(flown).toMatchObject({ row: 2, col: 17, moveLeft: 0 });
});

//A Me-109 (player 0) and, 4 hexes away out of its sight, a 7TP below a P.11c (player 1)
function hiddenPair() {
	return withRng(handWorld({ rows: 8, cols: 8, units: [
		{ eqid: ME_109, owner: 0, row: 4, col: 1 },
		{ eqid: TP7, owner: 1, row: 4, col: 5 },
		{ eqid: P11, owner: 1, row: 4, col: 5 },
	] }), 99);
}

//begin, then resume from each checkpoint
function byCheckpoints(w: World, cmd: Command) {
	const b = begin(w, cmd);
	if ("refusal" in b) throw new Error(b.refusal.reason);
	const checkpoints: string[] = [];
	let { world, checkpoint } = b;
	const events = b.events.slice();
	while (checkpoint !== null) {
		checkpoints.push(checkpoint.next);
		const r = resume(world, checkpoint);
		({ world, checkpoint } = r);
		events.push(...r.events);
	}
	return { world, events, checkpoints };
}

test("A move waits for the screen once moved, an attack once fired and once the destroyed are gone; then it ends as stepped whole", () => {
	const w = hiddenPair(), move: Command = { type: "move", unit: 0, to: { row: 4, col: 5 } };
	const moved = begin(w, move);
	expect(moved).toMatchObject({ ok: true, checkpoint: { next: "surprise", unit: 0, surprise: { row: 4, col: 5 }, win: false } });
	expect(moved.ok && unitById(moved.world, 0)).toMatchObject({ isSurprised: true, strength: 10 });
	const phased = byCheckpoints(w, move), whole = played(step(w, move));
	expect(phased.checkpoints).toEqual(["surprise", "cleanUp", "end"]);
	expect(JSON.stringify([phased.world.state, phased.events])).toBe(JSON.stringify([whole.world.state, whole.events]));
});

//A Me-109 flies into a hex where a 7TP and a P.11 hide: the P.11 stops it, an aircraft as it is, and the
//surprise attack hits the P.11, not the tank under it. A 7TP drives to a hex where a Pz IIA and a Me-109
//hide: the tank stops it and is hit. No screen's air mode picks either (the old game read the person's toggle,
//also for the AI's moves)
test("The surprise attack hits the hidden unit of the mover's kind, the one that stopped it (#77)", () => {
	const target = (w: World, cmd: Command) => byCheckpoints(w, cmd).events.filter((e) => e.type === "fight" && !e.support)
		.map((e) => e.type === "fight" && e.defender.unit);
	expect(target(hiddenPair(), { type: "move", unit: 0, to: { row: 4, col: 5 } })).toEqual([2]);
	const underFighter = withRng(handWorld({ rows: 8, cols: 8, units: [
		{ eqid: TP7, owner: 1, row: 4, col: 1 },
		{ eqid: PZ_IIA, owner: 0, row: 4, col: 4 },
		{ eqid: ME_109, owner: 0, row: 4, col: 4 },
	] }), 99);
	underFighter.state.turn.currentPlayer = 1;
	expect(target(underFighter, { type: "move", unit: 0, to: { row: 4, col: 4 } })).toEqual([1]);
});

//Two human players: a defender pushed back by an attack is the other player's unit, and the retreat
//isn't a move its player made
test("A retreat leaves nothing to undo, and an undo takes back only the current player's own move (#171)", () => {
	const veterans = () => handWorld({ rows: 6, cols: 6, units: [
		{ eqid: PZ_IIA, owner: 0, row: 2, col: 2, experience: 400 },
		{ eqid: TP7, owner: 1, row: 2, col: 3 },
	] });
	let seed = 1, r: Extract<Stepped, { ok: true }>;
	for (; seed < 500; seed++) {
		r = played(step(withRng(veterans(), seed), { type: "attack", unit: 0, target: 1 }));
		if (r.events.some((e) => e.type === "retreated")) break;
	}
	expect(seed).toBeLessThan(500);
	expect(r!.world.state.turn.undoable).toBeNull();
	expect(step(r!.world, { type: "undo", unit: 1 })).toEqual({ ok: false, refusal: { reason: "can't undo" } });

	//A move's undo, then the other player's turn: not theirs to take back
	const apart = handWorld({ rows: 8, cols: 8, units: [{ eqid: PZ_IIA, owner: 0, row: 4, col: 1 }, { eqid: TP7, owner: 1, row: 0, col: 7 }] });
	const moved = played(step(apart, { type: "move", unit: 0, to: { row: 5, col: 1 } }));
	expect(moved.world.state.turn.undoable).toMatchObject({ unit: 0 });
	const otherTurn = { ...moved.world, state: { ...moved.world.state, turn: { ...moved.world.state.turn, currentPlayer: 1 } } };
	expect(step(otherTurn, { type: "undo", unit: 0 })).toEqual({ ok: false, refusal: { reason: "can't undo" } });
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

//The screen's move path says what a move would take before it is made (#32): the same flag or objective
//and prestige the move's capture gives, nothing on a hex of its own side or without a flag, and nothing
//for an aircraft
test("What a move would capture is what the move captures: a flag +50, an objective +150, twice with a liberator", () => {
	const w = handWorld({ rows: 8, cols: 8, units: [{ eqid: PZ_IIA, owner: 0, row: 4, col: 1 },
		{ eqid: PZ_IIA, owner: 0, row: 4, col: 3, leader: leaderType.liberator }, { eqid: ME_109, owner: 0, row: 2, col: 1 }] });
	Object.assign(w.state.map.hexes[hexIndex(w, 5, 1)], { owner: 1, flag: 15, victorySide: -1 });
	Object.assign(w.state.map.hexes[hexIndex(w, 3, 1)], { owner: 1, flag: 15, victorySide: 0 });
	Object.assign(w.state.map.hexes[hexIndex(w, 6, 1)], { owner: 0, flag: 7, victorySide: -1 });
	const tank = unitById(w, 0), liberator = unitById(w, 1), plane = unitById(w, 2);
	expect(captureAt(w, tank, { row: 5, col: 1 })).toEqual({ flag: true, objective: false, prestige: 50 });
	expect(captureAt(w, tank, { row: 3, col: 1 })).toEqual({ flag: false, objective: true, prestige: 150 });
	expect(captureAt(w, liberator, { row: 5, col: 1 })).toEqual({ flag: true, objective: false, prestige: 100 });
	expect([captureAt(w, tank, { row: 6, col: 1 }), captureAt(w, tank, { row: 4, col: 2 }), captureAt(w, plane, { row: 5, col: 1 })])
		.toEqual([null, null, null]);
	const moved = played(step(w, { type: "move", unit: 0, to: { row: 5, col: 1 } }));
	expect(moved.events.find((e) => e.type === "captured")).toMatchObject({ flag: true, objective: false, prestige: 50 });
});

//A unit passes through its own side's units but can't stop on one of its kind: the hex holds one ground
//(or naval) unit and one air unit. A program's move is refused there, with the move range given as its
//cells too; an aircraft stops over a tank. (An enemy it doesn't see doesn't refuse it: the move stops
//before, surprised, as in the tests above)
test("A move can't end on a hex its side's unit of the same kind holds; an aircraft can over a tank (#74)", () => {
	const w = handWorld({ rows: 8, cols: 8, units: [
		{ eqid: PZ_IIA, owner: 0, row: 4, col: 1 },
		{ eqid: PZ_IIA, owner: 0, row: 4, col: 3 },
		{ eqid: ME_109, owner: 0, row: 2, col: 1 },
	] });
	const taken = { ok: false, refusal: { reason: "the hex is taken" } };
	expect(step(w, { type: "move", unit: 0, to: { row: 4, col: 3 } })).toEqual(taken);
	expect(step(w, { type: "move", unit: 0, to: { row: 4, col: 3 }, cells: moveRange(w, unitById(w, 0)) })).toEqual(taken);
	const flown = played(step(w, { type: "move", unit: 2, to: { row: 4, col: 3 } }));
	expect(flown.world.state.map.hexes[hexIndex(w, 4, 3)]).toMatchObject({ unit: 1, air: 2 });
	//passing through the tank to the hex beyond it
	expect(unitById(played(step(w, { type: "move", unit: 0, to: { row: 4, col: 4 } })).world, 0)).toMatchObject({ row: 4, col: 4 });
});

//A Polish infantry on its truck next to a Pz IIA
test("Mounted infantry attacked gets off its truck to fight", () => {
	const PIECHOTA = 271, PF621 = 278;
	const w = withRng(handWorld({ rows: 6, cols: 6, units: [
		{ eqid: PZ_IIA, owner: 0, row: 2, col: 2 },
		{ eqid: PIECHOTA, owner: 1, row: 2, col: 3, isMounted: true, transport: { eqid: PF621, ammo: 0, fuel: 50 } },
	] }), 5);
	const r = played(step(w, { type: "attack", unit: 0, target: 1 }));
	expect(r.events.map((e) => e.type)).toContain("dismounted");
	expect(unitById(r.world, 1)).toMatchObject({ isMounted: false, transport: { eqid: PF621 } });
});

//An SS infantry leaving its Ju-52 on an airfield: selecting it (as a mount does last) puts it back on
//the carrier when no neighbour lets it land (MapSelection.select), and leaves it landing otherwise
test("A unit leaving its carrier gets back on it when selected, unless it can still land", () => {
	//(a mount selects the unit: it has a truck to mount, #147)
	const SS_INFANTRY = 108, JU52 = 176, OPEL_BLITZ = 157;
	for (const [around, carrier] of [[terrainType.Clear, -JU52], [terrainType.Ocean, JU52]]) {
		const w = handWorld({ rows: 5, cols: 5, terrain: (r, c) => r === 2 && c === 2 ? terrainType.Airfield : around,
			units: [{ eqid: SS_INFANTRY, owner: 0, row: 2, col: 2, carrier: -JU52, transport: { eqid: OPEL_BLITZ, ammo: 4, fuel: 55 } }] });
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

//Far apart, neither side sees the other's unit any more: both hide again, whichever side the screen
//shows (the old game kept the screen side's own units seen, which the AI then shot at in the fog).
//Side by side, each sees the other: both stay seen
test("A unit seen after firing hides again at the round's end unless its enemy sees its hex, whatever the screen shows (#75)", () => {
	const roundEnded = (w: World) => played(step(played(step(w, { type: "endTurn" })).world, { type: "endTurn" })).world;
	for (const spotSide of [0, 1, -1]) {
		const apart = roundEnded(farApart(spotSide));
		expect([unitById(apart, 0).tempSpotted, unitById(apart, 1).tempSpotted], "screen shows " + spotSide).toEqual([false, false]);
		const near = farApart(spotSide);
		near.state.units[1] = { ...near.state.units[1], row: 1, col: 2 };
		near.state.map.hexes[9 * 12 + 9].unit = null;
		near.state.map.hexes[1 * 12 + 2].unit = 1;
		const together = roundEnded(createWorld({ data: near.data, state: near.state }, near.equipment, { spotSide }));
		expect([unitById(together, 0).tempSpotted, unitById(together, 1).tempSpotted], "side by side, screen shows " + spotSide)
			.toEqual([true, true]);
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

//The old engine's path search (GameRules.getShortestPath until #137), kept as the heap's oracle: the
//open cell nearest the start, the later of equally near ones, its neighbours relaxed, until the end
type Open = { row: number; col: number; cost: number; dist: number; prev: Open | null };

//(the old isAdjacent: x is the row, y the column)
const oldIsAdjacent = (x1: number, y1: number, x2: number, y2: number) => (y1 === y2 && Math.abs(x1 - x2) === 1)
	|| (Math.abs(y1 - y2) === 1 && (x1 - 1 + (y1 % 2) === x2 || x1 + (y1 % 2) === x2));

//The open cell nearest the start, the later of equally near ones (-1: none reached)
function nearestOpen(open: Open[]): number {
	let idx = 0;
	for (let i = 1; i < open.length; i++) if (open[i].dist !== Infinity && open[i].dist <= open[idx].dist) idx = i;
	return open[idx].dist === Infinity ? -1 : idx;
}

function oldShortestPath(start: Cell, end: Cell, list: { row: number; col: number; cost: number }[]): Open[] {
	const open: Open[] = [{ row: start.row, col: start.col, cost: 0, dist: 0, prev: null }]; //(cost 1 until #70)
	open[0].prev = open[0];
	for (const c of list) open.push({ row: c.row, col: c.col, cost: c.cost, dist: Infinity, prev: null });
	for (let idx = nearestOpen(open); idx >= 0; idx = open.length ? nearestOpen(open) : -1) {
		const min = open[idx];
		relax(min, open);
		if (min.row === end.row && min.col === end.col) return pathBack(min, start);
		open.splice(idx, 1);
	}
	return [];
}

//The neighbours of min nearer the start through it
function relax(min: Open, open: Open[]) {
	for (const o of open)
		if (oldIsAdjacent(min.row, min.col, o.row, o.col) && (o.dist === Infinity || min.dist + min.cost < o.dist))
			Object.assign(o, { dist: min.dist + min.cost, prev: min });
}

//The path to cell from the start, by the cells before it
function pathBack(cell: Open, start: Cell): Open[] {
	const path: Open[] = [];
	for (let t = cell; ; t = t.prev) {
		path.unshift(t);
		if (t.row === start.row && t.col === start.col) return path;
	}
}

test("Property: the path search with its heap finds the old engine's paths, ties broken the same", () => {
	const grid: Cell[] = [];
	for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) grid.push({ row: r, col: c } as Cell);
	const cell = fc.constantFrom(...grid);
	//most of a small map in any order, mostly of cost 1: many paths as cheap as each other
	const cells = fc.shuffledSubarray(grid, { minLength: 20 }).chain((list) => fc.tuple(...list.map((c) =>
		fc.constantFrom(1, 1, 1, 2, 254).map((cost) => ({ row: c.row, col: c.col, cost })))));
	fc.assert(fc.property(cell, cell, cells, (start, end, list) => {
		const old = oldShortestPath(start, end, list);
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
	w.data.hexes[0].deployment = 0; //somewhere to deploy it (#60)
	const bought = (exp: number, count: number) => {
		w.state.scenario.expPerSide = [{ exp: 0, count: 0 }, { exp, count }];
		const p = played(step(w, { type: "buy", eqid: PZ_IIA, transport: -1 })).world.state.players[0];
		return (p.core[0] as { reserve: { experience: number } }).reserve.experience;
	};
	expect(bought(250, 2)).toBe(125);
	expect(bought(0, 0)).toBe(0); //(0 / 0 is NaN)
});

//A German destroyer (129: Zerstorer 1934, close defense 3, ground defense 7) and a Soviet submarine (1863:
//S, close defense 1, ground defense 5) next to each other at sea: a ship and a submarine fight at close
//range, so the one that isn't the submarine defends with its close defense, whichever attacks. The
//original set it for a submarine defender, then overwrote it with the ground defense (#88)
test("A ship attacking a submarine defends with its close defense, as a ship a submarine attacks does (#88)", async () => {
	const { equipmentOf } = await import("./coreworld");
	const { remasterRules } = await import("../src/core/rules");
	const DESTROYER = 129, SUBMARINE = 1863;
	const defense = (rules: typeof classicRules, atk: number, def: number) => {
		const w = handWorld({ rows: 6, cols: 6, terrain: () => terrainType.Ocean, units: [
			{ eqid: atk, owner: 0, row: 2, col: 2 },
			{ eqid: def, owner: 1, row: 2, col: 3 },
		] }, equipmentOf([8, 20]), { rules });
		const record: Contribution[] = [];
		attackResult(w, unitById(w, 0), unitById(w, 1), null, record);
		const set = (side: string) => record.filter((r) => r.side === side && r.field === side.charAt(0) + "dv"
			&& (r.name === "attacker's type" || r.name === "defender's type"));
		return { attacker: set("attacker").slice(-1)[0].after, defender: set("defender").slice(-1)[0].after };
	};
	for (const rules of [classicRules, remasterRules]) {
		expect(defense(rules, DESTROYER, SUBMARINE), rules.name).toEqual({ attacker: 3, defender: 5 });
		expect(defense(rules, SUBMARINE, DESTROYER), rules.name).toEqual({ attacker: 5, defender: 3 });
	}
});

//The leader a unit wins comes from its class's list, the class leader aside: the original's roll left out
//the list's last two (infiltration tactics and liberator for the ground classes, fire discipline for
//the guns, first strike for the fighters), which only a scenario could give (#78). The classic rules
//keep its roll; in the remaster's every leader of the list can come up, by a single draw as before
test("In the remaster rules a unit can win any leader of its class's list, the last two included (#78)", async () => {
	const { newLeader } = await import("../src/core/fight");
	const { remasterRules } = await import("../src/core/rules");
	for (const rules of [classicRules, remasterRules]) {
		const w = handWorld({ rows: 2, cols: 2, units: [] }, undefined, { rules });
		rules.leaders.forEach((list, uclass) => {
			if (list.length < 2) return;
			const rolled = new Set<number>();
			const rng = { state: 1 };
			for (let i = 0; i < 400; i++) {
				const once = { state: rng.state };
				nextRandom(once);
				rolled.add(newLeader(w, uclass, rng));
				expect(rng.state, "one draw").toBe(once.state);
			}
			const expected = rules === classicRules ? list.slice(1, -2) : list.slice(1);
			expect([...rolled].sort((a, b) => a - b), rules.name + " class " + uclass).toEqual([...expected].sort((a, b) => a - b));
		});
	}
});

//The unit deploy places (src/core/commands/units.ts deployedAs), which the new UI's placing tag reads before the click:
//a German infantry on an ocean deployment hex embarks on Germany's naval transport, on land it stays as it is, and an
//aircraft over the ocean is an aircraft
test("A reserve unit deploys as deployedAs says: a ground unit on the ocean embarked, on land or in the air as it is", () => {
	const saved = smallGameData();
	saved.data.hexes[1 * 12 + 1].deployment = 0;
	saved.data.hexes[1 * 12 + 2] = { ...saved.data.hexes[1 * 12 + 2], terrain: terrainType.Ocean, deployment: 0 };
	saved.state.players[0].prestige = 5000;
	let w = createWorld(saved, Equipment.equipment, { rules: classicRules });
	for (const eqid of [115, 159]) {
		const r = step(w, { type: "buy", eqid, transport: -1 });
		if (r.ok === false) throw new Error(r.refusal.reason);
		w = r.world;
	}
	const reserve = (i: number) => (w.state.players[0].core[i] as { reserve: OffMapUnit }).reserve;
	const sea = deployedAs(w, reserve(0), hexIndex(w, 1, 2));
	expect(sea).toEqual({ ...reserve(0), carrier: sea.carrier });
	expect(sea.carrier).toBeGreaterThan(0);
	expect(deployedAs(w, reserve(0), hexIndex(w, 1, 1))).toBe(reserve(0));
	expect(deployedAs(w, reserve(1), hexIndex(w, 1, 2))).toBe(reserve(1));
	const r = step(w, { type: "deploy", index: 0, to: { row: 1, col: 2 } });
	if (r.ok === false) throw new Error(r.refusal.reason);
	expect(unitById(r.world, r.world.state.map.hexes[hexIndex(w, 1, 2)].unit!)!.carrier).toBe(sea.carrier);
});
