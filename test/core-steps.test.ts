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
//The core plays on from its own state: the old engine is only the oracle. The end of turn plays as the
//game plays it (#135): the command, the side shown set, then the reinforcements, with the outcome
//compared after every command. The AI's turn start isn't the core's yet (#136): no player plans
//(test/invariants.ts load). Masked, by issue:
//the old engine's counters drift from its units (#73: an embark, a disembark, an upgrade, a leader
//that sees farther; #72), the core's sight is computed from them. With the same state after the
//command, the old engine's counters are made again from its units and the sequence goes on; with
//another (the drift changed what the command did), it stops there. Commands are played as a
//program sends them: nothing selected (the selection is the UI's, D6; MapSelection.select and
//clear put a unit leaving its carrier back on it).
//
//Then the purchases in a row, a campaign's dossier, and the engine contract's own commands.
//
//FC_SEED=<seed> FC_PATH=<path> replays a failure, FC_RUNS=<n> plays more sequences, FC_STATS=1
//prints what was played, resynced and masked
import fs from "node:fs";
import fc from "fast-check";
import { afterAll, expect, test } from "vitest";
import { type ContractEnv, fixtures, runFixture } from "./contracts";
import { countersEqual, drifted, load, resync } from "./invariants";
import { difference } from "./aigames";
import { commandOf, freeDeployHexes, sameClass, type Sequence, sequences } from "./commandgen";
import { createWorld } from "../src/core/create";
import { computeSight } from "../src/core/sight";
import { begin, check, resume, step, type Stepped } from "../src/core/step";
import { arriveReinforcements, outcome } from "../src/core/turn";
import type { GameEvent } from "../src/core/events";
import type { Unit } from "../src/unit";
import type { AttackCommandHooks, Command, Commands, MoveCommandHooks, Refusal } from "../src/commands";
import type { toData as ToData } from "../src/state";

//The old engine's modules of a restored fixture (test/invariants.ts load), and the core's world
type World = Awaited<ReturnType<typeof load>>;
type CoreWorld = ReturnType<typeof createWorld>;

const SEED = process.env.FC_SEED ? Number(process.env.FC_SEED) : 134;
const RUNS = process.env.FC_RUNS ? Number(process.env.FC_RUNS) : 0;


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
	return createWorld(data(), w.Equipment.equipment, { spotSide: w.game.spotSide });
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

//The core's step on the world frozen: the state it was given must stay as it was. The same command
//played checkpoint by checkpoint, as a screen plays it (begin, then resume), ends the same
function coreStep(w: CoreWorld, cmd: Command): Stepped {
	freeze(w.state);
	count("commands");
	count(cmd.type);
	const r = step(w, cmd);
	const [whole, phased] = [r, inPhases(w, cmd)].map(outcomeOf);
	if (whole !== phased) throw new Error(`${JSON.stringify(cmd)} by checkpoints:${difference(whole, phased)}`);
	return r;
}

//A step's answer, state, sight and events as text
function outcomeOf(r: Stepped): string {
	if (!r.ok) return JSON.stringify(r);
	const { state, sight } = r.world;
	return JSON.stringify({ state, events: r.events, sight: [...sight.spot, ...sight.zoc].map((a) => a.join()) });
}

//begin, then resume from each checkpoint with nothing said
function inPhases(w: CoreWorld, cmd: Command): Stepped {
	const b = begin(w, cmd);
	if (!b.ok) return b;
	let { world, checkpoint } = b;
	const events = b.events.slice();
	while (checkpoint !== null) {
		count("checkpoints");
		const r = resume(world, checkpoint);
		({ world, checkpoint } = r);
		events.push(...r.events);
	}
	return { ok: true, world, events };
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

//The end of turn as game.ts plays it on both: the command, the turn limit's defeat, the side shown,
//then the reinforcements. Hotseat (every side shown in its turn) unless shown, the one side that plays
//on the screen. Null when the game goes on, STOP when it ended, or what differs
function endTurn(p: Play, shown = 2): string | null {
	const problem = endTurnCommand(p, shown);
	if (problem !== null) return problem;
	const { w } = p;
	w.game.spotSide = shown === 2 ? w.m.currentPlayer.side : shown;
	p.core = { ...p.core, spotSide: w.game.spotSide };
	return reinforcements(p);
}

//The end of turn command on both, the turn limit's defeat for the side shown and the outcome
function endTurnCommand(p: Play, shown: number): string | null {
	const { w } = p, ended = w.m.currentPlayer.side;
	w.m.currentUnit = null;
	const old = w.Commands.execute(w.scenario, { type: "endTurn" }, { localSide: shown });
	const core = coreStep(p.core, { type: "endTurn" });
	if (!old.ok || !core.ok) return refusals(old, core, check(p.core, { type: "endTurn" }));
	const problem = compareStates(p, { type: "endTurn" }, core.world, core.events, [])
		|| shownLimitProblem(old.result, core.events, ended, shown) || outcomeProblem(p, ended);
	return problem === null && old.result ? STOP : problem;
}

//The core's end of turn says the side that ended played its last turn
function reachedLimit(events: GameEvent[], ended: number): boolean {
	return events.some((e) => e.type === "turnLimit" && e.side === ended);
}

//The old engine's defeat at the turn limit, only for the side shown (or both, 2), and the core's turnLimit
function shownLimitProblem(defeat: boolean, events: GameEvent[], ended: number, shown: number): string | null {
	const limit = reachedLimit(events, ended) && (shown === 2 || shown === ended);
	if (limit) count("turn limit");
	return defeat !== limit ? `turn limit: old ${defeat}, core ${limit}` : null;
}

//The current player's reinforcements, Actions.deployReinforcements on the old engine, then the core's
function reinforcements(p: Play): string | null {
	const { w } = p;
	const story: string[] = [];
	p.Actions.deployReinforcements(w.scenario, w.m.turn, w.m.currentPlayer.id, (c) => story.push(`arrived ${c.row},${c.col}`));
	freeze(p.core.state);
	const arrived = arriveReinforcements(p.core);
	const arrivals = arrived.events.flatMap((e) => e.type === "arrived" ? [`arrived ${e.at.row},${e.at.col}`] : []);
	return compareStates(p, { type: "endTurn" }, arrived.world, arrived.events, []) || storyProblem(story, arrivals) || null;
}

//checkOutcome on the old engine and the core's outcome, ended: the side that just ended its turn
function outcomeProblem(p: Play, ended?: number): string | null {
	const want = JSON.stringify(p.Actions.checkOutcome(p.w.scenario, { endedSide: ended }));
	const got = JSON.stringify(outcome(p.core, { endedSide: ended }));
	if (want !== got) return `outcome: old ${want}, core ${got}`;
	if (got !== "null") count("outcome " + JSON.parse(got).kind);
	return null;
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
		const problem = cmd.type === "endTurn" ? endTurn(p) : playBoth(p, cmd) || outcomeProblem(p);
		if (problem === STOP) break;
		if (problem !== null) throw new Error(played() + "\n" + problem);
		if (p.Actions.checkOutcome(p.w.scenario)) {
			stats.ended++;
			break;
		}
	}
}

test("Property: the core's commands play as the old engine's, state, sight and events (counter drift: #72, #73)", async () => {
	await fc.assert(fc.asyncProperty(sequences, (seq) => run(seq)), { seed: SEED, path: process.env.FC_PATH, numRuns: RUNS || 20 });
	expect(stats.commands).toBeGreaterThan(0);
}, RUNS ? RUNS * 5000 : 120_000);


//Every fixture's turns ended one after the other past its turn limit, the screen showing one side as
//against the AI (the side that hides units in the end of turn, #75) or none (AI against AI), both
//engines: the units' end of turn, the new rounds, the time of day, the reinforcements and the defeat
//at the turn limit of the side shown
test("The turns end the same on both engines up to the turn limit, whichever side the screen shows", async () => {
	let limits = 0;
	for (const fixture of fixtures("engine"))
		for (const shown of [0, 1, -1]) {
			const p = await start({ fixture, seed: 1, steps: [] });
			const { w } = p;
			w.m.maxTurns = w.m.turn + 1;
			w.game.spotSide = shown;
			p.core = coreOf(w, p.data);
			for (let i = 0; i < 3 * w.m.getPlayers().length; i++) {
				const before = stats["turn limit"] || 0;
				const problem = endTurn(p, shown);
				limits += (stats["turn limit"] || 0) - before;
				if (problem === STOP) break;
				expect(problem, fixture + " shown " + shown + " end of turn " + i).toBeNull();
			}
		}
	expect(limits).toBeGreaterThan(5);
}, 120_000);

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

//Losses in a campaign count in the campaign player's dossier, and its difficulty scales the score:
//the one campaign fixture's armies are apart at its start, so a campaign unit and two enemies are
//put next to each other (fromData of the state edited), at strength 1 the units to be destroyed.
//The campaign unit attacks one (a kill), the other attacks it (a loss)
test("A campaign's kills and losses count in the dossier on both engines", async () => {
	let destroyed = 0, counted = 0;
	for (let seed = 1; seed <= 6; seed++) {
		const p = await start({ fixture: "campaign-3-1-t0.json.gz", seed, steps: [] });
		const { fromData } = await import("../src/state");
		const saved = p.data();
		const [own, a, b] = facingUnits(saved.state);
		const scenario = fromData(saved, p.w.game);
		p.w.game.scenario = scenario;
		Object.assign(p.w, { scenario, m: scenario.map });
		p.core = coreOf(p.w, p.data);
		for (const cmd of [{ type: "attack", unit: own, target: a }, { type: "attack", unit: b, target: own }] as Command[]) {
			expect(playBoth(p, cmd), JSON.stringify(cmd)).toBeNull();
			destroyed += p.core.index.has(cmd.type === "attack" ? cmd.target : -1) ? 0 : 1;
		}
		const units = p.core.state.players[0].dossier.units;
		counted += [units.killed, units.lostcore, units.lostaux].reduce((n, c) => n + Object.values(c).reduce((x, y) => x + y, 0), 0);
	}
	expect(destroyed).toBeGreaterThan(2);
	expect(counted).toBeGreaterThan(2);
});

//Edits a state: the first ground unit of player 0 (the campaign's) with a free hex on each side, an
//enemy ground unit put on each, the first at strength 1; the campaign unit at strength 1 too. Their ids
function facingUnits(state: ReturnType<typeof ToData>["state"]): [number, number, number] {
	const at = (r: number, c: number) => state.map.hexes[r * state.map.cols + c];
	const free = (r: number, c: number) => r >= 0 && c >= 0 && r < state.map.rows && c < state.map.cols && at(r, c).unit === null
		&& at(r, c).air === null;
	const own = state.units.find((u) => u.owner === 0 && u.row >= 0 && at(u.row, u.col).unit === u.id
		&& free(u.row - 1, u.col) && free(u.row + 1, u.col));
	const enemies = state.units.filter((u) => u.owner === 1 && u.row >= 0 && at(u.row, u.col).unit === u.id);
	const put = (u: typeof own, r: number, c: number, strength: number) => {
		at(u.row, u.col).unit = null;
		Object.assign(u, { row: r, col: c, strength });
		at(r, c).unit = u.id;
	};
	put(enemies[0], own.row - 1, own.col, 1);
	put(enemies[1], own.row + 1, own.col, 10);
	own.strength = 1;
	return [own.id, enemies[0].id, enemies[1].id];
}

//The engine contract's commands (the AI's and its random player actions, test/contracts/engine.contract.js),
//each also stepped on the core from toData of the state before it: the same answer and the same
//state after. The end of turn is compared where the next player's turn starts (GameMap.onPlayerTurn,
//before an AI player buys and plans: #136), and the reinforcements Game deploys after it on their own. The old engine's counters are made again from its units where they drifted (#72, #73);
//a command during which they drifted isn't compared when the states differ, nor one that deselected
//a unit in the middle of a disembark
test("The engine contract's commands, each on the core from the state before it, play as on the old engine", async () => {
	const seen = { compared: 0, skipped: 0, endTurns: 0, reinforcements: 0, arrived: 0 };
	const problems: string[] = [];
	for (const name of fixtures("engine"))
		await runFixture("engine", "runEngineContract", name, (env) => ({ Commands: shadowCommands(env, (cmd, problem) => {
			if (problem === null) seen.skipped++;
			else seen.compared++;
			if (cmd.type === "endTurn" && problem !== null) seen.endTurns++;
			if (problem) problems.push(name + " " + JSON.stringify(cmd) + ": " + problem);
		}), ...shadowReinforcements(env, (problem, arrived) => {
			seen.reinforcements++;
			seen.arrived += arrived;
			if (problem) problems.push(name + " reinforcements: " + problem);
		}) }));
	if (process.env.FC_STATS) fs.writeSync(2, JSON.stringify(seen) + "\n");
	expect(problems).toEqual([]);
	expect(seen.compared).toBeGreaterThan(2000);
	expect(seen.endTurns).toBeGreaterThan(50);
	expect(seen.arrived).toBeGreaterThan(20);
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
			if (cmd.type === "endTurn") return shadowEndTurn(env, () => real.execute(scenario, cmd, hooks), tell);
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
			tell(cmd, want !== got && (driftAfter || leaving) ? null : compared(r, core, want, got));
			return r;
		},
	};
}

//The contract's end of turn, also stepped on the core from toData of the state before it, compared with
//the old engine's state where the next player's turn starts (an AI player then buys and plans, #136)
function shadowEndTurn<R extends { ok: boolean }>(env: ContractEnv, play: () => R, tell: (cmd: Command, problem: string | null) => void): R {
	const toData = env.toData as typeof ToData, game = env.game as World["game"], m = env.map as World["m"];
	const old = { m, GameRules: env.GameRules } as World;
	if (drifted(old)) resync(old);
	const before = toData(env.scenario as World["scenario"], game), ended = m.currentPlayer.side;
	const core = step(createWorld(before, (env.Equipment as World["Equipment"]).equipment, { spotSide: game.spotSide }),
		{ type: "endTurn" });
	let want = "", driftAfter = false;
	const r = atTurnStart(m, () => {
		driftAfter = drifted(old);
		want = JSON.stringify(toData(env.scenario as World["scenario"], game).state);
	}, play);
	const got = core.ok ? JSON.stringify(core.world.state) : "";
	tell({ type: "endTurn" }, want !== got && driftAfter ? null : compared(r, core, want, got) || limitProblem(r, core, ended));
	return r;
}

//The old engine's defeat at the turn limit (the side shown's) is a turnLimit of the core's (any side's)
function limitProblem(old: { ok: boolean }, core: Stepped, ended: number): string {
	const defeat = "result" in old && old.result === true;
	return defeat && !(core.ok && reachedLimit(core.events, ended)) ? "turn limit" : "";
}

//Plays play with f called where the next player's turn starts (GameMap.onPlayerTurn), before it
function atTurnStart<R>(m: World["m"], f: () => void, play: () => R): R {
	const GameMap = m.constructor as typeof m.constructor & { onPlayerTurn: (...a: unknown[]) => void };
	const onPlayerTurn = GameMap.onPlayerTurn;
	GameMap.onPlayerTurn = (...a: unknown[]) => {
		f();
		onPlayerTurn(...a);
	};
	try {
		return play();
	} finally {
		GameMap.onPlayerTurn = onPlayerTurn;
	}
}

//Game.deployReinforcements of the contract's game, which also lets the core's reinforcements arrive
//from toData of the state before it: the same state after
function shadowReinforcements(env: ContractEnv, tell: (problem: string, arrived: number) => void): ContractEnv {
	const toData = env.toData as typeof ToData, game = env.game as World["game"];
	const old = { m: env.map, GameRules: env.GameRules } as World;
	const deploy = game.deployReinforcements;
	game.deployReinforcements = function(turn: number, id: number) {
		if (drifted(old)) resync(old);
		const before = toData(env.scenario as World["scenario"], game);
		const core = arriveReinforcements(createWorld(before, (env.Equipment as World["Equipment"]).equipment,
			{ spotSide: game.spotSide }));
		const r = deploy.call(game, turn, id);
		const want = JSON.stringify(toData(env.scenario as World["scenario"], game).state);
		const got = JSON.stringify(core.world.state);
		tell(want !== got && !drifted(old) ? "toData:" + difference(want, got) : "", core.events.filter((e) => e.type === "arrived").length);
		return r;
	};
	return {};
}

//What differs between the old engine's command and the core's step: the answer, then the state
function compared(old: { ok: boolean }, core: Stepped, want: string, got: string): string {
	const a = "refusal" in old ? (old as { refusal: Refusal }).refusal.reason : "ran";
	const b = "refusal" in core ? core.refusal.reason : "ran";
	if (a !== b) return `old ${a}, core ${b}`;
	return want !== got ? "toData:" + difference(want, got) : "";
}
