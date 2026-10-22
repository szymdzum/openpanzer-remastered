// @vitest-environment node
//The new core's rules on hand-built situations (docs/CORE.md, #133): each test reads like the rule
//it tests. That the core answers as the old engine does is test/core-contract.test.ts's and
//test/core-differential.test.ts's
import { expect, test } from "vitest";
import { nextRandom } from "../src/rng";
import { Leaders } from "../src/leaders";
import { movTableDry, movTableMud, terrainType, unitClass } from "../src/prototypes";
import { attackResult, combatResult } from "../src/core/combat";
import { moveRange, pathTo } from "../src/core/movement";
import { attackCells } from "../src/core/attack";
import { classicRules, moveCosts } from "../src/core/rules";
import { cellsInRange, distance } from "../src/core/geometry";
import { spotCells } from "../src/core/sight";
import { hexIndex, isSpotted, isZOC, unitById } from "../src/core/world";
import type { Contribution } from "../src/core/types";
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

test("The ruleset holds the movement tables by ground and the class leaders", () => {
	expect(moveCosts(classicRules, 0, 0)).toBe(movTableDry[0]);
	expect(moveCosts(classicRules, 2, 4)).toBe(movTableMud[4]);
	expect(moveCosts(classicRules, 7, 0)).toBe(movTableDry[0]); //an unknown ground moves as dry
	for (let c = 0; c <= unitClass.lightCruiser; c++)
		expect(classicRules.classLeaders[c], "class " + c).toBe(Leaders.unitClassLeaders[c][0] ?? -1);
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
