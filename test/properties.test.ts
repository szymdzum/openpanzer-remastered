//Property-based tests (fast-check): random sequences of player actions on the recorded engine
//fixtures, and what must hold after every step whatever the sequence. When a property breaks,
//fast-check shrinks the sequence to the shortest one that still breaks it and prints it with its
//seed and path: FC_SEED=<seed> FC_PATH=<path> npx vitest run test/properties.test.ts replays it,
//FC_RUNS=500 plays more sequences than CI does (CI plays the same ones every time), FC_STATS=1
//prints how often each kind of step found a unit to play it.
//
//A sequence is plain data: a fixture, a seed for Math.random (the dice, the leaders) and steps of
//{ kind, unit, pick }. A step picks among what the engine itself offers the player whose turn it
//is: unit indexes the player's units that can do the kind, pick the unit's options (the cells of
//its move range, the units it can attack...), both modulo their number. Every sequence is legal,
//and a shrunk one keeps its meaning.
//
//The steps are today's engine calls, the ones the engine contract makes
//(test/contracts/engine.contract.js) and the game makes through src/actions.ts. When #119 lands,
//a step becomes a Command ({ type: "move", unit, to }...) picked from the legal ones the same
//way, `play` becomes execute(game, command), and a property checks that run never fails once
//check has passed.
import { isDeepStrictEqual } from "node:util";
import fc from "fast-check";
import { afterAll, test } from "vitest";
import { fixtures, restoreState } from "./contracts";
import { cellName, counter, load, unitName, violations, type World } from "./invariants";
import { mulberry32 } from "./lifecycle";
import { withoutLosses, type Save } from "./saves";
import type { Unit } from "../src/unit";
import type { Cell, movementResults } from "../src/prototypes";
import type { AttackResult, OutcomeContext } from "../src/actions";

//CI plays the same sequences every run; FC_SEED, FC_PATH and FC_RUNS replay or widen a run
const SEED = process.env.FC_SEED ? Number(process.env.FC_SEED) : 125;
const RUNS = process.env.FC_RUNS ? Number(process.env.FC_RUNS) : 0;
async function holds<T>(property: fc.IAsyncProperty<T>, numRuns: number) {
	await fc.assert(property, { seed: SEED, path: process.env.FC_PATH, numRuns: RUNS || numRuns });
}

//A known bug's property, for test.fails: it has to break the way the bug breaks it (known, a
//pattern of the message). It fails on every run, so it isn't shrunk (slow). Broken another way,
//the test passes and test.fails reports it, with the message
async function breaks<T>(property: fc.IAsyncProperty<T>, numRuns: number, known: RegExp) {
	try {
		await fc.assert(property, { seed: SEED, path: process.env.FC_PATH, numRuns: RUNS || numRuns, endOnFailure: true });
	} catch (e) {
		const cause = (e as { cause?: unknown }).cause; //what the property threw
		const message = cause instanceof Error ? cause.message : e instanceof Error ? e.message : JSON.stringify(e);
		if (known.test(message)) throw e;
		console.error("broken another way than the known bug:\n" + message);
	}
}

const kinds = ["move", "capture", "attack", "resupply", "reinforce", "reinforce over", "mount", "unmount", "embark", "disembark",
	"upgrade", "disband", "undo", "estimate", "end turn"] as const;
type Kind = typeof kinds[number];
interface Step { kind: Kind; unit: number; pick: number }
interface Sequence { fixture: string; seed: number; steps: Step[] }

//Sequences of the kinds given with their weights (how often each comes up)
function sequences(weights: Partial<Record<Kind, number>>, maxLength: number): fc.Arbitrary<Sequence> {
	const kind = fc.oneof(...Object.entries(weights).map(([k, weight]) => ({ arbitrary: fc.constant(k as Kind), weight })));
	const step = fc.record({ kind, unit: fc.nat(63), pick: fc.nat(63) });
	return fc.record({ fixture: fc.constantFrom(...fixtures("engine")), seed: fc.integer(), steps: fc.array(step, { maxLength, size: "max" }) });
}

//The game the steps play: every player human and local (hotseat), as the undo needs (Map.moveUnit
//keeps the undo for a human player only); log says what each step did
async function start(fixture: string) {
	const w = await load(fixture);
	const { Actions } = await import("../src/actions");
	const { GameState } = await import("../src/gamestate");
	//(a campaign's other players stay AI: Game.setupPlayers makes them AI again on every load)
	for (const p of w.m.getPlayers())
		if (!w.game.campaign || p.country === w.game.campaign.country) p.type = w.playerType.humanLocal;
	w.game.spotSide = w.m.currentPlayer.side; //Game.setCurrentSide in hotseat
	return { w, Actions, GameState, log: [] as string[], ended: false, beforeMove: null as { unit: Unit; state: State } | null };
}
type Play = Awaited<ReturnType<typeof start>>;

//The game is over: no more steps
function settle(p: Play, last?: OutcomeContext) {
	if (p.Actions.checkOutcome(p.w.scenario, last)) p.ended = true;
}

//ui.ts uiAttackAnimationFinished without animations: the selection refresh, a retreat's own move
//finished after the elimination check
function finishAttack(p: Play, res: AttackResult) {
	const m = p.w.m, a = res.attacking.unit, d = res.defending.unit;
	p.Actions.finishAttack(m, res, {
		afterCleanup() {
			if (!m.currentUnit) return;
			if (a.destroyed && m.currentUnit.id === a.id) m.delCurrentUnit();
			else m.selectUnit(m.currentUnit);
			if (d.destroyed && m.currentUnit && !m.currentUnit.hasMoved) m.setMoveRange(m.currentUnit);
		},
	});
	settle(p);
	if (res.retreatMove) moved(p, d, res.retreatMove);
}

//ui.ts uiMoveAnimationFinished: the capture victory, then the surprise attack's second half
function moved(p: Play, u: Unit, mr: movementResults) {
	const r = p.Actions.finishMove(p.w.m, u, mr, false);
	settle(p, { move: r });
	if (r.surprise && r.surprise.attack) finishAttack(p, r.surprise.attack);
}

//ui.ts uiUnitSelect
function select(p: Play, u: Unit) {
	if (p.w.m.currentUnit !== null) p.w.m.delCurrentUnit();
	p.w.m.selectUnit(u);
}

//What a player sees on the map, in parts, each as plain text: the turn and the selection, the
//objectives, the units' own fields and positions, the players, every hex's owner, flag, objective,
//selection marks, units and counters. ignore leaves out what a known bug changes
interface Ignore { unitFields?: string[]; objectiveOrder?: boolean }
type State = Record<"turn" | "objectives" | "units" | "players" | "hexes", string>;
function stateOf(w: World, ignore: Ignore = {}): State {
	const { m } = w;
	const own = (o: object, without: string[]) => Object.fromEntries(Object.entries(o)
		.filter(([k, v]) => typeof v !== "function" && !without.includes(k))
		.map(([k, v]) => [k, k === "player" && v ? (v as { id: number }).id : v]));
	const units = m.getUnits().map((u) => ({ ...own(u, ignore.unitFields || []), pos: u.getPos() ? cellName(u.getPos()) : null }));
	const players = m.getPlayers().map((pl) => ({ ...own(pl, ["handler"]), core: pl.getCoreUnitList().map((u) => u.id) }));
	const objectives = m.sidesVictoryHexes.map((side) => side.map(cellName));
	if (ignore.objectiveOrder) objectives.forEach((side) => side.sort());
	const hexes: string[] = [];
	for (let r = 0; r < m.rows; r++)
		for (let c = 0; c < m.cols; c++) {
			const h = m.map[r][c];
			const zoc = (s: number) => counter(() => h.isZOC(s), (on) => h.setZOC(s, on));
			const spot = (s: number) => counter(() => h.isSpotted(s), (on) => h.setSpotted(s, on));
			hexes.push([r, c, h.owner, h.flag, h.victorySide, h.isMoveSel, h.isAttackSel, h.unit ? h.unit.id : "",
				h.airunit ? h.airunit.id : "", zoc(0), zoc(1), spot(0), spot(1)].join(","));
		}
	return {
		turn: JSON.stringify([m.turn, m.currentPlayer.id, m.currentUnit ? m.currentUnit.id : null]),
		objectives: JSON.stringify(objectives),
		units: JSON.stringify(units),
		players: JSON.stringify(players),
		hexes: hexes.join(";"),
	};
}

//The parts of two states that differ, each with where it first differs
function changes(before: State, after: State): string[] {
	return (Object.keys(before) as (keyof State)[]).filter((k) => before[k] !== after[k])
		.map((k) => k + ":" + difference(before[k], after[k]));
}

//Where two texts first differ
function difference(want: string, got: string): string {
	let d = 0;
	while (d < want.length && want[d] === got[d]) d++;
	const cut = (t: string) => t.slice(Math.max(0, d - 120), d + 120);
	return "\n    before " + cut(want) + "\n    after  " + cut(got);
}

//The units of the player whose turn it is that can do something, and what they can do it to
function attackTargets(w: World, u: Unit): Unit[] {
	const { m, GameRules: GR } = w;
	const targets: Unit[] = [];
	for (const cell of GR.getUnitAttackCells(m.map, u, m.rows, m.cols))
		for (const airMode of [false, true]) {
			const t = m.map[cell.row][cell.col].getAttackableUnit(u, airMode);
			if (t && !targets.includes(t)) targets.push(t);
		}
	return targets;
}
const moveCells = (w: World, u: Unit) => w.GameRules.getMoveRange(w.m, u).filter((c) => c.canMove);
//A move onto an objective the unit's side has to take, by a unit that can take it
const captureCells = (w: World, u: Unit) => !w.GameRules.canCapture(u) ? []
	: moveCells(w, u).filter((c) => w.m.sidesVictoryHexes[u.player.side].some((o) => o.row === c.row && o.col === c.col));
//Equipment of the unit's class from its player's countries, or from any country when none of
//theirs is loaded (as the engine contract picks them)
function upgrades(w: World, u: Unit): number[] {
	const { Equipment } = w;
	const countries = [u.player.country, ...(u.player.supportCountries || [])];
	const uclass = u.unitData().uclass;
	const same = Object.keys(Equipment.equipment).map(Number).filter((id) => id !== u.eqid && Equipment.equipment[id].uclass === uclass);
	const own = same.filter((id) => countries.includes(Equipment.equipment[id].country));
	return own.length ? own : same;
}

//What the steps check in the middle of a step: the undo (but what it ignores), the estimate
interface Checks { undo?: Ignore; estimate?: boolean }

//A step of a kind, by unit u: pick is the step's own, previous the state before the move just
//played (for the undo)
interface StepContext { p: Play; u: Unit; pick: number; checks: Checks; previous: Play["beforeMove"] }
//A kind of step: how many options a unit has (0: it can't do it), and the step, which returns
//what it did and what the undo and estimate checks found in the middle of it
interface StepKind {
	options(w: World, u: Unit): number;
	play(c: StepContext): StepResult;
}
interface StepResult { done: string; problems: string[] }

//A kind without options: whether the unit can, and what it does
function action(can: (w: World, u: Unit) => boolean, act: (w: World, u: Unit) => void): StepKind {
	return { options: (w, u) => +can(w, u), play: ({ p, u }) => { act(p.w, u); return { done: "", problems: [] }; } };
}

//A move to one of cells (ui.ts uiUnitSelect, then uiUnitMove), the state before it kept for the undo
function moveTo(cells: (w: World, u: Unit) => Cell[]): StepKind {
	return {
		options: (w, u) => cells(w, u).length,
		play: ({ p, u, pick, checks }) => {
			const all = cells(p.w, u), cell = all[pick % all.length];
			select(p, u);
			p.beforeMove = checks.undo ? { unit: u, state: stateOf(p.w, checks.undo) } : null;
			moved(p, u, p.w.m.moveUnit(u, cell.row, cell.col));
			return { done: " to " + cellName(cell), problems: [] };
		},
	};
}

//The attack preview (render.ts, without the hidden units) and the AI's (with them): no draw from
//the random stream, no change
function estimate({ p, u, pick, checks }: StepContext): StepResult {
	const { m, GameRules: GR } = p.w;
	const targets = attackTargets(p.w, u);
	const d = targets[pick % targets.length], withHidden = Math.floor(pick / targets.length) % 2 === 1;
	const done = " on " + unitName(d) + (withHidden ? " with the hidden units" : "");
	if (!checks.estimate) return { done, problems: [] };
	const before = stateOf(p.w), random = Math.random;
	let draws = 0;
	Math.random = () => { draws++; return random(); };
	try { GR.calculateCombatResults(u, d, m.getUnits(), withHidden, true); }
	finally { Math.random = random; }
	const problems = changes(before, stateOf(p.w)).map((c) => "the estimate changed the " + c);
	if (draws) problems.unshift("the estimate drew " + draws + " random numbers");
	return { done, problems };
}

const stepKinds: Record<Exclude<Kind, "end turn">, StepKind> = {
	"move": moveTo(moveCells),
	"capture": moveTo(captureCells),
	"attack": {
		options: (w, u) => attackTargets(w, u).length,
		play: ({ p, u, pick }) => {
			const targets = attackTargets(p.w, u), d = targets[pick % targets.length];
			select(p, u);
			const res = p.Actions.resolveAttack(p.w.m, u, d);
			if (res) finishAttack(p, res);
			return { done: " " + unitName(d), problems: [] };
		},
	},
	"estimate": { options: (w, u) => attackTargets(w, u).length, play: estimate },
	"resupply": action((w, u) => w.GameRules.canResupply(w.m.map, u), (w, u) => w.m.resupplyUnit(u)),
	"reinforce": action((w, u) => w.GameRules.canReinforce(w.m.map, u), (w, u) => w.m.reinforceUnit(u, false)),
	"reinforce over": action((w, u) => w.GameRules.canReinforce(w.m.map, u, true), (w, u) => w.m.reinforceUnit(u, true)),
	"mount": action((w, u) => w.GameRules.canMount(u), (w, u) => w.m.mountUnit(u)),
	"unmount": action((w, u) => w.GameRules.canUnmount(u), (w, u) => w.m.unmountUnit(u)),
	"embark": action((w, u) => w.GameRules.canEmbark(w.m.map, u), (w, u) => w.m.embarkUnit(u)),
	"disembark": action((w, u) => w.GameRules.canDisembark(w.m.map, u), (w, u) => w.m.disembarkUnit(u)),
	"upgrade": {
		options: (w, u) => upgrades(w, u).length,
		play: ({ p, u, pick }) => {
			const options = upgrades(p.w, u), to = options[pick % options.length];
			u.player.prestige = Math.max(u.player.prestige, 1e6); //what it costs isn't the point
			p.w.m.upgradeUnit(u.id, to, -1);
			return { done: " to " + to, problems: [] };
		},
	},
	"disband": action((w) => w.m.getUnits().filter((x) => x.player.id === w.m.currentPlayer.id).length > 1,
		(w, u) => w.m.disbandUnit(u.id)),
	"undo": {
		options: (w, u) => +w.m.canUndoMove(u),
		play: ({ p, u, checks, previous }) => {
			p.w.m.undoLastMove();
			//Right after the move: everything as it was before it
			const problems = checks.undo && previous && previous.unit === u
				? changes(previous.state, stateOf(p.w, checks.undo)).map((c) => "the undo didn't restore the " + c) : [];
			return { done: "", problems };
		},
	},
};

//game.ts endTurn and the end turn button: Scenario.endTurn, the defeat at the turn limit, the
//next side shown, its reinforcements, the combat log reset
function endTurn(p: Play): StepResult {
	const { w } = p, m = w.m, last = m.currentPlayer.side;
	if (p.Actions.endTurn(w.scenario, 2)) settle(p, { endedSide: last });
	else {
		w.game.spotSide = m.currentPlayer.side;
		p.Actions.deployReinforcements(w.scenario, m.turn, m.currentPlayer.id);
		w.CombatLog.reset();
	}
	return { done: "end turn, now turn " + m.turn + " player#" + m.currentPlayer.id, problems: [] };
}

//Plays one step, returns what it did (null: no unit of the player could do it) and what the undo
//and estimate checks found
function play(p: Play, s: Step, checks: Checks): StepResult | null {
	const previous = p.beforeMove;
	p.beforeMove = null;
	if (s.kind === "end turn") return endTurn(p);
	const kind = stepKinds[s.kind], m = p.w.m;
	const units = m.getUnits().filter((u) => u.player.id === m.currentPlayer.id && !u.destroyed && u.getPos() && kind.options(p.w, u) > 0);
	if (!units.length) return null;
	const u = units[s.unit % units.length];
	const r = kind.play({ p, u, pick: s.pick, checks, previous });
	return { done: s.kind + " " + unitName(u) + r.done, problems: r.problems };
}

//FC_STATS: how often each kind of step was played, "(none)" when no unit could
const stats: Record<string, number> = {};
afterAll(() => { if (process.env.FC_STATS) console.warn(JSON.stringify(stats)); });

//A recon leader won in a fight widens the unit's spotting, its counters stay (#73): what to look
//at before a step to tell after it
function reconLeaders(w: World): () => boolean {
	const before = w.m.getUnits().map((u) => [u, w.GameRules.getUnitSpotRange(u), u.leader] as const);
	return () => before.some(([u, range, leader]) => u.leader !== leader && w.GameRules.getUnitSpotRange(u) !== range);
}

//Plays the steps until one breaks a check (what it broke) or the game ends
function playSteps(p: Play, steps: Step[], opts: Checks & { invariants?: boolean }): string[] {
	for (const s of steps) {
		if (p.ended) break;
		const problems = playChecked(p, s, opts);
		if (problems === null) break;
		if (problems.length) return problems;
	}
	return [];
}

//Plays a step and checks it: what broke, null for the known break of #73, which ends the sequence
function playChecked(p: Play, s: Step, opts: Checks & { invariants?: boolean }): string[] | null {
	const newLeader = reconLeaders(p.w);
	const r = play(p, s, opts);
	const counted = s.kind + (r ? "" : " (none)");
	stats[counted] = (stats[counted] || 0) + 1;
	if (!r) return [];
	p.log.push("turn " + p.w.m.turn + " player#" + p.w.m.currentPlayer.id + ": " + r.done);
	if (!opts.invariants) return r.problems;
	return newLeader() ? null : [...r.problems, ...violations(p.w)];
}

//Plays the sequence, Math.random seeded with its seed, then after (what it found at the end); a
//broken check throws, with the steps played
async function run(seq: Sequence, opts: Checks & { invariants?: boolean }, after?: (p: Play) => Promise<string[]>) {
	const p = await start(seq.fixture);
	const random = Math.random;
	Math.random = mulberry32(seq.seed);
	let problems: string[];
	try { problems = playSteps(p, seq.steps, opts); }
	finally { Math.random = random; }
	if (!problems.length && after) problems = await after(p);
	if (problems.length)
		throw new Error(seq.fixture + ", " + p.log.length + " steps:\n  " + p.log.join("\n  ") + "\n" + problems.join("\n"));
}

//No describe block: Stryker's Vitest runner picks tests by name and misses names inside one

const playerActions = { "move": 6, "capture": 1, "attack": 4, "resupply": 1, "reinforce": 1, "reinforce over": 1, "mount": 1,
	"unmount": 1, "disband": 1, "undo": 2, "end turn": 1 };

//The invariants of test/invariants.ts: the counters equal a recomputation, hexes and units point
//at each other (so no two units on one hex), every unit belongs to its owner's Player
test("Property: the invariants hold after every player action", async () => {
	await holds(fc.asyncProperty(sequences(playerActions, 40), (seq) => run(seq, { invariants: true })), 40);
});

test.fails("Property: the invariants hold after embarking, disembarking and upgrading (fails: #73)", async () => {
	await breaks(fc.asyncProperty(sequences({ ...playerActions, "embark": 3, "disembark": 3, "upgrade": 3 }, 40),
		(seq) => run(seq, { invariants: true })), 40, /(spotting|zone of control) of side/);
});

//The undo is checked right after a move: its kinds come up often
const undoActions = { "move": 3, "capture": 2, "undo": 4, "attack": 1, "end turn": 1 };
test("Property: an undo right after a move restores the state from before the move, but for #140 and #141", async () => {
	await holds(fc.asyncProperty(sequences(undoActions, 20),
		(seq) => run(seq, { undo: { unitFields: ["tempSpotted"], objectiveOrder: true } })), 30);
});

test.fails("Property: an undo right after a move restores tempSpotted too (fails: #140)", async () => {
	await breaks(fc.asyncProperty(sequences(undoActions, 20), (seq) => run(seq, { undo: { objectiveOrder: true } })), 30,
		/undo didn't restore the units:\n {4}before .{106}"tempSpotted":false/); //(the text around the first difference)
});

test.fails("Property: an undo right after a move restores the objectives' order too (fails: #141)", async () => {
	await breaks(fc.asyncProperty(sequences(undoActions, 20), (seq) => run(seq, { undo: { unitFields: ["tempSpotted"] } })), 30,
		/undo didn't restore the objectives/);
});

test("Property: the attack estimate draws nothing from the random stream and changes nothing", async () => {
	await holds(fc.asyncProperty(sequences({ "estimate": 3, "move": 2, "attack": 2, "end turn": 1 }, 20),
		(seq) => run(seq, { estimate: true })), 30);
});

//The save of a game played on, loaded back. The game saves after Scenario.endTurn (game.ts
//endTurn), with nothing selected: the end of turn first, then GameState.exportGameState, then
//restoreFromString as the contracts load (it resets the modules, so last) and the export again.
//Null when the game ended
async function reloaded(p: Play): Promise<[Save, Save] | null> {
	if (p.ended || p.Actions.endTurn(p.w.scenario, 2)) return null;
	const saved = new p.GameState(p.w.game).exportGameState();
	await restoreState(saved);
	const { GameState } = await import("../src/gamestate");
	const { game } = await import("../src/game");
	return [JSON.parse(saved), JSON.parse(new GameState(game).exportGameState())];
}

//Slower (a load per sequence): fewer sequences. #71: a load gives the turn to the first player
test("Property: a save keeps the game after a player's actions, but for the known losses", async () => {
	await holds(fc.asyncProperty(sequences(playerActions, 25), (seq) => run(seq, {}, async (p) => {
		const saves = await reloaded(p);
		if (!saves) return [];
		const [saved, again] = saves;
		delete saved.scenario.map.currentPlayer;
		delete again.scenario.map.currentPlayer;
		const want = withoutLosses(saved), got = withoutLosses(again);
		return isDeepStrictEqual(want, got) ? [] : ["the load changed the save:" + difference(JSON.stringify(want), JSON.stringify(got))];
	})), 15);
});
