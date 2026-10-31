// @vitest-environment node
//The remastered AI's air doctrine (src/core/remastered/air.ts, #619): air superiority first, no strike that loses to
//the support fire it meets (#259), the bombers before the armour, and the way back to an airfield; on hand-built maps
import { expect, test } from "vitest";
import { aiController } from "../src/core/ai";
import type { Command } from "../src/core/command";
import { distance } from "../src/core/geometry";
import { remasteredController } from "../src/core/remastered/controller";
import { terrainType } from "../src/core/tables";
import type { Position, UnitState, World } from "../src/core/types";
import { hexIndex, unitById } from "../src/core/world";
import type { HandUnit } from "./coreworld";
import { playOneTurn, position, world } from "./staffworld";

const ME109 = 159, JU87 = 173, PZ_IVD = 148, LEFH18 = 92, PIECHOTA = 270, P11C = 280, PZL37 = 663, WZ36 = 726;
//Germany's country (germanyPoland): the flag its airfields fly
const GERMANY = 7;

const apart = (a: Position, b: Position) => distance(a.row, a.col, b.row, b.col);
const attacks = (cmds: readonly Command[]) => cmds.filter((c) => c.type === "attack");
const attackBy = (cmds: readonly Command[], id: number) => cmds.findIndex((c) => c.type === "attack" && c.unit === id);

//A world with Germany's airfields at the hexes given
function withAirfields(units: HandUnit[], fields: Position[], enemy: Position[] = [], cols = 16): World {
	const isField = (r: number, c: number) => fields.some((f) => f.row === r && f.col === c);
	const w = world(units, [], enemy, 3, false, { cols, terrain: (r, c) => isField(r, c) ? terrainType.Airfield : terrainType.Clear });
	for (const f of fields) {
		const h = hexIndex(w, f.row, f.col);
		w.state.map.hexes[h] = { ...w.state.map.hexes[h], flag: GERMANY };
	}
	return w;
}

const AIRFIELD = { row: 5, col: 1 };
const end = (t: World, id: number) => position(t, id);

test("the remastered AI's fighters attack the enemy's fighters first (#619)", () => {
	//A Me-109 and a Ju-87 near their airfield; a P.11c, a PZL.37 bomber and infantry on the objective ahead: the classic
	//AI sends the bomber in first, and its fighter on the infantry
	const units: HandUnit[] = [{ eqid: ME109, owner: 0, row: 5, col: 3 }, { eqid: JU87, owner: 0, row: 6, col: 3 },
		{ eqid: P11C, owner: 1, row: 5, col: 9 }, { eqid: PZL37, owner: 1, row: 4, col: 10 }, { eqid: PIECHOTA, owner: 1, row: 6, col: 10 }];
	const w = withAirfields(units, [AIRFIELD], [{ row: 6, col: 10 }]);
	const classic = playOneTurn(aiController(0), w);
	expect(attacks(classic.commands)[0]).toEqual({ type: "attack", unit: 1, target: 4 });
	const remastered = playOneTurn(remasteredController(0), w);
	expect(attacks(remastered.commands)[0]).toEqual({ type: "attack", unit: 0, target: 2 });
	expect(attackBy(remastered.commands, 1)).toBeGreaterThan(attackBy(remastered.commands, 0));
	expect(remastered.refused).toBe(0);
});

test("a bomber doesn't strike a target covered by air defence it would lose to (#619, #259)", () => {
	//Polish infantry on its objective, a 40 mm wz.36 beside it: the classic AI's Ju-87 strikes it, into the gun's fire
	const units: HandUnit[] = [{ eqid: JU87, owner: 0, row: 5, col: 3 }, { eqid: PIECHOTA, owner: 1, row: 5, col: 9 },
		{ eqid: WZ36, owner: 1, row: 5, col: 10, strength: 6 }];
	const w = withAirfields(units, [AIRFIELD], [{ row: 5, col: 9 }]);
	expect(attackBy(playOneTurn(aiController(0), w).commands, 0)).toBeGreaterThanOrEqual(0);
	expect(attackBy(playOneTurn(remasteredController(0), w).commands, 0)).toBe(-1);
});

test("the artillery or fighters clear the air defence before the bombers strike (#619, #259)", () => {
	//A worn-down wz.36 covers the Polish infantry on the objective a Pz IVD is to attack: the leFH 18 fires on the gun,
	//then the Ju-87 strikes the infantry, then the tank attacks. The classic AI's gun fires on the infantry
	const units: HandUnit[] = [{ eqid: JU87, owner: 0, row: 5, col: 3 }, { eqid: LEFH18, owner: 0, row: 5, col: 8 },
		{ eqid: PZ_IVD, owner: 0, row: 5, col: 10 }, { eqid: PIECHOTA, owner: 1, row: 5, col: 11 }, { eqid: WZ36, owner: 1, row: 5, col: 13, strength: 4 }];
	const w = withAirfields(units, [AIRFIELD], [{ row: 5, col: 11 }]);
	expect(attacks(playOneTurn(aiController(0), w).commands)[0]).toEqual({ type: "attack", unit: 1, target: 3 });
	const remastered = playOneTurn(remasteredController(0), w);
	expect(attacks(remastered.commands).slice(0, 3)).toEqual([{ type: "attack", unit: 1, target: 4 }, { type: "attack", unit: 0, target: 3 },
		{ type: "attack", unit: 2, target: 3 }]);
});

test("a bomber strikes the assault's target before the tanks attack (#619, #233)", () => {
	const units: HandUnit[] = [{ eqid: PZ_IVD, owner: 0, row: 5, col: 7 }, { eqid: JU87, owner: 0, row: 5, col: 2 },
		{ eqid: PIECHOTA, owner: 1, row: 5, col: 8 }];
	const w = withAirfields(units, [AIRFIELD], [{ row: 5, col: 8 }]);
	const remastered = playOneTurn(remasteredController(0), w);
	expect(attackBy(remastered.commands, 1)).toBeGreaterThanOrEqual(0);
	expect(attackBy(remastered.commands, 1)).toBeLessThan(attackBy(remastered.commands, 0));
});

test("an aircraft doesn't fly farther than it can come back from (#619)", () => {
	//On a long map a Ju-87 with 50 fuel 24 hexes from its airfield, the objective 20 hexes further: the classic AI flies a
	//whole move toward it, farther from the airfield than the fuel left brings it back
	const units: HandUnit[] = [{ eqid: JU87, owner: 0, row: 5, col: 25, fuel: 50 }, { eqid: PIECHOTA, owner: 1, row: 5, col: 45 }];
	const w = withAirfields(units, [AIRFIELD], [{ row: 5, col: 45 }], 48);
	const comesBack = (t: World) => apart(end(t, 0), AIRFIELD) - 1 <= (unitById(t, 0) as UnitState).fuel;
	const classic = playOneTurn(aiController(0), w).world;
	expect(apart(end(classic, 0), AIRFIELD)).toBeGreaterThan(apart(position(w, 0), AIRFIELD));
	expect(comesBack(classic)).toBe(false);
	const remastered = playOneTurn(remasteredController(0), w).world;
	expect(apart(end(remastered, 0), AIRFIELD)).toBeGreaterThan(apart(position(w, 0), AIRFIELD));
	expect(comesBack(remastered)).toBe(true);
});

test("a fighter ends its turn next to the bombers it covers (#619)", () => {
	//A Ju-87 that has struck, in reach of a P.11c the Me-109 can't reach this turn: the fighter flies to its side. The
	//classic AI's flies toward the objective
	const units: HandUnit[] = [{ eqid: JU87, owner: 0, row: 5, col: 14, hasMoved: true, hasFired: true }, { eqid: ME109, owner: 0, row: 8, col: 2 },
		{ eqid: P11C, owner: 1, row: 5, col: 26 }, { eqid: PIECHOTA, owner: 1, row: 11, col: 38 }];
	const w = withAirfields(units, [AIRFIELD], [{ row: 11, col: 38 }], 40);
	const beside = (t: World) => apart(end(t, 1), end(t, 0));
	expect(beside(playOneTurn(aiController(0), w).world)).toBeGreaterThan(1);
	expect(beside(playOneTurn(remasteredController(0), w).world)).toBe(1);
});

test("the classic AI flies its aircraft as before: the air doctrine is the remastered AI's (#619)", () => {
	const units: HandUnit[] = [{ eqid: ME109, owner: 0, row: 5, col: 3 }, { eqid: JU87, owner: 0, row: 6, col: 3 },
		{ eqid: P11C, owner: 1, row: 5, col: 9 }, { eqid: PZL37, owner: 1, row: 4, col: 10 }, { eqid: PIECHOTA, owner: 1, row: 6, col: 10 }];
	expect(playOneTurn(aiController(0), withAirfields(units, [AIRFIELD])).commands).toEqual([
		{ type: "move", unit: 1, to: { row: 7, col: 10 } }, { type: "attack", unit: 1, target: 4 },
		{ type: "move", unit: 0, to: { row: 5, col: 10 } }, { type: "attack", unit: 0, target: 3 }]);
});
