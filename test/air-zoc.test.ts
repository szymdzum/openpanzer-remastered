//Whether an enemy aircraft's zone of control stops an aircraft (#18): the remaster's rules say yes, as the manual does
//("air units' zones of control affect only air units"), the classic rules (the original's) say no. On a small map built by hand
import { expect, test } from "vitest";
import { classicRules, remasterRules } from "../src/core/rules";
import { step } from "../src/core/step";
import { moveRange } from "../src/core/movement";
import type { Ruleset } from "../src/core/types";
import { handWorld } from "./coreworld";

const ME_109 = 159, PZ_IIA = 140, TP7 = 273;

//A German fighter at 5,1 and a Polish aircraft at 5,5, whose zone covers its six neighbours (4,4 to 6,5 and 5,6)
function skyWorld(rules: Ruleset, enemy: number, noFOW = true) {
	return handWorld({ rows: 12, cols: 14, units: [
		{ eqid: ME_109, owner: 0, row: 5, col: 1 },
		{ eqid: enemy, owner: 1, row: 5, col: 5 },
	] }, undefined, { rules, noFOW });
}

const cellAt = (w: ReturnType<typeof handWorld>, row: number, col: number) =>
	moveRange(w, w.state.units[0]).find((c) => c.row === row && c.col === col);

//A strip of three rows, so that the zone of the aircraft in the middle of it can't be flown round
function narrowSky(rules: Ruleset) {
	return handWorld({ rows: 3, cols: 14, units: [
		{ eqid: ME_109, owner: 0, row: 1, col: 1 },
		{ eqid: ME_109, owner: 1, row: 1, col: 5 },
	] }, undefined, { rules, noFOW: true });
}

test("An aircraft is stopped next to an enemy aircraft it sees in the remaster rules (#18)", () => {
	const w = skyWorld(remasterRules, ME_109);
	expect(cellAt(w, 5, 4)?.cost).toBe(254);
	expect(cellAt(w, 5, 3)?.cost).toBe(1);
	const flown = step(w, { type: "move", unit: 0, to: { row: 5, col: 4 } });
	if (flown.ok === false) throw new Error(flown.refusal.reason);
	const unit = flown.world.state.units[0];
	expect([unit.row, unit.col, unit.moveLeft, unit.hasMoved]).toEqual([5, 4, 0, true]);
});

test("An aircraft can't fly on through an enemy aircraft's zone of control in the remaster rules (#18)", () => {
	const w = narrowSky(remasterRules);
	expect(cellAt(w, 1, 4)?.cost).toBe(254);
	expect(cellAt(w, 1, 8)).toBeUndefined();
});

test("An aircraft flies through an enemy aircraft's zone of control in the classic rules (kept, #18)", () => {
	const w = skyWorld(classicRules, ME_109);
	expect(cellAt(w, 5, 4)?.cost).toBe(1);
	expect(cellAt(narrowSky(classicRules), 1, 8)).toBeDefined();
});

test("An aircraft isn't stopped by a zone of an enemy aircraft its side doesn't see (#18)", () => {
	const w = skyWorld(remasterRules, ME_109, false);
	expect(w.sight.spot[0][5 * 14 + 5]).toBe(0);
	expect(cellAt(w, 5, 4)?.cost).toBe(1);
});

test("A ground unit's zone of control doesn't stop an aircraft, nor an aircraft's a ground unit (#18)", () => {
	const ground = skyWorld(remasterRules, TP7);
	expect(cellAt(ground, 5, 4)?.cost).toBe(1);
	const tank = handWorld({ rows: 12, cols: 14, units: [
		{ eqid: PZ_IIA, owner: 0, row: 5, col: 1 },
		{ eqid: ME_109, owner: 1, row: 5, col: 5 },
	] }, undefined, { rules: remasterRules, noFOW: true });
	const cell = moveRange(tank, tank.state.units[0]).find((c) => c.row === 5 && c.col === 4);
	expect(cell?.cost).toBe(1);
});
