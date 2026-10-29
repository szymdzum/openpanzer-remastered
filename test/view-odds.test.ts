// @vitest-environment node
//The attack cursor's view model (src/view/odds.ts, #441) on hand-built worlds: over a target, the two numbers the old
//UI's cursor showed (generateAttackCursor), the core's combat result before the attack with the support fire its side
//sees; nothing off a target
import { expect, test } from "vitest";
import { handWorld, type HandUnit } from "./coreworld";
import { combatResult } from "../src/core/combat";
import type { World } from "../src/core/types";
import { unitById } from "../src/core/world";
import { terrainType } from "../src/core/tables";
import { selectionOf } from "../src/view/mapview";
import { glanceOf } from "../src/view/odds";

const PZ_IIA = 140, TP7 = 273, PIECHOTA = 270, WZ97 = 264;

function hand(units: HandUnit[], terrain: Record<string, number> = {}): World {
	return handWorld({ rows: 10, cols: 10, units, terrain: (r, c) => terrain[r + "," + c] || terrainType.Clear }, undefined, { spotSide: 0 });
}

//The attacker (unit 0) selected, the target's (unit 1) hex pointed at
const glance = (w: World) => glanceOf(w, selectionOf(w, 0), { row: unitById(w, 1)!.row, col: unitById(w, 1)!.col }, false);

test("Over a target the cursor shows the old cursor's two numbers: your losses with the support fire, the target's (#441)", () => {
	const piechota: HandUnit[] = [{ eqid: PZ_IIA, owner: 0, row: 4, col: 3 }, { eqid: PIECHOTA, owner: 1, row: 4, col: 4, strength: 9, entrenchment: 4,
		experience: 200 }];
	const w = hand([...piechota, { eqid: WZ97, owner: 1, row: 5, col: 5 }], { "4,4": terrainType.City });
	const cr = combatResult(w, unitById(w, 0)!, unitById(w, 1)!, false, null);
	expect(glance(w)).toEqual({ at: { row: 4, col: 4 }, yours: { side: 0, loss: cr.losses }, theirs: { side: 1, loss: cr.kills } });
	//the gun behind the target fires first: without it, the attacker loses less
	const alone = hand(piechota, { "4,4": terrainType.City });
	expect(glance(alone)!.yours.loss).toBeLessThan(cr.losses);
	//(the target loses no more than it has)
	const weak = hand([{ eqid: PZ_IIA, owner: 0, row: 4, col: 3 }, { eqid: TP7, owner: 1, row: 4, col: 4, strength: 1 }]);
	expect(glance(weak)!.theirs.loss).toBeLessThanOrEqual(1);
});

test("Off a target, on the enemy's turn or with no unit selected there is no cursor", () => {
	const w = hand([{ eqid: PZ_IIA, owner: 0, row: 4, col: 3 }, { eqid: TP7, owner: 1, row: 4, col: 4 }]);
	expect(glanceOf(w, selectionOf(w, 0), { row: 6, col: 6 }, false)).toBe(null);
	expect(glanceOf(w, null, { row: 4, col: 4 }, false)).toBe(null);
	expect(glanceOf(w, selectionOf(w, 0), null, false)).toBe(null);
	w.state.turn.currentPlayer = 1;
	expect(glanceOf(w, selectionOf(w, 0), { row: 4, col: 4 }, false)).toBe(null);
});
