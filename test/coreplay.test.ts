//The running game's commands on the core (src/coreplay.ts, #137) against the old engine's
//(Commands.execute): random command sequences on the engine fixtures (test/commandgen.ts), each played
//on the old engine, then the same sequence on the core through the game's objects, with the hooks the
//UI gives (the move's finish when its animation ends, the surprise attack's animated as an attack, an
//attack's finish when its animation ends, the selection refreshed after the cleanup, a retreat's
//capture when its animation ends), the person clicking units between the commands. After every
//command both tell the same story:
//- the hooks called, in order, with what they were given (cells, units, strengths, the combat result,
//  the move's hexes and what the other side saw of them);
//- toData's state, the selection's hexes and unit, the counters, the combat log, the image cache.
import fs from "node:fs";
import fc from "fast-check";
import { afterAll, expect, test } from "vitest";
import { commandOf, type Sequence, sequences } from "./commandgen";
import { load } from "./invariants";
import { difference } from "./aigames";
import type { Unit } from "../src/unit";
import type { Cell, movementResults } from "../src/prototypes";
import type { ActionsAPI, AttackResult, FinishAttackHooks } from "../src/actions";
import type { toData as ToData } from "../src/state";
import type { AttackCommandHooks, Command } from "../src/commands";

type World = Awaited<ReturnType<typeof load>> & { toData: typeof ToData; Actions: ActionsAPI };
//The command entry under test: the old engine's, or the core's through the objects (the same hooks,
//but the surprise attack's: the old one asks the UI to attack, the new one for the attack's hooks)
type Engine = "old" | "core";

const stats: Record<string, number> = {};
const count = (what: string) => { stats[what] = (stats[what] || 0) + 1; };
afterAll(() => { if (process.env.FC_STATS) console.log(JSON.stringify(stats)); });

const unitName = (u: Unit | null) => u ? "unit#" + u.id : "none";
const cellName = (c: Cell | null) => c ? c.row + "," + c.col : "none";

function moveStory(mr: movementResults): string {
	const cells = (mr.passedCells as (Cell & { isVisible?: boolean })[]).map((c) => cellName(c) + (c.isVisible ? "v" : "")).join(" ");
	return `[${cells}] visible ${mr.isVisible} surprise ${Array.isArray(mr.surpriseCell) ? "none" : cellName(mr.surpriseCell)} capture ${mr.isCapture} win ${mr.isVictorySide}`;
}

function resultStory(r: AttackResult): string {
	const side = (s: AttackResult["attacking"]) => `${unitName(s.unit)} ${cellName(s.cell)} ${s.oldstr}->${s.newstr} leader ${s.leaderGain}`;
	const cr = r.cr === null ? "none" : `${r.cr.kills}/${r.cr.losses} overrun ${r.cr.isOverrun} rugged ${r.cr.isRugged} fire ${r.cr.defcanfire}`;
	return `${side(r.attacking)} | ${side(r.defending)} | ${cr} | support ${r.support.map(unitName).join(",")} stopped ${r.attackStopped}`
		+ ` | destroyed ${r.destroyed.map(unitName).join(",")} retreat ${cellName(r.retreat)} surrender ${r.surrender} won ${r.victorySides.join(",")}`;
}

//One game played on one engine: the story of every command
class Play {
	story: string[] = [];
	later: (() => void)[] = [];
	declare readonly w: World;
	declare readonly engine: Engine;
	declare readonly execute: (cmd: Command, hooks?: unknown) => { ok: boolean };

	constructor(w: World, engine: Engine, execute: (cmd: Command, hooks?: unknown) => { ok: boolean }) {
		this.w = w;
		this.engine = engine;
		this.execute = execute;
	}

	tell(what: string) {
		this.story.push(what);
	}

	//The UI's attack hooks (ui.ts uiAttackHooks): the facing of the units the animations read, the
	//animation's end later (the surprise attack's) or at once
	attackHooks(a: Unit, d: Unit, deferred: boolean): AttackCommandHooks {
		return {
			onStart: () => this.tell(`start ${unitName(a)} ${unitName(d)}`),
			onSupportShot: (u, c) => this.tell(`support ${unitName(u)} ${cellName(c)} facing ${u.facing}`),
			onAttack: (r) => this.tell(`attack ${resultStory(r)} facing ${a.facing} ${d.facing} ${d.destroyed}`),
			animate: (r, finish) => {
				this.tell("animate " + resultStory(r));
				if (deferred) this.later.push(() => finish(this.finishHooks(r)));
				else finish(this.finishHooks(r));
			},
		};
	}

	//ui.ts uiAttackAnimationFinished's hooks, with its selection refresh
	finishHooks(r: AttackResult): FinishAttackHooks {
		const m = this.w.m;
		return {
			onLosses: () => this.tell("losses " + resultStory(r)),
			onDestroyed: (c, u) => this.tell(`destroyed ${cellName(c)} ${unitName(u)}`),
			afterCleanup: () => {
				this.tell("cleanup " + unitName(m.currentUnit));
				if (m.currentUnit) {
					if (r.attacking.unit.destroyed && m.currentUnit.id === r.attacking.unit.id) m.delCurrentUnit();
					else m.selectUnit(m.currentUnit);
					if (r.defending.unit.destroyed && m.currentUnit && !m.currentUnit.hasMoved) m.setMoveRange(m.currentUnit);
				}
			},
			onRetreat: (u, c, mr) => {
				this.tell(`retreat ${unitName(u)} ${cellName(c)} ${moveStory(mr)}`);
				this.later.push(() => this.w.Actions.finishMove(m, u, mr, false, {
					onCapture: (x) => this.tell("retreat capture " + unitName(x)),
					onVictory: (side) => this.tell("retreat victory " + side),
				}));
			},
			onSurrender: (c, u) => this.tell(`surrender ${cellName(c)} ${unitName(u)}`),
			onVictory: (side) => this.tell("victory " + side),
		};
	}

	endTurn() {
		endTurnOld(this);
	}

	//ui.ts uiUnitMove and uiMoveAnimationFinished: the finish with the air mode, the surprise attack
	//animated (its finish after the move's), the capture, the victory
	move(cmd: Command & { type: "move" }, airMode: boolean) {
		const m = this.w.m, unit = m.getUnitById(cmd.unit);
		const finishHooks = {
			onSurprised: (c: Cell, u: Unit) => this.tell(`surprised ${cellName(c)} ${unitName(u)}`),
			onCapture: (u: Unit) => this.tell("capture " + unitName(u)),
			onVictory: (side: number) => this.tell("move victory " + side),
			...(this.engine === "old"
				? { attack: (a: Unit, d: Unit) => {
					const r = this.execute({ type: "attack", unit: a.id, target: d.id }, this.attackHooks(a, d, true));
					return r.ok ? (r as unknown as { result: AttackResult }).result : null;
				} }
				: { attackHooks: (a: Unit, d: Unit) => this.attackHooks(a, d, true) }),
		};
		return this.execute(cmd, {
			animate: (mr: movementResults, finish: (air: boolean, hooks: unknown) => unknown) => {
				this.tell(`moved ${unitName(unit)} ${moveStory(mr)} hexes ${m.getCurrentMoveRange().length} current ${unitName(m.currentUnit)}`);
				finish(airMode, finishHooks);
			},
		});
	}

	run(cmd: Command, airMode: boolean) {
		if (cmd.type === "endTurn") return this.endTurn();
		const r = cmd.type === "move" ? this.move(cmd, airMode)
			: cmd.type === "attack" ? this.execute(cmd, this.attackHooks(this.w.m.getUnitById(cmd.unit), this.w.m.getUnitById(cmd.target), false))
				: this.execute(cmd);
		const result = (r as { result?: unknown }).result;
		this.tell(!r.ok ? "refused " + JSON.stringify(r) : cmd.type === "move" ? "result " + moveStory(result as movementResults)
			: cmd.type === "attack" ? "result " + resultStory(result as AttackResult) : "result " + JSON.stringify(result));
		while (this.later.length) this.later.shift()();
	}
}

//The end of turn on the old engine for both (Game.endTurn: the next player's side shown, its
//reinforcements), as the game still plays it
function endTurnOld(p: Play) {
	const w = p.w;
	w.Commands.execute(w.scenario, { type: "endTurn" }, { localSide: 2 });
	w.game.spotSide = w.m.currentPlayer.side;
	w.Actions.deployReinforcements(w.scenario, w.m.turn, w.m.currentPlayer.id, (c) => p.tell("arrived " + cellName(c)));
}

//The state and what the screen shows beside it
function snapshot(w: World): string {
	const m = w.m, hexes: string[] = [];
	for (let r = 0; r < m.rows; r++)
		for (let c = 0; c < m.cols; c++) {
			const h = m.map[r][c], k = m.getBoard().visibility.counters[r][c];
			hexes.push(`${+h.isMoveSel}${+h.isAttackSel}${k.spot.join("")}${k.zoc.join("")}`);
		}
	return JSON.stringify({ state: w.toData(w.scenario, w.game).state, selected: m.currentUnit ? m.currentUnit.id : null,
		moveCells: m.getCurrentMoveRange().map((c) => c.row + "," + c.col).join(" "), hexes: hexes.join(","),
		log: w.CombatLog.log, images: m.getUnitImagesList() });
}

//A fixture loaded for a sequence: every player a person (but a campaign's other players), the side
//shown the current player's, the streams seeded, the combat log empty
async function loaded(seq: Sequence): Promise<World> {
	const w = await load(seq.fixture) as World;
	const { toData } = await import("../src/state");
	const { setEngineContext, engineContext } = await import("../src/context");
	const { Actions } = await import("../src/actions");
	Object.assign(w, { toData, Actions });
	setEngineContext({ ...engineContext, host: () => w.game });
	for (const p of w.m.getPlayers())
		if (!w.game.campaign || p.country === w.game.campaign.country) p.type = w.playerType.humanLocal;
	w.game.spotSide = w.m.currentPlayer.side;
	w.Rng.game.state = seq.seed >>> 0;
	w.Rng.ai.state = 7;
	w.CombatLog.reset();
	(globalThis as { map?: unknown }).map = w.m; //Map.attackUnit logs the turn of a global map (#28)
	return w;
}

//The person clicks a unit of theirs first, now and then (the selection's carrier flips)
function click(w: World, pick: Sequence["steps"][number]) {
	const own = w.m.getUnits().filter((u) => u.player.id === w.m.currentPlayer.id && u.getPos());
	if (pick.any % 3 !== 0 || !own.length) return;
	if (w.m.currentUnit !== null) w.m.delCurrentUnit();
	w.m.selectUnit(own[pick.unit % own.length]);
}

//The sequence on one engine: after each command its story and the snapshot
async function playOn(seq: Sequence, engine: Engine, commands?: (Command | null)[]): Promise<{ steps: string[]; commands: (Command | null)[] }> {
	const w = await loaded(seq);
	const { CorePlay } = await import("../src/coreplay");
	const execute = engine === "old" ? (cmd: Command, hooks?: unknown) => w.Commands.execute(w.scenario, cmd, hooks as never)
		: (cmd: Command, hooks?: unknown) => CorePlay.execute(w.scenario, cmd, hooks as never);
	const p = new Play(w, engine, execute);
	const played: (Command | null)[] = [], steps: string[] = [];
	for (let i = 0; i < seq.steps.length && !w.Actions.checkOutcome(w.scenario); i++) {
		const cmd = commands ? commands[i] : commandOf(w, seq.steps[i]);
		played.push(cmd);
		if (cmd === null) continue;
		click(w, seq.steps[i]);
		p.story = [];
		count(engine + " " + cmd.type);
		p.run(cmd, seq.steps[i].any % 2 === 1);
		steps.push(JSON.stringify(cmd) + "\n  " + p.story.join("\n  ") + "\n" + snapshot(w));
	}
	return { steps, commands: played };
}

async function both(seq: Sequence) {
	if (process.env.FC_TRACE) fs.appendFileSync(process.env.FC_TRACE, JSON.stringify(seq) + "\n");
	const old = await playOn(seq, "old");
	const core = await playOn(seq, "core", old.commands);
	for (let i = 0; i < Math.max(old.steps.length, core.steps.length); i++)
		if (old.steps[i] !== core.steps[i])
			throw new Error(`${seq.fixture}, step ${i}: ${(old.steps[i] || "").split("\n").filter((l) => !l.startsWith("{\"state")).join("\n")}${difference(old.steps[i] || "", core.steps[i] || "")}`);
	count("sequences");
}

test("Property: the game's commands on the core tell the UI what the old engine's did, and leave the same game", async () => {
	await fc.assert(fc.asyncProperty(sequences, both), { seed: 137, path: process.env.FC_PATH,
		numRuns: process.env.FC_RUNS ? Number(process.env.FC_RUNS) : 40, endOnFailure: !!process.env.FC_NOSHRINK });
	expect(stats["core attack"]).toBeGreaterThan(10);
}, process.env.FC_RUNS ? Number(process.env.FC_RUNS) * 1000 : 300_000);
