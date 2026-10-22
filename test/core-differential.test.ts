//Differential property tests (fast-check) of the new core against the old engine (docs/CORE.md,
//#133): random legal commands played on the engine fixtures through Commands.execute, then on the
//state reached:
//- the core's sight, computed from toData's units, equals the old engine's recomputation from its
//  units hex by hex, counts included. The old engine's own counters drift from it (#72, #73): a
//  state where they do is masked by name, its queries read the counters;
//- every query of the gamerules contract (its whole battery but the fuzz: every unit, every unit
//  pair, the dice) answers the same on the old engine and on the core through test/coreadapter.ts.
//  Where the counters don't drift, the core reads its own sight: the core's answer on toData alone;
//- the dice: an attack from a seeded game stream draws the same numbers to the same results.
//
//FC_SEED=<seed> FC_PATH=<path> replays a failure, FC_RUNS=<n> plays more sequences than CI does
import fc from "fast-check";
import { afterAll, expect, test } from "vitest";
import { compareResults, contract, fixtures } from "./contracts";
import { load, recompute, type OldWorld as World } from "./invariants";
import { mulberry32 } from "./lifecycle";
import { coreGameRules } from "./coreadapter";
import { createWorld } from "../src/core/create";
import type { Unit } from "../src/unit";
import type { Command } from "../src/commands";
import type { toData as ToData } from "../src/state";

const SEED = process.env.FC_SEED ? Number(process.env.FC_SEED) : 133;
const RUNS = process.env.FC_RUNS ? Number(process.env.FC_RUNS) : 0;

const kinds = { move: 6, attack: 4, resupply: 1, reinforce: 1, mount: 1, unmount: 1, embark: 1, disembark: 1, endTurn: 1 };
type Kind = keyof typeof kinds;
interface Step { kind: Kind; unit: number; pick: number }
interface Sequence { fixture: string; seed: number; steps: Step[] }

const sequences: fc.Arbitrary<Sequence> = fc.record({
	fixture: fc.constantFrom(...fixtures("engine")),
	seed: fc.integer(),
	steps: fc.array(fc.record({
		kind: fc.oneof(...Object.entries(kinds).map(([k, weight]) => ({ arbitrary: fc.constant(k as Kind), weight }))),
		unit: fc.nat(63), pick: fc.nat(63),
	}), { maxLength: 30, size: "max" }),
});

//The commands of a kind the engine offers a unit
type Offer = (w: World, u: Unit) => Command[];
const when = (rule: (w: World, u: Unit) => boolean, type: "resupply" | "reinforce" | "mount" | "unmount" | "embark" | "disembark"): Offer =>
	(w, u) => rule(w, u) ? [{ type, unit: u.id }] : [];
const offers: Record<Exclude<Kind, "endTurn">, Offer> = {
	move: ({ m, GameRules: GR }, u) => GR.getMoveRange(m, u).filter((c) => c.canMove)
		.map((c) => ({ type: "move", unit: u.id, to: { row: c.row, col: c.col } })),
	attack: ({ m, GameRules: GR }, u) => GR.getUnitAttackCells(m.map, u, m.rows, m.cols)
		.flatMap((c) => [false, true].map((air) => m.map[c.row][c.col].getAttackableUnit(u, air)))
		.filter((t, i, all) => t && all.indexOf(t) === i).map((t) => ({ type: "attack", unit: u.id, target: t.id })),
	resupply: when((w, u) => w.GameRules.canResupply(w.m.map, u), "resupply"),
	reinforce: when((w, u) => w.GameRules.canReinforce(w.m.map, u), "reinforce"),
	mount: when((w, u) => w.GameRules.canMount(u), "mount"),
	unmount: when((w, u) => w.GameRules.canUnmount(u), "unmount"),
	embark: when((w, u) => w.GameRules.canEmbark(w.m.map, u), "embark"),
	disembark: when((w, u) => w.GameRules.canDisembark(w.m.map, u), "disembark"),
};

//Plays the steps (hotseat: every player human and local), each command finished at once as a
//program sends it, the end of turn as game.ts plays it. Stops when the game ends
async function play(seq: Sequence): Promise<Played> {
	const w = await load(seq.fixture);
	const { Actions } = await import("../src/actions");
	const { toData } = await import("../src/state");
	for (const p of w.m.getPlayers())
		if (!w.game.campaign || p.country === w.game.campaign.country) p.type = w.playerType.humanLocal;
	w.game.spotSide = w.m.currentPlayer.side;
	const random = Math.random;
	Math.random = mulberry32(seq.seed);
	try {
		for (const s of seq.steps)
			if (playStep(w, s, Actions)) break;
	} finally {
		Math.random = random;
	}
	return { ...w, toData };
}

//Plays a step: whether the game ended
function playStep(w: World, s: Step, Actions: typeof import("../src/actions").Actions): boolean {
	if (s.kind === "endTurn") {
		played.endTurn++;
		const r = w.Commands.execute(w.scenario, { type: "endTurn" }, { localSide: 2 });
		if (r.ok && r.result) return true; //the turn limit ended the game
		w.game.spotSide = w.m.currentPlayer.side;
		Actions.deployReinforcements(w.scenario, w.m.turn, w.m.currentPlayer.id);
		return false;
	}
	const offer = offers[s.kind];
	const units = w.m.getUnits().filter((u) => u.player.id === w.m.currentPlayer.id && u.getPos() && offer(w, u).length);
	if (!units.length) return false;
	const options = offer(w, units[s.unit % units.length]);
	w.Commands.execute(w.scenario, options[s.pick % options.length]);
	played[s.kind]++;
	return !!Actions.checkOutcome(w.scenario);
}

//The game played to, with toData of its modules (load resets them)
type Played = World & { toData: typeof ToData };

//The hexes where the old engine's counters say otherwise than its recomputation from the units:
//the known drift. The core's sight equals the recomputation everywhere (the counts too)
function sightDifferences(w: Played): { core: string[]; drift: string[] } {
	const { m } = w;
	const board = recompute(w);
	const core = createWorld(w.toData(w.scenario), w.Equipment.equipment).sight;
	const out = { core: [] as string[], drift: [] as string[] };
	for (let r = 0; r < m.rows; r++)
		for (let c = 0; c < m.cols; c++)
			for (const side of [0, 1]) {
				const i = r * m.cols + c, h = m.map[r][c], b = board[r][c];
				const coreCounts = [core.spot[side][i], core.zoc[side][i]], oldCounts = [b.spot[side], b.zoc[side]];
				if (coreCounts.join() !== oldCounts.join())
					out.core.push(`${r},${c} side ${side}: core ${coreCounts.join("/")}, old ${oldCounts.join("/")}`);
				if (h.isSpotted(side) !== oldCounts[0] > 0 || h.isZOC(side) !== oldCounts[1] > 0) out.drift.push(`${r},${c} side ${side}`);
			}
	return out;
}

//The gamerules contract's battery, no fuzz, on the old engine and on the core
function queries(w: Played, computedSight: boolean): string | null {
	const run = contract("gamerules", "runGameRulesContract").run;
	const env = { Equipment: w.Equipment, terrainType: w.terrainType, leaderType: w.leaderType, map: w.m, fuzzRounds: 0 };
	const old = run({ ...env, GameRules: w.GameRules });
	masked.calls += old.length;
	const core = run({ ...env, GameRules: coreGameRules({ scenario: w.scenario, Equipment: w.Equipment, toData: w.toData,
		game: w.Rng.game, computedSight }) });
	return compareResults(old, core);
}

//Attacks by the units of the player whose turn it is on what they can attack, from the game stream
//seeded: the same results, the stream left at the same place
function dice(w: Played): string[] {
	const { m, GameRules: GR, Rng } = w;
	const core = coreGameRules({ scenario: w.scenario, Equipment: w.Equipment, toData: w.toData, game: Rng.game });
	const problems: string[] = [];
	let seed = 1;
	for (const u of m.getUnits().filter((x) => x.player.id === m.currentPlayer.id && x.getPos()))
		for (const cmd of offers.attack(w, u).slice(0, 3)) {
			const d = m.getUnitById((cmd as Command & { type: "attack" }).target);
			const roll = (rules: typeof GR) => {
				Rng.game.state = seed;
				const cr = JSON.stringify(rules.calculateCombatResults(u, d, m.getUnits(), false, false));
				return cr + " stream at " + Rng.game.state;
			};
			const [a, b] = [roll(GR), roll(core)];
			if (a !== b) problems.push(`unit#${u.id} on unit#${d.id}: old ${a}, core ${b}`);
			seed++;
		}
	Rng.game.state = null;
	return problems;
}

//How many states the drift masked and the commands played, for the record (FC_STATS=1 prints them)
const masked = { states: 0, drifted: 0, calls: 0 };
const played: Record<Kind, number> = { move: 0, attack: 0, resupply: 0, reinforce: 0, mount: 0, unmount: 0, embark: 0, disembark: 0, endTurn: 0 };
afterAll(() => { if (process.env.FC_STATS) console.warn(JSON.stringify({ ...masked, played })); });

test("Property: the core answers every query as the old engine on states played to (counter drift: #72, #73)", async () => {
	await fc.assert(fc.asyncProperty(sequences, async (seq) => {
		const w = await play(seq);
		const sight = sightDifferences(w);
		masked.states++;
		if (sight.drift.length) masked.drifted++;
		expect(sight.core, "the core's sight against the old recomputation").toEqual([]);
		expect(queries(w, sight.drift.length === 0), "the queries").toBeNull();
		expect(dice(w), "the dice").toEqual([]);
	}), { seed: SEED, path: process.env.FC_PATH, numRuns: RUNS || 12 });
	expect(masked.states).toBeGreaterThan(0);
}, RUNS ? RUNS * 5000 : undefined);
