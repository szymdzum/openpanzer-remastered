//Suppression in the remaster's rules (#2), as the manual says: "Each non-suppressed strength point makes an
//individual attack"; "Suppressed strength points are not available during the attack [...] tactical bombers
//can suppress units for the player's entire turn [...] Defending units whose suppression number is greater than
//or equal to their current strength, retreat, surrender, or are destroyed"; "Defensive Artillery fire suppresses
//for the attacking unit's entire combat"; "If all the attacking unit's strength points are destroyed or suppressed
//by defensive fire, the attack is broken off immediately". The classic rules keep the original, where nothing is
//suppressed. On small maps built by hand
import { expect, test } from "vitest";
import { attackResult, combatResult } from "../src/core/combat";
import type { EventOf, GameEvent } from "../src/core/events";
import { estimateAttack } from "../src/core/estimate";
import { classicRules, remasterRules } from "../src/core/rules";
import { begin, step } from "../src/core/step";
import { leaderType, terrainType } from "../src/core/tables";
import type { Contribution, Ruleset, World } from "../src/core/types";
import { unitById } from "../src/core/world";
import { type HandUnit, handWorld } from "./coreworld";

const INFANTERIE = 115, PZ_IIA = 140, JU_87 = 173, LEFH_18 = 92;

//The units given on an 8 x 8 map, the game stream seeded
function world(rules: Ruleset, units: HandUnit[], seed = 1, terrain?: (row: number, col: number) => number): World {
	const w = handWorld({ rows: 8, cols: 8, units, terrain }, undefined, { rules, noFOW: true });
	w.state.rng = { game: seed, ai: 1 };
	return w;
}

//A Pz IIA (unit 0) next to an Infanterie (unit 1), and the units given after them
const pair = (more: HandUnit[] = [], tank: Partial<HandUnit> = {}, infantry: Partial<HandUnit> = {}): HandUnit[] =>
	[{ eqid: PZ_IIA, owner: 0, row: 3, col: 3, ...tank }, { eqid: INFANTERIE, owner: 1, row: 3, col: 4, ...infantry }, ...more];

const seeds = Array.from({ length: 300 }, (_, i) => i + 1);

function attack(w: World, unit = 0, target = 1): { world: World; events: GameEvent[] } {
	const r = step(w, { type: "attack", unit, target });
	if (!r.ok) throw new Error("the attack was refused");
	return r;
}

const fights = (events: GameEvent[]) => events.filter((e): e is EventOf<"fight"> => e.type === "fight");
const mainFight = (events: GameEvent[]) => fights(events).find((e) => !e.support);
const strengthRecord = (record: Contribution[], name: string) =>
	record.filter((c) => c.name === name).map((c) => `${c.side} ${c.before} -> ${c.after}`);

//---- The dice

test("A die that misses the kill by up to 4 suppresses its point instead: the same kills and draws as without suppression (#2)", () => {
	let suppressed = 0;
	for (const seed of seeds.slice(0, 100)) {
		const plain = world({ ...remasterRules, suppression: false }, pair()), remaster = world(remasterRules, pair());
		const a = { state: seed }, b = { state: seed };
		const c = attackResult(plain, unitById(plain, 0)!, unitById(plain, 1)!, a);
		const r = attackResult(remaster, unitById(remaster, 0)!, unitById(remaster, 1)!, b);
		expect([r.kills, r.losses, b.state]).toEqual([c.kills, c.losses, a.state]);
		expect([c.defSuppress, c.atkSuppress]).toEqual([0, 0]);
		suppressed += r.defSuppress + r.atkSuppress;
	}
	expect(suppressed).toBeGreaterThan(0);
});

test("The estimate suppresses the dice's band of 4 in 20: 2 points of 10 and 1 of 5, when no chance is clamped (#2)", () => {
	const estimate = (w: World) => attackResult(w, unitById(w, 0)!, unitById(w, 1)!, null);
	//the tank's kill fraction is -2: a kill from 17, suppression from 13
	expect(estimate(world(remasterRules, pair())).defSuppress).toBe(2);
	expect(estimate(world(remasterRules, pair([], { strength: 5 }))).defSuppress).toBe(1);
	//the infantry's fire on the tank kills on a 20 only and suppresses nothing more: both chances clamped at 1 in 20
	expect(estimate(world(remasterRules, pair())).atkSuppress).toBe(0);
	//the dice's average comes close to it
	let sum = 0;
	for (const seed of seeds) {
		const w = world(remasterRules, pair());
		sum += attackResult(w, unitById(w, 0)!, unitById(w, 1)!, { state: seed }).defSuppress;
	}
	expect(sum / seeds.length).toBeGreaterThan(1.6);
	expect(sum / seeds.length).toBeLessThan(2.4);
});

//---- Support fire

//An Infanterie (unit 0) attacks another (1), a leFH 18 (2) behind it fires in support
const supported = (rules: Ruleset, seed: number, attacker: Partial<HandUnit> = {}) =>
	world(rules, pair([{ eqid: LEFH_18, owner: 1, row: 4, col: 5 }], { eqid: INFANTERIE, ...attacker }), seed);

function seedWhere(found: (seed: number) => boolean): number {
	const seed = seeds.find(found);
	if (seed === undefined) throw new Error("no seed of " + seeds.length);
	return seed;
}

test("The points the support fire suppressed don't fire in the attack (#2)", () => {
	const seed = seedWhere((s) => {
		const support = fights(attack(supported(remasterRules, s)).events).find((e) => e.support);
		return support !== undefined && support.result.defSuppress > 0 && mainFight(attack(supported(remasterRules, s)).events) !== undefined;
	});
	const events = attack(supported(remasterRules, seed)).events, support = fights(events).find((e) => e.support)!;
	const left = support.defender.after.strength;
	expect(strengthRecord(mainFight(events)!.record, "suppressed")).toEqual([`attacker ${left} -> ${left - support.result.defSuppress}`]);
});

test("An attacker whose every point the support fire destroyed or suppressed breaks the attack off (#2)", () => {
	//an Infanterie of 1 the gun suppresses but doesn't kill
	const seed = seedWhere((s) => {
		const support = fights(attack(supported(remasterRules, s, { strength: 1 })).events).find((e) => e.support)!;
		return support.result.kills === 0 && support.result.defSuppress === 1;
	});
	const events = attack(supported(remasterRules, seed, { strength: 1 })).events;
	expect(events.some((e) => e.type === "attackStopped")).toBe(true);
	expect(mainFight(events)).toBeUndefined();
	//the same dice in the classic rules: nothing suppressed, the attack goes on
	expect(mainFight(attack(supported(classicRules, seed, { strength: 1 })).events)).toBeDefined();
});

test("The attack preview counts the support fire's suppression in the attacker's (#2)", () => {
	const w = supported(remasterRules, 1);
	const gun = attackResult(w, unitById(w, 2)!, unitById(w, 0)!, null).defSuppress;
	const alone = attackResult(w, unitById(w, 0)!, unitById(w, 1)!, null, null, gun);
	expect(gun).toBeGreaterThan(0);
	expect(combatResult(w, unitById(w, 0)!, unitById(w, 1)!, false, null).atkSuppress).toBe(gun + alone.atkSuppress);
	expect(estimateAttack(w, unitById(w, 0)!, unitById(w, 1)!).support.map((s) => s.suppressed)).toEqual([gun]);
});

//---- The retreat

test("A defender with at least its strength suppressed falls back, and the results say it was pinned down (#2)", () => {
	const w = world(remasterRules, pair([], {}, { suppressed: 10 })), events = attack(w).events;
	expect(events.find((e) => e.type === "pinned")).toMatchObject({ unit: 1 });
	expect(events.some((e) => e.type === "retreated" && e.unit === 1)).toBe(true);
	expect(estimateAttack(w, unitById(w, 0)!, unitById(w, 1)!).fate).toBe("retreats");
});

test("A defender pinned down with nowhere to fall back surrenders (#2)", () => {
	const water = (r: number, c: number) => r === 3 && (c === 3 || c === 4) ? terrainType.Clear : terrainType.Ocean;
	const events = attack(world(remasterRules, pair([], {}, { suppressed: 10 }), 1, water)).events;
	expect(events.some((e) => e.type === "pinned")).toBe(true);
	expect(events.some((e) => e.type === "surrendered" && e.unit === 1)).toBe(true);
});

test("A defender with some points suppressed holds; artillery's suppression makes nobody fall back (#2)", () => {
	const holds = attack(world(remasterRules, pair([], {}, { suppressed: 1 }))).events;
	expect(holds.some((e) => e.type === "pinned" || e.type === "retreated")).toBe(false);
	const shelled = attack(world(remasterRules, [{ eqid: LEFH_18, owner: 0, row: 3, col: 1 },
		{ eqid: INFANTERIE, owner: 1, row: 3, col: 4, suppressed: 10 }])).events;
	expect(shelled.some((e) => e.type === "pinned" || e.type === "retreated")).toBe(false);
});

//---- Continued suppression

//A Ju-87 (unit 0) over an Infanterie (1), a Pz IIA (2) next to it
const bombed = (rules: Ruleset, seed: number) => world(rules, [{ eqid: JU_87, owner: 0, row: 3, col: 4 },
	{ eqid: INFANTERIE, owner: 1, row: 3, col: 4 }, { eqid: PZ_IIA, owner: 0, row: 3, col: 3 }], seed);

const bomberSuppresses = (s: number) => mainFight(attack(bombed(remasterRules, s)).events)!.result.defSuppress > 0
	&& unitById(attack(bombed(remasterRules, s)).world, 1)!.strength > mainFight(attack(bombed(remasterRules, s)).events)!.result.defSuppress;

test("A tactical bomber's suppression lasts the turn: the infantry fires back with fewer points in the next attack (#2)", () => {
	const seed = seedWhere(bomberSuppresses);
	const after = attack(bombed(remasterRules, seed)), held = mainFight(after.events)!.result.defSuppress;
	const infantry = unitById(after.world, 1)!;
	expect(infantry.suppressed).toBe(held);
	const next = mainFight(attack(after.world, 2, 1).events)!;
	expect(strengthRecord(next.record, "suppressed")).toEqual([`defender ${infantry.strength} -> ${infantry.strength - held}`]);
});

test("A unit the bomber destroys keeps no suppression to the cleanup (#2)", () => {
	const weak = (s: number) => world(remasterRules, [{ eqid: JU_87, owner: 0, row: 3, col: 4 },
		{ eqid: INFANTERIE, owner: 1, row: 3, col: 4, strength: 2 }], s);
	const seed = seedWhere((s) => {
		const r = mainFight(attack(weak(s)).events)!.result;
		return r.kills >= 2 && r.defSuppress > 0;
	});
	const r = begin(weak(seed), { type: "attack", unit: 0, target: 1 });
	if (!r.ok) throw new Error("the attack was refused");
	expect(unitById(r.world, 1)!.strength).toBeLessThanOrEqual(0);
	expect("suppressed" in unitById(r.world, 1)!).toBe(false);
});

test("The turn's suppression is lifted when the turn ends (#2)", () => {
	const after = attack(bombed(remasterRules, seedWhere(bomberSuppresses))).world;
	expect(unitById(after, 1)!.suppressed).toBeGreaterThan(0);
	const ended = step(after, { type: "endTurn" });
	expect(ended.ok && ended.world.state.units.every((u) => !("suppressed" in u))).toBe(true);
});

test("A tank's suppression lasts only its combat, unless it has Shock Tactics (#2)", () => {
	const seed = seedWhere((s) => mainFight(attack(world(remasterRules, pair(), s)).events)!.result.defSuppress > 0);
	expect("suppressed" in unitById(attack(world(remasterRules, pair(), seed)).world, 1)!).toBe(false);
	const shock = attack(world(remasterRules, pair([], { leader: leaderType.shockTactics }), seed));
	expect(unitById(shock.world, 1)!.suppressed).toBe(mainFight(shock.events)!.result.defSuppress);
});

//---- Overwhelming Attack

//Leaders on both units: Overwhelming Attack's +2 kill fraction cancelled by the defender's Resilience, or two
//leaders that do nothing in a fight; the class leaders the same in both
const leaders = (rules: Ruleset, seed: number, overwhelming: boolean) => world(rules, pair([],
	{ leader: overwhelming ? leaderType.overwhelmingAttack : leaderType.liberator },
	{ leader: overwhelming ? leaderType.resilience : leaderType.liberator }), seed);

const dice = (w: World, seed: number) => attackResult(w, unitById(w, 0)!, unitById(w, 1)!, { state: seed });

test("Overwhelming Attack turns half the suppression it inflicts, rounded up, into kills (#2)", () => {
	const seed = seedWhere((s) => dice(leaders(remasterRules, s, false), s).defSuppress >= 3);
	const plain = dice(leaders(remasterRules, seed, false), seed), overwhelming = dice(leaders(remasterRules, seed, true), seed);
	const converted = Math.ceil(plain.defSuppress / 2);
	expect([overwhelming.kills, overwhelming.defSuppress]).toEqual([plain.kills + converted, plain.defSuppress - converted]);
});

test("The classic rules' Overwhelming Attack kills one more and nothing is suppressed (#2)", () => {
	for (const seed of seeds.slice(0, 20)) {
		const plain = dice(leaders(classicRules, seed, false), seed), overwhelming = dice(leaders(classicRules, seed, true), seed);
		expect([overwhelming.kills, overwhelming.defSuppress]).toEqual([plain.kills + 1, 0]);
	}
});

//---- The classic rules

test("The classic rules suppress nothing: no step changes the firing strength, no unit keeps any (#2)", () => {
	for (const seed of seeds.slice(0, 30)) {
		const w = bombed(classicRules, seed), after = attack(w);
		const tank = attack(after.world, 2, 1);
		for (const f of fights([...after.events, ...tank.events])) {
			expect([f.result.atkSuppress, f.result.defSuppress]).toEqual([0, 0]);
			expect(strengthRecord(f.record, "suppressed")).toEqual([]);
		}
		expect(JSON.stringify(tank.world.state)).not.toContain("suppressed");
		expect(tank.events.some((e) => e.type === "pinned")).toBe(false);
	}
});
