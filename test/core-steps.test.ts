//Differential property tests of the core's commands (docs/CORE.md, #134): random command sequences
//on the engine fixtures, each command played on the old engine through Commands.execute and on the
//core through step (and check), and after every command:
//- the same answer: both run it, or both refuse it for the same reason, check's;
//- the same state: toData of the old engine and the core's state, as JSON (the key order is the
//  save's), the random streams' positions included;
//- the core's sight equals computeSight of its state, and the old engine's counters;
//- the same story: what the old engine's hooks saw (support fire, the attack, the units destroyed,
//  retreats, surrenders, victories, surprises, captures) and the core's events;
//- the core never changed the state it was given (it is frozen).
//
//The core plays on from its own state: the old engine is only the oracle. The end of turn isn't the
//core's yet (#135): the old engine plays it and the core takes its state again. Masked, by issue:
//the old engine's counters drift from its units (#73: an embark, a disembark, an upgrade, a leader
//that sees farther; #72), the core's sight is computed from them. With the same state after the
//command, the old engine's counters are made again from its units and the sequence goes on; with
//another (the drift changed what the command did), it stops there. Commands are played as a
//program sends them: nothing selected (the selection is the UI's, D6; MapSelection.select and
//clear put a unit leaving its carrier back on it).
//
//Then the purchases in a row, and the engine contract's own commands. The move, the attack and the
//undo aren't the core's yet: the old engine plays them and the core takes its state.
//
//FC_SEED=<seed> FC_PATH=<path> replays a failure, FC_RUNS=<n> plays more sequences, FC_STATS=1
//prints what was played, resynced and masked
import fs from "node:fs";
import fc from "fast-check";
import { afterAll, expect, test } from "vitest";
import { type ContractEnv, fixtures, runFixture } from "./contracts";
import { load, recompute } from "./invariants";
import { createWorld } from "../src/core/create";
import { computeSight } from "../src/core/sight";
import { check, step, type Stepped } from "../src/core/step";
import type { GameEvent } from "../src/core/events";
import type { Unit } from "../src/unit";
import type { AttackCommandHooks, Command, Commands, MoveCommandHooks, Refusal } from "../src/commands";
import type { toData as ToData } from "../src/state";

//The old engine's modules of a restored fixture (test/invariants.ts load), and the core's world
type World = Awaited<ReturnType<typeof load>>;
type CoreWorld = ReturnType<typeof createWorld>;

const SEED = process.env.FC_SEED ? Number(process.env.FC_SEED) : 134;
const RUNS = process.env.FC_RUNS ? Number(process.env.FC_RUNS) : 0;

const kinds = { move: 8, capture: 2, attack: 6, resupply: 1, reinforce: 1, overstrength: 1, mount: 1, unmount: 1, embark: 1,
	disembark: 1, upgrade: 1, undo: 3, disband: 1, buy: 1, deploy: 1, upgradeUndeployed: 1, sell: 1, endTurn: 2, any: 4 };
type Kind = keyof typeof kinds;
interface Pick { kind: Kind; unit: number; pick: number; any: number }
interface Sequence { fixture: string; seed: number; steps: Pick[] }

const sequences: fc.Arbitrary<Sequence> = fc.record({
	fixture: fc.constantFrom(...fixtures("engine")),
	seed: fc.integer(),
	steps: fc.array(fc.record({
		kind: fc.oneof(...Object.entries(kinds).map(([k, weight]) => ({ arbitrary: fc.constant(k as Kind), weight }))),
		unit: fc.nat(63), pick: fc.nat(1023), any: fc.nat(1 << 20),
	}), { maxLength: 40, size: "max" }),
});

//The game: every player human (as the undo needs), but a campaign's other players (Game makes them
//AI on every load); the game stream seeded, so the dice have a position in the state
async function start(seq: Sequence) {
	const w = await load(seq.fixture);
	const { toData } = await import("../src/state");
	const { Actions } = await import("../src/actions");
	for (const p of w.m.getPlayers())
		if (!w.game.campaign || p.country === w.game.campaign.country) p.type = w.playerType.humanLocal;
	w.game.spotSide = w.m.currentPlayer.side;
	w.Rng.game.state = seq.seed >>> 0;
	const data = () => toData(w.scenario, w.game);
	return { w, Actions, data, core: coreOf(w, data), log: [] as string[] };
}
type Play = Awaited<ReturnType<typeof start>>;

function coreOf(w: World, data: () => ReturnType<typeof ToData>): CoreWorld {
	return createWorld(data(), w.Equipment.equipment);
}

//The commands of a kind the engine offers the current player's unit u (none: it has none)
type Offer = (w: World, u: Unit) => Command[];
const one = (rule: (w: World, u: Unit) => boolean, cmd: (u: Unit) => Command): Offer => (w, u) => rule(w, u) ? [cmd(u)] : [];
const moves = (w: World, u: Unit) => w.GameRules.getMoveRange(w.m, u).filter((c) => c.canMove);
const unitOffers: Partial<Record<Kind, Offer>> = {
	move: (w, u) => moves(w, u).map((c) => ({ type: "move", unit: u.id, to: { row: c.row, col: c.col } })),
	capture: (w, u) => moves(w, u).filter((c) => enemyHex(w, u, c))
		.map((c) => ({ type: "move", unit: u.id, to: { row: c.row, col: c.col } })),
	attack: ({ m, GameRules: GR }, u) => GR.getUnitAttackCells(m.map, u, m.rows, m.cols)
		.flatMap((c) => [false, true].map((air) => m.map[c.row][c.col].getAttackableUnit(u, air)))
		.filter((t, i, all) => t && all.indexOf(t) === i).map((t) => ({ type: "attack", unit: u.id, target: t.id })),
	resupply: one((w, u) => w.GameRules.canResupply(w.m.map, u), (u) => ({ type: "resupply", unit: u.id })),
	reinforce: one((w, u) => w.GameRules.canReinforce(w.m.map, u), (u) => ({ type: "reinforce", unit: u.id })),
	overstrength: one((w, u) => w.GameRules.canReinforce(w.m.map, u, true), (u) => ({ type: "reinforce", unit: u.id, overstrength: true })),
	mount: one((w, u) => w.GameRules.canMount(u), (u) => ({ type: "mount", unit: u.id })),
	unmount: one((w, u) => w.GameRules.canUnmount(u), (u) => ({ type: "unmount", unit: u.id })),
	embark: one((w, u) => w.GameRules.canEmbark(w.m.map, u), (u) => ({ type: "embark", unit: u.id })),
	disembark: one((w, u) => w.GameRules.canDisembark(w.m.map, u), (u) => ({ type: "disembark", unit: u.id })),
	upgrade: (w, u) => sameClass(w, u.eqid).map((eqid) => ({ type: "upgrade", unit: u.id, eqid, transport: -1 })),
	undo: one((w, u) => w.m.canUndoMove(u), (u) => ({ type: "undo", unit: u.id })),
	disband: one(() => true, (u) => ({ type: "disband", unit: u.id })),
};

//A hex with a flag or an owner, not of u's side
function enemyHex(w: World, u: Unit, c: { row: number; col: number }): boolean {
	const h = w.m.map[c.row][c.col];
	if (h.owner === -1) return h.flag !== -1;
	return w.m.getPlayer(h.owner).side !== u.player.side;
}

//Other equipment of the class of eqid
function sameClass(w: World, eqid: number): number[] {
	const all = w.Equipment.equipment, uclass = all[eqid].uclass;
	return Object.keys(all).map(Number).filter((id) => id !== eqid && all[id].uclass === uclass);
}

//The current player's commands on its core list and purchases
const playerOffers: Partial<Record<Kind, (w: World) => Command[]>> = {
	buy: (w) => Object.keys(w.Equipment.equipment).map(Number)
		.filter((eqid) => w.Equipment.equipment[eqid].country === w.m.currentPlayer.country)
		.map((eqid) => ({ type: "buy", eqid, transport: -1 })),
	deploy: (w) => {
		const list = w.m.currentPlayer.getCoreUnitList(), hexes = freeDeployHexes(w);
		return list.flatMap((u, index) => u.isDeployed ? [] : hexes.map((to) => ({ type: "deploy", index, to: { row: to.row, col: to.col } })));
	},
	upgradeUndeployed: (w) => w.m.currentPlayer.getCoreUnitList()
		.flatMap((u, index) => sameClass(w, u.eqid).map((eqid) => ({ type: "upgradeUndeployed", index, eqid, transport: 0 }))),
	sell: (w) => w.m.currentPlayer.getCoreUnitList().map((_u, index) => ({ type: "sell", index })),
};

//The current player's side's deployment hexes with no unit
function freeDeployHexes(w: World) {
	return w.m.getDeployHexes(w.m.currentPlayer.side).filter((c) => !w.m.map[c.row][c.col].unit && !w.m.map[c.row][c.col].airunit);
}

//Any command at all from the pick's numbers, its ids and cells near the fixture's: most are refused,
//some allowed where the rules have no say
function anyCommand(w: World, n: number): Command {
	const ids = w.m.getUnits().map((u) => u.id);
	const unit = [...ids, -1, w.m.getBoard().uniqueID][n % (ids.length + 2)];
	const to = { row: (n >> 3) % (w.m.rows + 2) - 1, col: (n >> 7) % (w.m.cols + 2) - 1 };
	const eqids = Object.keys(w.Equipment.equipment).map(Number);
	const eqid = [...eqids, 0, -1, 99999][(n >> 5) % (eqids.length + 3)];
	const index = (n >> 9) % 4;
	const types: Command[] = [{ type: "move", unit, to }, { type: "attack", unit, target: ids[(n >> 4) % ids.length] },
		{ type: "resupply", unit }, { type: "reinforce", unit, overstrength: (n & 8) > 0 }, { type: "mount", unit },
		{ type: "unmount", unit }, { type: "embark", unit }, { type: "disembark", unit }, { type: "undo", unit },
		{ type: "deploy", index, to }, { type: "buy", eqid, transport: n & 16 ? -1 : eqid }, { type: "upgrade", unit, eqid, transport: -1 },
		{ type: "upgradeUndeployed", index, eqid, transport: 0 }, { type: "disband", unit }, { type: "sell", index }];
	return types[(n >> 11) % types.length];
}

//The command a pick stands for, null when the player has none of its kind
function commandOf(w: World, s: Pick): Command | null {
	if (s.kind === "endTurn") return { type: "endTurn" };
	if (s.kind === "any") return anyCommand(w, s.any);
	const own = playerOffers[s.kind];
	if (own) {
		const list = own(w);
		return list.length ? list[s.pick % list.length] : null;
	}
	const offer = unitOffers[s.kind], m = w.m;
	const units = m.getUnits().filter((u) => u.player.id === m.currentPlayer.id && u.getPos() && offer(w, u).length);
	if (!units.length) return null;
	const list = offer(w, units[s.unit % units.length]);
	return list[s.pick % list.length];
}

//What the old engine's hooks saw, as text
function oldStory(story: string[]): MoveCommandHooks & AttackCommandHooks {
	const finish = {
		onDestroyed: (_c: unknown, u: Unit) => story.push("destroyed " + u.id),
		onRetreat: (u: Unit, c: { row: number; col: number }) => story.push(`retreat ${u.id} ${c.row},${c.col}`),
		onSurrender: (_c: unknown, u: Unit) => story.push("surrender " + u.id),
		onVictory: (side: number) => story.push("victory " + side),
	};
	const shots = {
		onSupportShot: (u: Unit) => story.push("support " + u.id),
		onAttack: () => story.push("attack"),
	};
	return {
		...shots, finish: { ...shots, ...finish, onSurprised: (c: { row: number; col: number }) => story.push(`surprised ${c.row},${c.col}`),
			onCapture: (u: Unit) => story.push("capture " + u.id) },
		surprise: finish,
	} as unknown as MoveCommandHooks & AttackCommandHooks;
}

//The same story from the core's events (a retreat's capture has no hook: the retreat's finish is
//the caller's)
const told: { [T in GameEvent["type"]]?: (e: Extract<GameEvent, { type: T }>) => string } = {
	fight: (e) => e.support ? "support " + e.attacker.unit : "attack",
	destroyed: (e) => "destroyed " + e.unit,
	retreated: (e) => `retreat ${e.unit} ${e.to.row},${e.to.col}`,
	surrendered: (e) => "surrender " + e.unit,
	victory: (e) => "victory " + e.side,
	surprised: (e) => `surprised ${e.at.row},${e.at.col}`,
	captured: (e) => e.flag || e.objective ? "capture " + e.unit : "",
};
function coreStory(events: GameEvent[]): string[] {
	const retreated = new Set(events.filter((e) => e.type === "retreated").map((e) => "unit" in e && e.unit));
	return events.filter((e) => !(e.type === "captured" && retreated.has(e.unit)))
		.map((e) => (told[e.type] as ((x: GameEvent) => string) | undefined)?.(e) || "").filter((t) => t !== "");
}

//Freezes what isn't frozen yet: the state the core is given must stay as it was
function freeze(o: unknown) {
	if (o === null || typeof o !== "object" || Object.isFrozen(o)) return;
	Object.freeze(o);
	for (const v of Object.values(o)) freeze(v);
}

//Whether the old engine's counters equal the sight given, count for count
function countersEqual(w: World, spot: (side: number, i: number) => number, zoc: (side: number, i: number) => number): boolean {
	const counters = w.m.getBoard().visibility.counters;
	for (let r = 0; r < w.m.rows; r++)
		for (let c = 0; c < w.m.cols; c++)
			for (const side of [0, 1]) {
				const i = r * w.m.cols + c;
				if (counters[r][c].spot[side] !== spot(side, i) || counters[r][c].zoc[side] !== zoc(side, i)) return false;
			}
	return true;
}

//The old engine's counters as its units make them
function resync(w: World) {
	const board = recompute(w), counters = w.m.getBoard().visibility.counters;
	for (let r = 0; r < w.m.rows; r++)
		for (let c = 0; c < w.m.cols; c++) {
			counters[r][c].spot = board[r][c].spot.slice();
			counters[r][c].zoc = board[r][c].zoc.slice();
		}
}

//The old engine's counters drifted from its own units (#72, #73)
function drifted(w: World): boolean {
	const board = recompute(w);
	return !countersEqual(w, (side, i) => board[(i / w.m.cols) >> 0][i % w.m.cols].spot[side],
		(side, i) => board[(i / w.m.cols) >> 0][i % w.m.cols].zoc[side]);
}

const stats = { sequences: 0, commands: 0, refused: 0, oldThrew: 0, ended: 0 } as Record<string, number>;
afterAll(() => { if (process.env.FC_STATS) fs.writeSync(2, JSON.stringify(stats) + "\n"); });

//The sequence ends at this command (the old engine threw, or drifted)
const STOP = "stop";

//Plays a command on both: null when the sequence goes on, STOP when it ends there, or what differs
function playBoth(p: Play, cmd: Command): string | null {
	const { w } = p;
	w.m.currentUnit = null;
	const story: string[] = [];
	const old = oldExecute(w, cmd, story);
	if (old === null) return STOP;
	const core = coreStep(p.core, cmd);
	if (notYet(core)) {
		p.core = coreOf(w, p.data);
		return null;
	}
	if (!old.ok || !core.ok) return refusals(old, core, check(p.core, cmd));
	return compareStates(p, cmd, core.world, core.events, story);
}

//After a command both ran: the states, the sight, the story. The core goes on from its own state
function compareStates(p: Play, cmd: Command, core: CoreWorld, events: GameEvent[], story: string[]): string | null {
	const { w } = p;
	const want = JSON.stringify(p.data().state), got = JSON.stringify(core.state);
	const sightOk = countersEqual(w, (side, i) => core.sight.spot[side][i], (side, i) => core.sight.zoc[side][i]);
	if ((want !== got || !sightOk) && drifted(w)) return masked(p, cmd, core, want === got);
	p.core = core;
	for (const e of events) count("event " + e.type);
	const problems = [want !== got ? "toData:" + difference(want, got) : "", sightProblem(core, sightOk),
		storyProblem(story, coreStory(events))].filter((x) => x !== "");
	return problems.length ? problems.join("\n") : null;
}

//The old engine's counters drifted (#72, #73): with the same state, it goes on with the counters its
//units make; otherwise the sequence stops there
function masked(p: Play, cmd: Command, core: CoreWorld, same: boolean): string | null {
	count((same ? "resynced " : "masked ") + cmd.type);
	if (!same) return STOP;
	resync(p.w);
	p.core = core;
	return null;
}

function count(what: string) {
	stats[what] = (stats[what] || 0) + 1;
}

//A command the core doesn't play yet (the move, the attack, the undo): the old engine plays it and
//the core takes its state
function notYet(r: Stepped): boolean {
	return "refusal" in r && r.refusal.reason.includes("isn't in the core yet");
}

//The core's step on the world frozen: the state it was given must stay as it was
function coreStep(w: CoreWorld, cmd: Command): Stepped {
	freeze(w.state);
	count("commands");
	count(cmd.type);
	return step(w, cmd);
}

//The old engine's command with the hooks telling the story, null when it threw
function oldExecute(w: World, cmd: Command, story: string[]): ReturnType<World["Commands"]["execute"]> | null {
	try {
		return w.Commands.execute(w.scenario, cmd, oldStory(story));
	} catch {
		count("oldThrew");
		return null;
	}
}

//A refusal on either side: the same reason on both, and check's
function refusals(old: { ok: boolean }, core: Stepped, checked: Refusal | null): string | null {
	count("refused");
	const a = "refusal" in old ? (old as { refusal: Refusal }).refusal.reason : "ran";
	const b = "refusal" in core ? core.refusal.reason : "ran";
	if (a !== b) return `old: ${a}, core: ${b}`;
	return (checked === null ? "ran" : checked.reason) === b ? null : "check and step refuse differently";
}

//The core's sight: computeSight's of its state, and the old engine's counters
function sightProblem(w: CoreWorld, sameAsOld: boolean): string {
	const fresh = computeSight(w);
	const same = [0, 1].every((s) => fresh.spot[s].join() === w.sight.spot[s].join() && fresh.zoc[s].join() === w.sight.zoc[s].join());
	if (!same) return "the core's sight isn't computeSight's";
	return sameAsOld ? "" : "the core's sight isn't the old counters";
}

function storyProblem(old: string[], core: string[]): string {
	return old.join("; ") === core.join("; ") ? "" : `old hooks: ${old.join("; ")}\n  core events: ${core.join("; ")}`;
}

//Where two texts first differ
function difference(want: string, got: string): string {
	let d = 0;
	while (d < want.length && want[d] === got[d]) d++;
	const cut = (t: string) => t.slice(Math.max(0, d - 150), d + 150);
	return "\n    old  " + cut(want) + "\n    core " + cut(got);
}

//The end of turn as game.ts plays it, on the old engine; the core takes its state. Whether the game ended
function endTurn(p: Play): boolean {
	const { w } = p;
	w.m.currentUnit = null;
	const r = w.Commands.execute(w.scenario, { type: "endTurn" }, { localSide: 2 });
	if (r.ok && r.result) return true;
	w.game.spotSide = w.m.currentPlayer.side;
	p.Actions.deployReinforcements(w.scenario, w.m.turn, w.m.currentPlayer.id);
	p.core = coreOf(w, p.data);
	return false;
}

async function run(seq: Sequence): Promise<void> {
	const p = await start(seq);
	stats.sequences++;
	const played = () => seq.fixture + ", seed " + seq.seed + ":\n  " + p.log.join("\n  ");
	Object.assign(seq, { [fc.toStringMethod]: played });
	for (const s of seq.steps) {
		const cmd = commandOf(p.w, s);
		if (cmd === null) continue;
		p.log.push("turn " + p.w.m.turn + " player#" + p.w.m.currentPlayer.id + ": " + JSON.stringify(cmd));
		if (cmd.type === "endTurn") {
			if (endTurn(p)) break;
			continue;
		}
		const problem = playBoth(p, cmd);
		if (problem === STOP) break;
		if (problem !== null) throw new Error(played() + "\n" + problem);
		if (p.Actions.checkOutcome(p.w.scenario)) {
			stats.ended++;
			break;
		}
	}
}

test("Property: the core's commands play as the old engine's, state, sight and events (counter drift: #72, #73)", async () => {
	await fc.assert(fc.asyncProperty(sequences, run), { seed: SEED, path: process.env.FC_PATH, numRuns: RUNS || 20 });
	expect(stats.commands).toBeGreaterThan(0);
}, RUNS ? RUNS * 5000 : 120_000);


//The purchases in a row on every fixture where the player whose turn it is can deploy, with prestige
//to spare: buy a unit with a transport and one without, upgrade one off the map, deploy it, upgrade
//it on the map, sell the other, disband the deployed one
test("Buying, deploying, upgrading, selling and disbanding play the same on both engines", async () => {
	const events = (type: string) => stats["event " + type] || 0;
	const before = [events("deployed"), events("upgraded"), events("sold"), events("disbanded")];
	for (const fixture of fixtures("engine")) {
		const p = await start({ fixture, seed: 1, steps: [] });
		const { w } = p, player = w.m.currentPlayer, to = freeDeployHexes(w)[0];
		const own = Object.keys(w.Equipment.equipment).map(Number).filter((id) => w.Equipment.equipment[id].country === player.country);
		const unit = own.find((id) => w.Equipment.equipment[id].movmethod !== 5 && sameClass(w, id).length > 0); //(not air)
		if (!to || unit === undefined) continue;
		const truck = own.find((id) => w.Equipment.equipment[id].uclass === w.unitClass.groundTransport) || -1;
		player.prestige = 100000;
		p.core = coreOf(w, p.data);
		const index = player.getCoreUnitList().length, upgradeTo = sameClass(w, unit)[0];
		const cmds: Command[] = [{ type: "buy", eqid: unit, transport: truck }, { type: "buy", eqid: unit, transport: -1 },
			{ type: "upgradeUndeployed", index, eqid: upgradeTo, transport: 0 }, { type: "deploy", index, to: { row: to.row, col: to.col } },
			{ type: "upgrade", unit: w.m.getBoard().uniqueID, eqid: unit, transport: -1 }, { type: "sell", index: index + 1 },
			{ type: "disband", unit: w.m.getBoard().uniqueID }];
		for (const cmd of cmds) expect(playBoth(p, cmd), fixture + " " + JSON.stringify(cmd)).toBeNull();
	}
	const after = [events("deployed"), events("upgraded"), events("sold"), events("disbanded")];
	after.forEach((n, i) => expect(n - before[i]).toBeGreaterThan(2));
});

//The engine contract's commands (the AI's and its random player actions, test/contracts/engine.contract.js),
//each also stepped on the core from toData of the state before it: the same answer and the same
//state after. The old engine's counters are made again from its units where they drifted (#72, #73);
//a command during which they drifted isn't compared when the states differ, nor one that deselected
//a unit in the middle of a disembark
test("The engine contract's commands, each on the core from the state before it, play as on the old engine", async () => {
	const seen = { compared: 0, skipped: 0 };
	const problems: string[] = [];
	for (const name of fixtures("engine"))
		await runFixture("engine", "runEngineContract", name, (env) => ({ Commands: shadowCommands(env, (cmd, problem) => {
			if (problem === null) seen.skipped++;
			else seen.compared++;
			if (problem) problems.push(name + " " + JSON.stringify(cmd) + ": " + problem);
		}) }));
	if (process.env.FC_STATS) fs.writeSync(2, JSON.stringify(seen) + "\n");
	expect(problems).toEqual([]);
	expect(seen.compared).toBeGreaterThan(500);
}, 300_000);

//Commands.execute of the contract's modules, which also steps the core from the state before the
//command and tells what differs ("": nothing; null: not compared, the counters drifted during it or
//the selection changed a unit)
function shadowCommands(env: ContractEnv, tell: (cmd: Command, problem: string | null) => void): typeof Commands {
	const real = env.Commands as typeof Commands, toData = env.toData as typeof ToData, game = env.game as World["game"];
	const old = { m: env.map, GameRules: env.GameRules } as World;
	const equipment = (env.Equipment as World["Equipment"]).equipment;
	return {
		check: (scenario, cmd) => real.check(scenario, cmd),
		execute(scenario, cmd, hooks) {
			if (cmd.type === "endTurn") return real.execute(scenario, cmd, hooks);
			//(the old engine plays on with the counters its units make: the core's sight)
			if (drifted(old)) resync(old);
			//(a unit selected in the middle of a disembark goes back on its carrier when the command
			//selects another: the selection is the UI's, D6)
			const selected = old.m.currentUnit, leaving = selected !== null && selected.carrier < 0;
			const before = toData(scenario, game);
			const core = step(createWorld(before, equipment), cmd);
			const r = real.execute(scenario, cmd, hooks);
			const driftAfter = drifted(old);
			if (driftAfter) resync(old);
			const want = JSON.stringify(toData(scenario, game).state);
			const got = JSON.stringify("world" in core ? core.world.state : before.state);
			tell(cmd, notCompared(core, want !== got, driftAfter || leaving) ? null : compared(r, core, want, got));
			return r;
		},
	};
}

//A command the core doesn't play yet, or one whose states differ where the counters drifted or the
//selection changed a unit
function notCompared(core: Stepped, differ: boolean, unreliable: boolean): boolean {
	return notYet(core) || (differ && unreliable);
}

//What differs between the old engine's command and the core's step: the answer, then the state
function compared(old: { ok: boolean }, core: Stepped, want: string, got: string): string {
	const a = "refusal" in old ? (old as { refusal: Refusal }).refusal.reason : "ran";
	const b = "refusal" in core ? core.refusal.reason : "ran";
	if (a !== b) return `old ${a}, core ${b}`;
	return want !== got ? "toData:" + difference(want, got) : "";
}
