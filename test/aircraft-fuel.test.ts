//Aircraft have no fuel limit (#631): in the remaster rules, as the manual says ("Because of their operational range,
//air units have no fuel limits in PANZER GENERAL II"), an aircraft burns no fuel and its fuel doesn't limit its moves;
//its ammunition still runs out and comes back at an airfield. The classic rules keep the original's: a fuel a point.
//On a small map built by hand
import { expect, test } from "vitest";
import { fullMoves, moveRange, unitMoveRange } from "../src/core/movement";
import { classicRules, remasterRules } from "../src/core/rules";
import { step } from "../src/core/step";
import { canResupply, resupplyValue } from "../src/core/supply";
import { terrainType } from "../src/core/tables";
import type { Position, Ruleset, World } from "../src/core/types";
import { unitLowFuel, unitUsesFuel } from "../src/core/units";
import { unitById } from "../src/core/world";
import { germanyPoland, type HandUnit, handWorld } from "./coreworld";
import { moves, unitLine } from "../cli/units";

const ME109 = 159, PZ_IIA = 140, TP7 = 273;
const FULL = germanyPoland[ME109].fuel, MOVES = germanyPoland[ME109].movpoints;

//A Me-109 (unit 0) on a German airfield at 5,2, a 7TP far away
function hand(rules: Ruleset, plane: Partial<HandUnit> = {}, others: HandUnit[] = []): World {
	const w = handWorld({ rows: 12, cols: 24, terrain: (r, c) => r === 5 && c === 2 ? terrainType.Airfield : 0,
		units: [{ eqid: ME109, owner: 0, row: 5, col: 2, ...plane }, { eqid: TP7, owner: 1, row: 11, col: 23 }, ...others] },
	germanyPoland, { rules, noFOW: true });
	w.state.map.hexes[5 * 24 + 2].flag = w.state.players[0].country;
	return w;
}

function moved(w: World, to: Position, unit = 0): World {
	const r = step(w, { type: "move", unit, to });
	if ("refusal" in r) throw new Error("move refused: " + r.refusal.reason);
	return r.world;
}

test("in the remaster rules an aircraft burns no fuel when it moves (#631)", () => {
	const w = moved(hand(remasterRules), { row: 5, col: 6 });
	expect(unitById(w, 0)).toMatchObject({ row: 5, col: 6, fuel: FULL, hasMoved: true });
});

test("in the remaster rules an aircraft's range isn't limited by its fuel (#631)", () => {
	const w = hand(remasterRules, { fuel: 2 }), u = unitById(w, 0);
	expect(unitMoveRange(w, u)).toBe(MOVES);
	expect(moveRange(w, u).some((c) => c.canMove && c.row === 5 && c.col === 2 + MOVES)).toBe(true);
	expect(unitById(moved(w, { row: 5, col: 2 + MOVES }), 0).fuel).toBe(2);
	const dry = hand(remasterRules, { fuel: 0 });
	expect(unitMoveRange(dry, unitById(dry, 0))).toBe(MOVES);
});

test("in the classic rules an aircraft still burns fuel (#631)", () => {
	const w = moved(hand(classicRules), { row: 5, col: 6 });
	expect(unitById(w, 0).fuel).toBe(FULL - 4);
	const low = hand(classicRules, { fuel: 2 });
	expect(unitMoveRange(low, unitById(low, 0))).toBe(2);
	expect(unitUsesFuel(low, unitById(low, 0))).toBe(true);
	expect(unitLowFuel(low, unitById(low, 0), 5)).toBe(true);
});

test("in the remaster rules a ground unit still burns fuel and its fuel limits its moves (#631)", () => {
	const tank: HandUnit = { eqid: PZ_IIA, owner: 0, row: 8, col: 2 };
	const w = hand(remasterRules, {}, [tank]), full = germanyPoland[PZ_IIA].fuel;
	expect(unitById(moved(w, { row: 8, col: 4 }, 2), 2).fuel).toBe(full - 2);
	const low = hand(remasterRules, {}, [{ ...tank, fuel: 1 }]);
	expect(unitMoveRange(low, unitById(low, 2))).toBe(1);
	expect(fullMoves(low, unitById(low, 2))).toBe(0);
});

test("in the remaster rules an aircraft is never short of fuel: it resupplies its ammunition only (#631)", () => {
	const short = hand(remasterRules, { fuel: 2 }), u = unitById(short, 0);
	expect([unitUsesFuel(short, u), unitLowFuel(short, u, 5), canResupply(short, u)]).toEqual([false, false, false]);
	const spent = hand(remasterRules, { fuel: 2, ammo: 1 }), full = germanyPoland[ME109].ammo;
	expect(resupplyValue(spent, unitById(spent, 0))).toEqual({ ammo: full - 1, fuel: 0, transportAmmo: 0, transportFuel: 0 });
	const r = step(spent, { type: "resupply", unit: 0 });
	expect("world" in r && unitById(r.world, 0)).toMatchObject({ ammo: full, fuel: 2 });
	const classic = hand(classicRules, { fuel: 2 });
	expect(resupplyValue(classic, unitById(classic, 0)).fuel).toBe(FULL - 2);
});

test("the command line lists no fuel for an aircraft in the remaster rules (#631)", () => {
	const line = (w: World) => unitLine(w, unitById(w, 0), true), to = (w: World) => moves(w, 0, 0).cells[0].fuelLeft;
	const remaster = hand(remasterRules), classic = hand(classicRules);
	expect([line(remaster).includes("fuel"), to(remaster)]).toEqual([false, null]);
	expect(line(classic)).toContain(`fuel ${FULL}/${FULL}`);
	expect(to(classic)).toBe(FULL - 1);
});
