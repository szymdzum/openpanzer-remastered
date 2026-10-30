//Whether a zone of control stops a recon unit (#4): the remaster's rules say no, as the manual does, the classic
//rules (the original's) stop it like any ground unit. On a small map built by hand
import { expect, test } from "vitest";
import { classicRules, remasterRules } from "../src/core/rules";
import { step } from "../src/core/step";
import { moveRange } from "../src/core/movement";
import type { Ruleset } from "../src/core/types";
import { handWorld } from "./coreworld";

const PSW_233 = 119, PZ_IIA = 140, TP7 = 273;

//A German unit at 5,2 and Polish tanks on column 5, whose zones of control cover columns 4 to 6
function screenedWorld(rules: Ruleset, eqid: number) {
	return handWorld({ rows: 10, cols: 12, units: [
		{ eqid, owner: 0, row: 5, col: 2 },
		...[1, 3, 5, 7, 9].map((row) => ({ eqid: TP7, owner: 1, row, col: 5 })),
	] }, undefined, { rules, noFOW: true });
}

const cellAt = (w: ReturnType<typeof screenedWorld>, row: number, col: number) =>
	moveRange(w, w.state.units[0]).find((c) => c.row === row && c.col === col);

function moveTo(rules: Ruleset, eqid: number, row: number, col: number) {
	const r = step(screenedWorld(rules, eqid), { type: "move", unit: 0, to: { row, col } });
	if (r.ok === false) throw new Error(r.refusal.reason);
	return r.world.state.units[0];
}

test("A recon unit moves on through an enemy zone of control in the remaster rules (#4)", () => {
	const w = screenedWorld(remasterRules, PSW_233);
	expect(cellAt(w, 4, 4)?.cost).toBeLessThan(254);
	expect(cellAt(w, 5, 7)).toBeDefined();
	const unit = moveTo(remasterRules, PSW_233, 5, 7);
	expect([unit.row, unit.col]).toEqual([5, 7]);
});

test("A recon unit that ends its move in an enemy zone of control keeps the points it has left in the remaster rules (#4)", () => {
	const unit = moveTo(remasterRules, PSW_233, 4, 4);
	expect(unit.moveLeft).toBeGreaterThan(0);
	expect(unit.hasMoved).toBe(false);
});

test("A recon unit is stopped by an enemy zone of control in the classic rules (kept, #4)", () => {
	const w = screenedWorld(classicRules, PSW_233);
	expect(cellAt(w, 4, 4)?.cost).toBe(254);
	expect(cellAt(w, 5, 7)).toBeUndefined();
	const unit = moveTo(classicRules, PSW_233, 4, 4);
	expect([unit.moveLeft, unit.hasMoved]).toEqual([0, true]);
});

test("A tank is stopped by an enemy zone of control in the remaster rules too (#4)", () => {
	const w = screenedWorld(remasterRules, PZ_IIA);
	expect(cellAt(w, 4, 4)?.cost).toBe(254);
	expect(cellAt(w, 5, 7)).toBeUndefined();
});
