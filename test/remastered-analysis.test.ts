// @vitest-environment node
//The remastered AI's perception and analysis (src/core/remastered/, #610): what a side sees and remembers of the
//enemy, and the maps it reads (influence, front, threat, distances, supply), on hand-built maps; and its
//controller, which plays the classic AI's commands while it computes them
import { JSDOM } from "jsdom";
import { expect, test } from "vitest";
import { aiController } from "../src/core/ai";
import type { Controller } from "../src/core/controller";
import { createWorld } from "../src/core/create";
import { distance } from "../src/core/geometry";
import { newGame } from "../src/core/newgame";
import { analyse, type Analysis } from "../src/core/remastered/analysis";
import { aiControllerFor, remasteredController } from "../src/core/remastered/controller";
import { perceive, type Sighting } from "../src/core/remastered/perception";
import { classicRules, remasterRules } from "../src/core/rules";
import { advance, startSession } from "../src/core/session";
import { movMethod, playerType, terrainType } from "../src/core/tables";
import type { Position, World } from "../src/core/types";
import { hexIndex } from "../src/core/world";
import { setupOf } from "./corefiles";
import { type HandUnit, handWorld } from "./coreworld";

const PZ_IIA = 140, PSW_222 = 117, INFANTERIE = 115, TP7 = 273, P11C = 280, WZ13 = 262;

const at = (w: World, p: Position) => hexIndex(w, p.row, p.col);
const sum = (xs: ArrayLike<number>) => Array.from(xs).reduce((a, x) => a + x, 0);
const onTurn = (w: World, turn: number): World => ({ ...w, state: { ...w.state, turn: { ...w.state.turn, turn } } });

//The analysis side 0 makes of a hand-built world, with no memory
function analysed(w: World): Analysis {
	return analyse(w, perceive(w, 0, []));
}

function world(units: HandUnit[], rows = 12, cols = 16, options = {}): World {
	return handWorld({ rows, cols, units }, undefined, options);
}

test("a hidden enemy is in no map of the side's analysis (#610, #17)", () => {
	const units: HandUnit[] = [{ eqid: PZ_IIA, owner: 0, row: 2, col: 2 }, { eqid: TP7, owner: 1, row: 9, col: 13 }];
	const hidden = world(units), shown = world(units, 12, 16, { noFOW: true });
	const view = perceive(hidden, 0, []);
	expect(view.seen).toEqual([]);
	expect(view.enemies).toEqual([]);
	const a = analyse(hidden, view);
	expect([sum(a.influence.enemy), sum(a.threat.ground), sum(a.threat.air), a.front.length]).toEqual([0, 0, 0, 0]);
	//The same enemy in sight is in the maps
	const b = analysed(shown);
	expect(sum(b.influence.enemy)).toBeGreaterThan(0);
	expect(b.threat.ground[at(shown, { row: 9, col: 11 })]).toBe(10);
});

test("an enemy last seen fades from the side's view over the turns (#610)", () => {
	//Turn 1: the 7TP next to the Pz IIA. Then the Pz IIA drives away and loses sight of its hex
	const seenNow = world([{ eqid: PZ_IIA, owner: 0, row: 5, col: 5 }, { eqid: TP7, owner: 1, row: 5, col: 6, strength: 8 }]);
	let memory: readonly Sighting[] = perceive(seenNow, 0, []).enemies;
	expect(memory).toMatchObject([{ id: 1, eqid: TP7, row: 5, col: 6, strength: 8, turn: 1, confidence: 1 }]);
	const away = world([{ eqid: PZ_IIA, owner: 0, row: 5, col: 13 }, { eqid: TP7, owner: 1, row: 1, col: 1 }]);
	const confidences: number[] = [];
	for (let turn = 2; turn <= 5; turn++) {
		const view = perceive(onTurn(away, turn), 0, memory);
		expect(view.seen).toEqual([]);
		confidences.push(view.enemies.length ? view.enemies[0].confidence : 0);
		memory = view.enemies;
		if (turn === 2) {
			//Remembered where it was last seen, its strength weighted by the confidence
			expect(view.enemies[0]).toMatchObject({ row: 5, col: 6, turn: 1 });
			expect(sum(analyse(onTurn(away, turn), view).influence.enemy)).toBeGreaterThan(0);
		}
	}
	expect(confidences).toEqual([0.5, 0.25, 0.125, 0]);
	//Its last hex seen empty: forgotten at once
	const back = world([{ eqid: PZ_IIA, owner: 0, row: 5, col: 5 }, { eqid: TP7, owner: 1, row: 1, col: 1 }]);
	const remembered = perceive(onTurn(away, 2), 0, perceive(seenNow, 0, []).enemies).enemies;
	expect(remembered).toHaveLength(1);
	expect(perceive(onTurn(back, 3), 0, remembered).enemies).toEqual([]);
});

test("the front lies between the two sides' units (#610)", () => {
	//The Pz IIA strikes 6 hexes away (5 moves and its gun), the 7TP 5: they meet on columns 6 and 7
	const w = world([{ eqid: PZ_IIA, owner: 0, row: 5, col: 1 }, { eqid: TP7, owner: 1, row: 5, col: 11 }], 12, 16, { noFOW: true });
	const a = analysed(w);
	expect(a.front.length).toBeGreaterThan(0);
	const cols = a.front.map((h) => h % w.state.map.cols);
	expect([Math.min(...cols), Math.max(...cols)]).toEqual([6, 7]);
	//The own side holds sway at its end, the enemy at its own
	expect(a.influence.balance[at(w, { row: 5, col: 1 })]).toBeGreaterThan(0);
	expect(a.influence.balance[at(w, { row: 5, col: 11 })]).toBeLessThan(0);
});

test("the weak sectors are the objectives to take where the enemy is weak (#610)", () => {
	const w = world([{ eqid: PZ_IIA, owner: 0, row: 5, col: 1 }, { eqid: TP7, owner: 1, row: 2, col: 12 }], 12, 16, { noFOW: true });
	const objectives = [{ row: 2, col: 13 }, { row: 10, col: 3 }];
	const state = { ...w.state, objectives: [objectives, []] as [Position[], Position[]] };
	const a = analysed(createWorld({ data: w.data, state }, w.equipment, { noFOW: true }));
	expect(a.sectors.map((s) => [s.at, s.weak])).toEqual([[{ row: 10, col: 3 }, true], [{ row: 2, col: 13 }, false]]);
});

test("the threat map counts the enemy's reach next turn, ground and air apart (#610)", () => {
	//A 7TP moves 4 on clear ground and fires 1 further; a 105 mm gun fires 4 from where it stands
	const ground = analysed(world([{ eqid: PZ_IIA, owner: 0, row: 1, col: 1 }, { eqid: TP7, owner: 1, row: 5, col: 12 },
		{ eqid: WZ13, owner: 1, row: 6, col: 4 }], 12, 16, { noFOW: true }));
	const w = world([], 12, 16);
	const hexes = (pred: (h: number) => boolean) => Array.from({ length: 12 * 16 }, (_, h) => h).filter(pred);
	const from = (p: Position) => (h: number) => distance(Math.floor(h / 16), h % 16, p.row, p.col);
	const tank = from({ row: 5, col: 12 }), gun = from({ row: 6, col: 4 });
	expect(hexes((h) => tank(h) <= 5).every((h) => ground.threat.ground[h] >= 10)).toBe(true);
	expect(hexes((h) => tank(h) >= 6 && gun(h) > 4).every((h) => ground.threat.ground[h] === 0)).toBe(true);
	expect(hexes((h) => gun(h) <= 4).every((h) => ground.threat.ground[h] >= 10)).toBe(true);
	expect(sum(ground.threat.air)).toBe(0);
	//A fighter: the air over the whole of its flight, and its little ground attack below
	const air = analysed(world([{ eqid: PZ_IIA, owner: 0, row: 1, col: 1 }, { eqid: P11C, owner: 1, row: 5, col: 8 }], 12, 16, { noFOW: true }));
	expect(air.threat.air[at(w, { row: 1, col: 1 })]).toBe(10);
	expect(air.threat.ground[at(w, { row: 1, col: 1 })]).toBe(10);
});

test("the distance to an objective follows the terrain's cost for the movement method (#610)", () => {
	//Clear but for a forest across column 4; the objective to take on 1,7
	const w0 = handWorld({ rows: 3, cols: 8, terrain: (_r, c) => c === 4 ? terrainType.Forest : terrainType.Clear,
		units: [{ eqid: PZ_IIA, owner: 0, row: 1, col: 0 }, { eqid: PSW_222, owner: 0, row: 2, col: 0 }, { eqid: INFANTERIE, owner: 0, row: 0, col: 1 }] });
	const w = createWorld({ data: w0.data, state: { ...w0.state, objectives: [[{ row: 1, col: 7 }], []] } }, w0.equipment);
	const a = analysed(w);
	const field = (m: number) => a.distance.find((d) => d.movmethod === m);
	const start = at(w, { row: 1, col: 0 }), objective = at(w, { row: 1, col: 7 });
	const byNumber = (x: number, y: number) => x - y;
	expect(a.distance.map((d) => d.movmethod).sort(byNumber)).toEqual([movMethod.tracked, movMethod.wheeled, movMethod.leg].sort(byNumber));
	//7 hexes, one of them forest: tracked 6 x 1 + 2, wheeled 6 x 2 + 4
	expect([field(movMethod.tracked).take[start], field(movMethod.wheeled).take[start], field(movMethod.leg).take[start]]).toEqual([8, 16, 8]);
	expect(field(movMethod.tracked).take[objective]).toBe(0);
	expect(a.units.find((u) => u.id === 1)).toMatchObject({ take: field(movMethod.wheeled).take[at(w, { row: 2, col: 0 })] });
});

test("the supply map is 0 on the side's own city and grows away from it (#610)", () => {
	const city = { row: 3, col: 3 }, enemyCity = { row: 8, col: 10 };
	const w0 = handWorld({ rows: 12, cols: 12, terrain: (r, c) => (r === 3 && c === 3) || (r === 8 && c === 10) ? terrainType.City : terrainType.Clear,
		units: [{ eqid: PZ_IIA, owner: 0, row: 3, col: 6 }] });
	w0.state.map.hexes[at(w0, city)].owner = 0;
	w0.state.map.hexes[at(w0, enemyCity)].owner = 1;
	const a = analysed(w0);
	expect(a.supply.ground[at(w0, city)]).toBe(0);
	expect(a.supply.ground[at(w0, { row: 2, col: 3 })]).toBe(1);
	expect(a.supply.ground[at(w0, { row: 3, col: 6 })]).toBe(3);
	expect(a.supply.ground[at(w0, enemyCity)]).toBe(distance(3, 3, 8, 10));
	expect(a.units).toMatchObject([{ id: 0, supply: 3 }]);
});

//A few turns of Panzer-Verbaende Ostpreussen played by two controllers of each side: every order given
function orders(make: (player: number) => Controller, turns = 3): { orders: unknown[]; state: unknown } {
	const setup = { ...setupOf("drpzop01.xml", { game: 5, ai: 5 + 7919 }, null, undefined, [], new new JSDOM().window.DOMParser()),
		rules: remasterRules };
	const created = newGame(setup);
	for (const p of created.state.players) p.type = playerType.aiLocal;
	const w = createWorld(created, setup.equipment, { spotSide: -1, rules: setup.rules });
	const s = startSession(w, (_type, p) => make(p), { fresh: true, localSide: -1 });
	const given: unknown[] = [];
	for (let n = 0; n < 20_000 && s.world.state.turn.turn <= turns; n++) {
		const a = advance(s);
		if (a.kind === "ended") break;
		given.push(a.kind === "order" ? a.order : { end: a.player, started: a.started?.commands });
	}
	return { orders: given, state: s.world.state };
}

test("the remastered controller plays the classic AI's commands (#610)", () => {
	const made: ReturnType<typeof remasteredController>[] = [];
	const remastered = orders((p) => {
		const c = remasteredController(p);
		made.push(c);
		return c;
	});
	const classic = orders((p) => aiController(p));
	expect(remastered.orders.length).toBeGreaterThan(50);
	expect(remastered.orders).toEqual(classic.orders);
	expect(remastered.state).toEqual(classic.state);
	//and it analysed its turns beside them
	expect(made.every((c) => c.analysis !== null && c.view !== null)).toBe(true);
}, 60_000);

test("in the classic rules the AI is the classic controller and computes no analysis (#610)", () => {
	const w = world([{ eqid: PZ_IIA, owner: 0, row: 5, col: 1 }]);
	const classic = aiControllerFor(w, 0);
	expect("analysis" in classic).toBe(false);
	expect(w.rules).toBe(classicRules);
	const remaster = aiControllerFor({ ...w, rules: remasterRules }, 0);
	expect("analysis" in remaster).toBe(true);
	remaster.plan({ ...w, rules: remasterRules });
	expect((remaster as ReturnType<typeof remasteredController>).analysis).not.toBeNull();
	expect([classicRules.remasteredAI, remasterRules.remasteredAI]).toEqual([false, true]);
});
