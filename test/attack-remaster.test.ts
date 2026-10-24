//Who attacks whom in the remaster's rules (#53, #285): an aircraft hits a ground unit on the next hex as
//in PG2, and the core's check of an attack takes only the targets the screen lists, for a person, the AI
//and the command-line player alike. The classic rules keep the original's: the screen only from over it,
//the core's check only the distance. On a small map built by hand
import { expect, test } from "vitest";
import { attackCells, isTargetFrom } from "../src/core/attack";
import { distance } from "../src/core/geometry";
import { classicRules, remasterRules } from "../src/core/rules";
import { check } from "../src/core/step";
import type { Position, Ruleset } from "../src/core/types";
import { germanyPoland, handWorld } from "./coreworld";

const JU_87 = 173, INFANTERIE = 115, TP7 = 273, P11C = 280;

const at = (cells: Position[]) => cells.map((c) => `${c.row},${c.col}`);

//A Ju-87 (range 1) over a 7TP at 5,5, another 7TP on the next hex, a third two hexes off
function bomberOverTanks(rules: Ruleset) {
	const w = handWorld({ rows: 10, cols: 10, units: [
		{ eqid: JU_87, owner: 0, row: 5, col: 5 },
		{ eqid: TP7, owner: 1, row: 5, col: 5 },
		{ eqid: TP7, owner: 1, row: 4, col: 5 },
		{ eqid: TP7, owner: 1, row: 3, col: 5 },
	] }, germanyPoland, { rules, noFOW: true });
	expect([distance(5, 5, 4, 5), distance(5, 5, 3, 5)]).toEqual([1, 2]);
	return w;
}

const attackOn = (target: number) => ({ type: "attack" as const, unit: 0, target });

test("In the remaster rules an aircraft attacks a ground unit on the next hex, and the one below it, as in PG2 (#285)", () => {
	const w = bomberOverTanks(remasterRules);
	expect(at(attackCells(w, w.state.units[0]))).toEqual(["4,5", "5,5"]);
	expect([check(w, attackOn(1)), check(w, attackOn(2))]).toEqual([null, null]);
	expect(check(w, attackOn(3))).toEqual({ reason: "out of range" });
});

test("In the classic rules an aircraft's targets are only the ground unit below it, the core's check the distance (#285)", () => {
	const w = bomberOverTanks(classicRules);
	expect(at(attackCells(w, w.state.units[0]))).toEqual(["5,5"]);
	expect([check(w, attackOn(1)), check(w, attackOn(2))]).toEqual([null, null]);
	expect(check(w, attackOn(3))).toEqual({ reason: "out of range" });
});

//A German infantry (no air attack) with a Polish P.11c on the next hex
function infantryNextToFighter(rules: Ruleset) {
	return handWorld({ rows: 10, cols: 10, units: [
		{ eqid: INFANTERIE, owner: 0, row: 5, col: 5 },
		{ eqid: P11C, owner: 1, row: 4, col: 5 },
	] }, germanyPoland, { rules, noFOW: true });
}

test("In the remaster rules the core refuses an attack the screen doesn't list: a unit with no air attack on an aircraft (#285)", () => {
	const w = infantryNextToFighter(remasterRules);
	expect(attackCells(w, w.state.units[0])).toEqual([]);
	expect(check(w, attackOn(1))).toEqual({ reason: "not a target from here" });
});

test("In the classic rules the core's check of an attack asks only the distance, as the original AI's (#285)", () => {
	const w = infantryNextToFighter(classicRules);
	expect(attackCells(w, w.state.units[0])).toEqual([]);
	expect(check(w, attackOn(1))).toBeNull();
});

test("A unit's targets where it stands are the screen's, in either rules (#285)", () => {
	for (const rules of [classicRules, remasterRules]) {
		const remaster = rules === remasterRules;
		const bomber = bomberOverTanks(rules), [ju87, below, next, far] = bomber.state.units;
		expect([below, next, far].map((t) => isTargetFrom(bomber, ju87, t)), rules.name).toEqual([true, remaster, false]);
		//the 7TPs have no air attack
		expect([isTargetFrom(bomber, below, ju87), isTargetFrom(bomber, next, ju87)], rules.name).toEqual([false, false]);
		//the fighter on the infantry next to it as the bomber on the tank, a ground unit on a ground one
		const w = handWorld({ rows: 10, cols: 10, units: [
			{ eqid: INFANTERIE, owner: 0, row: 5, col: 5 },
			{ eqid: P11C, owner: 1, row: 4, col: 5 },
			{ eqid: TP7, owner: 1, row: 5, col: 4 },
		] }, germanyPoland, { rules, noFOW: true });
		const [infantry, fighter, tank] = w.state.units;
		expect([isTargetFrom(w, infantry, fighter), isTargetFrom(w, fighter, infantry), isTargetFrom(w, infantry, tank)], rules.name)
			.toEqual([false, remaster, true]);
	}
});
