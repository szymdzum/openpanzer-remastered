// @vitest-environment node
//What a resupply and a reinforcement give where a unit stands, as the new UI's context menu shows it before the
//click (#346): the divisions the rules apply, the enemies around, and what a reinforcement buys with the player's
//prestige. The reinforce command buys exactly that
import { expect, test } from "vitest";
import { costPerStrength } from "../src/core/costs";
import { step } from "../src/core/step";
import { adjacentEnemies, canSupplyHere, isInCity, reinforcement, reinforceDivisors, reinforceValue, resupplyDivisors,
	resupplyValue } from "../src/core/supply";
import type { World } from "../src/core/types";
import { unitById } from "../src/core/world";
import { OVERSTRENGTH_PENALTY, terrainType } from "../src/prototypes";
import { type HandUnit, handWorld } from "./coreworld";

const PZ_IIA = 140, TP7 = 273, ME_109 = 159;

//A Pz IIA at 4,4 (in a city when city), the Polish tanks given around it, the German player's prestige
function around(enemies: [number, number][], city: boolean, prestige = 1000, tank: Partial<HandUnit> = {}): World {
	const w = handWorld({ rows: 9, cols: 9, terrain: (r, c) => city && r === 4 && c === 4 ? terrainType.City : terrainType.Clear,
		units: [{ eqid: PZ_IIA, owner: 0, row: 4, col: 4, strength: 6, ammo: 2, fuel: 10, ...tank },
			...enemies.map(([row, col]) => ({ eqid: TP7, owner: 1, row, col }))] });
	(w.state.players[0] as { prestige: number }).prestige = prestige;
	return w;
}

test("A unit's resupply and reinforcement are divided outside a city, then by the enemies next to it (#346)", () => {
	const cases: [World, boolean, number, [number, number]][] = [
		[around([], true), true, 0, [1, 1]],
		[around([], false), false, 0, [1.3, 1]],
		[around([[3, 4]], false), false, 1, [1.3, 1.5]],
		[around([[3, 4], [5, 4], [4, 5]], true), true, 3, [1, 3]],
	];
	for (const [w, city, enemies, divisors] of cases) {
		const u = unitById(w, 0);
		expect([isInCity(w, u), adjacentEnemies(w, u), resupplyDivisors(w, u), reinforceDivisors(w, u), canSupplyHere(w, u)])
			.toEqual([city, enemies, divisors, divisors, true]);
		//what the values give is what is missing divided so
		const missing = 10 - u.strength;
		expect(reinforceValue(w, u)).toBe(Math.round(missing / divisors[0] / divisors[1]));
		expect(resupplyValue(w, u).ammo).toBe(Math.round(Math.max(1, (w.equipment[PZ_IIA].ammo - 2) / divisors[0] / divisors[1])));
	}
});

test("An aircraft takes all of it, and only next to an airfield (#346)", () => {
	const w = handWorld({ rows: 6, cols: 6, units: [{ eqid: ME_109, owner: 0, row: 2, col: 2, strength: 5 }, { eqid: TP7, owner: 1, row: 3, col: 2 }] });
	const u = unitById(w, 0);
	expect([resupplyDivisors(w, u), reinforceDivisors(w, u), canSupplyHere(w, u)]).toEqual([[1, 1], [1, 1], false]);
});

test("A reinforcement buys what the prestige pays for, no more than the unit can get; overstrength costs more (#346)", () => {
	const per = costPerStrength(around([], true), unitById(around([], true), 0));
	expect(reinforcement(around([], true), unitById(around([], true), 0))).toEqual({ wanted: 4, perPoint: per, bought: 4 });
	const part = around([], true, per * 2 + 1);
	expect(reinforcement(part, unitById(part, 0))).toEqual({ wanted: 4, perPoint: per, bought: 2 });
	const poor = around([], true, per - 1);
	expect(reinforcement(poor, unitById(poor, 0))).toEqual({ wanted: 4, perPoint: per, bought: 0 });
	//at full strength with two experience bars: two points over 10, at the penalty
	const veteran = around([], true, 1000, { strength: 10, experience: 200 });
	expect(reinforcement(veteran, unitById(veteran, 0), true))
		.toEqual({ wanted: 2, perPoint: Math.round(per * OVERSTRENGTH_PENALTY), bought: 2 });
	expect(reinforcement(veteran, unitById(veteran, 0))).toMatchObject({ wanted: 0 });
});

test("The reinforce command buys exactly what reinforcement says, and nothing when the prestige pays for no point (#346)", () => {
	const per = costPerStrength(around([], true), unitById(around([], true), 0));
	const part = around([], true, per * 2 + 1);
	const r = step(part, { type: "reinforce", unit: 0 });
	expect(r.ok && [unitById(r.world, 0).strength, r.world.state.players[0].prestige]).toEqual([8, 1]);
	const poor = around([], true, per - 1);
	const none = step(poor, { type: "reinforce", unit: 0 });
	expect(none.ok && [unitById(none.world, 0).strength, none.world.state.players[0].prestige]).toEqual([6, per - 1]);
});
