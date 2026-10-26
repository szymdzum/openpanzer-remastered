// @vitest-environment node
//The attack preview's view model (src/view/odds.ts, #347) on hand-built worlds: the CombatOdds card's four examples
//(their units, as the card's Ciechanów scene has them), the glance beside a target, the grey badges of stage 0
import { expect, test } from "vitest";
import { handWorld, type HandUnit } from "./coreworld";
import type { World } from "../src/core/types";
import { unitById } from "../src/core/world";
import { terrainType } from "../src/prototypes";
import { selectionOf } from "../src/view/mapview";
import { blockedOf, glanceOf, oddsOf } from "../src/view/odds";

const ME_109 = 159, PZ_38T = 136, PZ_IIA = 140, INFANTERIE = 115, LEFH18 = 92, TP7 = 273, PIECHOTA = 270, WZ97 = 264, PZL_23 = 281;

function hand(units: HandUnit[], terrain: Record<string, number> = {}): World {
	return handWorld({ rows: 10, cols: 10, units, terrain: (r, c) => terrain[r + "," + c] || terrainType.Clear }, undefined, { spotSide: 0 });
}

//The attacker (unit 0) selected, the target's hex hovered
const look = (w: World, touch = false) => {
	const sel = selectionOf(w, 0), at = { row: unitById(w, 1)!.row, col: unitById(w, 1)!.col };
	return { glance: glanceOf(w, sel, at, false), odds: oddsOf(w, sel, at, false, touch)! };
};
const words = (tags: { text: string }[]) => tags.map((t) => t.text);

test("An overrun: no loss for you, the target destroyed, no return fire, +1 move (CombatOdds, first example)", () => {
	const { glance, odds } = look(hand([{ eqid: PZ_38T, owner: 0, row: 4, col: 3 }, { eqid: TP7, owner: 1, row: 4, col: 4, strength: 3 }]));
	expect(glance).toEqual({ at: { row: 4, col: 4 }, yours: { side: 0, loss: 0 }, theirs: { side: 1, loss: 3 }, glyph: "overrun" });
	expect(odds).toMatchObject({ verb: "Attack", target: "7TP", nation: "pl", where: "Open ground · adjacent", verdict: { word: "Overrun", tone: "good", icon: "ok" }, away: "right",
		advice: null, commit: "Click to attack · Esc to cancel" });
	expect(odds.bars.map((b) => [b.name, b.who, b.before, b.after])).toEqual([["Pz 38(t)A", "yours", 10, 10], ["7TP", "Poland", 3, 0]]);
	expect(odds.reasons[0]).toMatchObject({ text: "You fire first: initiative 7 against 6", effect: "+1 atk", tone: "up" });
	expect(words(odds.next)).toEqual(["Destroyed", "No return fire", "+1 move", "Can attack again"]);
});

test("A rugged defense: certain before the attack, the gun behind it counted and hatched in your losses, advice to bring the entrenchment down first", () => {
	const w = hand([{ eqid: PZ_IIA, owner: 0, row: 4, col: 3 }, { eqid: PIECHOTA, owner: 1, row: 4, col: 4, strength: 9, entrenchment: 4,
		experience: 200 }, { eqid: WZ97, owner: 1, row: 5, col: 5 }], { "4,4": terrainType.City });
	const { glance, odds } = look(w);
	expect(glance).toMatchObject({ yours: { loss: 6 }, theirs: { loss: 0 }, glyph: "rugged" });
	expect(odds).toMatchObject({ where: "City · adjacent · entrenched 4 · 2 bars of experience", verdict: { word: "Rugged defense", tone: "bad" },
		commit: "Click to attack anyway · Esc to cancel" });
	expect(odds.bars.map((b) => [b.before, b.after, b.support])).toEqual([[10, 4, 1], [9, 9, 0]]);
	expect(odds.reasons.map((r) => [r.text, r.effect, r.key])).toEqual([
		["Your defence drops to 0 and your attack is halved", "", true],
		["Support fire from 75mm A wz.97 before you attack", "−1", false],
		["Entrenchment counts twice: infantry in city against Pz IIA", "+8 def", false],
		["Defending in a city", "+4 def", false],
	]);
	expect(odds.advice).toMatch(/^Bring the entrenchment down first/);
});

test("Close combat in a forest: a costly win, both on close defence; the target keeps its hex at the engine's estimate (#90)", () => {
	const { odds } = look(hand([{ eqid: INFANTERIE, owner: 0, row: 4, col: 3 }, { eqid: PIECHOTA, owner: 1, row: 4, col: 4, entrenchment: 2 }],
		{ "4,4": terrainType.Forest }));
	expect(odds.bars.map((b) => [b.before, b.after])).toEqual([[10, 6], [10, 5]]);
	expect(odds.verdict).toEqual({ word: "Costly win", tone: "warn", icon: "low" });
	expect(odds.reasons.map((r) => [r.text, r.effect])).toEqual([["Close combat in forest: both sides use close defence", ""],
		["Entrenched 2", "+2 def"]]);
	expect(words(odds.next)).toEqual(["Entrenchment 2 → 1", "−2 defence for the next attack this turn"]);
});

test("A bombardment from range: no return fire, entrenchment and defence knocked down for the next attack; on touch the second tap fires", () => {
	const w = hand([{ eqid: LEFH18, owner: 0, row: 4, col: 1 }, { eqid: TP7, owner: 1, row: 4, col: 4, strength: 8, entrenchment: 2 },
		{ eqid: PZ_IIA, owner: 0, row: 4, col: 3 }]);
	const { glance, odds } = look(w, true);
	expect(glance).toMatchObject({ yours: { loss: 0 }, theirs: { loss: 1 }, glyph: "no-return" });
	expect(odds).toMatchObject({ verb: "Bombard", icon: "artillery", where: "Open ground · range 3 of 5 · entrenched 2", verdict: { word: "No return fire" },
		commit: "Tap again to fire · tap elsewhere to cancel" });
	expect(odds.bars[1]).toMatchObject({ before: 8, after: 7 });
	expect(odds.reasons[0].text).toBe("From range: the target can't fire back and no support fire answers");
	expect(words(odds.next)).toEqual(["No return fire", "Entrenchment 2 → 1", "−2 defence for the next attack this turn"]);
});

test("Support fire that would stop the attack says so, and the target loses nothing", () => {
	const w = hand([{ eqid: PZ_IIA, owner: 0, row: 4, col: 3, strength: 3 }, { eqid: TP7, owner: 1, row: 4, col: 4 },
		{ eqid: WZ97, owner: 1, row: 5, col: 5 }, { eqid: WZ97, owner: 1, row: 3, col: 4 }]);
	const { glance, odds } = look(w);
	expect(glance).toMatchObject({ theirs: { loss: 0 }, glyph: "support" });
	expect(odds.verdict).toEqual({ word: "Attack stopped", tone: "bad", icon: "critical" });
	expect(words(odds.next)).toEqual(["Attack stopped by the support fire"]);
	expect(odds.reasons[0].text).toBe("Support fire from 75mm A wz.97 and 1 other gun before you attack");
});

test("Off a target, on the enemy's turn or with no unit selected there is no preview", () => {
	const w = hand([{ eqid: PZ_IIA, owner: 0, row: 4, col: 3 }, { eqid: TP7, owner: 1, row: 4, col: 4 }]);
	expect(glanceOf(w, selectionOf(w, 0), { row: 6, col: 6 }, false)).toBe(null);
	expect(oddsOf(w, null, { row: 4, col: 4 }, false, false)).toBe(null);
	w.state.turn.currentPlayer = 1;
	expect(glanceOf(w, selectionOf(w, 0), { row: 4, col: 4 }, false)).toBe(null);
	expect(blockedOf(w, selectionOf(w, 0))).toEqual([]);
});

test("An enemy in range the unit can't attack gets a grey badge with the reason: fired, no ammo, an aircraft for a tank; none in the fog", () => {
	const units: HandUnit[] = [{ eqid: PZ_IIA, owner: 0, row: 4, col: 3 }, { eqid: TP7, owner: 1, row: 4, col: 4 }, { eqid: PZL_23, owner: 1, row: 3, col: 3 },
		{ eqid: TP7, owner: 1, row: 9, col: 9 }];
	const w = hand(units);
	expect(blockedOf(w, selectionOf(w, 0))).toEqual([{ at: { row: 3, col: 3 }, reason: "Can't attack aircraft" }]);
	const fired = hand([{ ...units[0], hasFired: true }, units[1]]);
	expect(blockedOf(fired, selectionOf(fired, 0))).toEqual([{ at: { row: 4, col: 4 }, reason: "Already fired" }]);
	const dry = hand([{ ...units[0], ammo: 0 }, units[1]]);
	expect(blockedOf(dry, selectionOf(dry, 0))).toEqual([{ at: { row: 4, col: 4 }, reason: "No ammo" }]);
	//(an aircraft of range 1 in the classic rules hits the ground only below it)
	const fighter = hand([{ eqid: ME_109, owner: 0, row: 4, col: 3 }, units[1]]);
	expect(blockedOf(fighter, selectionOf(fighter, 0))).toEqual([{ at: { row: 4, col: 4 }, reason: "Hits the ground only below it" }]);
});
