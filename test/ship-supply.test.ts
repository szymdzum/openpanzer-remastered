// @vitest-environment node
//Where a ship resupplies and reinforces (#19): in a port, as the PG2 manual says ("only air units which
//are at an airfield and naval units which are in port can resupply"). The original checked for NOT being
//in a port, so its ships resupplied anywhere at sea and never in port. A bug of the original: fixed in
//both rulesets
import { expect, test } from "vitest";
import { classicRules, remasterRules } from "../src/core/rules";
import { step } from "../src/core/step";
import { canReinforce, canResupply, reinforceValue, resupplyValue } from "../src/core/supply";
import type { Ruleset, World } from "../src/core/types";
import { unitById } from "../src/core/world";
import { terrainType } from "../src/core/tables";
import { handWorld } from "./coreworld";

const ZERSTORER_1934 = 129; //a German destroyer: 20 ammo, no fuel

//A German destroyer at 6 strength and 5 ammo, in a port at 2,2 (inPort) or on the ocean at 2,3
function shipWorld(rules: Ruleset, inPort: boolean): World {
	return handWorld({ rows: 6, cols: 6, terrain: (r, c) => r === 2 && c === 2 ? terrainType.Port : terrainType.Ocean,
		units: [{ eqid: ZERSTORER_1934, owner: 0, row: 2, col: inPort ? 2 : 3, strength: 6, ammo: 5 }] }, undefined, { rules });
}

for (const rules of [classicRules, remasterRules]) {
	test(`A ship resupplies and reinforces in a port, not at sea, in the ${rules.name} rules (#19)`, () => {
		const port = shipWorld(rules, true), sea = shipWorld(rules, false);
		expect([canResupply(port, unitById(port, 0)), canReinforce(port, unitById(port, 0))]).toEqual([true, true]);
		expect(resupplyValue(port, unitById(port, 0))).toEqual({ ammo: 15, fuel: 0, transportAmmo: 0, transportFuel: 0 });
		expect(reinforceValue(port, unitById(port, 0))).toBe(3); //4 / 1.3: a port isn't a city
		expect([canResupply(sea, unitById(sea, 0)), canReinforce(sea, unitById(sea, 0))]).toEqual([false, false]);
		expect(step(sea, { type: "resupply", unit: 0 }).ok).toBe(false);
		const r = step(port, { type: "resupply", unit: 0 });
		expect(r.ok && unitById(r.world, 0).ammo).toBe(20);
	});

	test(`A ship that stayed in a port takes the turn start's resupply, one at sea doesn't, in the ${rules.name} rules (#19)`, () => {
		const ammoAfterRound = (w: World) => {
			for (let i = 0; i < 2; i++) {
				const r = step(w, { type: "endTurn" });
				if (r.ok === false) throw new Error(r.refusal.reason);
				w = r.world;
			}
			return unitById(w, 0).ammo;
		};
		expect(ammoAfterRound(shipWorld(rules, true))).toBe(20);
		expect(ammoAfterRound(shipWorld(rules, false))).toBe(5);
	});
}
