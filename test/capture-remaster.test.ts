//Whether a mounted gun captures a hex (#544): the remaster's rules say no, the classic rules (the original's) read
//the transport's class and say yes. On a small map built by hand
import { expect, test } from "vitest";
import { classicRules, remasterRules } from "../src/core/rules";
import { step } from "../src/core/step";
import { captureAt } from "../src/core/moves";
import type { Ruleset } from "../src/core/types";
import { handWorld } from "./coreworld";

const PAK_38 = 77, OPEL_BLITZ = 157, PZ_IIA = 140, FLAG_HEX = 3 * 8 + 5;

//A PaK 38 (a towed anti-tank gun) on an Opel Blitz and a Pz IIA, each next to an enemy flag
function flagWorld(rules: Ruleset) {
	const w = handWorld({ rows: 8, cols: 8, units: [
		{ eqid: PAK_38, owner: 0, row: 3, col: 3, isMounted: true, transport: { eqid: OPEL_BLITZ, ammo: 0, fuel: 20 } },
		{ eqid: PZ_IIA, owner: 0, row: 5, col: 3 },
		{ eqid: 273, owner: 1, row: 0, col: 7 },
	] }, undefined, { rules, noFOW: true });
	for (const hex of [FLAG_HEX, 5 * 8 + 5]) Object.assign(w.state.map.hexes[hex], { owner: 1, flag: 1 });
	return w;
}

function moveOntoFlag(rules: Ruleset, unit: number) {
	const w = flagWorld(rules);
	const to = unit === 0 ? { row: 3, col: 5 } : { row: 5, col: 5 };
	const before = captureAt(w, w.state.units[unit], to);
	const r = step(w, { type: "move", unit, to });
	if (r.ok === false) throw new Error(r.refusal.reason);
	return { before, owner: r.world.state.map.hexes[to.row * 8 + to.col].owner };
}

test("A mounted anti-tank gun moving onto an enemy flag doesn't take it in the remaster rules (#544)", () => {
	expect(moveOntoFlag(remasterRules, 0)).toEqual({ before: null, owner: 1 });
});

test("A tank moving onto an enemy flag still takes it in the remaster rules (#544)", () => {
	const { before, owner } = moveOntoFlag(remasterRules, 1);
	expect(before).not.toBeNull();
	expect(owner).toBe(0);
});

//The original reads the transport's class (reference/src/gamerules.js:1123)
test("A mounted anti-tank gun moving onto an enemy flag takes it in the classic rules (kept, #544)", () => {
	const { before, owner } = moveOntoFlag(classicRules, 0);
	expect(before).not.toBeNull();
	expect(owner).toBe(0);
});
