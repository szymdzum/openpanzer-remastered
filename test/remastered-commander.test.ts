// @vitest-environment node
//The remastered AI's commander (src/core/remastered/commander.ts, #638): the directives it gives its staff, the check
//a list of them passes, its turn clock and counterattack, and the staff's line and reserve; on hand-built maps
import { expect, test } from "vitest";
import { planTurn } from "../src/core/ai";
import type { Command } from "../src/core/command";
import { analyse, type AnalysisCache } from "../src/core/remastered/analysis";
import { clockLine, clockOf } from "../src/core/remastered/clock";
import { command, type CommanderMemory } from "../src/core/remastered/commander";
import { type Directive, validateDirectives } from "../src/core/remastered/directives";
import { remasteredController } from "../src/core/remastered/controller";
import { perceive } from "../src/core/remastered/perception";
import type { Position, World } from "../src/core/types";
import type { HandUnit } from "./coreworld";
import { playOneTurn, position, world } from "./staffworld";

const INFANTERIE = 115, PZ_IVD = 148, PIECHOTA = 270, TP7 = 273;

const attacks = (cmds: readonly Command[]) => cmds.filter((c) => c.type === "attack");

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
	expect(rules.operations).toMatchObject([{ kind: "assault", at: SOUTH }]);
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

test("the turn clock counts the turns left for the objectives left, by the turn limit's rule (#638, #232, #353)", () => {
	//Germany had two objectives to take at the start and Poland none: Germany attacks to the end, even once it holds more
	const w = world(twoSectors, [], [NORTH, SOUTH], 3, false, [2, 0]);
	expect(clockOf(w, 0)).toEqual({ attacks: true, turnsLeft: 10, toTake: 2, behind: false, late: false });
	expect(clockLine(clockOf(w, 0))).toBe("2 objectives in 10 turns");
	expect(clockLine(clockOf(w, 1))).toBe("0 objectives in 10 turns: defending");
	//Half the turns gone and nothing taken: behind schedule; one taken: on schedule again
	expect(clockLine(clockOf(onTurn(w, 6), 0))).toBe("2 objectives in 5 turns: behind schedule");
	const one = world(twoSectors, [NORTH], [SOUTH], 3, false, [2, 0]);
	expect(clockOf(onTurn(one, 6), 0)).toMatchObject({ attacks: true, toTake: 1, behind: false });
	expect(clockLine(clockOf(onTurn(one, 9), 0))).toBe("1 objective in 2 turns: the last turns");
});

test("an attacker that holds more objectives than it has left to take still plays as the attacker (#638, #353)", () => {
	//Germany, the scenario's attacker, took one of two objectives: by the count it has fewer left to take than Poland.
	//Its infantry dug in far from the enemy keeps its hole by the count, and leaves it by the turn limit's rule
	const units: HandUnit[] = [{ eqid: INFANTERIE, owner: 0, row: 5, col: 3, entrenchment: 5 }, { eqid: PIECHOTA, owner: 1, row: 5, col: 14 },
		{ eqid: INFANTERIE, owner: 0, row: 2, col: 0 }, { eqid: INFANTERIE, owner: 0, row: 8, col: 0 }];
	const w = world(units, [{ row: 2, col: 0 }, { row: 8, col: 0 }], [{ row: 5, col: 14 }], 3, false, [2, 0]);
	const moves = (cmds: readonly Command[]) => cmds.filter((c) => c.type === "move" && c.unit === 0);
	const byCount = planTurn(w, 0, w.rules.ai.config, 0).queue;
	expect(moves(byCount)).toEqual([]);
	expect(planTurn(w, 0, w.rules.ai.config, 0, { attacks: false }).queue).toEqual(byCount);
	expect(moves(planTurn(w, 0, w.rules.ai.config, 0, { attacks: true }).queue)).toHaveLength(1);
	expect(moves(playOneTurn(remasteredController(0), w).commands)).toHaveLength(1);
});

test("behind schedule the attacker pays for the objective as in the last turns (#638, #232)", () => {
	//German infantry beside a 7TP entrenched on the only objective: the attack loses more than it kills
	const units: HandUnit[] = [{ eqid: INFANTERIE, owner: 0, row: 5, col: 7 }, { eqid: TP7, owner: 1, row: 5, col: 8, entrenchment: 3 }];
	const w = world(units, [], [{ row: 5, col: 8 }], 3, false, [1, 0]);
	expect(attacks(playOneTurn(remasteredController(0), onTurn(w, 2)).commands)).toEqual([]);
	expect(clockOf(onTurn(w, 5), 0)).toMatchObject({ behind: true, late: false });
	expect(attacks(playOneTurn(remasteredController(0), onTurn(w, 5)).commands)).toEqual([{ type: "attack", unit: 0, target: 1 }]);
});

test("in the last turns the attacker goes for the objectives still in reach (#638, #232)", () => {
	//The far objective is held by one worn-down infantry, the near one by three: the commander's sector is the far one,
	//three turns of the tank's march away. With two turns left it is the near one
	const far = { row: 0, col: 0 }, near = { row: 10, col: 13 };
	const units: HandUnit[] = [{ eqid: PZ_IVD, owner: 0, row: 9, col: 9 }, { eqid: INFANTERIE, owner: 0, row: 9, col: 8 },
		{ eqid: PIECHOTA, owner: 1, row: 0, col: 0, strength: 1 }, { eqid: PIECHOTA, owner: 1, row: 10, col: 13 },
		{ eqid: PIECHOTA, owner: 1, row: 10, col: 14 }, { eqid: PIECHOTA, owner: 1, row: 11, col: 13 }];
	const w = world(units, [], [far, near], 3, false, [2, 0]);
	const early = commanded(onTurn(w, 3));
	expect(assaultsOf(early)).toMatchObject([{ target: far }]);
	const late = commanded(onTurn(w, 9), early);
	expect(assaultsOf(late)).toMatchObject([{ target: near }]);
	expect(late[0].reason).toContain("2 objectives in 2 turns: the last turns");
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

//Germany attacks (two objectives to take at the start): five Pz IVD in a column on the western edge, the Polish
//infantry on the objectives in the east
const column: HandUnit[] = [{ eqid: PZ_IVD, owner: 0, row: 5, col: 5 }, { eqid: PZ_IVD, owner: 0, row: 5, col: 4 },
	{ eqid: PZ_IVD, owner: 0, row: 5, col: 3 }, { eqid: PZ_IVD, owner: 0, row: 5, col: 2 }, { eqid: PZ_IVD, owner: 0, row: 5, col: 0 },
	{ eqid: PIECHOTA, owner: 1, row: 4, col: 13 }, { eqid: PIECHOTA, owner: 1, row: 7, col: 13 }];
const EAST = [{ row: 4, col: 13 }, { row: 7, col: 13 }];

test("the reserve stays out of the enemy's reach until committed (#638)", () => {
	//The rules keep no reserve; a commander that asks for one behind the sector, then commits it by asking no more
	let kept = true;
	const c = remasteredController(0, (w, view, a, memory) => {
		const rules = command(w, view, a, memory), effort = rules.find((d) => d.task === "assault");
		return kept && effort !== undefined ? [...rules, { ...effort, task: "reserve", priority: rules.length + 1, reason: "a fifth held back" }] : rules;
	});
	const w = world(column, [], EAST, 3, false, [2, 0]);
	const turn = playOneTurn(c, w);
	expect(c.directives.map((d) => d.task)).toEqual(["assault", "reserve"]);
	//A fifth of the mobile units, the furthest from the enemy
	expect(c.operations.find((op) => op.kind === "reserve")).toMatchObject({ units: [4] });
	const enemyReach = (t: World, id: number) => {
		const view = perceive(t, 0, []), p = position(t, id);
		return analyse(t, view).influence.enemy[p.row * t.state.map.cols + p.col];
	};
	expect(enemyReach(turn.world, 4)).toBe(0);
	//The others go on toward the sector; the reserve follows behind them
	const gap = (t: World, id: number) => Math.abs(position(t, id).col - 13);
	expect(gap(turn.world, 0)).toBeLessThan(gap(w, 0));
	expect(gap(turn.world, 4)).toBeGreaterThan(gap(turn.world, 0));
	//Once the side's units stand by the sector, the reserve waits out of the infantry's reach while the tanks are in it
	const close = world(column.map((u, i) => i < 4 ? { ...u, row: 3 + i, col: 10 } : i === 4 ? { ...u, col: 7 } : u), [], EAST, 3, false, [2, 0]);
	const fight = playOneTurn(c, close);
	expect(c.operations.find((op) => op.kind === "reserve")).toMatchObject({ units: [4] });
	expect(enemyReach(fight.world, 4)).toBe(0);
	expect(fight.commands.filter((cmd) => cmd.type === "attack" && cmd.unit === 4)).toEqual([]);
	//Committed: the staff holds it no longer, and it goes with the others
	kept = false;
	const committed = playOneTurn(c, close);
	expect(c.operations.some((op) => op.kind === "reserve")).toBe(false);
	expect(gap(committed.world, 4)).toBeLessThan(gap(close, 4));
});

test("the commander counterattacks an objective just lost when the estimate favours it (#638, #5)", () => {
	//Germany attacks in the east and holds an objective in the west with an infantry, a 7TP three hexes from it
	const own = { row: 5, col: 3 };
	const army: HandUnit[] = [{ eqid: PZ_IVD, owner: 0, row: 4, col: 5 }, { eqid: PZ_IVD, owner: 0, row: 6, col: 5 },
		{ eqid: PZ_IVD, owner: 0, row: 5, col: 6 }, { eqid: PZ_IVD, owner: 0, row: 4, col: 6 }, { eqid: PZ_IVD, owner: 0, row: 1, col: 0 },
		{ eqid: PIECHOTA, owner: 1, row: 4, col: 13 }, { eqid: PIECHOTA, owner: 1, row: 7, col: 13 }];
	const held = world([...army, { eqid: INFANTERIE, owner: 0, row: 5, col: 3 }, { eqid: TP7, owner: 1, row: 8, col: 3 }], [own], EAST, 3, false, [2, 0]);
	const c = remasteredController(0);
	playOneTurn(c, held);
	expect(c.directives.map((d) => d.task)).toEqual(["hold", "assault"]);
	//Poland's turn: the 7TP, worn down to 3, stands on the objective
	const lost = onTurn(world([...army, { eqid: TP7, owner: 1, row: 5, col: 3, strength: 3 }], [], [...EAST, own], 3, false, [2, 0]), 2);
	const turn = playOneTurn(c, lost);
	expect(c.directives[0]).toMatchObject({ task: "counterattack", target: own, until: 3 });
	expect(c.directives[0].reason).toMatch(/^counterattack 5,3: just lost, the estimate gives \d+\.\d for the units in reach$/);
	//The units in reach strike it before anything else, and the objective is Germany's again
	expect(attacks(turn.commands)[0]).toMatchObject({ target: 7 });
	expect(turn.world.state.map.hexes[5 * 16 + 3].owner).toBe(0);
	//The same with worn-down infantry for an army and a fresh 7TP dug in on the objective: the estimate is against it
	const worn = army.map((u): HandUnit => u.owner === 0 ? { ...u, eqid: INFANTERIE, strength: 2 } : u);
	const again = remasteredController(0);
	playOneTurn(again, world([...worn, { eqid: INFANTERIE, owner: 0, row: 5, col: 3 }, { eqid: TP7, owner: 1, row: 8, col: 3 }], [own], EAST, 3, false, [2, 0]));
	expect(again.directives.map((d) => d.task)).toContain("hold");
	playOneTurn(again, onTurn(world([...worn, { eqid: TP7, owner: 1, row: 5, col: 3, entrenchment: 5 }], [], [...EAST, own], 3, false, [2, 0]), 2));
	expect(again.directives.some((d) => d.task === "counterattack")).toBe(false);
});

test("the infantry near an objective to hold stands fast instead of marching on the enemy's objective (#638)", () => {
	//Germany defends its objective: an infantry on it and one two hexes behind it, a 7TP three hexes in front; the
	//objective to take is far in the east. The classic plan marches the second infantry east, past the tank
	const own = { row: 5, col: 5 };
	const units: HandUnit[] = [{ eqid: INFANTERIE, owner: 0, row: 5, col: 5 }, { eqid: INFANTERIE, owner: 0, row: 5, col: 3, entrenchment: 2 },
		{ eqid: TP7, owner: 1, row: 5, col: 8 }, { eqid: PIECHOTA, owner: 1, row: 5, col: 14 }];
	const w = world(units, [own], [{ row: 5, col: 14 }], 3, false, [0, 1]);
	const east = (cmds: readonly Command[]) => cmds.some((cmd) => cmd.type === "move" && cmd.unit === 1 && cmd.to.col > own.col);
	expect(east(planTurn(w, 0, w.rules.ai.config, 0, { held: new Set([0]) }).queue)).toBe(true);
	const c = remasteredController(0);
	const turn = playOneTurn(c, w);
	expect(c.directives.map((d) => d.task)).toEqual(["hold"]);
	expect(east(turn.commands)).toBe(false);
	expect(position(turn.world, 1).col).toBeLessThanOrEqual(own.col);
	//With no enemy near the objective there is no hold and no line: it marches
	const quiet = world(units.filter((u) => u.eqid !== TP7), [own], [{ row: 5, col: 14 }], 3, false, [0, 1]);
	expect(east(playOneTurn(remasteredController(0), quiet).commands)).toBe(true);
});

test("a defender counterattacks a worn-down enemy out of its holes near its objective (#638, #5)", () => {
	//Germany defends its objective with an infantry on it and a Pz IVD beside it; a 7TP worn down to 3 has come up two
	//hexes from it
	const own = { row: 5, col: 5 }, far = { row: 5, col: 14 };
	const units = (tank: Partial<HandUnit>): HandUnit[] => [{ eqid: INFANTERIE, owner: 0, row: 5, col: 5 }, { eqid: PZ_IVD, owner: 0, row: 4, col: 5 },
		{ eqid: TP7, owner: 1, row: 5, col: 7, ...tank }, { eqid: PIECHOTA, owner: 1, row: 5, col: 14 }];
	const c = remasteredController(0);
	const turn = playOneTurn(c, world(units({ strength: 3 }), [own], [far], 3, false, [0, 1]));
	expect(c.directives.map((d) => d.task)).toEqual(["hold", "counterattack"]);
	expect(c.directives[1]).toMatchObject({ target: { row: 5, col: 7 }, until: 1 });
	expect(c.directives[1].reason).toMatch(/^counterattack 5,7: .+ worn down to 3 near our objective$/);
	expect(attacks(turn.commands)[0]).toEqual({ type: "attack", unit: 1, target: 2 });
	expect(position(turn.world, 0)).toEqual(own);
	//Not on a fresh one, nor on one dug in; and an attacker's units are its main effort's
	const tasks = (w: World) => commanded(w).map((d) => d.task);
	expect(tasks(world(units({}), [own], [far], 3, false, [0, 1]))).toEqual(["hold"]);
	expect(tasks(world(units({ strength: 3, entrenchment: 3 }), [own], [far], 3, false, [0, 1]))).toEqual(["hold"]);
	expect(tasks(world(units({ strength: 3 }), [own], [far], 3, false, [1, 0]))).toEqual(["hold", "assault"]);
});
