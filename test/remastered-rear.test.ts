// @vitest-environment node
//The remastered AI's staff, part 2 (#617): a resupply before contact, no ride ending in the enemy's reach (#315); on
//hand-built maps
import { expect, test } from "vitest";
import { aiController, planTurn } from "../src/core/ai";
import { distance } from "../src/core/geometry";
import { remasteredController } from "../src/core/remastered/controller";
import type { UnitState, World } from "../src/core/types";
import { unitById } from "../src/core/world";
import type { HandUnit } from "./coreworld";
import { playOneTurn, world } from "./staffworld";

const PZ_IVD = 148, PAK36 = 66, OPEL_BLITZ = 157, TP7 = 273;

const unit = (w: World, id: number) => unitById(w, id) as UnitState;
const apart = (w: World, a: number, b: number) => distance(unit(w, a).row, unit(w, a).col, unit(w, b).row, unit(w, b).col);

test("a unit short of ammunition resupplies before it reaches the enemy (#617)", () => {
	//A Pz IVD with 3 of its 11 shells, the 7TP far out of reach: the classic AI drives on
	const units: HandUnit[] = [{ eqid: PZ_IVD, owner: 0, row: 5, col: 2, ammo: 3 }, { eqid: TP7, owner: 1, row: 5, col: 14 }];
	const w = world(units, [], [{ row: 5, col: 9 }]);
	const classic = playOneTurn(aiController(0), w);
	expect(classic.commands).not.toContainEqual({ type: "resupply", unit: 0 });
	const remastered = playOneTurn(remasteredController(0), w);
	expect(remastered.commands).toEqual([{ type: "resupply", unit: 0 }]);
});

test("a mounted gun doesn't end its move within the enemy's reach (#617, #315)", () => {
	//A PaK 36 on its Opel Blitz, a 7TP that strikes 5 hexes from 5,10, Poland's objective far behind it on 5,14: the
	//classic AI drives the gun into the tank's reach, on its truck
	const units: HandUnit[] = [{ eqid: PAK36, owner: 0, row: 5, col: 1, transport: { eqid: OPEL_BLITZ, ammo: 0, fuel: 50 } },
		{ eqid: TP7, owner: 1, row: 5, col: 10 }];
	const w = world(units, [], [{ row: 5, col: 14 }]);
	const classic = playOneTurn(aiController(0), w);
	expect(unit(classic.world, 0).isMounted).toBe(true);
	expect(apart(classic.world, 0, 1)).toBeLessThanOrEqual(5);
	const remastered = playOneTurn(remasteredController(0), w);
	const gun = unit(remastered.world, 0);
	expect(gun.isMounted && apart(remastered.world, 0, 1) <= 5).toBe(false);
	expect(gun.col).toBeGreaterThan(1);
});

test("a ride may end in the enemy's reach next to an objective (#617)", () => {
	//The same gun, Poland's objective on 5,8 within the tank's reach: arriving in time decides it
	const units: HandUnit[] = [{ eqid: PAK36, owner: 0, row: 5, col: 1, transport: { eqid: OPEL_BLITZ, ammo: 0, fuel: 50 } },
		{ eqid: TP7, owner: 1, row: 5, col: 11 }];
	const remastered = playOneTurn(remasteredController(0), world(units, [], [{ row: 5, col: 8 }]));
	expect(remastered.commands).toEqual([{ type: "mount", unit: 0 }, { type: "move", unit: 0, to: { row: 4, col: 6 } }]);
});

test("without a ride rule the classic plan rides as before (#617)", () => {
	const units: HandUnit[] = [{ eqid: PAK36, owner: 0, row: 5, col: 1, transport: { eqid: OPEL_BLITZ, ammo: 0, fuel: 50 } },
		{ eqid: TP7, owner: 1, row: 5, col: 11 }];
	const w = world(units, [], [{ row: 5, col: 8 }]);
	const plain = planTurn(w, 0, w.rules.ai.config, 0).queue, anywhere = planTurn(w, 0, w.rules.ai.config, 0, { ridesTo: () => true }).queue;
	expect(plain).toEqual(anywhere);
	expect(plain).toEqual([{ type: "mount", unit: 0 }, { type: "move", unit: 0, to: { row: 4, col: 6 } }]);
	const nowhere = planTurn(w, 0, w.rules.ai.config, 0, { ridesTo: () => false }).queue;
	expect(nowhere.some((cmd) => cmd.type === "mount")).toBe(false);
});


//The gun of the tests above, Poland's now, on 5,14, a Pz IVD on 5,5 and Germany's objective behind it on 5,1, Poland to
//move: its units get off their transports at the new round, before Germany's turn. `attacker`: the side with more
//objectives to take at the start
function lastToMove(attacker: number): World {
	const units: HandUnit[] = [{ eqid: PAK36, owner: 1, row: 5, col: 14, transport: { eqid: OPEL_BLITZ, ammo: 0, fuel: 50 } },
		{ eqid: PZ_IVD, owner: 0, row: 5, col: 5 }];
	const w = world(units, [{ row: 5, col: 1 }]);
	w.data.startObjectives = attacker === 0 ? [2, 1] : [1, 2];
	w.state.turn.currentPlayer = 1;
	return w;
}

test("a defender that no enemy plays after in the round rides into the enemy's reach as the classic AI does (#626)", () => {
	const w = lastToMove(0);
	const classic = playOneTurn(aiController(1), w);
	expect(unit(classic.world, 0).isMounted).toBe(true);
	expect(apart(classic.world, 0, 1)).toBeLessThanOrEqual(5);
	expect(playOneTurn(remasteredController(1), w).commands).toEqual(classic.commands);
});

test("an attacker that no enemy plays after in the round still ends no ride in the enemy's reach (#626)", () => {
	const remastered = playOneTurn(remasteredController(1), lastToMove(1));
	const gun = unit(remastered.world, 0);
	expect(gun.isMounted && apart(remastered.world, 0, 1) <= 5).toBe(false);
	expect(gun.col).toBeLessThan(14);
});
