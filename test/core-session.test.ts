// @vitest-environment node
//The core's headless session (src/core/session.ts) on hand-built games: the turn's order, the turn
//limit, a controller that gets stuck or hands its player over. That it plays as the old game does is
//test/core-ai.test.ts's
import { expect, test } from "vitest";
import { playerType } from "../src/prototypes";
import { aiController } from "../src/core/ai";
import type { Controller, Order } from "../src/core/controller";
import { advance, endTurn, nextOrder, play, playOn, playTurn, type StartedTurn, startSession } from "../src/core/session";
import type { World } from "../src/core/types";
import { handWorld } from "./coreworld";

const PZ_IIA = 140, TP7 = 273;

//A Pz IIA (player 0) and a 7TP (player 1) far apart, both players the AI (or as types says), the
//streams seeded
function farApart(types = [playerType.aiLocal, playerType.aiLocal]): World {
	const w = handWorld({ rows: 12, cols: 12, units: [{ eqid: PZ_IIA, owner: 0, row: 2, col: 2 }, { eqid: TP7, owner: 1, row: 9, col: 9 }] });
	return { ...w, state: { ...w.state, rng: { game: 1, ai: 2 }, players: w.state.players.map((p, i) => ({ ...p, type: types[i] })) } };
}

const ai = (_type: number, player: number) => aiController(player);

//A controller that plays the orders given, then ends its turn; startTurn changes the world as given,
//and hands the player over when it changed it
function scripted(player: number, orders: Order[], start?: (w: World) => World): Controller & { joined: number } {
	return {
		player, joined: 0,
		join(w) { this.joined++; return { world: w, commands: [], events: [], view: [] }; },
		startTurn(w) { return { world: start ? start(w) : w, commands: [], events: [], view: [], handOver: start !== undefined }; },
		plan: (w) => w,
		next: () => orders.shift() || null,
	};
}

test("In a new game the first player's AI ends its first turn at once; the next one plans before its reinforcements arrive (#94), saved before them (#93)", () => {
	const w = farApart();
	const { id: _id, row: _row, col: _col, ...tp } = w.state.units[1];
	const s = startSession({ ...w, state: { ...w.state, reinforcements: [{ turn: 1, row: 8, col: 8, unit: tp }] } }, ai);
	const first = advance(s);
	expect(first).toMatchObject({ kind: "endTurn", player: 0, started: { player: 1 } });
	expect(first.kind === "endTurn" && first.arrived.map((e) => e.type)).toEqual(["arrived"]);
	expect([s.saved.state.units.length, s.world.state.units.length]).toEqual([2, 3]);
	//The reinforcement (unit 2) isn't in the plan of the turn it arrived on
	const turn = playTurn(s);
	expect(turn[turn.length - 1]).toMatchObject({ kind: "endTurn", player: 1 });
	expect(turn.some((a) => a.kind === "order" && "command" in a.order && "unit" in a.order.command && a.order.command.unit === 2)).toBe(false);
	expect(s.world.state.rng.ai).not.toBe(2);	//the AI drew from its stream
});

test("The turn limit ends the game only for a side that plays on this screen", () => {
	const w = farApart();
	const last = { ...w, state: { ...w.state, scenario: { ...w.state.scenario, maxTurns: 1 } } };
	const idle = (_type: number, player: number) => scripted(player, []);
	const shown = startSession(last, idle, { localSide: 0 });
	expect(advance(shown)).toMatchObject({ kind: "endTurn", player: 0, arrived: [] });
	expect(shown.ended).toEqual({ kind: "turnLimit", side: 0 });
	expect(advance(shown)).toEqual({ kind: "ended" });
	const aiOnly = startSession(last, idle);
	advance(aiOnly);
	expect([aiOnly.localSide, aiOnly.ended, aiOnly.world.state.turn.currentPlayer]).toEqual([-1, null, 1]);
});

test("A controller stuck where the old game froze ends the game for good (#80)", () => {
	const s = startSession(farApart(), (_type, player) => scripted(player, [{ view: { type: "stuck", reason: "no unit" } }]));
	expect(advance(s)).toMatchObject({ kind: "order", player: 0, order: { view: { type: "stuck" } } });
	expect([s.ended, advance(s)]).toEqual([{ kind: "stuck", reason: "no unit" }, { kind: "ended" }]);
});

test("A player handed over to the AI gets a new one at once, which ends that turn having planned nothing (#81)", () => {
	let handed: Controller & { joined: number } = null;
	const toAI = (w: World) => ({ ...w, state: { ...w.state, players: w.state.players.map((p) => p.id === 1 ? { ...p, type: playerType.aiLocal } : p) } });
	const s = startSession(farApart([playerType.aiScripted, playerType.aiScripted]), (type, player) => {
		if (type === playerType.aiLocal) return handed = scripted(player, []);
		return scripted(player, [], player === 1 ? toAI : undefined);
	});
	expect(s.localSide).toBe(2);	//both scripted: hotseat, the screen shows the current player's side
	expect(advance(s)).toMatchObject({ kind: "endTurn", player: 0, started: { player: 1 } });
	expect([s.world.spotSide, s.world.state.players[1].type, handed.joined, s.controllers[1]]).toEqual([1, playerType.aiLocal, 1, handed]);
	expect(advance(s)).toMatchObject({ kind: "endTurn", player: 1 });
});

test("What the controllers ask of the screen when they join is kept for it, in the players' order", () => {
	const s = startSession(farApart([playerType.aiScripted, playerType.aiScripted]), (_type, player) => ({
		...scripted(player, []),
		join: (w: World) => ({ world: w, commands: [], events: [], view: [{ type: "select" as const, unit: player }] }),
	}));
	expect(s.joined).toEqual([{ type: "select", unit: 0 }, { type: "select", unit: 1 }]);
});

test("A screen asks for the next order, shows the state, then plays it checkpoint by checkpoint", () => {
	const move: Order = { command: { type: "move", unit: 0, to: { row: 3, col: 3 } } };
	const s = startSession(farApart(), (_type, player) => scripted(player, player === 0 ? [move] : []));
	const before = s.world;
	const order = nextOrder(s);
	expect([order, s.world]).toEqual([move, before]);
	const moved = play(s, "command" in order ? order.command : null);
	expect(moved).toMatchObject({ refusal: null, checkpoint: { next: "surprise", unit: 0, surprise: null, win: false } });
	expect(moved.events.map((e) => e.type)).toEqual(["moved"]);
	expect(playOn(s, moved.checkpoint)).toEqual({ events: [], refusal: null, checkpoint: null });
	expect(s.world.state.units[0]).toMatchObject({ row: 3, col: 3 });
	expect([nextOrder(s), play(s, { type: "resupply", unit: 9 })]).toEqual([null, { events: [], refusal: { reason: "no such unit" }, checkpoint: null }]);
});

test("The end of turn stops at the save point for the screen: the AI's turn started and planned, its reinforcements not yet there", () => {
	const w = farApart();
	const { id: _id, row: _row, col: _col, ...tp } = w.state.units[1];
	const s = startSession({ ...w, state: { ...w.state, reinforcements: [{ turn: 1, row: 8, col: 8, unit: tp }] } }, ai);
	const seen: [StartedTurn | null, number][] = [];
	const ended = endTurn(s, (started) => { seen.push([started, s.world.state.units.length]); });
	expect(seen).toEqual([[{ player: 1, type: playerType.aiLocal, commands: [], events: [], view: [] }, 2]]);
	expect([ended.kind === "endTurn" && ended.arrived.length, s.world.state.units.length, s.saved.state.units.length]).toEqual([1, 3, 2]);
});
