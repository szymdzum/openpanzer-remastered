//Property-based tests (fast-check): random sequences of player commands on the recorded engine
//fixtures, played through the command layer (src/commands.ts, Commands.execute) as the game sends
//them, and what must hold after every step whatever the sequence. When a property breaks,
//fast-check shrinks the sequence to the shortest one that still breaks it and prints the commands
//it played with its seed and path: FC_SEED=<seed> FC_PATH=<path> npx vitest run
//test/properties.test.ts replays it, FC_RUNS=500 plays more sequences than CI does (CI plays the
//same ones every time), FC_STATS=1 prints how often each kind of step found a unit to play it.
//
//A sequence is plain data: a fixture, a seed for Math.random (the dice, the leaders) and steps.
//A step is either a pick { kind, unit, pick } or a Command. A pick chooses among the commands the
//engine itself offers the player whose turn it is (its move ranges, attack cells and rules): unit
//indexes the player's units that have a command of the kind, pick the unit's commands of it, both
//modulo their number. Every pick is legal, and a shrunk sequence keeps its meaning. A Command step
//is any command at all, its ids and cells drawn from the fixture's: most are refused, some allowed
//where the rules have no say, which is what the check/run drift properties look at.
import { isDeepStrictEqual } from "node:util";
import fc from "fast-check";
import { afterAll, test } from "vitest";
import { fixtures, restoreState } from "./contracts";
import { cellName, counter, load, violations, type World } from "./invariants";
import { mulberry32 } from "./lifecycle";
import { withoutLosses, type Save } from "./saves";
import type { Unit } from "../src/unit";
import type { Cell, movementResults } from "../src/prototypes";
import type { AttackResult, FinishAttackHooks, OutcomeContext } from "../src/actions";
import type { Command, Refusal } from "../src/commands";

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
interface Pick { kind: Kind; unit: number; pick: number }
type Step = Pick | Command;
interface Sequence { fixture: string; seed: number; steps: Step[] }

//The attack preview (render.ts, without the hidden units, and the AI's, with them): no command, a
//step the estimate property plays beside them
interface Estimate { type: "estimate"; unit: number; target: number; hidden: boolean }
type Played = Command | Estimate;

//Picks of the kinds given with their weights (how often each comes up)
function picks(weights: Partial<Record<Kind, number>>): fc.Arbitrary<Pick> {
	const kind = fc.oneof(...Object.entries(weights).map(([k, weight]) => ({ arbitrary: fc.constant(k as Kind), weight })));
	return fc.record({ kind, unit: fc.nat(63), pick: fc.nat(63) });
}

function sequences(weights: Partial<Record<Kind, number>>, maxLength: number): fc.Arbitrary<Sequence> {
	return fc.record({ fixture: fc.constantFrom(...fixtures("engine")), seed: fc.integer(),
		steps: fc.array(picks(weights), { maxLength, size: "max" }) });
}

//What a fixture's commands can name: its units' ids (and ids of units not there), its map's size
//(a cell can be off it by one), its players' core unit lists, its equipment
interface Pool { units: number[]; rows: number; cols: number; core: number; equipment: number[] }
async function poolOf(fixture: string): Promise<Pool> {
	const w = await load(fixture);
	const ids = w.m.getUnits().map((u) => u.id);
	const next = w.m.getBoard().uniqueID;
	return { units: [...ids, next, next + 1, next + 2, -1, 9999], rows: w.m.rows, cols: w.m.cols,
		core: Math.max(...w.m.getPlayers().map((pl) => pl.getCoreUnitList().length)),
		equipment: Object.keys(w.Equipment.equipment).map(Number) };
}

//Any command, named by the fixture's ids and cells
function anyCommand(pool: Pool): fc.Arbitrary<Command> {
	const unit = fc.constantFrom(...pool.units);
	const to = fc.record({ row: fc.integer({ min: -1, max: pool.rows }), col: fc.integer({ min: -1, max: pool.cols }) });
	const index = fc.nat(pool.core + 1);
	const eqid = fc.oneof({ arbitrary: fc.constantFrom(...pool.equipment), weight: 4 }, fc.constantFrom(-1, 0, 99999));
	const transport = fc.oneof(fc.constantFrom(-1, 0), fc.constantFrom(...pool.equipment));
	const of = <T extends string>(type: T) => fc.constant(type);
	return fc.oneof(
		fc.record({ type: of("move"), unit, to }),
		fc.record({ type: of("attack"), unit, target: unit }),
		...(["resupply", "mount", "unmount", "embark", "disembark", "undo", "disband"] as const)
			.map((type) => fc.record({ type: of(type), unit })),
		fc.record({ type: of("reinforce"), unit, overstrength: fc.boolean() }),
		fc.record({ type: of("deploy"), index, to }),
		fc.record({ type: of("buy"), eqid, transport }),
		fc.record({ type: of("upgrade"), unit, eqid, transport }),
		fc.record({ type: of("upgradeUndeployed"), index, eqid, transport }),
		fc.record({ type: of("sell"), index }),
		fc.record({ type: of("endTurn") }),
	);
}

//Each fixture's pool, read once
let pools: Promise<Map<string, Pool>> | null = null;
async function readPools(): Promise<Map<string, Pool>> {
	const all = new Map<string, Pool>();
	for (const f of fixtures("engine")) all.set(f, await poolOf(f));
	return all;
}

//Sequences of picks of the kinds given, and among them any commands (one step in three)
async function sequencesWithCommands(weights: Partial<Record<Kind, number>>, maxLength: number): Promise<fc.Arbitrary<Sequence>> {
	if (pools === null) pools = readPools();
	const all = await pools;
	return fc.constantFrom(...all.keys()).chain((fixture) => fc.record({ fixture: fc.constant(fixture), seed: fc.integer(),
		steps: fc.array(fc.oneof({ arbitrary: picks(weights) as fc.Arbitrary<Step>, weight: 2 },
			{ arbitrary: anyCommand(all.get(fixture) as Pool), weight: 1 }), { maxLength, size: "max" }) }));
}

//The game the steps play: every player human and local (hotseat), as the undo needs (Map.moveUnit
//keeps the undo for a human player only); log lists the commands played
async function start(fixture: string, seed: number) {
	const w = await load(fixture);
	const { Actions } = await import("../src/actions");
	const { GameState } = await import("../src/gamestate");
	const { toData } = await import("../src/state");
	//(a campaign's other players stay AI: Game.setupPlayers makes them AI again on every load)
	for (const p of w.m.getPlayers())
		if (!w.game.campaign || p.country === w.game.campaign.country) p.type = w.playerType.humanLocal;
	w.game.spotSide = w.m.currentPlayer.side; //Game.setCurrentSide in hotseat
	//The AI's and the UI's streams from the sequence's seed; the game stream stays unseeded, it
	//reads Math.random, which run seeds (and the estimate property counts)
	w.Rng.ai.state = (seed ^ 0x61692121) >>> 0;
	w.Rng.cosmetic.state = (seed ^ 0x636f736d) >>> 0;
	const data = () => JSON.stringify(toData(w.scenario, w.game));
	return { w, Actions, GameState, data, log: [] as string[], ended: false, beforeMove: null as { unit: number; state: State } | null };
}
type Play = Awaited<ReturnType<typeof start>>;

//The game is over: no more steps
function settle(p: Play, last?: OutcomeContext) {
	if (p.Actions.checkOutcome(p.w.scenario, last)) p.ended = true;
}

//ui.ts uiAttackAnimationFinished without animations: the attack command's finish with the
//selection refresh, a retreat's own move finished after the elimination check
function finishAttack(p: Play, res: AttackResult, finish: (hooks?: FinishAttackHooks) => AttackResult) {
	const m = p.w.m, a = res.attacking.unit, d = res.defending.unit;
	finish({
		afterCleanup() {
			if (!m.currentUnit) return;
			if (a.destroyed && m.currentUnit.id === a.id) m.delCurrentUnit();
			else m.selectUnit(m.currentUnit);
			if (d.destroyed && m.currentUnit && !m.currentUnit.hasMoved) m.setMoveRange(m.currentUnit);
		},
	});
	settle(p);
	if (res.retreatMove) retreated(p, d, res.retreatMove);
}

//ui.ts uiMoveAnimationFinished for a retreat (no command: Actions.finishMove), then the capture victory
function retreated(p: Play, u: Unit, mr: movementResults) {
	settle(p, { move: p.Actions.finishMove(p.w.m, u, mr, false) });
}

//The attack command as ui.ts uiUnitAttack sends it, its finish called at once (the animation's end)
function attack(p: Play, cmd: Command & { type: "attack" }) {
	return p.w.Commands.execute(p.w.scenario, cmd, {
		animate(res, finish) { if (res) finishAttack(p, res, finish); },
	});
}

//The move command as ui.ts uiUnitMove sends it, finished as uiMoveAnimationFinished: the capture
//victory, then the surprise attack (an attack command, as ui.ts sends it) finished last
function move(p: Play, cmd: Command & { type: "move" }) {
	const { Commands, scenario } = p.w;
	return Commands.execute(scenario, cmd, {
		animate(_mr, finish) {
			const surprise: { result: AttackResult | null; finish?: (hooks?: FinishAttackHooks) => AttackResult } = { result: null };
			const r = finish(false, {
				attack(a, d) {
					Commands.execute(scenario, { type: "attack", unit: a.id, target: d.id }, {
						animate(res, fin) { surprise.result = res; surprise.finish = fin; },
					});
					return surprise.result;
				},
			});
			settle(p, { move: r });
			if (surprise.result && surprise.finish) finishAttack(p, surprise.result, surprise.finish);
		},
	});
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

//What the engine offers the unit: the units it can attack, the cells it can move to
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
//theirs is loaded (as the engine contract picks them), that the player can afford
function upgrades(w: World, u: Unit): number[] {
	const { Equipment, GameRules: GR } = w;
	const countries = [u.player.country, ...(u.player.supportCountries || [])];
	const uclass = u.unitData().uclass;
	const same = Object.keys(Equipment.equipment).map(Number).filter((id) => id !== u.eqid && Equipment.equipment[id].uclass === uclass);
	const own = same.filter((id) => countries.includes(Equipment.equipment[id].country));
	return (own.length ? own : same).filter((id) => GR.calculateUpgradeCosts(u, id, -1) <= u.player.prestige);
}

//A kind of pick: the unit's commands of the kind the engine offers (none: it can't)
type Offer = (w: World, u: Unit) => Played[];
//One command when the rule allows it
const when = (rule: (w: World, u: Unit) => boolean, cmd: (u: Unit) => Command): Offer => (w, u) => rule(w, u) ? [cmd(u)] : [];
const moveTo = (cells: (w: World, u: Unit) => Cell[]): Offer =>
	(w, u) => cells(w, u).map((c): Command => ({ type: "move", unit: u.id, to: { row: c.row, col: c.col } }));
const offers: Record<Exclude<Kind, "end turn">, Offer> = {
	"move": moveTo(moveCells),
	"capture": moveTo(captureCells),
	"attack": (w, u) => attackTargets(w, u).map((d): Command => ({ type: "attack", unit: u.id, target: d.id })),
	"estimate": (w, u) => [false, true].flatMap((hidden) =>
		attackTargets(w, u).map((d): Estimate => ({ type: "estimate", unit: u.id, target: d.id, hidden }))),
	"resupply": when((w, u) => w.GameRules.canResupply(w.m.map, u), (u) => ({ type: "resupply", unit: u.id })),
	"reinforce": when((w, u) => w.GameRules.canReinforce(w.m.map, u), (u) => ({ type: "reinforce", unit: u.id })),
	"reinforce over": when((w, u) => w.GameRules.canReinforce(w.m.map, u, true),
		(u) => ({ type: "reinforce", unit: u.id, overstrength: true })),
	"mount": when((w, u) => w.GameRules.canMount(u), (u) => ({ type: "mount", unit: u.id })),
	"unmount": when((w, u) => w.GameRules.canUnmount(u), (u) => ({ type: "unmount", unit: u.id })),
	"embark": when((w, u) => w.GameRules.canEmbark(w.m.map, u), (u) => ({ type: "embark", unit: u.id })),
	"disembark": when((w, u) => w.GameRules.canDisembark(w.m.map, u), (u) => ({ type: "disembark", unit: u.id })),
	"upgrade": (w, u) => upgrades(w, u).map((eqid): Command => ({ type: "upgrade", unit: u.id, eqid, transport: -1 })),
	"disband": when((w) => w.m.getUnits().filter((x) => x.player.id === w.m.currentPlayer.id).length > 1,
		(u) => ({ type: "disband", unit: u.id })),
	"undo": when((w, u) => w.m.canUndoMove(u), (u) => ({ type: "undo", unit: u.id })),
};

//The command a pick stands for: one of the commands of its kind a unit of the player whose turn it
//is has. Null when none has one
function commandOf(p: Play, s: Pick): Played | null {
	if (s.kind === "end turn") return { type: "endTurn" };
	const offer = offers[s.kind], m = p.w.m;
	let commands: Played[] = [];
	const units = m.getUnits().filter((u) => u.player.id === m.currentPlayer.id && !u.destroyed && u.getPos()
		&& offer(p.w, u).length > 0);
	if (units.length) commands = offer(p.w, units[s.unit % units.length]);
	return commands.length ? commands[s.pick % commands.length] : null;
}

//What the steps check: the undo right after a move (but what it ignores), the estimate, the
//invariants after every step, and the commands' check against their run: drift, run never throws
//once check has passed; refused, a refused command changes nothing
interface Checks { undo?: Ignore; estimate?: boolean; invariants?: boolean; drift?: boolean; refused?: boolean }

//What f returns and how many numbers it drew from Math.random (the game stream, unseeded)
function counted<T>(f: () => T): { value: T; draws: number } {
	const random = Math.random;
	let draws = 0;
	Math.random = () => { draws++; return random(); };
	try { return { value: f(), draws }; }
	finally { Math.random = random; }
}

//The estimate (GameRules.calculateCombatResults): no draw from the random stream, no change
function estimate(p: Play, e: Estimate, checks: Checks): string[] {
	if (!checks.estimate) return [];
	const { m, GameRules: GR } = p.w;
	const before = stateOf(p.w);
	const { draws } = counted(() => GR.calculateCombatResults(m.getUnitById(e.unit), m.getUnitById(e.target), m.getUnits(), e.hidden, true));
	const problems = changes(before, stateOf(p.w)).map((c) => "the estimate changed the " + c);
	if (draws) problems.unshift("the estimate drew " + draws + " random numbers");
	return problems;
}

//game.ts endTurn and the end turn button: the endTurn command, the defeat at the turn limit, the
//next side shown, its reinforcements, the combat log reset
function endTurn(p: Play) {
	const { w } = p, m = w.m, last = m.currentPlayer.side;
	const r = w.Commands.execute(w.scenario, { type: "endTurn" }, { localSide: 2 });
	if (r.ok && r.result) settle(p, { endedSide: last });
	else {
		w.game.spotSide = m.currentPlayer.side;
		p.Actions.deployReinforcements(w.scenario, m.turn, m.currentPlayer.id);
		w.CombatLog.reset();
	}
	return r;
}

//The refusal's reason, null when the command ran
const refusalOf = (r: { ok: true } | { ok: false; refusal: Refusal }) => "refusal" in r ? r.refusal.reason : null;

//A command as a button or a program sends it: finished at once (no animation), the end of turn as
//game.ts plays it. The refusal's reason, if refused
function sendAtOnce(p: Play, cmd: Command): string | null {
	if (cmd.type === "endTurn") return refusalOf(endTurn(p));
	const r = p.w.Commands.execute(p.w.scenario, cmd);
	settle(p);
	return refusalOf(r);
}

//ui.ts selects the unit that moves or attacks first; the state before a move is kept for the undo
function selectFor(p: Play, cmd: Command, checks: Checks) {
	const u = cmd.type === "move" || cmd.type === "attack" ? p.w.m.getUnitById(cmd.unit) : null;
	if (!u) return;
	select(p, u);
	if (cmd.type === "move") p.beforeMove = checks.undo ? { unit: u.id, state: stateOf(p.w, checks.undo) } : null;
}

//A command a pick chose, sent as the game sends it. The refusal's reason, if refused
function send(p: Play, cmd: Command, checks: Checks): string | null {
	selectFor(p, cmd, checks);
	if (cmd.type === "move") return refusalOf(move(p, cmd));
	if (cmd.type === "attack") return refusalOf(attack(p, cmd));
	return sendAtOnce(p, cmd);
}

const errorText = (e: unknown) => e instanceof Error ? e.stack || e.message : JSON.stringify(e);

//A command no pick chose, as a program sends it (no selection, no animation), checked against its
//run: check changes nothing, then the command is played. Null problems: the run threw after check
//allowed it without drift checked, the sequence ends there (the state is half changed)
function sendChecked(p: Play, cmd: Command, checks: Checks): StepResult {
	const before = checks.refused ? p.data() : "";
	const refusal = p.w.Commands.check(p.w.scenario, cmd);
	if (checks.refused && p.data() !== before)
		return { played: cmd, refusal: null, problems: ["check changed the game:" + difference(before, p.data())] };
	return refusal ? sendRefused(p, cmd, refusal.reason, checks, before) : sendAllowed(p, cmd, checks);
}

//With drift, a command check allowed whose run throws
function sendAllowed(p: Play, cmd: Command, checks: Checks): StepResult {
	try {
		sendAtOnce(p, cmd);
		return { played: cmd, refusal: null, problems: [] };
	} catch (e) {
		return { played: cmd, refusal: null, problems: checks.drift ? ["run threw after check allowed it: " + errorText(e)] : null };
	}
}

//With refused, a refused command that execute didn't refuse the same way, that changed the game's
//data or drew a random number
function sendRefused(p: Play, cmd: Command, reason: string, checks: Checks, before: string): StepResult {
	let sent: { value: string | null; draws: number };
	try { sent = counted(() => sendAtOnce(p, cmd)); }
	catch (e) { return { played: cmd, refusal: reason, problems: ["execute threw on a refused command: " + errorText(e)] }; }
	if (!checks.refused) return { played: cmd, refusal: reason, problems: [] };
	const problems: string[] = [];
	if (sent.value !== reason) problems.push("execute didn't refuse as check did: " + sent.value + ", check: " + reason);
	if (p.data() !== before) problems.push("the refused command changed the game:" + difference(before, p.data()));
	if (sent.draws) problems.push("the refused command drew " + sent.draws + " random numbers");
	return { played: cmd, refusal: reason, problems };
}

//Plays one step, returns what it played (null: no unit of the player had a command of the pick's
//kind), the refusal if it was refused and what the undo, estimate and command checks found. Null
//problems: the step ends the sequence
interface StepResult { played: Played; refusal: string | null; problems: string[] | null }
function play(p: Play, s: Step, checks: Checks): StepResult | null {
	const previous = p.beforeMove;
	p.beforeMove = null;
	if (!("kind" in s)) return sendChecked(p, s, checks);
	const cmd = commandOf(p, s);
	if (!cmd) return null;
	if (cmd.type === "estimate") return { played: cmd, refusal: null, problems: estimate(p, cmd, checks) };
	const refusal = send(p, cmd, checks);
	return { played: cmd, refusal, problems: cmd.type === "undo" ? undone(p, cmd.unit, checks, previous) : [] };
}

//Right after the unit's move, the undo restores everything as it was before it
function undone(p: Play, unit: number, checks: Checks, previous: Play["beforeMove"]): string[] {
	if (!checks.undo || !previous || previous.unit !== unit) return [];
	return changes(previous.state, stateOf(p.w, checks.undo)).map((c) => "the undo didn't restore the " + c);
}

//FC_STATS: how often each kind of step was played, "(none)" when no unit could, "(refused)" when
//the command was
const stats: Record<string, number> = {};
afterAll(() => { if (process.env.FC_STATS) console.warn(JSON.stringify(stats)); });
function count(s: Step, r: StepResult | null) {
	const name = ("kind" in s ? s.kind : "command " + s.type) + (!r ? " (none)" : r.refusal === null ? "" : " (refused)");
	stats[name] = (stats[name] || 0) + 1;
}

//A recon leader won in a fight widens the unit's spotting, its counters stay (#73): what to look
//at before a step to tell after it
function reconLeaders(w: World): () => boolean {
	const before = w.m.getUnits().map((u) => [u, w.GameRules.getUnitSpotRange(u), u.leader] as const);
	return () => before.some(([u, range, leader]) => u.leader !== leader && w.GameRules.getUnitSpotRange(u) !== range);
}

//Plays the steps until one breaks a check (what it broke) or the game ends
function playSteps(p: Play, steps: Step[], checks: Checks): string[] {
	for (const s of steps) {
		if (p.ended) break;
		const problems = playChecked(p, s, checks);
		if (problems === null) break;
		if (problems.length) return problems;
	}
	return [];
}

//Plays a step and checks it: what broke, null when the sequence ends there (the known break of
//#73, a run that threw)
function playChecked(p: Play, s: Step, checks: Checks): string[] | null {
	const newLeader = reconLeaders(p.w);
	const r = play(p, s, checks);
	count(s, r);
	if (!r) return [];
	p.log.push("turn " + p.w.m.turn + " player#" + p.w.m.currentPlayer.id + ": " + JSON.stringify(r.played)
		+ (r.refusal === null ? "" : " refused: " + r.refusal));
	if (!r.problems || !checks.invariants) return r.problems;
	return newLeader() ? null : [...r.problems, ...violations(p.w)];
}

//Plays the sequence, Math.random seeded with its seed, then after (what it found at the end); a
//broken check throws, with the commands played. The sequence prints as them too (fast-check's
//counterexample)
async function run(seq: Sequence, checks: Checks, after?: (p: Play) => Promise<string[]>) {
	const p = await start(seq.fixture, seq.seed);
	const played = () => seq.fixture + ", seed " + seq.seed + ", " + p.log.length + " steps:\n  " + p.log.join("\n  ");
	Object.assign(seq, { [fc.toStringMethod]: played });
	const random = Math.random;
	Math.random = mulberry32(seq.seed);
	let problems: string[];
	try { problems = playSteps(p, seq.steps, checks); }
	finally { Math.random = random; }
	if (!problems.length && after) problems = await after(p);
	if (problems.length) throw new Error(played() + "\n" + problems.join("\n"));
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

//Any command among the player's: the ones the rules don't stop (a unit of the other player, a
//resupply the button wouldn't offer...), the ones check refuses
const anyActions = { ...playerActions, "embark": 1, "disembark": 1, "upgrade": 1 };

//The check/run drift guard (docs/REFACTOR.md, step 4): check passes only what run can play
test("Property: execute never throws once check has allowed a command", async () => {
	await holds(fc.asyncProperty(await sequencesWithCommands(anyActions, 30), (seq) => run(seq, { drift: true })), 25);
});

//check is pure, and a refused command neither changes the game's data (src/state.ts toData) nor
//draws a random number
test("Property: a refused command changes nothing", async () => {
	await holds(fc.asyncProperty(await sequencesWithCommands(anyActions, 30), (seq) => run(seq, { refused: true })), 25);
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
