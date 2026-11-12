// @vitest-environment node
//The remastered AI's reinforcements (#639): its commander plans with the units that arrived after its plan, and gives a
//group that arrived together a directive of its own; on hand-built maps, the turn played as the session plays it (the
//plan, the reinforcements, then the orders)
import { expect, test } from "vitest";
import type { Command } from "../src/core/command";
import { remasteredController } from "../src/core/remastered/controller";
import { type Directive, validateDirectives } from "../src/core/remastered/directives";
import { arriveReinforcements } from "../src/core/turn";
import type { Position, World } from "../src/core/types";
import { distance } from "../src/core/geometry";
import { type HandUnit, reserveUnit } from "./coreworld";
import { playOneTurn, position, world } from "./staffworld";

const INFANTERIE = 115, PZ_IVD = 148, PIECHOTA = 270;

//The world with the player's reinforcements due this turn at the hexes given
function withReinforcements(w: World, arrivals: { eqid: number; at: Position }[]): World {
	const due = arrivals.map((r) => ({ turn: w.state.turn.turn, row: r.at.row, col: r.at.col, unit: reserveUnit(r.eqid) }));
	return { ...w, state: { ...w.state, reinforcements: due } };
}

//The reinforcements arrive after the plan, before the first order: the session's order (#94)
const arriving = (w: World, n: number) => n === 0 ? arriveReinforcements(w).world : w;

const apart = (a: Position, b: Position) => distance(a.row, a.col, b.row, b.col);

//Germany attacks (two objectives to take at the start): tanks and infantry on the western edge; the southern objective
//held by a worn-down infantry is its main effort
const NORTH = { row: 1, col: 13 }, SOUTH = { row: 10, col: 13 };
const twoSectors: HandUnit[] = [{ eqid: PZ_IVD, owner: 0, row: 4, col: 1 }, { eqid: PZ_IVD, owner: 0, row: 7, col: 1 },
	{ eqid: INFANTERIE, owner: 0, row: 3, col: 1 }, { eqid: INFANTERIE, owner: 0, row: 8, col: 1 },
	{ eqid: PIECHOTA, owner: 1, row: 1, col: 13 }, { eqid: PIECHOTA, owner: 1, row: 10, col: 13, strength: 3 }];

test("the remastered AI's commander sees the reinforcements that arrived this turn (#639, #94)", () => {
	const w = withReinforcements(world(twoSectors, [], [NORTH, SOUTH], 3, false, [2, 0]), [{ eqid: PZ_IVD, at: { row: 9, col: 9 } }]);
	const c = remasteredController(0);
	playOneTurn(c, w, arriving);
	expect(c.view?.own.map((u) => u.id)).toContain(6);
	expect(c.analysis?.units.map((u) => u.id)).toContain(6);
});

test("a group that arrives together joins the main effort in reach (#639)", () => {
	const w = withReinforcements(world(twoSectors, [], [NORTH, SOUTH], 3, false, [2, 0]),
		[{ eqid: PZ_IVD, at: { row: 8, col: 9 } }, { eqid: INFANTERIE, at: { row: 9, col: 9 } }]);
	const c = remasteredController(0);
	playOneTurn(c, w, arriving);
	expect(c.directives.filter((d) => d.units !== undefined)).toMatchObject([{ task: "assault", target: SOUTH, units: [6, 7] }]);
	expect(c.directives.find((d) => d.units !== undefined)?.reason).toContain("2 units arrived");
});

//Germany defends two objectives (Poland had both to take at the start); Polish infantry near the northern one only
const NORTH_HELD = { row: 2, col: 4 }, SOUTH_HELD = { row: 10, col: 4 };
const defence: HandUnit[] = [{ eqid: INFANTERIE, owner: 0, row: 2, col: 4 }, { eqid: INFANTERIE, owner: 0, row: 10, col: 4 },
	{ eqid: PIECHOTA, owner: 1, row: 2, col: 9 }, { eqid: PZ_IVD, owner: 0, row: 6, col: 2 }];
const defended = () => world(defence, [NORTH_HELD, SOUTH_HELD], [], 3, false, [0, 2]);

test("a group with no main effort in reach relieves the nearest threatened objective (#639)", () => {
	//The group arrives in the south-west, nearer the southern objective, which nothing threatens
	const w = withReinforcements(defended(), [{ eqid: PZ_IVD, at: { row: 9, col: 0 } }, { eqid: PZ_IVD, at: { row: 10, col: 0 } }]);
	const c = remasteredController(0);
	const turn = playOneTurn(c, w, arriving);
	expect(c.directives.filter((d) => d.units !== undefined)).toMatchObject([{ task: "hold", target: NORTH_HELD, units: [4, 5] }]);
	for (const id of [4, 5]) expect(apart(position(turn.world, id), NORTH_HELD)).toBeLessThan(apart({ row: 5 + id, col: 0 }, NORTH_HELD));
});

test("an attacker's group out of the main effort's reach goes on with the plan, relieving nothing (#639)", () => {
	//Germany's objective in the west is threatened; the group arrives beside it, far from the southern sector
	const own = { row: 5, col: 2 }, units: HandUnit[] = [...twoSectors, { eqid: PIECHOTA, owner: 1, row: 5, col: 6 }];
	const w = withReinforcements(world(units, [own], [NORTH, SOUTH], 3, false, [2, 0]),
		[{ eqid: PZ_IVD, at: { row: 4, col: 0 } }, { eqid: PZ_IVD, at: { row: 5, col: 0 } }]);
	const c = remasteredController(0);
	playOneTurn(c, w, arriving);
	expect(c.directives.map((d) => d.task)).toContain("hold");
	expect(c.directives.filter((d) => d.units !== undefined)).toEqual([]);
});

test("a group directive names the side's units on the map, each in one group (#639)", () => {
	const w = world(twoSectors, [], [NORTH, SOUTH], 3, false, [2, 0]);
	const effort: Directive = { task: "assault", target: SOUTH, priority: 1, until: 4, reason: "the weakest sector" };
	const group: Directive = { ...effort, priority: 2, reason: "they arrived together", units: [0, 2] };
	const list: unknown[] = [effort, group, { ...group, units: [4] }, { ...group, units: [] }, { ...group, units: [1, 1] },
		{ ...group, units: "all" }, { ...group, task: "counterattack", units: [2, 3] }, { ...group, task: "counterattack", units: [3] }];
	const checked = validateDirectives(list, w, 0);
	expect(checked.directives).toEqual([effort, group, { ...group, task: "counterattack", units: [3] }]);
	expect(checked.directives[1]).toBe(group);
	const notGroup = "its units are not a group of the side's on the map";
	expect(checked.dropped).toEqual([{ index: 2, reason: notGroup }, { index: 3, reason: notGroup }, { index: 4, reason: notGroup },
		{ index: 5, reason: notGroup }, { index: 6, reason: "unit 2 is already in a group: assault 10,13" }]);
});

test("with no reinforcements the turn plays as before (#639)", () => {
	//The orders of main before #639 on these worlds
	for (const [w, orders] of [[world(twoSectors, [], [NORTH, SOUTH], 3, false, [2, 0]), ATTACK], [defended(), DEFENCE]] as const) {
		const c = remasteredController(0);
		expect(playOneTurn(c, w).commands).toEqual(orders);
		expect(c.directives.every((d) => d.units === undefined)).toBe(true);
	}
});

const ATTACK: Command[] = [{ type: "move", unit: 0, to: { row: 7, col: 6 } }, { type: "move", unit: 1, to: { row: 8, col: 6 } },
	{ type: "move", unit: 3, to: { row: 7, col: 4 } }, { type: "move", unit: 2, to: { row: 5, col: 3 } }];
//The defender's units stay in their holes: nothing comes within reach
const DEFENCE: Command[] = [];
