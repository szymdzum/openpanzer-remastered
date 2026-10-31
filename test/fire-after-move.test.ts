//Artillery and air defence fire before they move (#625): in the remaster rules, as the manual says, "artillery and
//air defense units can only shoot before they move", on foot or on their transport, and the core's check refuses an
//attack by a unit that can't fire now. The classic rules keep the original's: only a move on the transport uses the
//shot. On a small map built by hand
import { expect, test } from "vitest";
import { attackCells } from "../src/core/attack";
import type { Refusal } from "../src/core/command";
import { leaderType } from "../src/core/tables";
import { classicRules, remasterRules } from "../src/core/rules";
import { check, step } from "../src/core/step";
import type { Position, Ruleset, World } from "../src/core/types";
import { unitById } from "../src/core/world";
import { germanyPoland, type HandUnit, handWorld } from "./coreworld";

const LEFK18 = 95, SIG_PZ_I = 101, FLAK36 = 67, FLAK38 = 64, PAK36 = 66, INFANTERIE = 115, OPEL_BLITZ = 157;
const TP7 = 273, P11C = 280;

const hand = (units: HandUnit[], rules: Ruleset) => handWorld({ rows: 10, cols: 10, units }, germanyPoland, { rules, noFOW: true });

//The world after unit 0's move to the hex
function moved(w: World, to: Position): World {
	const r = step(w, { type: "move", unit: 0, to });
	if ("refusal" in r) throw new Error("move refused: " + r.refusal.reason);
	expect(unitById(r.world, 0)).toMatchObject(to);
	return r.world;
}

const attackOn = (target: number) => ({ type: "attack" as const, unit: 0, target });

//The gun's targets after its move, and what the core's check says of its attack on unit 1
function afterMove(units: HandUnit[], to: Position, rules: Ruleset) {
	const w = moved(hand(units, rules), to);
	return { targets: attackCells(w, unitById(w, 0)).length, check: check(w, attackOn(1)) };
}

const refused = { targets: 0, check: { reason: "can't fire this turn" } };
const fires = { targets: 1, check: null as Refusal | null };

test("in the remaster rules artillery that moved can't attack (#625)", () => {
	//A self-propelled 15 cm sIG on a Pz I, range 2, three hexes from a 7TP: it moves one hex and has it in range
	const sp: HandUnit[] = [{ eqid: SIG_PZ_I, owner: 0, row: 5, col: 2 }, { eqid: TP7, owner: 1, row: 5, col: 5 }];
	expect(afterMove(sp, { row: 5, col: 3 }, remasterRules)).toEqual(refused);
	expect(afterMove(sp, { row: 5, col: 3 }, classicRules)).toEqual(fires);
});

test("in the remaster rules air defence that moved can't attack, flak too (#625)", () => {
	//A 3.7 cm FlaK 36 (air defence, range 2) and a 2 cm Flak 38 (the flak class, range 1), a P.11c in range of the hex
	//each steps to
	const ad: HandUnit[] = [{ eqid: FLAK36, owner: 0, row: 5, col: 2 }, { eqid: P11C, owner: 1, row: 5, col: 5 }];
	const flak: HandUnit[] = [{ eqid: FLAK38, owner: 0, row: 5, col: 2 }, { eqid: P11C, owner: 1, row: 5, col: 4 }];
	expect(afterMove(ad, { row: 5, col: 3 }, remasterRules)).toEqual(refused);
	expect(afterMove(flak, { row: 5, col: 3 }, remasterRules)).toEqual(refused);
	expect(afterMove(ad, { row: 5, col: 3 }, classicRules)).toEqual(fires);
});

test("in the remaster rules anti-tank that moved still attacks, as the manual's anti-tank class says (#625)", () => {
	//"AT class units suffer a penalty to initiative and attack value if they move, and attack in the same turn"
	const at: HandUnit[] = [{ eqid: PAK36, owner: 0, row: 5, col: 2 }, { eqid: TP7, owner: 1, row: 5, col: 4 }];
	expect(afterMove(at, { row: 5, col: 3 }, remasterRules)).toEqual(fires);
});

test("a towed gun that moved on foot can't fire in the remaster rules (#625)", () => {
	//A leFK 18 (range 4) with its Opel Blitz, not on it: one hex on foot
	const towed: HandUnit[] = [{ eqid: LEFK18, owner: 0, row: 5, col: 2, transport: { eqid: OPEL_BLITZ, ammo: 0, fuel: 50 } },
		{ eqid: TP7, owner: 1, row: 5, col: 6 }];
	expect(afterMove(towed, { row: 5, col: 3 }, remasterRules)).toEqual(refused);
});

test("in the classic rules a towed gun that moved on foot still fires (#625)", () => {
	const towed: HandUnit[] = [{ eqid: LEFK18, owner: 0, row: 5, col: 2, transport: { eqid: OPEL_BLITZ, ammo: 0, fuel: 50 } },
		{ eqid: TP7, owner: 1, row: 5, col: 6 }];
	expect(afterMove(towed, { row: 5, col: 3 }, classicRules)).toEqual(fires);
});

test("in the remaster rules air defence with Mechanized Veteran moves and fires (#625)", () => {
	//"Air Defence unit may move and fire in the same turn"
	const ad: HandUnit[] = [{ eqid: FLAK36, owner: 0, row: 5, col: 2, leader: leaderType.mechanizedVeteran },
		{ eqid: P11C, owner: 1, row: 5, col: 5 }];
	expect(afterMove(ad, { row: 5, col: 3 }, remasterRules)).toEqual(fires);
});

test("artillery fires, then moves, in either rules (#625)", () => {
	for (const rules of [classicRules, remasterRules]) {
		const w = hand([{ eqid: SIG_PZ_I, owner: 0, row: 5, col: 3 }, { eqid: TP7, owner: 1, row: 5, col: 5 }], rules);
		const fired = step(w, attackOn(1));
		expect(fired.ok, rules.name).toBe(true);
		if ("world" in fired) expect(check(fired.world, { type: "move", unit: 0, to: { row: 4, col: 2 } }), rules.name).toBeNull();
	}
});

test("check refuses an attack by a unit that already fired (#625)", () => {
	const units: HandUnit[] = [{ eqid: INFANTERIE, owner: 0, row: 5, col: 5, hasFired: true }, { eqid: TP7, owner: 1, row: 5, col: 6 }];
	expect(check(hand(units, remasterRules), attackOn(1))).toEqual({ reason: "can't fire this turn" });
	expect(check(hand([{ ...units[0], hasFired: false, ammo: 0 }, units[1]], remasterRules), attackOn(1)))
		.toEqual({ reason: "can't fire this turn" });
	//The classic rules' check asks the distance only, as the original AI's attacks do (it attacks after its surprise
	//attack, which already fired)
	expect(check(hand(units, classicRules), attackOn(1))).toBeNull();
});
