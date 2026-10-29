//The running game's commands on the core (src/commands.ts, #137): random command sequences on the engine
//fixtures (test/commandgen.ts), played through the game's objects as the UI plays them (a move and an
//attack whole, the selection refreshed after the attack's cleanup), the person clicking units between the
//commands. After every command, two hashes: of toData's state, the combat log and the image cache (not the
//selection since #377: the old UI's); and of what the UI is told to show (the move's hexes and what the other side
//saw of them, the surprise, the attack's sides with their strengths, classes and facings at the shots, the
//combat result, the destroyed units, the retreat). Until the old engine went (#137) the old engine's
//commands left the same game on the same sequences, up to where its counters drifted (#72, #73); the
//states' hashes then pin it since. Until #375 the UI finished a move and an attack from the hooks it
//animated with: the states after each command were recorded before that change (test/coreplay.json.gz),
//the stories of the steps played whole after it
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { createHash } from "node:crypto";
import fc from "fast-check";
import { afterAll, expect, test } from "vitest";
import { commandOf, type Sequence, sequences } from "./commandgen";
import { load, uiCommand } from "./invariants";
import type { Unit } from "../src/unit";
import type { Cell, movementResults } from "../src/prototypes";
import type { AttackResult, MoveResult } from "../src/commands";
import type { Command } from "../src/core/command";

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
	const side = (s: AttackResult["attacking"]) => `${unitName(s.unit)} ${cellName(s.cell)} ${s.oldstr}->${s.newstr} leader ${s.leaderGain}`
		+ ` class ${s.uclass} facing ${s.facing}`;
	const cr = r.cr === null ? "none" : `${r.cr.kills}/${r.cr.losses} overrun ${r.cr.isOverrun} rugged ${r.cr.isRugged} fire ${r.cr.defcanfire}`;
	return `${side(r.attacking)} | ${side(r.defending)} | ${cr} | support ${r.support.map((u) => unitName(u) + " facing " + u.facing).join(",")}`
		+ ` stopped ${r.attackStopped} | destroyed ${r.destroyed.map(unitName).join(",")} retreat ${cellName(r.retreat)}`
		+ ` ${r.retreatMove === null ? "" : moveStory(r.retreatMove)} surrender ${r.surrender} won ${r.victorySides.join(",")}`
		+ ` | ${r.events.map((e) => e.type).join(",")}`;
}

function surpriseStory(s: MoveResult["surprise"]): string {
	if (s === null) return "none";
	return `${cellName(s.cell)} ${unitName(s.target)} ${s.attack === null ? "no attack" : resultStory(s.attack)}`;
}

//One game played: the story of every command
class Play {
	story: string[] = [];
	declare readonly w: World;

	constructor(w: World) {
		this.w = w;
	}

	tell(what: string) {
		this.story.push(what);
	}

	endTurn() {
		endTurn(this);
	}

	//The command as the UI plays it (ui.ts uiUnitMove, uiUnitAttack), what it is told
	run(cmd: Command) {
		if (cmd.type === "endTurn") return this.endTurn();
		const r = uiCommand(this.w, cmd);
		if (!r.ok) {
			this.tell("refused " + JSON.stringify(r));
			return;
		}
		const result = r.result as unknown;
		if (cmd.type === "move") {
			const m = result as MoveResult;
			this.tell(`moved ${moveStory(m.move)} at ${cellName(m.at)} facing ${m.facing} capture ${m.capture} win ${m.victorySide}`
				+ ` surprise ${surpriseStory(m.surprise)} | ${m.events.map((e) => e.type).join(",")}`);
		} else {
			this.tell("result " + (cmd.type === "attack" ? resultStory(result as AttackResult) : JSON.stringify(result)));
		}
	}
}

//The end of turn as Game.endTurn plays it on the session (src/app/driver.ts endGameTurn), no player
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

//The state and what the game keeps beside it: the combat log, the image cache. Not the selection, the
//old UI's (#377)
function snapshot(w: World): string {
	return JSON.stringify({ state: w.toData(w.scenario, w.game).state, log: w.CombatLog.log, images: w.m.getUnitImagesList() });
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

//The sequence: after each command the snapshot's hash and the story's
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
		const hash = (text: string) => createHash("sha1").update(text).digest("hex").slice(0, 12);
		steps.push(hash(JSON.stringify(cmd) + "\n" + snapshot(w)) + " " + hash(JSON.stringify(cmd) + "\n  " + p.story.join("\n  ")));
	}
	return steps;
}

//The hashes recorded, by sequence (UPDATE_CONTRACTS=1 writes them again, in a commit that names the
//issue it fixes): the old engine's states were the same up to where its counters drifted
const pinned = path.join(__dirname, "coreplay.json.gz");
const recorded = () => JSON.parse(zlib.gunzipSync(fs.readFileSync(pinned)).toString("utf8")) as string[][];

test("The game's commands on the core leave the same game as the old engine's, and tell the UI what they did", async () => {
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
