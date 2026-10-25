//The running game's commands on the core (src/commands.ts, #137): random command sequences on the engine
//fixtures (test/commandgen.ts), played through the game's objects with the hooks the UI gives (the
//move's finish when its animation ends, the surprise attack's animated as an attack, an attack's finish
//when its animation ends, the selection refreshed after the cleanup, a retreat's capture when its
//animation ends), the person clicking units between the commands. After every command, its story: the
//hooks called, in order, with what they were given (cells, units, strengths, the combat result, the
//move's hexes and what the other side saw of them); toData's state, the selection's hexes and unit,
//the combat log, the image cache. Until the old engine went (#137) the old engine's commands told the
//same story on the same sequences, up to where its counters drifted (#72, #73); the hashes of the
//stories then (test/coreplay.json.gz) pin them since
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { createHash } from "node:crypto";
import fc from "fast-check";
import { afterAll, expect, test } from "vitest";
import { commandOf, type Sequence, sequences } from "./commandgen";
import { load } from "./invariants";
import type { Unit } from "../src/unit";
import type { Cell, movementResults } from "../src/prototypes";
import type { AttackCommandHooks, AttackResult, Command, FinishAttackHooks } from "../src/commands";

type World = Awaited<ReturnType<typeof loaded>>;

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

//One game played: the story of every command
class Play {
	story: string[] = [];
	later: (() => void)[] = [];
	declare readonly w: World;

	constructor(w: World) {
		this.w = w;
	}

	execute(cmd: Command, hooks?: unknown): { ok: boolean } {
		return this.w.Commands.execute(this.w.scenario, cmd, hooks as never);
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
				this.later.push(() => this.w.Commands.finishRetreat(u, mr, {
					onCapture: (x) => this.tell("retreat capture " + unitName(x)),
					onVictory: (side) => this.tell("retreat victory " + side),
				}));
			},
			onSurrender: (c, u) => this.tell(`surrender ${cellName(c)} ${unitName(u)}`),
			onVictory: (side) => this.tell("victory " + side),
		};
	}

	endTurn() {
		endTurn(this);
	}

	//ui.ts uiUnitMove and uiMoveAnimationFinished: the finish, the surprise attack animated (its finish
	//after the move's), the capture, the victory
	move(cmd: Command & { type: "move" }) {
		const m = this.w.m, unit = m.getUnitById(cmd.unit);
		const finishHooks = {
			onSurprised: (c: Cell, u: Unit) => this.tell(`surprised ${cellName(c)} ${unitName(u)}`),
			onCapture: (u: Unit) => this.tell("capture " + unitName(u)),
			onVictory: (side: number) => this.tell("move victory " + side),
			attackHooks: (a: Unit, d: Unit) => this.attackHooks(a, d, true),
		};
		return this.execute(cmd, {
			animate: (mr: movementResults, finish: (hooks: unknown) => unknown) => {
				this.tell(`moved ${unitName(unit)} ${moveStory(mr)} hexes ${m.getCurrentMoveRange().length} current ${unitName(m.currentUnit)}`);
				finish(finishHooks);
			},
		});
	}

	run(cmd: Command) {
		if (cmd.type === "endTurn") return this.endTurn();
		const r = cmd.type === "move" ? this.move(cmd)
			: cmd.type === "attack" ? this.execute(cmd, this.attackHooks(this.w.m.getUnitById(cmd.unit), this.w.m.getUnitById(cmd.target), false))
				: this.execute(cmd);
		const result = (r as { result?: unknown }).result;
		this.tell(!r.ok ? "refused " + JSON.stringify(r) : cmd.type === "move" ? "result " + moveStory(result as movementResults)
			: cmd.type === "attack" ? "result " + resultStory(result as AttackResult) : "result " + JSON.stringify(result));
		while (this.later.length) this.later.shift()();
	}
}

//The end of turn as Game.endTurn plays it on the session (src/coresession.ts endGameTurn), no player
//planning (the people play): the selection cleared, the end of turn step, the resupplies of the new
//turn in the combat log, the next player's side shown, its reinforcements arrived, each in the log
function endTurn(p: Play) {
	const w = p.w;
	w.m.delMoveSel();
	w.m.delAttackSel();
	w.m.delCurrentUnit();
	const r = w.step(w.worldOf(), { type: "endTurn" });
	if (!r.ok) throw new Error("the end of turn refused");
	w.applyData(r.world);
	for (const e of r.events) if (e.type === "resupplied") w.CombatLog.addResupply(w.m.getUnitById(e.unit));
	w.game.spotSide = w.m.currentPlayer.side;
	const arrived = w.arriveReinforcements(w.worldOf());
	w.applyData(arrived.world);
	for (const e of arrived.events)
		if (e.type === "arrived") {
			p.tell("arrived " + cellName(e.at as Cell));
			w.CombatLog.addReinforcement(w.m.getUnitById(e.unit));
		}
}

//The state and what the screen shows beside it
function snapshot(w: World): string {
	const m = w.m, hexes: string[] = [];
	for (let r = 0; r < m.rows; r++)
		for (let c = 0; c < m.cols; c++) {
			const h = m.map[r][c];
			hexes.push(`${+h.isMoveSel}${+h.isAttackSel}`);
		}
	return JSON.stringify({ state: w.toData(w.scenario, w.game).state, selected: m.currentUnit ? m.currentUnit.id : null,
		moveCells: m.getCurrentMoveRange().map((c) => c.row + "," + c.col).join(" "), hexes: hexes.join(","),
		log: w.CombatLog.log, images: m.getUnitImagesList() });
}

//A fixture loaded for a sequence: every player a person (but a campaign's other players), the side
//shown the current player's, the streams seeded, the combat log empty
async function loaded(seq: Sequence) {
	const w = await load(seq.fixture);
	const { setEngineContext, engineContext } = await import("../src/context");
	const { worldOf, applyData, gameInputs } = await import("../src/mirror");
	const { arriveReinforcements, outcome } = await import("../src/core/turn");
	const { step } = await import("../src/core/step");
	setEngineContext({ ...engineContext, host: () => w.game });
	for (const p of w.m.getPlayers())
		if (!w.game.campaign || p.country === w.game.campaign.country) p.type = w.playerType.humanLocal;
	w.game.spotSide = w.m.currentPlayer.side;
	w.Rng.game.state = seq.seed >>> 0;
	w.Rng.ai.state = 7;
	w.CombatLog.reset();
	const world = () => worldOf(w.scenario, w.game, gameInputs(w.game));
	return Object.assign(w, { worldOf: world, applyData: (x: ReturnType<typeof world>) => applyData(w.scenario, x, w.game),
		arriveReinforcements, step, ended: () => outcome(world()) !== null });
}

//The person clicks a unit of theirs first, now and then (the selection's carrier flips)
function click(w: World, pick: Sequence["steps"][number]) {
	const own = w.m.getUnits().filter((u) => u.player.id === w.m.currentPlayer.id && u.getPos());
	if (pick.any % 3 !== 0 || !own.length) return;
	if (w.m.currentUnit !== null) w.m.delCurrentUnit();
	w.m.selectUnit(own[pick.unit % own.length]);
}

//The sequence: after each command its story and the snapshot, as hashes
async function play(seq: Sequence): Promise<string[]> {
	const w = await loaded(seq);
	const p = new Play(w);
	const steps: string[] = [];
	for (let i = 0; i < seq.steps.length && !w.ended(); i++) {
		const cmd = commandOf(w, seq.steps[i]);
		if (cmd === null) continue;
		click(w, seq.steps[i]);
		p.story = [];
		count(cmd.type);
		p.run(cmd);
		steps.push(createHash("sha1").update(JSON.stringify(cmd) + "\n  " + p.story.join("\n  ") + "\n" + snapshot(w))
			.digest("hex").slice(0, 12));
	}
	return steps;
}

//The hashes recorded, by sequence (UPDATE_CONTRACTS=1 writes them again, in a commit that names the
//issue it fixes): the old engine's story was the same up to where its counters drifted
const pinned = path.join(__dirname, "coreplay.json.gz");
const recorded = () => JSON.parse(zlib.gunzipSync(fs.readFileSync(pinned)).toString("utf8")) as string[][];

test("The game's commands on the core tell the UI what the old engine's did, and leave the same game", async () => {
	const want = recorded(), got: string[][] = [];
	for (const seq of fc.sample(sequences, { seed: 137, numRuns: want.length })) {
		const steps = await play(seq);
		const i = got.length;
		got.push(steps);
		if (process.env.UPDATE_CONTRACTS) continue;
		const k = want[i].findIndex((h, n) => steps[n] !== h);
		expect(k, `sequence ${i} on ${seq.fixture}, step ${k}`).toBe(-1);
	}
	if (process.env.UPDATE_CONTRACTS) fs.writeFileSync(pinned, zlib.gzipSync(JSON.stringify(got), { level: 9 }));
	expect(stats.attack).toBeGreaterThan(10);
}, 300_000);
