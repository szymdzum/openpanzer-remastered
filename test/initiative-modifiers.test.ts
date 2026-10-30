//Initiative in the remaster's rules (#18): the manual says it comes from the equipment, the terrain and the
//experience, is adjusted by a random factor, and is zero for an attacker that is surprised or meets a rugged
//defense. The classic rules compare the equipment's alone. On a small map built by hand, the dice by Math.random
import { afterEach, expect, test, vi } from "vitest";
import { attackResult } from "../src/core/combat";
import { estimateAttack } from "../src/core/estimate";
import { classicRules, remasterRules } from "../src/core/rules";
import { terrainType } from "../src/core/tables";
import type { Contribution, Ruleset, World } from "../src/core/types";
import { unitById } from "../src/core/world";
import { handWorld } from "./coreworld";
import type { HandUnit } from "./coreworld";

const PZ_IIA = 140, TP7 = 273;

afterEach(() => vi.restoreAllMocks());

//A Pz IIA (initiative 7) attacking a 7TP (6) next to it, with what the test changes on either
function fight(rules: Ruleset, attacker: Partial<HandUnit> = {}, defender: Partial<HandUnit> = {}, terrain = terrainType.Clear): World {
	return handWorld({ rows: 6, cols: 6, terrain: (r, c) => r === 2 && c === 3 ? terrain : terrainType.Clear, units: [
		{ eqid: PZ_IIA, owner: 0, row: 2, col: 2, ...attacker }, { eqid: TP7, owner: 1, row: 2, col: 3, ...defender }] }, undefined, { rules });
}

//The initiative step's changes, with the game stream giving the draws first (0 to 1 each: 0.0 is a 0, 0.5 a 1, 0.9 a 2)
function initiativeOf(w: World, draws: number[] = [0.5, 0.5]) {
	const spy = vi.spyOn(Math, "random");
	for (const d of draws) spy.mockReturnValueOnce(d);
	spy.mockReturnValue(0.5);
	const record: Contribution[] = [];
	attackResult(w, unitById(w, 0), unitById(w, 1), { state: null }, record);
	return record.filter((c) => c.name === "initiative").map((c) => `${c.side} ${c.field} +${c.after - c.before}`);
}

//(what the edge gives: +4 defence and the lead in attack, to the attacker or the defender)
const attackerEdge = ["attacker adv +4"], defenderEdge = ["defender ddv +4"];

test("An experience level adds a point of initiative in the remaster rules (#18)", () => {
	//7 against 6: the attacker's edge and a point of attack; the 7TP at level 2 makes it 7 against 8
	expect(initiativeOf(fight(remasterRules))).toEqual([...attackerEdge, "attacker aav +1"]);
	expect(initiativeOf(fight(remasterRules, {}, { experience: 200 }))).toEqual([...defenderEdge, "defender dav +1"]);
	//8 against 8: a tie, the attacker's, with no lead in attack
	expect(initiativeOf(fight(remasterRules, { experience: 100 }, { experience: 200 }))).toEqual(attackerEdge);
});

test("The terrain's cap comes after experience: a veteran in a city has no more initiative than a recruit (#18, #14)", () => {
	//both capped to 1 then, a tie, the attacker's
	expect(initiativeOf(fight(remasterRules, { experience: 500 }, {}, terrainType.City))).toEqual(attackerEdge);
	expect(initiativeOf(fight(remasterRules, {}, { experience: 500 }, terrainType.City))).toEqual(attackerEdge);
});

test("Each side's initiative has a random 0 to 2 added, the attacker's draw first (#18)", () => {
	//7 + 0 against 6 + 2: the defender's lead of one; the other way round the attacker's lead of 3
	expect(initiativeOf(fight(remasterRules), [0, 0.9])).toEqual([...defenderEdge, "defender dav +1"]);
	expect(initiativeOf(fight(remasterRules), [0.9, 0])).toEqual([...attackerEdge, "attacker aav +3"]);
});

test("An attacker that is surprised has initiative zero, whatever it was and whatever it drew (#18)", () => {
	//0 against 6 + 0: the defender's lead of 6, up to the cap of 4 in attack
	const w = fight(remasterRules, { isSurprised: true });
	expect(initiativeOf(w, [0.9, 0])).toEqual([...defenderEdge, "defender dav +4"]);
});

test("An attacker that meets a rugged defense has initiative zero (#18)", () => {
	const rugged = fight(remasterRules, {}, { entrenchment: 5, experience: 500 });
	const spy = vi.spyOn(Math, "random").mockReturnValue(0.5);
	expect(attackResult(rugged, unitById(rugged, 0), unitById(rugged, 1), null).isRugged).toBe(true);
	spy.mockRestore();
	expect(initiativeOf(rugged, [0.9, 0])).toEqual([...defenderEdge, "defender dav +4"]);
});

test("The estimate draws nothing and takes the mean of the random factor (#18)", () => {
	const spy = vi.spyOn(Math, "random");
	const w = fight(remasterRules);
	const e = estimateAttack(w, unitById(w, 0), unitById(w, 1));
	expect(spy).not.toHaveBeenCalled();
	expect(e.result).toEqual(attackResult(w, unitById(w, 0), unitById(w, 1), null));
	expect(e.record.filter((c) => c.name === "initiative").map((c) => c.side + c.field)).toEqual(["attackeradv", "attackeraav"]);
});

test("The classic rules compare the equipment's initiative only and draw only the dice (kept, #18)", () => {
	const classic = fight(classicRules, {}, { experience: 500 });
	expect(initiativeOf(classic, [0.9, 0])).toEqual([...attackerEdge, "attacker aav +1"]);
	const draws = (w: World) => {
		vi.restoreAllMocks();
		const spy = vi.spyOn(Math, "random").mockReturnValue(0.5);
		attackResult(w, unitById(w, 0), unitById(w, 1), { state: null });
		const n = spy.mock.calls.length;
		spy.mockRestore();
		return n;
	};
	//the remaster's rules draw the two of the initiative on top of the dice
	expect(draws(fight(remasterRules))).toBe(draws(fight(classicRules)) + 2);
});
