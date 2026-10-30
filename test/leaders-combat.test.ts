//The leaders' combat abilities (#3): Devastating Fire, Fire Discipline, Mechanized Veteran and Combat Support work
//in the remaster's rules and do nothing in the classic ones (the original's). On small maps built by hand
import { expect, test } from "vitest";
import { canFireThisTurn } from "../src/core/attack";
import { attackResult } from "../src/core/combat";
import { classicRules, remasterRules } from "../src/core/rules";
import { step } from "../src/core/step";
import { leaderType } from "../src/core/tables";
import type { Contribution, Ruleset, UnitState, World } from "../src/core/types";
import { unitById } from "../src/core/world";
import { type HandUnit, handWorld } from "./coreworld";

const INFANTERIE = 115, PZ_IIA = 140, JU_87 = 173, FLAK_36 = 67, OPEL_BLITZ = 157, P11C = 280;

function world(rules: Ruleset, units: HandUnit[], seed = 1): World {
	const w = handWorld({ rows: 8, cols: 8, units }, undefined, { rules, noFOW: true });
	w.state.rng = { game: seed, ai: 1 };
	return w;
}

//A Pz IIA (unit 0) at 3,3 next to two Polish Infanterie, at 3,4 (unit 1) and 2,3 (unit 2)
const twoTargets = (tank: Partial<HandUnit>): HandUnit[] => [{ eqid: PZ_IIA, owner: 0, row: 3, col: 3, ...tank },
	{ eqid: INFANTERIE, owner: 1, row: 3, col: 4 }, { eqid: INFANTERIE, owner: 1, row: 2, col: 3 }];

function attack(w: World, unit: number, target: number): World {
	const r = step(w, { type: "attack", unit, target });
	if (!r.ok) throw new Error("the attack was refused");
	return r.world;
}

const unit = (w: World, id: number): UnitState => unitById(w, id)!;

//---- Devastating Fire: "The unit may fire twice in a turn"

test("A unit with Devastating Fire may attack twice in a turn in the remaster rules (#3)", () => {
	const once = attack(world(remasterRules, twoTargets({ leader: leaderType.devastatingFire })), 0, 1);
	expect(canFireThisTurn(unit(once, 0))).toBe(true);
	const twice = attack(once, 0, 2);
	expect(unit(twice, 0).hasFired).toBe(true);
	expect(canFireThisTurn(unit(twice, 0))).toBe(false);
});

test("Devastating Fire's second attack comes back with the next turn (#3)", () => {
	let w = attack(attack(world(remasterRules, twoTargets({ leader: leaderType.devastatingFire })), 0, 1), 0, 2);
	for (let i = 0; i < 2; i++) {
		const r = step(w, { type: "endTurn" });
		if (!r.ok) throw new Error("end turn refused");
		w = r.world;
	}
	expect("firedOnce" in unit(w, 0)).toBe(false);
	expect(canFireThisTurn(unit(attack(w, 0, 2), 0))).toBe(true);
});

test("A unit with Devastating Fire attacks once in the classic rules (kept, #3)", () => {
	const once = attack(world(classicRules, twoTargets({ leader: leaderType.devastatingFire })), 0, 1);
	expect(unit(once, 0).hasFired).toBe(true);
	expect("firedOnce" in unit(once, 0)).toBe(false);
	expect(canFireThisTurn(unit(once, 0))).toBe(false);
});

//---- Fire Discipline: "The unit will expend only one-half of an ammunition point each time it attacks"

test("A unit with Fire Discipline spends half an ammo point an attack in the remaster rules: a point every second one (#3)", () => {
	const first = unit(attack(world(remasterRules, twoTargets({ leader: leaderType.fireDiscipline })), 0, 1), 0);
	expect([first.ammo, first.halfAmmo]).toEqual([unit(world(remasterRules, twoTargets({})), 0).ammo, true]);
	const second = unit(attack(world(remasterRules, twoTargets({ leader: leaderType.fireDiscipline, halfAmmo: true })), 0, 1), 0);
	expect(second.ammo).toBe(first.ammo - 1);
	expect("halfAmmo" in second).toBe(false);
});

test("A unit with Fire Discipline that fires back spends half an ammo point too (#3)", () => {
	const units = twoTargets({});
	units[1] = { ...units[1], leader: leaderType.fireDiscipline };
	const w = world(remasterRules, units);
	const after = unit(attack(w, 0, 1), 1);
	expect([after.ammo, after.halfAmmo]).toEqual([unit(w, 1).ammo, true]);
});

test("A unit with Fire Discipline spends a whole ammo point an attack in the classic rules (kept, #3)", () => {
	const w = world(classicRules, twoTargets({ leader: leaderType.fireDiscipline }));
	const after = unit(attack(w, 0, 1), 0);
	expect(after.ammo).toBe(unit(w, 0).ammo - 1);
	expect("halfAmmo" in after).toBe(false);
});

test("A resupply fills the half ammo point Fire Discipline spent (#3)", () => {
	const w = world(remasterRules, [{ eqid: PZ_IIA, owner: 0, row: 3, col: 3, leader: leaderType.fireDiscipline, ammo: 2,
		halfAmmo: true }]);
	const r = step(w, { type: "resupply", unit: 0 });
	if (!r.ok) throw new Error("resupply refused");
	expect("halfAmmo" in unit(r.world, 0)).toBe(false);
});

//---- Mechanized Veteran: "Air Defence unit may move and fire in the same turn"

//A 3.7 FlaK36 on its Opel Blitz at 3,1, led (Mechanized Veteran is the air defence's class leader), a Polish P.11c at 3,5
const flak = (rules: Ruleset, leader: number) => world(rules, [
	{ eqid: FLAK_36, owner: 0, row: 3, col: 1, leader, isMounted: true, transport: { eqid: OPEL_BLITZ, ammo: 4, fuel: 40 } },
	{ eqid: P11C, owner: 1, row: 3, col: 5 }]);

function moveTo(w: World, row: number, col: number): World {
	const r = step(w, { type: "move", unit: 0, to: { row, col } });
	if (r.ok === false) throw new Error(r.refusal.reason);
	return r.world;
}

test("An air defence unit with Mechanized Veteran gets off its transport after a move and may fire in the remaster rules (#3)", () => {
	const moved = moveTo(flak(remasterRules, leaderType.aggressiveAttack), 3, 3);
	const u = unit(moved, 0);
	expect([u.isMounted, u.hasMoved, u.hasFired]).toEqual([false, true, false]);
	expect(attack(moved, 0, 1)).toBeDefined();
});

test("An air defence unit moved on its transport can't fire in the classic rules, Mechanized Veteran or not (kept, #3)", () => {
	const u = unit(moveTo(flak(classicRules, leaderType.aggressiveAttack), 3, 3), 0);
	expect([u.isMounted, u.hasFired]).toEqual([true, true]);
	const plain = unit(moveTo(flak(remasterRules, -1), 3, 3), 0);
	expect([plain.isMounted, plain.hasFired]).toEqual([true, true]);
});

//---- Combat Support: "provides both Resilience and Skilled Ground Attack abilities to all adjoining units"

const estimate = (w: World, atk: number, def: number, record: Contribution[] | null = null) =>
	attackResult(w, unit(w, atk), unit(w, def), null, record);

test("A unit next to a friend with Combat Support loses fewer points, as with Resilience, in the remaster rules (#3)", () => {
	const near = (rules: Ruleset, leader: number) => world(rules, [{ eqid: PZ_IIA, owner: 0, row: 3, col: 3 },
		{ eqid: INFANTERIE, owner: 1, row: 3, col: 4 }, { eqid: INFANTERIE, owner: 1, row: 2, col: 4, leader }]);
	const plain = estimate(near(remasterRules, leaderType.aggressiveAttack), 0, 1).kills;
	expect(estimate(near(remasterRules, leaderType.combatSupport), 0, 1).kills).toBeLessThan(plain);
	expect(estimate(near(classicRules, leaderType.combatSupport), 0, 1).kills)
		.toBe(estimate(near(classicRules, leaderType.aggressiveAttack), 0, 1).kills);
});

test("An aircraft next to a friend with Combat Support attacks the ground as with Skilled Ground Attack in the remaster rules (#3)", () => {
	const near = (rules: Ruleset) => world(rules, [{ eqid: JU_87, owner: 0, row: 3, col: 3 },
		{ eqid: INFANTERIE, owner: 1, row: 3, col: 4 }, { eqid: PZ_IIA, owner: 0, row: 2, col: 3, leader: leaderType.combatSupport }]);
	const named = (rules: Ruleset) => {
		const record: Contribution[] = [];
		estimate(near(rules), 0, 1, record);
		return record.filter((c) => c.name === "skilled ground attack").length;
	};
	expect(named(remasterRules)).toBe(1);
	expect(named(classicRules)).toBe(0);
});

test("Combat Support lends nothing to an enemy next to the unit (#3)", () => {
	const w = (leader: number) => world(remasterRules, [{ eqid: PZ_IIA, owner: 0, row: 3, col: 3, leader },
		{ eqid: INFANTERIE, owner: 1, row: 3, col: 4 }]);
	expect(estimate(w(leaderType.combatSupport), 0, 1).kills).toBe(estimate(w(-1), 0, 1).kills);
});
