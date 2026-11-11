// @vitest-environment node
//The remastered AI's commander (src/core/remastered/commander.ts, #638): the directives it gives its staff and the
//check a list of them passes; on hand-built maps
import { expect, test } from "vitest";
import { analyse, type AnalysisCache } from "../src/core/remastered/analysis";
import { command, type CommanderMemory } from "../src/core/remastered/commander";
import { type Directive, validateDirectives } from "../src/core/remastered/directives";
import { remasteredController } from "../src/core/remastered/controller";
import { perceive } from "../src/core/remastered/perception";
import type { Position, World } from "../src/core/types";
import type { HandUnit } from "./coreworld";
import { playOneTurn, position, world } from "./staffworld";

const INFANTERIE = 115, PZ_IVD = 148, PIECHOTA = 270;

//Two of Poland's objectives at either end of the map, the southern one held by a worn-down infantry; Germany's tanks
//and infantry on the western edge, three turns from either
const NORTH = { row: 1, col: 13 }, SOUTH = { row: 10, col: 13 };
const twoSectors: HandUnit[] = [{ eqid: PZ_IVD, owner: 0, row: 4, col: 1 }, { eqid: PZ_IVD, owner: 0, row: 7, col: 1 },
	{ eqid: INFANTERIE, owner: 0, row: 3, col: 1 }, { eqid: INFANTERIE, owner: 0, row: 8, col: 1 },
	{ eqid: PIECHOTA, owner: 1, row: 1, col: 13 }, { eqid: PIECHOTA, owner: 1, row: 10, col: 13, strength: 3 }];

//The rule-based commander's directives for Germany in the world, from its last ones
function commanded(w: World, last: readonly Directive[] = [], cache: AnalysisCache = new Map()): Directive[] {
	const view = perceive(w, 0, []), memory: CommanderMemory = { player: 0, directives: last, held: new Set(), cache };
	return command(w, view, analyse(w, view, cache), memory);
}

const onTurn = (w: World, turn: number): World => ({ ...w, state: { ...w.state, turn: { ...w.state.turn, turn } } });
const assaultsOf = (directives: readonly Directive[]) => directives.filter((d) => d.task === "assault");

test("the commander gives one assault directive and keeps it until its deadline (#638)", () => {
	const w = world(twoSectors, [], [NORTH, SOUTH]);
	const first = commanded(w);
	expect(assaultsOf(first)).toMatchObject([{ target: SOUTH, until: 5 }]);
	expect(first[0].reason).toContain("assault 10,13");
	//The northern infantry worn down to 1: the north now ranks better, but the assault goes on to its deadline
	const next = world(twoSectors.map((u) => u.row === NORTH.row ? { ...u, strength: 1 } : u), [], [NORTH, SOUTH]);
	expect(assaultsOf(commanded(next))).toMatchObject([{ target: NORTH }]);
	expect(assaultsOf(commanded(onTurn(next, 5), first))).toMatchObject([{ target: SOUTH, until: 5 }]);
	expect(assaultsOf(commanded(onTurn(next, 6), first))).toMatchObject([{ target: NORTH, until: 8 }]);
});

test("the commander's directives are plain data: the same after JSON (#638)", () => {
	const w = world([...twoSectors, { eqid: PIECHOTA, owner: 1, row: 5, col: 4 }], [{ row: 5, col: 2 }], [NORTH, SOUTH]);
	const directives = commanded(w);
	expect(directives.map((d) => d.task)).toEqual(["hold", "assault"]);
	expect(JSON.parse(JSON.stringify(directives))).toEqual(directives);
	expect(validateDirectives(JSON.parse(JSON.stringify(directives)), w, 0)).toEqual({ directives, dropped: [] });
});

test("an invalid directive is dropped with its reason (#638)", () => {
	const own = { row: 5, col: 2 }, w = world(twoSectors, [own], [NORTH, SOUTH]);
	const good: Directive = { task: "assault", target: SOUTH, priority: 2, until: 4, reason: "the weakest sector" };
	const hold: Directive = { task: "hold", target: own, priority: 1, until: 3, reason: "the enemy is near" };
	const list: unknown[] = [good, hold,
		{ ...good, task: "encircle" }, { ...good, target: { row: 40, col: 2 } }, { ...good, target: { row: 5, col: 5 } },
		{ ...hold, target: NORTH }, { ...good, priority: 0 }, { ...good, until: 0 }, { ...good, reason: 7 }, "assault the north",
		{ ...hold, priority: 3 }, { ...hold, task: "delay", priority: 4 }, { ...good, target: NORTH, priority: 5 },
		{ task: "reserve", target: { row: 5, col: 5 }, priority: 6, until: 3, reason: "a fifth of the tanks", units: [1] }];
	const checked = validateDirectives(list, w, 0);
	expect(checked.directives).toEqual([hold, good, { task: "reserve", target: { row: 5, col: 5 }, priority: 6, until: 3, reason: "a fifth of the tanks" }]);
	expect(checked.dropped).toEqual([
		{ index: 2, reason: "unknown task \"encircle\"" }, { index: 3, reason: "target off the map" },
		{ index: 4, reason: "5,5 is not an objective to take" }, { index: 5, reason: "1,13 is not an objective the side holds" },
		{ index: 6, reason: "priority not a number from 1" }, { index: 7, reason: "its last turn has passed" },
		{ index: 8, reason: "no reason given" }, { index: 9, reason: "not a directive" },
		{ index: 10, reason: "a second hold on 5,2" }, { index: 11, reason: "5,2 already has a posture, hold" },
		{ index: 12, reason: "a second assault: the main effort is on 10,13" }]);
	expect(validateDirectives({ task: "assault" }, w, 0)).toEqual({ directives: [], dropped: [{ index: -1, reason: "not a list of directives" }] });
});

test("the staff makes its operations from directives only (#638)", () => {
	//No enemy near Germany's objective and the south the weaker sector: the rules give no hold and assault the south.
	//A commander that delays at the objective and assaults the north gets a garrison there (the staff holds a delayed
	//objective as it holds any) and the units sent north
	const own = { row: 5, col: 2 }, w = world(twoSectors, [own], [NORTH, SOUTH]);
	const rules = remasteredController(0);
	playOneTurn(rules, w);
	expect(rules.operations.filter((op) => op.kind !== "reserve")).toMatchObject([{ kind: "assault", at: SOUTH }]);
	const orders: Directive[] = [{ task: "delay", target: own, priority: 1, until: 3, reason: "the staff is told to" },
		{ task: "assault", target: NORTH, priority: 2, until: 4, reason: "the staff is told to" },
		{ task: "assault", target: { row: 6, col: 6 }, priority: 3, until: 4, reason: "not an objective" }];
	const told = remasteredController(0, () => orders);
	const turn = playOneTurn(told, w);
	expect(told.directives).toEqual(orders.slice(0, 2));
	expect(told.dropped).toEqual([{ index: 2, reason: "6,6 is not an objective to take" }]);
	expect(told.operations).toMatchObject([{ kind: "garrison", at: own, until: 3, reason: "the staff is told to" },
		{ kind: "assault", at: NORTH, units: [], until: 4, reason: "the staff is told to" }]);
	const garrison = told.operations[0].units[0];
	expect(position(turn.world, garrison)).not.toEqual(position(w, garrison));
	const apart = (a: Position, b: Position) => Math.abs(a.row - b.row);
	expect(apart(position(turn.world, 1), NORTH)).toBeLessThan(apart(position(w, 1), NORTH));
	//A commander that says nothing leaves the staff without operations
	const silent = remasteredController(0, () => []);
	playOneTurn(silent, w);
	expect(silent.operations).toEqual([]);
});

test("the commander switches the main effort when the sector is hopeless and another is weak (#638, #629)", () => {
	const w = world(twoSectors, [], [NORTH, SOUTH]);
	const first = commanded(w);
	expect(assaultsOf(first)).toMatchObject([{ target: SOUTH, until: 5 }]);
	//Three more infantry around the southern objective outweigh what Germany brings there; the north is still one
	//infantry: the commander doesn't wait for the deadline
	const south: HandUnit[] = [{ eqid: PIECHOTA, owner: 1, row: 9, col: 13 }, { eqid: PIECHOTA, owner: 1, row: 10, col: 12 },
		{ eqid: PIECHOTA, owner: 1, row: 11, col: 13 }];
	const next = onTurn(world([...twoSectors, ...south], [], [NORTH, SOUTH]), 2);
	expect(assaultsOf(commanded(next, first))).toMatchObject([{ target: NORTH }]);
});
