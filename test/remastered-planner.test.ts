// @vitest-environment node
//The remastered AI's planner (src/core/remastered/planner.ts, #627): the orders of the units no operation holds, one at
//a time on the world as it is, without the classic AI's plan; on hand-built maps
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";
import { aiController } from "../src/core/ai";
import type { Command } from "../src/core/command";
import { estimateAttack } from "../src/core/estimate";
import { distance } from "../src/core/geometry";
import type { Analysis } from "../src/core/remastered/analysis";
import { remasteredController } from "../src/core/remastered/controller";
import { step } from "../src/core/step";
import { terrainType } from "../src/core/tables";
import type { Position, UnitState, World } from "../src/core/types";
import { hexIndex, unitById } from "../src/core/world";
import type { HandUnit } from "./coreworld";
import { playOneTurn, position, scenarioWorld, world } from "./staffworld";

const INFANTERIE = 115, PZ_IVD = 148, OPEL_BLITZ = 157, LEFH18 = 92, ME_109E = 159, PIECHOTA = 270, TP7 = 273, TRANSPORTSCHIFFE = 546;
const GERMANY = 7;

const apart = (a: Position, b: Position) => distance(a.row, a.col, b.row, b.col);
const unit = (w: World, id: number) => unitById(w, id) as UnitState;
const moves = (cmds: readonly Command[], id: number) => cmds.filter((c) => c.type === "move" && c.unit === id);
const attacks = (cmds: readonly Command[]) => cmds.filter((c) => c.type === "attack");
const withTerrain = (w: World, at: Position, terrain: number, flag = -1) => {
	w.data.hexes[hexIndex(w, at.row, at.col)].terrain = terrain;
	w.state.map.hexes[hexIndex(w, at.row, at.col)].flag = flag;
	return w;
};

test("the remastered AI plays a turn without the classic planner (#627)", () => {
	//No module of the remastered AI reads the classic plan: only the controller takes the classic AI, for its turn's start
	const dir = path.resolve(__dirname, "../src/core/remastered");
	const sources = fs.readdirSync(dir).map((f) => ({ f, text: fs.readFileSync(path.join(dir, f), "utf8") }));
	expect(sources.filter((s) => /planTurn|aiscore/.test(s.text)).map((s) => s.f)).toEqual([]);
	expect(sources.filter((s) => /\baiController\b/.test(s.text)).map((s) => s.f)).toEqual(["controller.ts"]);
	//And it plays: a tank and an infantry march on the objective
	const units: HandUnit[] = [{ eqid: INFANTERIE, owner: 0, row: 2, col: 2 }, { eqid: PZ_IVD, owner: 0, row: 3, col: 2 },
		{ eqid: TP7, owner: 1, row: 10, col: 15 }];
	const objective = { row: 8, col: 12 }, w = world(units, [], [objective]);
	const turn = playOneTurn(remasteredController(0), w);
	expect(turn.refused).toBe(0);
	for (const id of [0, 1]) expect(apart(position(turn.world, id), objective)).toBeLessThan(apart(position(w, id), objective));
});

//Two of Poland's objectives at either end of the map, the southern one held by a worn-down infantry: the main effort.
//Germany's tanks and infantry on the western edge, three turns from either, and a tank four hexes from the northern one
const NORTH = { row: 1, col: 13 }, SOUTH = { row: 10, col: 13 };
const twoSectors: HandUnit[] = [{ eqid: PZ_IVD, owner: 0, row: 4, col: 1 }, { eqid: PZ_IVD, owner: 0, row: 7, col: 1 },
	{ eqid: INFANTERIE, owner: 0, row: 3, col: 1 }, { eqid: INFANTERIE, owner: 0, row: 8, col: 1 },
	{ eqid: PIECHOTA, owner: 1, row: 1, col: 13 }, { eqid: PIECHOTA, owner: 1, row: 10, col: 13, strength: 3 },
	{ eqid: PZ_IVD, owner: 0, row: 2, col: 9 }];

test("a free unit moves toward the main effort's sector (#627, #258)", () => {
	const w = world(twoSectors, [], [NORTH, SOUTH]);
	const c = remasteredController(0);
	const turn = playOneTurn(c, w);
	expect(c.directives.filter((d) => d.task === "assault")).toMatchObject([{ target: SOUTH }]);
	//The units in the west, the northern ones too, go south
	for (const id of [0, 1, 2, 3]) expect(apart(position(turn.world, id), SOUTH)).toBeLessThan(apart(position(w, id), SOUTH));
});

test("a unit near another objective goes for that one (#627)", () => {
	const w = world(twoSectors, [], [NORTH, SOUTH]);
	const turn = playOneTurn(remasteredController(0), w);
	expect(apart(position(turn.world, 6), NORTH)).toBeLessThan(apart(position(w, 6), NORTH));
	expect(apart(position(turn.world, 6), SOUTH)).toBeGreaterThanOrEqual(apart(position(w, 6), SOUTH));
});

test("a free unit takes an empty objective in its reach (#627)", () => {
	//An empty objective two hexes from the German infantry, a tank that could take it too, the Poles far away
	const units: HandUnit[] = [{ eqid: PZ_IVD, owner: 0, row: 6, col: 6 }, { eqid: INFANTERIE, owner: 0, row: 5, col: 6 },
		{ eqid: PIECHOTA, owner: 1, row: 5, col: 15 }];
	const objective = { row: 5, col: 8 }, w = world(units, [], [objective, { row: 5, col: 15 }]);
	const turn = playOneTurn(remasteredController(0), w);
	expect(turn.commands[0]).toEqual({ type: "move", unit: 1, to: objective });
	expect(turn.world.state.map.hexes[hexIndex(w, objective.row, objective.col)].owner).toBe(0);
	expect(turn.world.state.objectives[0]).toEqual([{ row: 5, col: 15 }]);
});

test("artillery stays out of the enemy's reach and in range of the front (#627, #234)", () => {
	//A leFH 18 on its Opel Blitz far from Poland's objective, which an infantry holds; a commander that gives no
	//directive, so no assault brings the gun up: the planner does
	const units: HandUnit[] = [{ eqid: LEFH18, owner: 0, row: 5, col: 1, transport: { eqid: OPEL_BLITZ, ammo: 0, fuel: 50 } },
		{ eqid: PIECHOTA, owner: 1, row: 5, col: 12 }, { eqid: PZ_IVD, owner: 0, row: 6, col: 1 }];
	const objective = { row: 5, col: 12 }, w = world(units, [], [objective]);
	const c = remasteredController(0, () => []);
	const turn = playOneTurn(c, w);
	expect(c.operations).toEqual([]);
	const gun = position(turn.world, 0), reach = w.equipment[PIECHOTA].movpoints + 1;
	expect(apart(gun, objective)).toBeLessThanOrEqual(w.equipment[LEFH18].gunrange + 2);
	expect(apart(gun, objective)).toBeGreaterThan(reach);
	expect(turn.refused).toBe(0);
});

test("a unit with nothing to do stays entrenched (#627)", () => {
	//Germany defends and has nothing to take: its infantry is dug in beside a town, no enemy near. The classic AI walks
	//it into the town, for the cover; the remastered AI leaves it in its holes
	const units: HandUnit[] = [{ eqid: INFANTERIE, owner: 0, row: 5, col: 5, entrenchment: 1 }, { eqid: PIECHOTA, owner: 1, row: 5, col: 15 }];
	const w = withTerrain(world(units, [{ row: 2, col: 2 }], [], 3, false, [0, 1]), { row: 5, col: 6 }, terrainType.City);
	expect(moves(playOneTurn(aiController(0), w).commands, 0)).toHaveLength(1);
	const turn = playOneTurn(remasteredController(0), w);
	expect(moves(turn.commands, 0)).toEqual([]);
	expect(unit(turn.world, 0).entrenchment).toBe(1);
});

test("the planner gives no attack the estimate says loses more than it kills (#627)", () => {
	//German infantry beside a 7TP dug in in the open, another beside a worn-down Polish infantry; the objective far away,
	//so neither is the assault's target
	const units: HandUnit[] = [{ eqid: INFANTERIE, owner: 0, row: 5, col: 7 }, { eqid: TP7, owner: 1, row: 5, col: 8, entrenchment: 3 },
		{ eqid: INFANTERIE, owner: 0, row: 9, col: 7 }, { eqid: PIECHOTA, owner: 1, row: 9, col: 8, strength: 3 }];
	const w = world(units, [], [{ row: 1, col: 15 }]);
	const bad = estimateAttack(w, unit(w, 0), unit(w, 1)), good = estimateAttack(w, unit(w, 2), unit(w, 3));
	expect(bad.result.losses).toBeGreaterThan(bad.result.kills);
	expect(good.result.kills).toBeGreaterThan(good.result.losses);
	const turn = playOneTurn(remasteredController(0), w);
	expect(attacks(turn.commands).filter((c) => c.type === "attack" && c.target === 1)).toEqual([]);
	expect(attacks(turn.commands)).toContainEqual({ type: "attack", unit: 2, target: 3 });
});

test("a worn-down unit attacks only where it kills more than it loses (#627, #6)", () => {
	//A German infantry beside a Polish one: at full strength against the Poles dug in, and worn down to 4 against them
	//in the open, the estimate gives a kill for a loss. The first attacks, the second spares itself
	const beside = (strength: number, entrenchment: number): HandUnit[] => [{ eqid: INFANTERIE, owner: 0, row: 5, col: 7, strength },
		{ eqid: PIECHOTA, owner: 1, row: 5, col: 8, entrenchment }];
	const fresh = world(beside(10, 2), [], [{ row: 1, col: 15 }]), worn = world(beside(4, 0), [], [{ row: 1, col: 15 }]);
	for (const w of [fresh, worn]) expect(estimateAttack(w, unit(w, 0), unit(w, 1)).result).toMatchObject({ kills: 1, losses: 1 });
	expect(attacks(playOneTurn(remasteredController(0), fresh).commands)).toEqual([{ type: "attack", unit: 0, target: 1 }]);
	expect(attacks(playOneTurn(remasteredController(0), worn).commands)).toEqual([]);
});

test("a worn-down unit marches where the enemy doesn't reach it (#627, #6)", () => {
	//Two 7TP north of the road to Poland's objective: an infantry at full strength takes the hex nearest it, in their
	//reach; worn down to 3 it goes round, out of it
	const marching = (strength: number): HandUnit[] => [{ eqid: INFANTERIE, owner: 0, row: 6, col: 2, strength },
		{ eqid: TP7, owner: 1, row: 2, col: 7 }, { eqid: TP7, owner: 1, row: 2, col: 8 }];
	const threatAfter = (strength: number) => {
		const w = world(marching(strength), [], [{ row: 6, col: 14 }]), c = remasteredController(0);
		const turn = playOneTurn(c, w), at = position(turn.world, 0);
		expect(at.col).toBeGreaterThan(2);
		return (c.analysis as Analysis).threat.ground[hexIndex(w, at.row, at.col)];
	};
	expect(threatAfter(10)).toBeGreaterThan(0);
	expect(threatAfter(3)).toBe(0);
});

test("the planner's turn is the same played twice (#627)", () => {
	//The same game with another position of the AI's stream: the planner draws from none, so it gives the same orders
	const w = world(twoSectors, [], [NORTH, SOUTH]), other = world(twoSectors, [], [NORTH, SOUTH]);
	other.state.rng = { game: 3, ai: 1 };
	const first = playOneTurn(remasteredController(0), w), again = playOneTurn(remasteredController(0), w);
	expect(first.commands.length).toBeGreaterThan(4);
	expect(again.commands).toEqual(first.commands);
	const elsewhere = playOneTurn(remasteredController(0), other);
	expect(elsewhere.commands).toEqual(first.commands);
	expect(elsewhere.world.state.rng).toMatchObject({ ai: 1 });
});

test("an aircraft out of ammunition returns to an airfield (#627)", () => {
	//A Me-109 over the front with no ammunition left, Germany's airfield eight hexes behind it
	const airfield = { row: 5, col: 2 };
	const units: HandUnit[] = [{ eqid: ME_109E, owner: 0, row: 5, col: 10, ammo: 0 }, { eqid: PIECHOTA, owner: 1, row: 5, col: 14 },
		{ eqid: INFANTERIE, owner: 0, row: 6, col: 9 }];
	const w = withTerrain(world(units, [], [{ row: 5, col: 14 }]), airfield, terrainType.Airfield, GERMANY);
	const classic = playOneTurn(aiController(0), w);
	expect(position(classic.world, 0)).not.toEqual(airfield);
	const c = remasteredController(0);
	const turn = playOneTurn(c, w);
	expect(position(turn.world, 0)).toEqual(airfield);
	//And is given its ammunition there in its next turn
	const rested = turn.world.state.units.map((u) => ({ ...u, hasMoved: false, hasFired: false, hasResupplied: false }));
	const next: World = { ...turn.world, state: { ...turn.world.state, units: rested } };
	expect(playOneTurn(c, next).commands).toContainEqual({ type: "resupply", unit: 0 });
});

test("a unit on a naval transport is carried to its objective and lands beside it (#627)", () => {
	//The sea west of column 6; an Infanterie on a Transportschiffe, Poland's objective eight hexes inland of the shore,
	//then three: too far to march, it sails on; near enough, it lands. The classic AI never lands a unit
	const sea = (w: World) => {
		for (let row = 0; row < 12; row++) for (let col = 0; col < 6; col++) withTerrain(w, { row, col }, terrainType.Ocean);
		return w;
	};
	const afloat = (col: number): HandUnit[] => [{ eqid: INFANTERIE, owner: 0, row: 5, col, carrier: TRANSPORTSCHIFFE },
		{ eqid: PIECHOTA, owner: 1, row: 5, col: 15 }];
	const far = sea(world(afloat(1), [], [{ row: 5, col: 14 }]));
	const sailed = playOneTurn(remasteredController(0), far);
	expect(unit(sailed.world, 0).carrier).toBe(TRANSPORTSCHIFFE);
	expect(position(sailed.world, 0).col).toBeGreaterThan(1);
	const near = sea(world(afloat(5), [], [{ row: 5, col: 9 }]));
	const landed = playOneTurn(remasteredController(0), near);
	expect(landed.commands.slice(0, 2)).toMatchObject([{ type: "disembark", unit: 0 }, { type: "move", unit: 0 }]);
	expect(unit(landed.world, 0).carrier).toBe(0);
	expect(position(landed.world, 0).col).toBe(6);
	expect(landed.refused).toBe(0);
	expect(playOneTurn(aiController(0), near).commands.some((c) => c.type === "disembark")).toBe(false);
});

test("the AI stream moves only at the turn's start (#627)", () => {
	//Germany's first turn of Panzer-Verbaende Ostpreussen: its purchases draw from the AI's stream, its orders don't
	const w = scenarioWorld("drpzop01.xml");
	const stream = (x: World) => x.state.rng?.ai;
	const c = remasteredController(0);
	const started = c.startTurn(c.join(w).world).world;
	expect(started.state.units.length).toBeGreaterThan(w.state.units.length);
	expect(stream(started)).not.toBe(stream(w));
	let now = c.plan(started), orders = 0;
	expect(stream(now)).toBe(stream(started));
	for (let o = c.next(now); o !== null && orders < 500; o = c.next(now)) {
		if (!("command" in o)) continue;
		const r = step(now, o.command);
		expect(r.ok).toBe(true);
		if (r.ok) now = r.world;
		orders++;
	}
	expect(orders).toBeGreaterThan(20);
	expect(stream(now)).toBe(stream(started));
	//The classic AI's plan draws its scores' noise from it
	const classic = aiController(0), its = classic.startTurn(classic.join(w).world).world;
	expect(stream(classic.plan(its))).not.toBe(stream(its));
}, 60_000);
