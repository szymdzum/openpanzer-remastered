// @vitest-environment node
//What the map tells after a combat (src/view/hud/results.ts, #347, the CombatResults card): attacks played on hand-built
//worlds with the game's dice, the loss chips, the one stamp and the status bar's line read from the step's events
import { expect, test } from "vitest";
import { handWorld, type HandUnit } from "./coreworld";
import { adjacent } from "../src/core/geometry";
import { step } from "../src/core/step";
import type { Command } from "../src/core/command";
import type { World } from "../src/core/types";
import { terrainType } from "../src/core/tables";
import { resultsOf } from "../src/view/hud/results";

const PZ_38T = 136, PZ_IIA = 140, INFANTERIE = 115, LEFH18 = 92, TP7 = 273, PIECHOTA = 270, WZ97 = 264;

function hand(units: HandUnit[], terrain: Record<string, number> = {}): World {
	return handWorld({ rows: 10, cols: 10, units, terrain: (r, c) => terrain[r + "," + c] || terrainType.Clear }, undefined, { spotSide: 0 });
}

//The command played with the dice of a seed: the results the map shows
function play(w: World, seed = 1, cmd: Command = { type: "attack", unit: 0, target: 1 }) {
	const before = { ...w, state: { ...w.state, rng: { game: seed, ai: 7 } } };
	const r = step(before, cmd);
	if ("refusal" in r) throw new Error(r.refusal.reason);
	return resultsOf(before, r.world, r.events);
}

//The first seed whose results pass the test
function seedWhere(w: World, holds: (r: ReturnType<typeof play>) => boolean): ReturnType<typeof play> {
	for (let seed = 1; seed < 500; seed++) {
		const r = play(w, seed);
		if (holds(r)) return r;
	}
	throw new Error("no seed");
}

test("An overrun: the stamp over the tank with its +1 move, a 0 chip for it, no chip for the destroyed target (CombatResults)", () => {
	const r = play(hand([{ eqid: PZ_38T, owner: 0, row: 4, col: 3 }, { eqid: TP7, owner: 1, row: 4, col: 4, strength: 3 }]))!;
	expect(r.stamp).toEqual({ at: { row: 4, col: 3 }, word: "Overrun", extra: "+1 move", tone: "good" });
	expect(r.chips).toEqual([{ at: { row: 4, col: 3 }, loss: 0, note: null }]);
	expect(r.news).toEqual({ name: "Pz 38(t)A", text: "overran the 7TP · no return fire" });
});

test("A rugged defense: its stamp over the defender, the attacker's chip with the support fire's part noted, the gun named in the line", () => {
	const w = hand([{ eqid: PZ_IIA, owner: 0, row: 4, col: 3 }, { eqid: PIECHOTA, owner: 1, row: 4, col: 4, strength: 9, entrenchment: 4, experience: 200 },
		{ eqid: WZ97, owner: 1, row: 5, col: 5 }], { "4,4": terrainType.City });
	const r = seedWhere(w, (x) => x!.chips[0].note !== null)!;
	expect(r.stamp).toMatchObject({ at: { row: 4, col: 4 }, word: "Rugged defense", tone: "bad" });
	const [atk, def] = r.chips, support = Number(atk.note!.split(" ")[0]);
	expect(atk.note).toBe(support + " by support");
	expect(def).toMatchObject({ at: { row: 4, col: 4 }, note: "entrenched 4 → 3" });
	expect(r.news.text).toBe("hit a rugged defense in the city · −" + atk.loss + ", 75mm A wz.97 −" + support + " of it");
	//(two guns that hit: the line says how much they took together)
	const guns = hand([{ eqid: PZ_IIA, owner: 0, row: 4, col: 3 }, { eqid: PIECHOTA, owner: 1, row: 4, col: 4, strength: 9, entrenchment: 4,
		experience: 200 }, { eqid: WZ97, owner: 1, row: 5, col: 5 }, { eqid: WZ97, owner: 1, row: 3, col: 4 }], { "4,4": terrainType.City });
	const two = seedWhere(guns, (x) => x!.news.text.endsWith("of it by support fire"))!;
	expect(two.news.text).toBe("hit a rugged defense in the city · −" + two.chips[0].loss + ", " + two.chips[0].note!.split(" ")[0] + " of it by support fire");
});

test("A retreat: the stamp and the defender's chip on the hex it fell back to, a trail from where it stood", () => {
	const w = hand([{ eqid: INFANTERIE, owner: 0, row: 4, col: 3 }, { eqid: PIECHOTA, owner: 1, row: 4, col: 4, strength: 6, entrenchment: 2 }],
		{ "4,4": terrainType.Forest });
	const r = seedWhere(w, (x) => x!.trail !== null)!;
	expect(r.stamp).toMatchObject({ word: "Retreat", tone: "warn", at: r.trail!.to });
	expect(r.trail!.from).toEqual({ row: 4, col: 4 });
	expect(r.chips[1].at).toEqual(r.trail!.to);
	expect(r.news).toEqual({ name: "Infanterie", text: "drove the 38 Piechota out of the forest · it fell back one hex" });
});

test("A surrender with nowhere to go, a destroyed defender, and a shelling from range with no stamp but its line", () => {
	const boxed = hand([{ eqid: INFANTERIE, owner: 0, row: 4, col: 3 }, { eqid: PIECHOTA, owner: 1, row: 4, col: 4, strength: 6, entrenchment: 2 },
		...adjacent(4, 4).filter((c) => !(c.row === 4 && c.col === 3)).map((c) => ({ eqid: PIECHOTA, owner: 1, ...c }))], { "4,4": terrainType.Forest });
	expect(seedWhere(boxed, (x) => x!.stamp !== null && x!.stamp.word === "Surrendered")!.news.text)
		.toBe("forced the 38 Piechota to surrender · it had nowhere to fall back");
	//(infantry: a tank would overrun it)
	const weak = hand([{ eqid: INFANTERIE, owner: 0, row: 4, col: 3 }, { eqid: PIECHOTA, owner: 1, row: 4, col: 4, strength: 1 }]);
	const killed = seedWhere(weak, (x) => x!.stamp !== null && x!.stamp.word === "Destroyed")!;
	expect(killed.stamp).toMatchObject({ at: { row: 4, col: 4 }, extra: "−1", tone: "bad" });
	expect(killed.chips.map((c) => c.at)).toEqual([{ row: 4, col: 3 }]);
	const far = play(hand([{ eqid: LEFH18, owner: 0, row: 4, col: 1 }, { eqid: TP7, owner: 1, row: 4, col: 4, strength: 8, entrenchment: 2 },
		{ eqid: PZ_IIA, owner: 0, row: 4, col: 3 }]))!;
	expect(far.stamp).toBe(null);
	expect(far.chips).toEqual([{ at: { row: 4, col: 1 }, loss: 0, note: null },
		{ at: { row: 4, col: 4 }, loss: far.chips[1].loss, note: "entrenched 2 → 1" }]);
	expect(far.news).toEqual({ name: "10.5 leFH18", text: "shelled the 7TP · −" + far.chips[1].loss + ", no return fire" });
});

test("Support fire that stops the attack: the stamp over the attacker, its losses in the line", () => {
	const w = hand([{ eqid: PZ_IIA, owner: 0, row: 4, col: 3, strength: 3 }, { eqid: TP7, owner: 1, row: 4, col: 4 },
		{ eqid: WZ97, owner: 1, row: 5, col: 5 }, { eqid: WZ97, owner: 1, row: 3, col: 4 }]);
	const r = seedWhere(w, (x) => x !== null && x.stamp !== null && x.stamp.word === "Attack stopped")!;
	expect(r.stamp!.at).toEqual({ row: 4, col: 3 });
	expect(r.news.text).toMatch(/^was stopped by the support fire · (−\d|0)$/);
});

test("A plain exchange has its line and no stamp; a move with nothing to tell, nothing; a capture its stamp", () => {
	const w = hand([{ eqid: PZ_IIA, owner: 0, row: 4, col: 3 }, { eqid: TP7, owner: 1, row: 4, col: 4 }]);
	const r = seedWhere(w, (x) => x!.stamp === null)!;
	expect(r.news.text).toMatch(/^attacked the 7TP · 7TP (−\d+|0), Pz IIA (−\d+|0)$/);
	expect(play(w, 1, { type: "move", unit: 0, to: { row: 2, col: 3 } })).toBe(null);
	Object.assign(w.state.map.hexes[2 * 10 + 3], { flag: 15, owner: 1 });
	w.data.hexes[2 * 10 + 3].name = "Mława";
	expect(play(w, 1, { type: "move", unit: 0, to: { row: 2, col: 3 } })).toMatchObject({ chips: [],
		stamp: { at: { row: 2, col: 3 }, word: "Captured", extra: "+50", tone: "brass" }, news: { name: "Pz IIA", text: "took Mława · +50 prestige" } });
});

test("A combat the side shown doesn't see isn't told", () => {
	//(the enemy's two units far from the side's only one, out of its sight)
	const w = hand([{ eqid: PZ_IIA, owner: 0, row: 0, col: 0 }, { eqid: TP7, owner: 1, row: 8, col: 8 }, { eqid: PZ_IIA, owner: 1, row: 8, col: 7 }]);
	w.state.units[2].owner = 0;
	expect(play(w, 1, { type: "attack", unit: 2, target: 1 })).toBe(null);
});
