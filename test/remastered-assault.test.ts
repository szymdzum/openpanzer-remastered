// @vitest-environment node
//The remastered AI's assault doctrine (src/core/remastered/assault.ts, #618): one sector at a time, the units sent to
//it, and the order of arms on it: reconnaissance, artillery, the armoured attack, the infantry occupying; on
//hand-built maps
import { expect, test } from "vitest";
import { aiController, planTurn } from "../src/core/ai";
import type { Command } from "../src/core/command";
import { distance } from "../src/core/geometry";
import { remasteredController } from "../src/core/remastered/controller";
import type { Position, World } from "../src/core/types";
import { hexIndex, isSpotted } from "../src/core/world";
import type { HandUnit } from "./coreworld";
import { playOneTurn, position, world } from "./staffworld";




const PAK36 = 66, INFANTERIE = 115, PSW_222 = 117, PZ_IVD = 148, OPEL_BLITZ = 157, PIECHOTA = 270, LEFH18 = 92, LEFK18 = 95, WZ97 = 264;

const apart = (a: Position, b: Position) => distance(a.row, a.col, b.row, b.col);
const attacks = (cmds: readonly Command[]) => cmds.filter((c) => c.type === "attack");
const attackBy = (cmds: readonly Command[], id: number) => cmds.findIndex((c) => c.type === "attack" && c.unit === id);

//Two of Poland's objectives at either end of the map, the southern one held by a worn-down infantry; Germany's tanks
//and infantry on the western edge, three turns from either
const NORTH = { row: 1, col: 13 }, SOUTH = { row: 10, col: 13 };
const twoSectors: HandUnit[] = [{ eqid: PZ_IVD, owner: 0, row: 4, col: 1 }, { eqid: PZ_IVD, owner: 0, row: 7, col: 1 },
	{ eqid: INFANTERIE, owner: 0, row: 3, col: 1 }, { eqid: INFANTERIE, owner: 0, row: 8, col: 1 },
	{ eqid: PIECHOTA, owner: 1, row: 1, col: 13 }, { eqid: PIECHOTA, owner: 1, row: 10, col: 13, strength: 3 }];

test("the remastered AI assaults one sector, not every objective at once (#618, #233)", () => {
	const w = world(twoSectors, [], [NORTH, SOUTH]);
	//The classic AI sends each unit to its nearest objective: the force splits
	const classic = playOneTurn(aiController(0), w);
	const nearer = (t: World, id: number, o: Position) => apart(position(t, id), o) < apart(position(w, id), o);
	expect([0, 1, 2, 3].some((id) => nearer(classic.world, id, NORTH))).toBe(true);
	expect([0, 1, 2, 3].some((id) => nearer(classic.world, id, SOUTH))).toBe(true);
	const c = remasteredController(0);
	const remastered = playOneTurn(c, w);
	expect(c.operations.filter((op) => op.kind === "assault")).toMatchObject([{ at: SOUTH }]);
	expect([0, 1, 2, 3].every((id) => apart(position(remastered.world, id), SOUTH) <= apart(position(w, id), SOUTH))).toBe(true);
});

test("units far from the sector move toward it, not to their nearest objective (#618, #258)", () => {
	//Two PaK 36 in the middle of the map, four turns' march from the western objective and one hex nearer it than the
	//eastern one; the west is held by three infantry, the east by one
	const units: HandUnit[] = [{ eqid: PAK36, owner: 0, row: 5, col: 7 }, { eqid: PAK36, owner: 0, row: 6, col: 7 },
		{ eqid: PIECHOTA, owner: 1, row: 5, col: 0 }, { eqid: PIECHOTA, owner: 1, row: 4, col: 0 }, { eqid: PIECHOTA, owner: 1, row: 6, col: 0 },
		{ eqid: PIECHOTA, owner: 1, row: 5, col: 15 }];
	const west = { row: 5, col: 0 }, east = { row: 5, col: 15 };
	const w = world(units, [], [west, east]);
	expect(apart(position(w, 0), west)).toBeLessThan(apart(position(w, 0), east));
	const classic = playOneTurn(aiController(0), w);
	expect([0, 1].some((id) => apart(position(classic.world, id), west) < apart(position(w, id), west))).toBe(true);
	const remastered = playOneTurn(remasteredController(0), w);
	for (const id of [0, 1]) expect(apart(position(remastered.world, id), east)).toBeLessThan(apart(position(w, id), east));
});

test("the artillery fires before the armour attacks (#618, #234)", () => {
	//A Pz IVD three hexes from the Polish infantry on the objective, a leFK 18 on its Opel Blitz a step out of range: the
	//classic AI drives the gun up on its truck, which uses its shot, and the tank attacks alone
	const units: HandUnit[] = [{ eqid: PZ_IVD, owner: 0, row: 5, col: 7 },
		{ eqid: LEFK18, owner: 0, row: 5, col: 5, transport: { eqid: OPEL_BLITZ, ammo: 0, fuel: 50 } }, { eqid: PIECHOTA, owner: 1, row: 5, col: 10 }];
	const w = world(units, [], [{ row: 5, col: 10 }]);
	const classic = playOneTurn(aiController(0), w);
	expect(attackBy(classic.commands, 1)).toBe(-1);
	const remastered = playOneTurn(remasteredController(0), w);
	expect(attackBy(remastered.commands, 1)).toBeGreaterThanOrEqual(0);
	expect(attackBy(remastered.commands, 1)).toBeLessThan(attackBy(remastered.commands, 0));
	expect(remastered.refused).toBe(0);
});

test("the artillery fires first on the enemy artillery that would support the target (#618)", () => {
	//A Polish 75 mm gun behind the infantry on the objective covers it against the Pz IVD: the leFH 18 fires on the gun
	//first. The classic AI fires on the infantry, its target on an objective worth more
	const units: HandUnit[] = [{ eqid: PZ_IVD, owner: 0, row: 6, col: 7 }, { eqid: LEFH18, owner: 0, row: 5, col: 7 },
		{ eqid: PIECHOTA, owner: 1, row: 5, col: 10 }, { eqid: WZ97, owner: 1, row: 5, col: 12, entrenchment: 2 }];
	const w = world(units, [], [{ row: 5, col: 10 }]);
	const classic = playOneTurn(aiController(0), w);
	expect(attacks(classic.commands)[0]).toEqual({ type: "attack", unit: 1, target: 2 });
	const remastered = playOneTurn(remasteredController(0), w);
	expect(attacks(remastered.commands)[0]).toEqual({ type: "attack", unit: 1, target: 3 });
});

test("artillery that can't fire this turn moves into range of the sector for the next (#618, #234)", () => {
	//A leFH 18 on its Opel Blitz far from the southern objective; the classic AI drives it toward the nearest one, in
	//the north
	const units: HandUnit[] = [{ eqid: LEFH18, owner: 0, row: 6, col: 2, transport: { eqid: OPEL_BLITZ, ammo: 0, fuel: 50 } },
		{ eqid: PIECHOTA, owner: 1, row: 9, col: 12 }, { eqid: PIECHOTA, owner: 1, row: 1, col: 5 }, { eqid: PIECHOTA, owner: 1, row: 1, col: 6 },
		{ eqid: PIECHOTA, owner: 1, row: 2, col: 6 }, { eqid: PZ_IVD, owner: 0, row: 7, col: 3 }, { eqid: PZ_IVD, owner: 0, row: 8, col: 3 }];
	const sector = { row: 9, col: 12 };
	const w = world(units, [], [sector, { row: 1, col: 5 }]);
	const inRange = (t: World) => apart(position(t, 0), sector) <= w.equipment[LEFH18].gunrange + 2;
	const outOfReach = (t: World) => [1, 2, 3, 4].every((id) => apart(position(t, 0), position(t, id)) > 4);
	expect(inRange(w)).toBe(false);
	const classic = playOneTurn(aiController(0), w);
	expect(inRange(classic.world) && outOfReach(classic.world)).toBe(false);
	const remastered = playOneTurn(remasteredController(0), w);
	expect(inRange(remastered.world)).toBe(true);
	expect(outOfReach(remastered.world)).toBe(true);
});

test("recon moves before the assault to spot the sector (#618)", () => {
	//In the fog, a Psw 222 behind a Pz IVD; the Polish infantry on the objective and a gun behind it unseen. The
	//classic AI moves the tank first, in the list's order
	const units: HandUnit[] = [{ eqid: PZ_IVD, owner: 0, row: 5, col: 3 }, { eqid: PSW_222, owner: 0, row: 6, col: 3 },
		{ eqid: PIECHOTA, owner: 1, row: 5, col: 11 }, { eqid: WZ97, owner: 1, row: 5, col: 13 }];
	const sector = { row: 5, col: 11 };
	const w = world(units, [], [sector], 3, true);
	const spotted = (t: World) => [...Array(t.state.map.rows * t.state.map.cols).keys()]
		.filter((h) => apart({ row: Math.floor(h / 16), col: h % 16 }, sector) <= 4 && isSpotted(t, h, 0)).length;
	const classic = playOneTurn(aiController(0), w);
	expect(classic.commands[0]).not.toMatchObject({ type: "move", unit: 1 });
	const c = remasteredController(0);
	let before = -1, after = -1;
	playOneTurn(c, w, (t, n) => {
		if (n === 0) before = spotted(t);
		if (n === 1) after = spotted(t);
		return t;
	});
	const remastered = playOneTurn(remasteredController(0), w);
	expect(remastered.commands[0]).toMatchObject({ type: "move", unit: 1 });
	expect(after).toBeGreaterThan(before);
});

test("the AI doesn't order an attack the estimate says loses more than it kills (#618)", () => {
	//German infantry beside a 7TP entrenched on the objective: the classic AI attacks, for the objective's worth
	const units: HandUnit[] = [{ eqid: INFANTERIE, owner: 0, row: 5, col: 7 }, { eqid: 273, owner: 1, row: 5, col: 8, entrenchment: 3 }];
	const w = world(units, [], [{ row: 5, col: 8 }]);
	const classic = playOneTurn(aiController(0), w);
	expect(attacks(classic.commands)).toEqual([{ type: "attack", unit: 0, target: 1 }]);
	const remastered = playOneTurn(remasteredController(0), w);
	expect(attacks(remastered.commands)).toEqual([]);
});

test("in the last turns the AI attacks the objective whatever it costs (#618)", () => {
	const units: HandUnit[] = [{ eqid: INFANTERIE, owner: 0, row: 5, col: 7 }, { eqid: 273, owner: 1, row: 5, col: 8, entrenchment: 3 }];
	const w = world(units, [], [{ row: 5, col: 8 }]);
	w.state.turn.turn = 8;
	expect(attacks(playOneTurn(remasteredController(0), w).commands)).toEqual([{ type: "attack", unit: 0, target: 1 }]);
});

test("infantry occupies the objective the assault emptied (#618, #312)", () => {
	//A worn-down Polish infantry on the objective, German infantry beside it and two Pz IVD behind: the classic plan
	//sends the infantry in first, in the list's order, and a tank takes the hex. The assault's armour goes first, and
	//the infantry moves in
	const units: HandUnit[] = [{ eqid: INFANTERIE, owner: 0, row: 6, col: 8 }, { eqid: PZ_IVD, owner: 0, row: 5, col: 6 },
		{ eqid: PZ_IVD, owner: 0, row: 4, col: 6 }, { eqid: PIECHOTA, owner: 1, row: 5, col: 9, strength: 3 }];
	const objective = { row: 5, col: 9 };
	const w = world(units, [], [objective, { row: 1, col: 14 }]);
	const remastered = playOneTurn(remasteredController(0), w);
	expect(attacks(remastered.commands)[0]).toMatchObject({ unit: 1, target: 3 });
	const hex = remastered.world.state.map.hexes[hexIndex(w, objective.row, objective.col)];
	expect(hex.unit).toBe(0);
	expect(hex.owner).toBe(0);
});

test("the assault keeps its sector across turns (#618)", () => {
	const w = world(twoSectors, [], [NORTH, SOUTH]);
	const c = remasteredController(0);
	const first = playOneTurn(c, w);
	const [op] = c.operations.filter((o) => o.kind === "assault");
	expect(op).toMatchObject({ at: SOUTH });
	//Poland's next turn brings a second infantry beside the southern objective: the north now ranks a little better,
	//but the assault goes on
	const next = world([...first.world.state.units.map((u) => ({ ...u, hasMoved: false, hasFired: false })),
		{ eqid: PIECHOTA, owner: 1, row: 9, col: 13 }], [], [NORTH, SOUTH]);
	next.state.turn.turn = 2;
	const fresh = remasteredController(0);
	playOneTurn(fresh, next);
	expect(fresh.operations.find((o) => o.kind === "assault")).toMatchObject({ at: NORTH });
	playOneTurn(c, next);
	expect(c.operations.find((o) => o.kind === "assault")).toBe(op);
});

test("without a pull the classic plan goes for the nearest objective as before (#618)", () => {
	const w = world(twoSectors, [], [NORTH, SOUTH]);
	const plain = planTurn(w, 0, w.rules.ai.config, 0).queue;
	expect(planTurn(w, 0, w.rules.ai.config, 0, { pullTo: () => w.state.objectives[0] }).queue).toEqual(plain);
	expect(planTurn(w, 0, w.rules.ai.config, 0, { pullTo: () => [SOUTH] }).queue).not.toEqual(plain);
});
