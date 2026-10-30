//The weather changes in the remaster's rules (#591): "Weather is randomly determined based on actual weather
//conditions for the area and month of the year in which a battle occurs [...] Storm fronts can last for a number
//of days [...] It never rains or snows in North Africa" (the manual). Once a round, from the game stream; the
//classic rules keep the scenario's start weather and draw nothing. On a small map built by hand
import { expect, test } from "vitest";
import { classicRules, remasterRules } from "../src/core/rules";
import { groundCondition } from "../src/core/tables";
import type { Ruleset, World } from "../src/core/types";
import { nextRandom } from "../src/core/random";
import { step } from "../src/core/step";
import { writeSave, readSave } from "../src/app/save";
import { fromData } from "../src/legacy/state";
import { Scenario } from "../src/legacy/scenario";
import { handWorld } from "./coreworld";
import { smallGameData } from "./smallgame";

const FAIR = 0, OVERCAST = 1, RAIN = 2, SNOW = 3;
const DESERT = 0, TEMPERATE = 2, EAST = 3;

interface Sky {
	zone: number;
	date: string;
	weather?: number;
	ground?: number;
	seed?: number;
}

//Two players on a 4 x 4 map, the game stream seeded; a day of 500 rounds keeps the month
function world(rules: Ruleset, sky: Sky): World {
	const w = handWorld({ rows: 4, cols: 4, ground: sky.ground, units: [{ eqid: 140, owner: 0, row: 0, col: 0 },
		{ eqid: 273, owner: 1, row: 3, col: 3 }] }, undefined, { rules });
	Object.assign(w.state.scenario, { latitude: sky.zone, date: sky.date, atmospheric: sky.weather || FAIR,
		turnsPerDay: 1000 });
	w.state.rng = { game: sky.seed || 591, ai: 1 };
	return w;
}

function endTurn(w: World): World {
	const r = step(w, { type: "endTurn" });
	if (!r.ok) throw new Error("refused");
	return r.world;
}

//The weather of each round's start, the first round's included, over the rounds given
function weathers(w: World, rounds: number): number[] {
	const seen = [w.state.scenario.atmospheric];
	for (let i = 1; i < rounds; i++) {
		w = endTurn(endTurn(w));
		seen.push(w.state.scenario.atmospheric);
	}
	return seen;
}

//The changes of weather, and how long each weather lasted in rounds
function spells(seen: number[]): number[] {
	const out = [1];
	for (let i = 1; i < seen.length; i++)
		if (seen[i] === seen[i - 1]) out[out.length - 1]++;
		else out.push(1);
	return out;
}

const AUTUMN_WEST = "1944-11-15T00:00:00.000Z";

test("The remaster's weather changes from round to round in fronts that last, between fair, overcast and rain (#591)", () => {
	const seen = weathers(world(remasterRules, { zone: TEMPERATE, date: AUTUMN_WEST }), 200);
	expect(new Set(seen)).toEqual(new Set([FAIR, OVERCAST, RAIN]));
	const lasted = spells(seen);
	expect(lasted.length).toBeGreaterThan(20);
	//a spell of weather lasts more than a round on average
	expect(seen.length / lasted.length).toBeGreaterThan(2);
	//one step at a time: a front clouds over before it rains, and the rain eases to overcast before it clears
	for (let i = 1; i < seen.length; i++) expect(Math.abs(seen[i] - seen[i - 1])).toBeLessThanOrEqual(1);
});

test("The same seed plays the same weather (#591)", () => {
	const sky = { zone: TEMPERATE, date: AUTUMN_WEST, seed: 7 };
	expect(weathers(world(remasterRules, sky), 60)).toEqual(weathers(world(remasterRules, sky), 60));
});

test("It never rains or snows in the desert zone, in any month (#591)", () => {
	for (let month = 0; month < 12; month++) {
		const date = new Date(Date.UTC(1942, month, 10)).toISOString();
		const seen = weathers(world(remasterRules, { zone: DESERT, date, seed: 100 + month }), 120);
		expect(seen.filter((x) => x === RAIN || x === SNOW)).toEqual([]);
	}
	//an overcast sky comes and goes there all the same
	expect(weathers(world(remasterRules, { zone: DESERT, date: "1941-12-01T00:00:00.000Z" }), 200)).toContain(OVERCAST);
});

test("No snow in a summer month of the temperate zone, rain instead; snow on frozen ground, in its winter and the east's (#591)", () => {
	const summer = weathers(world(remasterRules, { zone: TEMPERATE, date: "1944-07-01T00:00:00.000Z" }), 25);
	expect(summer).not.toContain(SNOW);
	expect(summer).toContain(RAIN);
	for (const [zone, date] of [[TEMPERATE, "1945-01-10T00:00:00.000Z"], [EAST, "1941-12-05T00:00:00.000Z"]] as const) {
		const frozen = weathers(world(remasterRules, { zone, date, ground: groundCondition.frozen }), 50);
		expect(frozen).toContain(SNOW);
		expect(frozen).not.toContain(RAIN);
	}
});

test("A storm keeps its rain or snow until it eases: a scenario's snow on dry ground, its rain on frozen ground (#591)", () => {
	for (const [start, ground] of [[SNOW, groundCondition.dry], [RAIN, groundCondition.frozen]]) {
		const seen = weathers(world(remasterRules, { zone: EAST, date: "1941-12-05T00:00:00.000Z", weather: start, ground }), 60);
		const eased = seen.indexOf(OVERCAST);
		expect(eased).toBeGreaterThan(0);
		expect(seen.slice(0, eased)).toEqual(Array(eased).fill(start));
		expect(seen.slice(eased)).not.toContain(start);
	}
});

test("The first turn keeps the scenario's start weather; the weather changes only when a new round starts, one draw each (#591)", () => {
	const w = world(remasterRules, { zone: TEMPERATE, date: AUTUMN_WEST, weather: SNOW });
	//player 0 ends turn 1: player 1's turn 1, the same weather and no draw
	const second = endTurn(w);
	expect([second.state.scenario.atmospheric, second.state.rng!.game]).toEqual([SNOW, w.state.rng!.game]);
	//the round's end: turn 2, one draw
	const next = endTurn(second);
	expect(next.state.turn.turn).toBe(2);
	expect(next.state.rng!.game).not.toBe(w.state.rng!.game);
	const one = world(remasterRules, { zone: TEMPERATE, date: AUTUMN_WEST });
	const r = one.state.rng!;
	expect(endTurn(endTurn(one)).state.rng!.game).toBe(drawnOnce(r.game));
});

//Where the game stream is after one draw from state
function drawnOnce(state: number): number {
	const stream = { state };
	nextRandom(stream);
	return stream.state;
}

test("The classic rules keep the start weather to the end and draw nothing (#591)", () => {
	const w = world(classicRules, { zone: TEMPERATE, date: AUTUMN_WEST, weather: OVERCAST });
	expect(new Set(weathers(w, 60))).toEqual(new Set([OVERCAST]));
	let after = w;
	for (let i = 0; i < 20; i++) after = endTurn(after);
	expect(after.state.rng!.game).toBe(w.state.rng!.game);
});

test("A saved game keeps the weather it changed to, and loads it again (#591)", () => {
	let w = world(remasterRules, { zone: TEMPERATE, date: AUTUMN_WEST });
	for (let i = 0; i < 100 && w.state.scenario.atmospheric === FAIR; i++) w = endTurn(endTurn(w));
	expect(w.state.scenario.atmospheric).not.toBe(FAIR);
	const saveOf = (s: World["state"]["scenario"]) => {
		const saved = smallGameData();
		saved.state.scenario = { ...s };
		return readSave(JSON.stringify(writeSave(fromData(saved, null, new Scenario()), null, "remaster")))!.save.state.scenario;
	};
	const changed = saveOf(w.state.scenario);
	expect(changed.atmospheric).toBe(w.state.scenario.atmospheric);
	//the same fields in the same order as a save of the start weather
	expect(Object.keys(changed)).toEqual(Object.keys(saveOf(world(remasterRules, { zone: TEMPERATE, date: AUTUMN_WEST }).state.scenario)));
});
