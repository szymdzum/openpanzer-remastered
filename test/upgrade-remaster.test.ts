//What an upgrade does to a mounted unit whose new equipment no transport carries (#546): the remaster's rules
//leave it on foot, the classic rules (the original's) leave it mounted with no transport. On a small map built by hand
import { expect, test } from "vitest";
import { classicRules, remasterRules } from "../src/core/rules";
import { step } from "../src/core/step";
import { dismountsWhenAttacked } from "../src/core/combat";
import { canCapture, unitLowAmmo, unitLowFuel } from "../src/core/units";
import type { Ruleset } from "../src/core/types";
import { handWorld } from "./coreworld";

const PAK_38 = 77, MARDER_III_H = 87, SDKFZ_251 = 156;

//A PaK 38 (a towed gun) riding a SdKfz 251/1, upgraded to a Marder III H (self-propelled, no transport carries it)
function upgradedGun(rules: Ruleset) {
	const w = handWorld({ rows: 8, cols: 8, units: [
		{ eqid: PAK_38, owner: 0, row: 3, col: 3, isMounted: true, transport: { eqid: SDKFZ_251, ammo: 0, fuel: 20 } },
		{ eqid: 273, owner: 1, row: 3, col: 6 },
	] }, undefined, { rules, noFOW: true });
	w.state.players[0].prestige = 5000;
	const r = step(w, { type: "upgrade", unit: 0, eqid: MARDER_III_H, transport: 0 });
	if (r.ok === false) throw new Error(r.refusal.reason);
	return { world: r.world, unit: r.world.state.units[0] };
}

test("An upgrade to equipment that can't be carried leaves the unit on foot in the remaster rules (#546)", () => {
	const { world, unit } = upgradedGun(remasterRules);
	expect(unit.eqid).toBe(MARDER_III_H);
	expect(unit.transport).toBeNull();
	expect(unit.isMounted).toBe(false);
	expect(canCapture(world, unit)).toBe(true);
	expect(dismountsWhenAttacked(world, unit)).toBe(false);
	expect(() => [unitLowFuel(world, unit, 5), unitLowAmmo(world, unit, 5)]).not.toThrow();
});

//The original drops the transport the same way without unmounting (reference/src/unit.js:257-258)
test("An upgrade to equipment that can't be carried leaves the unit mounted with no transport in the classic rules (kept, #546)", () => {
	const { unit } = upgradedGun(classicRules);
	expect(unit.transport).toBeNull();
	expect(unit.isMounted).toBe(true);
});
