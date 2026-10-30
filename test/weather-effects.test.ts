//What the weather does in the remaster's rules (#1), as the manual says. Combat: "The number of strength points
//used for attack is also halved by rain or snow for ground troops and by overcast weather for air units (air
//units may not attack in rain or snow)"; "During rain or snow storms aircraft and air defense cannot attack".
//Spotting: "Air units' spotting range is halved by overcast and inclement weather. Other units' spotting ranges
//are halved when it is raining or snowing". Supply: "If it is raining or snowing and a unit is not in a friendly
//city, port, or airfield, the unit gets less supply"; "Bad weather [...] also reduce[s] replacements". Fuel: "when
//the ground is covered with snow, all ground units pay double fuel costs". An air unit with All Weather Combat
//ignores the weather. The classic rules keep the original, where the weather does nothing. On small maps built
//by hand
import { expect, test } from "vitest";
import { attackCells } from "../src/core/attack";
import { attackResult, combatResult } from "../src/core/combat";
import { fullMoves, unitMoveRange } from "../src/core/movement";
import { classicRules, remasterRules } from "../src/core/rules";
import { computeSight, unitSpotRange } from "../src/core/sight";
import { step } from "../src/core/step";
import { reinforceValue, resupplyValue } from "../src/core/supply";
import { groundCondition, leaderType, terrainType } from "../src/core/tables";
import type { Contribution, Ruleset, World } from "../src/core/types";
import { unitById } from "../src/core/world";
import { type HandUnit, handWorld } from "./coreworld";

const FAIR = 0, OVERCAST = 1, RAIN = 2, SNOW = 3;
const INFANTERIE = 115, SS_INFANTERIE = 108, PZ_IIA = 140, PZ_IIIE = 142, ME_109 = 159, JU_87 = 173, FLAK_88 = 69,
	FLAK_38 = 64, LEFH_18 = 92;

interface Sky {
	weather: number;
	ground?: number;
	terrain?: (row: number, col: number) => number;
}

//The sight computed again for the weather set
function world(rules: Ruleset, sky: Sky, units: HandUnit[], owners: [number, number][] = []): World {
	const w = handWorld({ rows: 8, cols: 8, ground: sky.ground, terrain: sky.terrain, units }, undefined, { rules, noFOW: true });
	w.state.scenario.atmospheric = sky.weather;
	for (const [hex, owner] of owners) w.state.map.hexes[hex] = { ...w.state.map.hexes[hex], owner };
	return { ...w, sight: computeSight(w) };
}

//Unit 0 attacks unit 1 next to it: what the weather step recorded, as "side before -> after"
function weatherRecord(w: World): string[] {
	const record: Contribution[] = [];
	attackResult(w, unitById(w, 0)!, unitById(w, 1)!, null, record);
	return record.filter((c) => c.name === "weather").map((c) => `${c.side} ${c.field} ${c.before} -> ${c.after}`);
}

const pair = (a: number, b: number): HandUnit[] => [{ eqid: a, owner: 0, row: 3, col: 3 }, { eqid: b, owner: 1, row: 3, col: 4 }];

//---- Combat

test("In rain and snow a ground unit fires with half its strength, attacking and firing back (#1)", () => {
	for (const weather of [RAIN, SNOW])
		expect(weatherRecord(world(remasterRules, { weather }, pair(PZ_IIA, INFANTERIE))))
			.toEqual(["attacker strength 10 -> 5", "defender strength 10 -> 5"]);
	//rounded up: a unit of 7 fires with 4
	const w = world(remasterRules, { weather: RAIN }, [{ eqid: PZ_IIA, owner: 0, row: 3, col: 3, strength: 7 },
		{ eqid: INFANTERIE, owner: 1, row: 3, col: 4, strength: 1 }]);
	expect(weatherRecord(w)).toEqual(["attacker strength 7 -> 4"]);
	for (const weather of [FAIR, OVERCAST]) expect(weatherRecord(world(remasterRules, { weather }, pair(PZ_IIA, INFANTERIE)))).toEqual([]);
});

test("The halved strength makes the estimate of a unit at half strength in fair weather (#1)", () => {
	const rain = world(remasterRules, { weather: RAIN }, pair(PZ_IIA, INFANTERIE));
	const half = world(remasterRules, { weather: FAIR }, [{ eqid: PZ_IIA, owner: 0, row: 3, col: 3, strength: 5 },
		{ eqid: INFANTERIE, owner: 1, row: 3, col: 4, strength: 5 }]);
	const kills = (w: World) => attackResult(w, unitById(w, 0)!, unitById(w, 1)!, null);
	expect([kills(rain).kills, kills(rain).losses]).toEqual([kills(half).kills, kills(half).losses]);
	expect(kills(rain).kills).toBeLessThan(kills(world(remasterRules, { weather: FAIR }, pair(PZ_IIA, INFANTERIE))).kills);
});

test("Overcast halves an aircraft's strength, not a ground unit's (#1)", () => {
	expect(weatherRecord(world(remasterRules, { weather: OVERCAST }, pair(ME_109, ME_109))))
		.toEqual(["attacker strength 10 -> 5", "defender strength 10 -> 5"]);
	const bomber = world(remasterRules, { weather: OVERCAST }, [{ eqid: JU_87, owner: 0, row: 3, col: 4 },
		{ eqid: INFANTERIE, owner: 1, row: 3, col: 4 }]);
	expect(weatherRecord(bomber)).toEqual(["attacker strength 10 -> 5"]);
});

test("In rain and snow aircraft and air defence have no targets, and the attack is refused (#1)", () => {
	for (const weather of [RAIN, SNOW]) {
		const air = world(remasterRules, { weather }, [{ eqid: ME_109, owner: 0, row: 3, col: 3 }, { eqid: JU_87, owner: 1, row: 3, col: 4 },
			{ eqid: FLAK_88, owner: 0, row: 5, col: 4 }, { eqid: FLAK_38, owner: 0, row: 4, col: 5 }, { eqid: INFANTERIE, owner: 1, row: 5, col: 5 }]);
		for (const id of [0, 2, 3]) expect(attackCells(air, unitById(air, id)!)).toEqual([]);
		expect(step(air, { type: "attack", unit: 0, target: 1 }).ok).toBe(false);
		expect(step(air, { type: "attack", unit: 2, target: 4 }).ok).toBe(false);
	}
	const fair = world(remasterRules, { weather: OVERCAST }, pair(ME_109, JU_87));
	expect(attackCells(fair, unitById(fair, 0)!)).not.toEqual([]);
});

test("In rain an aircraft or an air defence gun attacked still defends but doesn't fire back (#1)", () => {
	const rain = world(remasterRules, { weather: RAIN }, pair(SS_INFANTERIE, JU_87));
	const fair = world(remasterRules, { weather: FAIR }, pair(SS_INFANTERIE, JU_87));
	const result = (w: World) => attackResult(w, unitById(w, 0)!, unitById(w, 1)!, null);
	expect([result(fair).defcanfire, result(rain).defcanfire]).toEqual([true, false]);
	const gun = world(remasterRules, { weather: SNOW }, pair(PZ_IIA, FLAK_88));
	expect([result(gun).defcanfire, result(gun).losses]).toEqual([false, 0]);
});

test("In rain artillery's support fire is halved too (#1)", () => {
	const w = world(remasterRules, { weather: RAIN }, [...pair(PZ_IIA, INFANTERIE), { eqid: LEFH_18, owner: 1, row: 4, col: 5 }]);
	const record: Contribution[] = [];
	combatResult(w, unitById(w, 0)!, unitById(w, 1)!, true, null, record);
	expect(record.some((c) => c.name === "support fire")).toBe(true);
	attackResult(w, unitById(w, 2)!, unitById(w, 0)!, null, record);
	expect(record.filter((c) => c.name === "weather").map((c) => `${c.side} ${c.after}`)).toContain("attacker 5");
});

test("An aircraft with All Weather Combat fires whole in overcast and attacks in rain (#1)", () => {
	const allWeather = (weather: number) => world(remasterRules, { weather }, [{ eqid: ME_109, owner: 0, row: 3, col: 3,
		leader: leaderType.allWeatherCombat }, { eqid: JU_87, owner: 1, row: 3, col: 4 }]);
	expect(weatherRecord(allWeather(OVERCAST))).toEqual(["defender strength 10 -> 5"]);
	const rain = allWeather(RAIN);
	expect(attackCells(rain, unitById(rain, 0)!)).not.toEqual([]);
	expect(step(rain, { type: "attack", unit: 0, target: 1 }).ok).toBe(true);
});

test("The classic rules fight the same in any weather (#1)", () => {
	for (const weather of [FAIR, OVERCAST, RAIN, SNOW]) {
		expect(weatherRecord(world(classicRules, { weather }, pair(PZ_IIA, INFANTERIE)))).toEqual([]);
		const air = world(classicRules, { weather }, pair(ME_109, JU_87));
		expect(attackCells(air, unitById(air, 0)!)).not.toEqual([]);
	}
});

//---- Spotting

test("An aircraft's spotting is halved in overcast, rain and snow, a ground unit's in rain and snow, at least 1 (#1)", () => {
	const spots = (rules: Ruleset, weather: number) => {
		const w = world(rules, { weather }, [{ eqid: ME_109, owner: 0, row: 1, col: 1 }, { eqid: PZ_IIA, owner: 0, row: 3, col: 3 },
			{ eqid: PZ_IIIE, owner: 0, row: 5, col: 5 }, { eqid: INFANTERIE, owner: 1, row: 7, col: 7 },
			{ eqid: ME_109, owner: 0, row: 1, col: 6, leader: leaderType.allWeatherCombat }]);
		return [0, 1, 2, 4].map((id) => unitSpotRange(w, unitById(w, id)!));
	};
	expect(spots(remasterRules, FAIR)).toEqual([2, 2, 1, 2]);
	expect(spots(remasterRules, OVERCAST)).toEqual([1, 2, 1, 2]);
	expect(spots(remasterRules, RAIN)).toEqual([1, 1, 1, 2]);
	expect(spots(remasterRules, SNOW)).toEqual([1, 1, 1, 2]);
	expect(spots(classicRules, SNOW)).toEqual([2, 2, 1, 2]);
});

test("When the weather changes at a new round the fog follows: the sight is the new weather's (#1)", () => {
	let w = handWorld({ rows: 8, cols: 8, units: [{ eqid: PZ_IIA, owner: 0, row: 3, col: 3 }, { eqid: INFANTERIE, owner: 1, row: 7, col: 7 }] },
		undefined, { rules: remasterRules });
	Object.assign(w.state.scenario, { latitude: 3, date: "1941-10-15T00:00:00.000Z", turnsPerDay: 1000 });
	w.state.rng = { game: 1, ai: 1 };
	const seen = new Set<number>();
	for (let i = 0; i < 80; i++) {
		const r = step(w, { type: "endTurn" });
		if (!r.ok) throw new Error("refused");
		w = r.world;
		seen.add(w.state.scenario.atmospheric);
		expect(w.sight).toEqual(computeSight(w));
	}
	expect(seen.has(RAIN)).toBe(true);
});

//---- Supply

const cityAt = (r: number, c: number) => r === 2 && c === 2 ? terrainType.City : terrainType.Clear;

const CITY = 2 * 8 + 2;

//A Pz IIA with no ammo, no fuel and strength 2, on row 5 (clear) or 2 (in the city at 2,2, its side's or the enemy's)
function supplied(rules: Ruleset, weather: number, row: number, cityOwner = 0): number[] {
	const w = world(rules, { weather, terrain: cityAt }, [{ eqid: PZ_IIA, owner: 0, row, col: 2, ammo: 0, fuel: 0, strength: 2 },
		{ eqid: INFANTERIE, owner: 1, row: 7, col: 7 }], [[CITY, cityOwner]]);
	const u = unitById(w, 0)!;
	return [resupplyValue(w, u).ammo, resupplyValue(w, u).fuel, reinforceValue(w, u)];
}

test("In rain or snow a unit out of a friendly city gets half the supply and replacements; in one, all of it (#1)", () => {
	const ammo = handWorld({ rows: 1, cols: 1, units: [] }).equipment[PZ_IIA].ammo;
	//outside a city: / 1.3, and / 2 in rain or snow; 50 fuel and 8 strength missing
	expect(supplied(remasterRules, FAIR, 5)).toEqual([Math.round(ammo / 1.3), Math.round(50 / 1.3), Math.round(8 / 1.3)]);
	for (const weather of [RAIN, SNOW])
		expect(supplied(remasterRules, weather, 5)).toEqual([Math.round(Math.max(1, ammo / 2.6)), Math.round(50 / 2.6), Math.round(8 / 2.6)]);
	expect(supplied(remasterRules, OVERCAST, 5)).toEqual(supplied(remasterRules, FAIR, 5));
	expect(supplied(remasterRules, RAIN, 2)).toEqual(supplied(remasterRules, FAIR, 2));
	expect(supplied(classicRules, RAIN, 5)).toEqual(supplied(classicRules, FAIR, 5));
});

test("An enemy's city gives no shelter from the rain (#1)", () => {
	expect(supplied(remasterRules, RAIN, 2, 1)[1]).toBe(Math.round(50 / 2));
	expect(supplied(remasterRules, FAIR, 2, 1)[1]).toBe(50);
});

//---- Fuel

test("On frozen ground a ground unit's move burns two fuel a point; its range is what its fuel pays for (#1)", () => {
	const moved = (rules: Ruleset, ground: number, fuel = 50) => {
		const w = world(rules, { weather: FAIR, ground }, [{ eqid: PZ_IIA, owner: 0, row: 3, col: 1, fuel },
			{ eqid: INFANTERIE, owner: 1, row: 7, col: 7 }]);
		const before = unitById(w, 0)!;
		const r = step(w, { type: "move", unit: 0, to: { row: 3, col: 3 } });
		if (r.ok === false) throw new Error(r.refusal.reason);
		return { burned: before.fuel - unitById(r.world, 0)!.fuel, range: unitMoveRange(w, before), full: fullMoves(w, before) };
	};
	const remaster = moved(remasterRules, groundCondition.frozen), classic = moved(classicRules, groundCondition.frozen);
	expect(remaster.burned).toBe(2 * classic.burned);
	expect([remaster.full, classic.full]).toEqual([5, 10]);
	expect([moved(remasterRules, groundCondition.frozen, 6).range, moved(classicRules, groundCondition.frozen, 6).range]).toEqual([3, 5]);
	expect(moved(remasterRules, groundCondition.dry).burned).toBe(moved(classicRules, groundCondition.dry).burned);
});

test("An aircraft burns the same fuel on frozen ground (#1)", () => {
	const burned = (ground: number) => {
		const w = world(remasterRules, { weather: FAIR, ground }, [{ eqid: ME_109, owner: 0, row: 3, col: 1 }, { eqid: INFANTERIE, owner: 1, row: 7, col: 7 }]);
		const r = step(w, { type: "move", unit: 0, to: { row: 3, col: 4 } });
		if (r.ok === false) throw new Error(r.refusal.reason);
		return unitById(w, 0)!.fuel - unitById(r.world, 0)!.fuel;
	};
	expect(burned(groundCondition.frozen)).toBe(burned(groundCondition.dry));
});
