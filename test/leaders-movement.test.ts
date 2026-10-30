//The leaders' movement abilities (#3): Alpine Training, Bridging, Superior Maneuver and Recon Movement work in the
//remaster's rules and do nothing in the classic ones (the original's). On a small map built by hand
import { expect, test } from "vitest";
import { classicRules, remasterRules } from "../src/core/rules";
import { step } from "../src/core/step";
import { moveRange } from "../src/core/movement";
import { leaderType, terrainType } from "../src/core/tables";
import type { Ruleset, World } from "../src/core/types";
import { handWorld } from "./coreworld";

const PZ_IIA = 140, TP7 = 273;

//A Pz IIA at 5,2 led by the leader given, a forest on column 3 and a mountain on column 4
function terrainWorld(rules: Ruleset, leader: number) {
	const terrain = (_row: number, col: number) => col === 3 ? terrainType.Forest : col === 4 ? terrainType.Mountain : terrainType.Clear;
	return handWorld({ rows: 10, cols: 12, terrain, units: [{ eqid: PZ_IIA, owner: 0, row: 5, col: 2, leader }] }, undefined,
		{ rules, noFOW: true });
}

//The same tank and a river on column 3
function riverWorld(rules: Ruleset, leader: number) {
	return handWorld({ rows: 10, cols: 12, terrain: (_row, col) => col === 3 ? terrainType.River : terrainType.Clear,
		units: [{ eqid: PZ_IIA, owner: 0, row: 5, col: 2, leader }] }, undefined, { rules, noFOW: true });
}

//The same tank and Polish tanks on column 5, whose zones of control cover columns 4 to 6
function screenedWorld(rules: Ruleset, leader: number) {
	return handWorld({ rows: 10, cols: 12, units: [
		{ eqid: PZ_IIA, owner: 0, row: 5, col: 2, leader },
		...[1, 3, 5, 7, 9].map((row) => ({ eqid: TP7, owner: 1, row, col: 5 })),
	] }, undefined, { rules, noFOW: true });
}

const costAt = (w: World, row: number, col: number) =>
	moveRange(w, w.state.units[0]).find((c) => c.row === row && c.col === col)?.cost;

function moved(w: World, row: number, col: number) {
	const r = step(w, { type: "move", unit: 0, to: { row, col } });
	if (r.ok === false) throw new Error(r.refusal.reason);
	return r.world.state.units[0];
}

test("A unit with Alpine Training moves through forest and mountain as clear terrain in the remaster rules (#3)", () => {
	const w = terrainWorld(remasterRules, leaderType.alpineTraining);
	expect([costAt(w, 5, 3), costAt(w, 5, 4)]).toEqual([1, 1]);
	const unit = moved(w, 5, 5);
	expect([unit.moveLeft, unit.hasMoved]).toEqual([2, true]);
});

test("Alpine Training changes no move cost in the classic rules (kept, #3)", () => {
	const w = terrainWorld(classicRules, leaderType.alpineTraining);
	expect([costAt(w, 5, 3), costAt(w, 5, 4)]).toEqual([2, 254]);
});

test("A unit with Bridging moves through a river as rough terrain in the remaster rules (#3)", () => {
	const w = riverWorld(remasterRules, leaderType.bridging);
	expect(costAt(w, 5, 3)).toBe(2);
	expect(costAt(w, 5, 4)).toBeDefined();
	expect(costAt(terrainWorld(remasterRules, leaderType.bridging), 5, 3)).toBe(2); //a forest stays a forest
});

test("Bridging changes no move cost in the classic rules (kept, #3)", () => {
	const w = riverWorld(classicRules, leaderType.bridging);
	expect(costAt(w, 5, 3)).toBe(254);
	expect(costAt(w, 5, 4)).toBeUndefined();
});

test("A unit with Superior Maneuver moves on through an enemy zone of control in the remaster rules (#3)", () => {
	const w = screenedWorld(remasterRules, leaderType.superiorManeuver);
	expect(costAt(w, 4, 4)).toBe(1);
	const unit = moved(w, 5, 7);
	expect([unit.row, unit.col]).toEqual([5, 7]);
});

test("An enemy zone of control stops a unit with Superior Maneuver in the classic rules (kept, #3)", () => {
	const w = screenedWorld(classicRules, leaderType.superiorManeuver);
	expect(costAt(w, 4, 4)).toBe(254);
	expect(costAt(w, 5, 7)).toBeUndefined();
});

test("A unit with Recon Movement can move again with the points it has left in the remaster rules (#3)", () => {
	const first = moved(terrainWorld(remasterRules, leaderType.reconMovement), 5, 1);
	expect([first.moveLeft, first.hasMoved, first.hasOverstrength]).toEqual([4, false, false]);
});

test("A unit with Recon Movement moves once in the classic rules (kept, #3)", () => {
	const first = moved(terrainWorld(classicRules, leaderType.reconMovement), 5, 1);
	expect([first.hasMoved, first.hasOverstrength]).toEqual([true, true]);
});

test("A unit without the leaders moves as before in the remaster rules (#3)", () => {
	const w = terrainWorld(remasterRules, leaderType.aggressiveAttack);
	expect([costAt(w, 5, 3), costAt(w, 5, 4)]).toEqual([2, 254]);
	expect(costAt(screenedWorld(remasterRules, leaderType.aggressiveAttack), 4, 4)).toBe(254);
	expect(moved(w, 5, 1).hasMoved).toBe(true);
});
