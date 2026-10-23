//The game's objects as a mirror of the core's world (src/mirror.ts, #137): on every engine
//fixture, the core plays a round as the AI (every order checkpoint by checkpoint, as the screen plays
//it, every end of turn with its reinforcements), and after each piece applyData updates the objects:
//- toData of the objects is the world's state, and the counters its sight;
//- each unit still on the map is the object it was (the UI compares units with ===);
//- the world made again from the objects is the one they mirror.
//Then random commands a person sends, every type, the same way; and the other way: what a screen writes
//into the objects is in the world made from them
import fc from "fast-check";
import { expect, test } from "vitest";
import { commandOf, type Sequence, sequences } from "./commandgen";
import { fixtures } from "./contracts";
import { load } from "./invariants";
import { aiController } from "../src/core/ai";
import { tutorialController } from "../src/core/tutorial";
import { endTurn, nextOrder, play, playOn, type Session, startSession } from "../src/core/session";
import { begin, resume, step } from "../src/core/step";
import { arriveReinforcements, outcome } from "../src/core/turn";
import type { World } from "../src/core/types";
import type { Command } from "../src/commands";
import type { Unit } from "../src/unit";

const stats: Record<string, number> = {};
const count = (what: string) => { stats[what] = (stats[what] || 0) + 1; };

async function mirrorOf(name: string) {
	const o = await load(name);
	const { worldOf, applyData, mirrorDifference, unitObject } = await import("../src/mirror");
	const inputs = { spotSide: o.game.spotSide, noFOW: false };
	return { o, inputs, worldOf: () => worldOf(o.scenario, o.game, inputs), applyData: (w: World) => applyData(o.scenario, w, o.game),
		difference: (w: World) => mirrorDifference(o.scenario, w, o.game), unitObject: (id: number) => unitObject(o.m, id) };
}
type Mirror = Awaited<ReturnType<typeof mirrorOf>>;

//applyData after a piece of play, and what must hold then
function synced(x: Mirror, w: World, what: string) {
	const before = new Map<number, Unit>(x.o.m.getUnits().map((u) => [u.id, u]));
	x.applyData(w);
	count("syncs");
	expect(x.difference(w), what).toBe("");
	for (const u of x.o.m.getUnits())
		if (before.has(u.id)) expect(u === before.get(u.id), what + ": unit#" + u.id + " is the object it was").toBe(true);
		else count("units placed");
	for (const [id, u] of before) expect(x.unitObject(id), what + ": unit#" + id + " is known").toBe(u);
	const again = x.worldOf();
	expect(JSON.stringify(again.state), what + ": the world made again").toBe(JSON.stringify(w.state));
	expect([...again.sight.spot, ...again.sight.zoc].map((a) => a.join()), what + ": its sight")
		.toEqual([...w.sight.spot, ...w.sight.zoc].map((a) => a.join()));
	const byId = (a: number, b: number) => a - b;
	expect([...again.destroyed].sort(byId), what + ": the destroyed units")
		.toEqual(w.state.units.filter((u) => u.strength <= 0).map((u) => u.id).sort(byId));
}

//The current player's next order played piece by piece, or its turn ended. False when the game ended
function advanceSynced(x: Mirror, s: Session): boolean {
	const order = nextOrder(s), what = "turn " + s.world.state.turn.turn + " " + JSON.stringify(order);
	if (order === null) {
		const ended = endTurn(s, () => {
			x.applyData(s.world);
			count("turn starts");
			expect(x.difference(s.world), what + " at the turn start").toBe("");
		});
		synced(x, s.world, what);
		return s.ended === null && ended.kind === "endTurn";
	}
	if ("view" in order) return order.view.type !== "stuck";
	let phase = play(s, order.command);
	synced(x, s.world, what);
	while (phase.checkpoint !== null) {
		count("checkpoint " + phase.checkpoint.next);
		phase = playOn(s, phase.checkpoint);
		synced(x, s.world, what + " after a checkpoint");
	}
	return true;
}

test.each(fixtures("engine"))("The objects mirror the core's world as it plays %s", async (name) => {
	const x = await mirrorOf(name);
	const w = x.worldOf();
	expect(x.difference(w)).toBe("");
	const programs = { ...w, state: { ...w.state, players: w.state.players.map((p) => p.type === x.o.playerType.aiScripted ? p
		: { ...p, type: x.o.playerType.aiLocal }) } };
	const s = startSession(programs, (type, player) => type === x.o.playerType.aiScripted ? tutorialController(player) : aiController(player),
		{ loaded: true });
	synced(x, s.world, "the start");
	const last = s.world.state.turn.turn + 1;
	while (s.world.state.turn.turn < last && advanceSynced(x, s));
});

//A sequence of commands a person sends (test/commandgen.ts, offered by the objects), each played on the
//core piece by piece and mirrored; the end of turn with the side shown and the reinforcements
async function mirrorRun(seq: Sequence) {
	const x = await mirrorOf(seq.fixture), { o } = x;
	for (const p of o.m.getPlayers())
		if (!o.game.campaign || p.country === o.game.campaign.country) p.type = o.playerType.humanLocal;
	o.game.spotSide = x.inputs.spotSide = o.m.currentPlayer.side;
	o.Rng.game.state = seq.seed >>> 0;
	let w = x.worldOf();
	for (const pick of seq.steps) {
		const cmd = commandOf(o, pick);
		if (cmd === null) continue;
		count("commands");
		count(cmd.type);
		w = cmd.type === "endTurn" ? endTurnMirrored(x, w, seq.fixture) : piecewise(x, w, cmd, seq.fixture + " " + JSON.stringify(cmd));
		if (outcome(w) !== null) break;
	}
}

//The end of turn, the side shown, the reinforcements, mirrored after each
function endTurnMirrored(x: Mirror, w: World, what: string): World {
	const r = step(w, { type: "endTurn" });
	if (!r.ok) throw new Error("the end of turn refused");
	synced(x, r.world, what + " end of turn");
	x.o.game.spotSide = x.inputs.spotSide = x.o.m.currentPlayer.side;
	const arrived = arriveReinforcements({ ...r.world, spotSide: x.o.game.spotSide }).world;
	synced(x, arrived, what + " reinforcements");
	return arrived;
}

//A command played up to each checkpoint, mirrored after each
function piecewise(x: Mirror, w: World, cmd: Command, what: string): World {
	const b = begin(w, cmd);
	if ("refusal" in b) return w;
	synced(x, b.world, what);
	let world = b.world;
	for (let cp = b.checkpoint; cp !== null;) {
		const r = resume(world, cp);
		synced(x, world = r.world, what + " after " + cp.next);
		cp = r.checkpoint;
	}
	return world;
}

test("Property: the objects mirror the core's world through every command a person sends, piece by piece", async () => {
	await fc.assert(fc.asyncProperty(sequences, mirrorRun), { seed: 137, path: process.env.FC_PATH,
		numRuns: process.env.FC_RUNS ? Number(process.env.FC_RUNS) : 30 });
}, 120_000);

test("What a screen writes into the objects is in the world made from them", async () => {
	const x = await mirrorOf("drpzop01-t2.json.gz");
	const u = x.o.m.getUnits()[3], h = x.o.m.map[0][0];
	u.facing = (u.facing + 1) % 6;
	u.strength = 4;
	h.owner = 1;
	const list = Object.values(x.o.Equipment.equipmentIndexes).find((e) => e.unitclass)!.unitclass!;
	const sorted = Object.values(list).find((l) => l.length > 2)!;
	sorted.reverse();
	x.o.m.getVisibility().counters[1][1].spot[0] += 2;
	(await import("../src/context")).touched(); //(as the screen says it wrote)
	const w = x.worldOf();
	expect(w.state.units[3]).toMatchObject({ facing: u.facing, strength: 4 });
	expect(w.state.map.hexes[0].owner).toBe(1);
	expect(Object.values(w.state.equipment.indexes).some((e) => e.unitclass && Object.values(e.unitclass).some((l) => l.join() === sorted.join())))
		.toBe(true);
	//(the sight is computed from the units: a counter switched by hand isn't in it, D10)
	expect(w.sight.spot[0][x.o.m.cols + 1]).toBe(x.o.m.getVisibility().counters[1][1].spot[0] - 2);
	expect(x.difference(w)).toBe("the counters differ from the world's sight");
});

//The world the screen's rules read is kept until something says it wrote into the objects (touched);
//a write that didn't say so throws where the checks look (the tests, the dev server), and isn't seen
//without them. Under ?harness (no cache) the world is kept while toData of the objects is its state
test("The screen's rules read the world kept until something says it wrote into the objects", async () => {
	const x = await mirrorOf("drpzop01-t2.json.gz");
	const { rulesWorld, stepWorld, mirrorOptions } = await import("../src/mirror");
	const { touched } = await import("../src/context");
	const world = () => rulesWorld(x.o.scenario, x.o.game, x.inputs);
	const u = x.o.m.getUnits()[3], strength = () => world().state.units[3].strength;
	const w = world();
	expect(world()).toBe(w);
	expect(stepWorld(x.o.scenario, x.o.game, x.inputs)).toBe(w);
	expect(rulesWorld(x.o.scenario, x.o.game, { ...x.inputs, spotSide: 1 - x.inputs.spotSide }), "another side shown").not.toBe(w);
	u.strength = 4;
	touched();
	expect(strength()).toBe(4);
	u.strength = 5;
	expect(world, "a write nobody announced").toThrow(/without touched/);
	expect(() => stepWorld(x.o.scenario, x.o.game, x.inputs)).toThrow(/without touched/);
	mirrorOptions.checks = false;
	expect(strength(), "trusted without the checks").toBe(4);
	mirrorOptions.cache = false;
	expect(strength(), "?harness").toBe(5);
	expect(world()).toBe(world());
	u.strength = 6;
	expect(strength()).toBe(6);
});

//The purchase window sorts a copy of an equipment list (#186): the state's lists, which the AI buys
//from, keep their order, in the objects and in the world the rules read
test("The equipment lists sorted for the purchase window leave the world's lists in their order (#186)", async () => {
	const x = await mirrorOf("drpzop01-t2.json.gz");
	const { rulesWorld } = await import("../src/mirror");
	const world = () => rulesWorld(x.o.scenario, x.o.game, x.inputs);
	const [country, index] = Object.entries(x.o.Equipment.equipmentIndexes).find(([, e]) => e.unitclass)!;
	const [uclass] = Object.entries(index.unitclass!).find(([, l]) => l.length > 2)!;
	const listed = () => world().state.equipment.indexes[country].unitclass![uclass].join();
	const before = listed();
	const sorted = x.o.Equipment.getCountryEquipmentByClass(+uclass, +country, "cost", true).join();
	expect(sorted).not.toBe(before);
	expect(listed()).toBe(before);
	expect(x.o.Equipment.equipmentIndexes[country].unitclass![uclass].join()).toBe(before);
});

test("The pieces played cover the checkpoints, the turn starts and new units", () => {
	if (process.env.FC_STATS) console.log(JSON.stringify(stats));
	expect(stats["checkpoint surprise"]).toBeGreaterThan(10);
	expect(stats["checkpoint cleanUp"]).toBeGreaterThan(10);
	expect(stats["turn starts"]).toBeGreaterThan(10);
	expect(stats["units placed"]).toBeGreaterThan(0);
	expect(stats.commands).toBeGreaterThan(100);
});
