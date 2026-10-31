// @vitest-environment node
//The remastered AI's staff (src/core/remastered/staff.ts, #616): one owner per unit, the operations, the plan made
//again on the world as it is, the garrisons of the objectives in the enemy's reach (#5) and the occupation of an
//objective its attack emptied (#312); on hand-built maps, and a few turns of Panzer-Verbaende Ostpreussen
import { JSDOM } from "jsdom";
import { expect, test } from "vitest";
import { aiController, planTurn } from "../src/core/ai";
import type { Command } from "../src/core/command";
import type { Controller } from "../src/core/controller";
import { createWorld } from "../src/core/create";
import { distance } from "../src/core/geometry";
import { newGame } from "../src/core/newgame";
import { aiControllerFor, remasteredController } from "../src/core/remastered/controller";
import { classicRules, remasterRules } from "../src/core/rules";
import { type Advance, advance, type Session, startSession } from "../src/core/session";
import { check } from "../src/core/step";
import { playerType } from "../src/core/tables";
import type { RulesetName, UnitState, World } from "../src/core/types";
import { hexIndex, unitById } from "../src/core/world";
import { setupOf } from "./corefiles";
import type { HandUnit } from "./coreworld";
import { playOneTurn, position, world } from "./staffworld";

const INFANTERIE = 115, PZ_IVD = 148, PIECHOTA = 270, TP7 = 273;

test("the remastered AI garrisons an objective in the enemy's reach (#616, #5)", () => {
	//Germany's objective on 5,3, its tank four hexes east of it, Poland's objective to take three hexes further; a 7TP
	//two of its moves from Germany's. The classic AI marches on Poland's objective and leaves its own empty
	const units: HandUnit[] = [{ eqid: PZ_IVD, owner: 0, row: 5, col: 7 }, { eqid: TP7, owner: 1, row: 5, col: 11 }];
	const w = world(units, [{ row: 5, col: 3 }], [{ row: 4, col: 10 }]);
	const classic = playOneTurn(aiController(0), w);
	expect(position(classic.world, 0)).not.toEqual({ row: 5, col: 3 });
	const c = remasteredController(0);
	const remastered = playOneTurn(c, w);
	expect(position(remastered.world, 0)).toEqual({ row: 5, col: 3 });
	expect(c.operations).toMatchObject([{ kind: "garrison", at: { row: 5, col: 3 }, units: [0], reason: "garrison 5,3: enemy 8 hexes away" }]);
});

test("a garrison doesn't leave its objective to attack (#616, #5)", () => {
	//A tank on Germany's objective, a worn-down Polish infantry two hexes off: the classic AI goes for it
	const units: HandUnit[] = [{ eqid: PZ_IVD, owner: 0, row: 5, col: 3 }, { eqid: PIECHOTA, owner: 1, row: 5, col: 5, strength: 3 }];
	const w = world(units, [{ row: 5, col: 3 }], [{ row: 5, col: 12 }]);
	const classic = playOneTurn(aiController(0), w);
	expect(position(classic.world, 0)).not.toEqual({ row: 5, col: 3 });
	const remastered = playOneTurn(remasteredController(0), w);
	expect(position(remastered.world, 0)).toEqual({ row: 5, col: 3 });
	expect(remastered.commands.filter((cmd) => cmd.type === "move" || cmd.type === "attack")).toEqual([]);
});

test("a garrison fires from its objective when the estimate gives more kills than losses (#616, #5)", () => {
	//A worn-down Polish infantry next to the tank on Germany's objective, Poland's objective five hexes off: the
	//classic AI drives for it; the garrison hits the infantry without leaving its hex
	const units: HandUnit[] = [{ eqid: PZ_IVD, owner: 0, row: 5, col: 3 }, { eqid: PIECHOTA, owner: 1, row: 6, col: 3, strength: 4 }];
	const w = world(units, [{ row: 5, col: 3 }], [{ row: 5, col: 8 }]);
	const classic = playOneTurn(aiController(0), w);
	expect(classic.commands).not.toContainEqual({ type: "attack", unit: 0, target: 1 });
	const remastered = playOneTurn(remasteredController(0), w);
	expect(remastered.commands).toContainEqual({ type: "attack", unit: 0, target: 1 });
	expect(position(remastered.world, 0)).toEqual({ row: 5, col: 3 });
});

test("an objective whose garrison was destroyed gets a new one the same turn (#616)", () => {
	//The infantry on the objective is its garrison; a tank waits two hexes off. The garrison is gone after the
	//plan: the tank takes its place before anything else
	const units: HandUnit[] = [{ eqid: INFANTERIE, owner: 0, row: 5, col: 3 }, { eqid: PZ_IVD, owner: 0, row: 5, col: 1 },
		{ eqid: TP7, owner: 1, row: 5, col: 10 }];
	const w = world(units, [{ row: 5, col: 3 }], [{ row: 5, col: 14 }]);
	const c = remasteredController(0);
	const lost = (x: World, n: number) => n === 0 ? without(x, 0) : x;
	const turn = playOneTurn(c, w, lost);
	expect(turn.commands[0]).toEqual({ type: "move", unit: 1, to: { row: 5, col: 3 } });
	expect(c.operations).toMatchObject([{ kind: "garrison", at: { row: 5, col: 3 }, units: [1] }]);
});

//The world without the unit, as if destroyed
function without(w: World, id: number): World {
	const u = unitById(w, id) as UnitState;
	const hexes = w.state.map.hexes.map((h, i) => i === hexIndex(w, u.row, u.col) ? { ...h, unit: null } : h);
	const state = { ...w.state, units: w.state.units.filter((x) => x.id !== id), map: { ...w.state.map, hexes } };
	return createWorld({ data: w.data, state }, w.equipment, { rules: w.rules, noFOW: true });
}

test("the remastered AI moves onto an enemy objective it just emptied (#616, #312)", () => {
	//A Pz IVD next to Poland's objective, held by a worn-down infantry; a German infantry two hexes off is planned
	//first, before the attack, and the classic AI sends it elsewhere: the hex stays empty after the attack. A German
	//unit that can still move goes in
	const units: HandUnit[] = [{ eqid: INFANTERIE, owner: 0, row: 5, col: 6 }, { eqid: PZ_IVD, owner: 0, row: 5, col: 7 },
		{ eqid: PIECHOTA, owner: 1, row: 5, col: 8, strength: 2 }];
	const objective = { row: 5, col: 8 };
	const w = world(units, [], [objective, { row: 1, col: 14 }]);
	const classic = playOneTurn(aiController(0), w);
	expect(classic.commands).toContainEqual({ type: "attack", unit: 1, target: 2 });
	expect(unitById(classic.world, 2)).toBeNull();
	expect(classic.world.state.map.hexes[hexIndex(w, 5, 8)].unit).toBeNull();
	const remastered = playOneTurn(remasteredController(0), w);
	const hex = remastered.world.state.map.hexes[hexIndex(w, 5, 8)];
	expect(hex.owner).toBe(0);
	expect((unitById(remastered.world, hex.unit as number) as UnitState).owner).toBe(0);
});

test("a unit the staff holds gets no order from the classic plan (#616)", () => {
	const units: HandUnit[] = [{ eqid: INFANTERIE, owner: 0, row: 5, col: 6 }, { eqid: PZ_IVD, owner: 0, row: 3, col: 6 },
		{ eqid: TP7, owner: 1, row: 5, col: 10 }];
	const w = world(units, [], [{ row: 5, col: 14 }]);
	const all = planTurn(w, 0, w.rules.ai.config, 0).queue;
	const free = planTurn(w, 0, w.rules.ai.config, 0, { held: new Set([0]) }).queue;
	expect(all.some((cmd) => "unit" in cmd && cmd.unit === 0)).toBe(true);
	expect(free.some((cmd) => "unit" in cmd && cmd.unit === 0)).toBe(false);
	expect(free.length).toBeGreaterThan(0);
});

test("with no objective in reach and no attack the remastered AI gives the classic AI's commands (#616)", () => {
	const units: HandUnit[] = [{ eqid: INFANTERIE, owner: 0, row: 2, col: 2 }, { eqid: PZ_IVD, owner: 0, row: 3, col: 2 },
		{ eqid: TP7, owner: 1, row: 10, col: 15 }];
	const w = world(units, [], [{ row: 8, col: 12 }]);
	const classic = playOneTurn(aiController(0), w), remastered = playOneTurn(remasteredController(0), w);
	expect(remastered.commands.length).toBeGreaterThan(0);
	expect(remastered.commands).toEqual(classic.commands);
	expect(remastered.world.state).toEqual(classic.world.state);
});

//Panzer-Verbaende Ostpreussen's start, in the rules given, every player the AI
function ostpreussen(rules: RulesetName = "remaster", seed = 5): World {
	const setup = { ...setupOf("drpzop01.xml", { game: seed, ai: seed + 7919 }, null, undefined, [], new new JSDOM().window.DOMParser()),
		rules: rules === "remaster" ? remasterRules : classicRules };
	const created = newGame(setup);
	for (const p of created.state.players) p.type = playerType.aiLocal;
	return createWorld(created, setup.equipment, { spotSide: -1, rules: setup.rules });
}

interface Played {
	orders: unknown[];
	refused: [number, number];
	session: Session;
}

type Watch = (before: World, order: Command) => void;

//The turns played by the controllers made, every order given and the refused ones by side
function played(s: Session, turns: number, watch: Watch = () => {}): Played {
	const p: Played = { orders: [], refused: [0, 0], session: s };
	for (let n = 0; n < 20_000 && s.ended === null && s.world.state.turn.turn <= turns; n++) {
		const before = s.world;
		const a = advance(s);
		if (a.kind === "ended") break;
		if (a.kind === "order") ordered(p, before, a, watch);
		else p.orders.push({ end: a.player, started: a.started?.commands });
	}
	return p;
}

function ordered(p: Played, before: World, a: Extract<Advance, { kind: "order" }>, watch: Watch) {
	if ("command" in a.order) watch(before, a.order.command);
	if (a.refusal !== null) p.refused[before.state.players[a.player].side]++;
	p.orders.push(a.order);
}

const fresh = (w: World, make: (player: number) => Controller) => startSession(w, (_type, p) => make(p), { fresh: true, localSide: -1 });

test("the remastered AI gives no order the core refuses (#616)", () => {
	const remastered = played(fresh(ostpreussen(), remasteredController), 4);
	expect(remastered.orders.length).toBeGreaterThan(100);
	expect(remastered.refused).toEqual([0, 0]);
	//The classic AI's plan made at the turn's start has orders the turn's fighting overtook
	const classic = played(fresh(ostpreussen(), aiController), 4);
	expect(classic.refused[0] + classic.refused[1]).toBeGreaterThan(0);
}, 60_000);

test("a garrison holds its objective and the classic plan never orders it (#616, #5)", () => {
	const made: ReturnType<typeof remasteredController>[] = [];
	let garrisonOrders = 0;
	//Every order of a unit a garrison holds is the garrison's: toward its objective, or from it
	const watch = (w: World, cmd: Command) => {
		const c = made[w.state.turn.currentPlayer];
		const op = "unit" in cmd ? c.operations.find((o) => o.kind === "garrison" && o.units.includes(cmd.unit)) : undefined;
		if (op === undefined || !("unit" in cmd)) return;
		garrisonOrders++;
		const u = unitById(w, cmd.unit) as UnitState;
		const from = distance(u.row, u.col, op.at.row, op.at.col);
		if (cmd.type === "move") expect(distance(cmd.to.row, cmd.to.col, op.at.row, op.at.col)).toBeLessThan(from);
		else if (cmd.type !== "mount") expect(from).toBe(0);
	};
	const make = (p: number) => made[p] = remasteredController(p);
	played(fresh(ostpreussen(), make), 8, watch);
	expect(garrisonOrders).toBeGreaterThan(0);
}, 60_000);

test("the operations are rebuilt the same after two loads of a save (#616)", () => {
	const first = played(fresh(ostpreussen(), remasteredController), 3);
	const saved = first.session.saved as World;
	const load = () => {
		const made: ReturnType<typeof remasteredController>[] = [];
		const s = startSession({ ...saved, state: structuredClone(saved.state) }, (_type, p) => made[p] = remasteredController(p), { loaded: true, localSide: -1 });
		const turn = saved.state.turn.turn;
		const ops = made[saved.state.turn.currentPlayer].operations.map((op) => ({ ...op }));
		return { ops, played: played(s, turn).orders };
	};
	const a = load(), b = load();
	expect(a.ops.length).toBeGreaterThan(0);
	expect(b).toEqual(a);
}, 60_000);

test("in the classic rules the AI plays the classic plan, unchanged (#616)", () => {
	const w = ostpreussen("classic");
	expect(aiControllerFor(w, 0)).not.toHaveProperty("operations");
	const classic = played(fresh(w, aiController), 3), chosen = played(fresh(ostpreussen("classic"), (p) => aiControllerFor(w, p)), 3);
	expect(chosen.orders).toEqual(classic.orders);
	expect(chosen.session.world.state).toEqual(classic.session.world.state);
	//And every order of the classic AI is one `check` would allow or refuse the same way the session does
	expect(classic.orders.length).toBeGreaterThan(50);
	expect(check(w, { type: "endTurn" })).toBeNull();
}, 60_000);
