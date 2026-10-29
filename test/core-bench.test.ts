//How fast the core answers (docs/CORE.md), on each engine fixture: the AI's hot queries (the move
//range of every unit that can move, the combat estimate of every unit on what it can attack) and what
//building the world from toData costs; a move and an attack played by the core's step and by the
//game's command (on the world of the objects, the objects updated after); an end of turn; an AI
//turn on the core and in the game; and the screen's rules (src/gamerules.ts) the render loop and a click ask. Off unless BENCH=1
//(timings on a shared machine aren't a test): BENCH=1 npx vitest run test/core-bench.test.ts prints
//the tables
import fs from "node:fs";
import { test } from "vitest";
import { fixtures } from "./contracts";
import { load as loadChecked } from "./invariants";
import { createWorld } from "../src/core/create";
import { moveRange } from "../src/core/movement";
import { combatResult } from "../src/core/combat";
import { unitById } from "../src/core/world";
import { step } from "../src/core/step";
import { arriveReinforcements } from "../src/core/turn";
import type { Command } from "../src/core/command";
import type { Unit } from "../src/unit";
import type { AIAction } from "../src/ai";

//A fixture as the page plays it: the mirror without the checks the tests run with (src/mirror.ts)
async function load(name: string) {
	const w = await loadChecked(name);
	(await import("../src/mirror")).mirrorOptions.checks = false;
	return w;
}

//The time per call in microseconds, of the best of 5 rounds of reps calls
function time(reps: number, f: () => void): number {
	let best = Infinity;
	for (let round = 0; round < 5; round++) {
		const t = performance.now();
		for (let i = 0; i < reps; i++) f();
		best = Math.min(best, (performance.now() - t) / reps);
	}
	return best * 1000;
}

test.runIf(!!process.env.BENCH)("Benchmark: the core's move range and combat estimate", async () => {
	const rows: string[] = ["fixture, units that can move | move range µs | estimate µs | world from toData µs"];
	for (const name of fixtures("engine")) {
		const w = await load(name);
		const { toData } = await import("../src/state");
		const { m, GameRules: GR } = w;
		const units = m.getUnits().filter((u) => u.getPos());
		const movers = units.filter((u) => GR.getMoveRange(m, u).length > 0);
		const world = createWorld(toData(w.scenario), w.Equipment.equipment);
		const core = (u: Unit) => unitById(world, u.id);
		const pairs: [Unit, Unit][] = [];
		for (const u of units)
			for (const c of GR.getUnitAttackCells(m.map, u, m.rows, m.cols)) {
				const t = m.map[c.row][c.col].getAttackableUnit(u, false) || m.map[c.row][c.col].getAttackableUnit(u, true);
				if (t) pairs.push([u, t]);
			}
		const per = (n: number, x: number) => n ? (x / n).toFixed(1) : "-";
		const move = time(3, () => { for (const u of movers) moveRange(world, core(u)); });
		const estimate = time(3, () => { for (const [a, d] of pairs) combatResult(world, core(a), core(d), true, null); });
		const build = time(3, () => createWorld(toData(w.scenario), w.Equipment.equipment));
		rows.push(`${name} ${movers.length} | ${per(movers.length, move)} | ${per(pairs.length, estimate)} (${pairs.length} pairs)`
			+ ` | ${build.toFixed(0)}`);
	}
	fs.writeSync(2, rows.join("\n") + "\n"); //(past Vitest, which keeps a passing test's console)
}, 600_000);

//The commands played in a row, each unit once: a move to the first hex of its range, or an attack
//on the first unit it can attack, as the game offers them at the start
async function commandsOf(name: string, kind: "move" | "attack"): Promise<Command[]> {
	const { m, GameRules: GR } = await load(name);
	const cmds: Command[] = [];
	for (const u of m.getUnits().filter((x) => x.player.id === m.currentPlayer.id && x.getPos())) {
		if (kind === "move") {
			const to = GR.getMoveRange(m, u).find((c) => c.canMove);
			if (to) cmds.push({ type: "move", unit: u.id, to: { row: to.row, col: to.col } });
			continue;
		}
		for (const c of GR.getUnitAttackCells(m.map, u, m.rows, m.cols)) {
			const t = m.map[c.row][c.col].getAttackableUnit(u, false) || m.map[c.row][c.col].getAttackableUnit(u, true);
			if (t) {
				cmds.push({ type: "attack", unit: u.id, target: t.id });
				break;
			}
		}
	}
	return cmds;
}

//The best of 5 rounds of the commands played in a row, per command in µs: the game's command (the
//fixture loaded again before each round, not timed) and the core's step (from the same start)
async function timeCommands(name: string, cmds: Command[]): Promise<[number, number]> {
	let played = Infinity, core = Infinity;
	for (let round = 0; round < 5; round++) {
		const w = await load(name);
		const { toData } = await import("../src/state");
		w.Rng.game.state = round + 1;
		let world = createWorld(toData(w.scenario, w.game), w.Equipment.equipment);
		let t = performance.now();
		for (const cmd of cmds) {
			const r = step(world, cmd);
			if (r.ok) world = r.world;
		}
		core = Math.min(core, performance.now() - t);
		t = performance.now();
		for (const cmd of cmds) w.Commands.execute(w.scenario, cmd);
		played = Math.min(played, performance.now() - t);
	}
	return [played * 1000 / cmds.length, core * 1000 / cmds.length];
}

test.runIf(!!process.env.BENCH)("Benchmark: the game's command against the core's step, move and attack", async () => {
	const rows: string[] = ["fixture | moves: game/core µs per command | attacks: game/core µs per command"];
	for (const name of fixtures("engine")) {
		const moves = await commandsOf(name, "move"), attacks = await commandsOf(name, "attack");
		const [mg, mc] = moves.length ? await timeCommands(name, moves) : [0, 0];
		const [ag, ac] = attacks.length ? await timeCommands(name, attacks) : [0, 0];
		rows.push(`${name} | ${moves.length}: ${mg.toFixed(0)} / ${mc.toFixed(0)} | ${attacks.length}: ${ag.toFixed(0)} / ${ac.toFixed(0)}`);
	}
	fs.writeSync(2, rows.join("\n") + "\n");
}, 600_000);

//Two rounds of turns ended on each fixture, each with the reinforcements that arrive (no player
//plans): the core's step and arriveReinforcements, per end of turn in µs, best of 5
test.runIf(!!process.env.BENCH)("Benchmark: the core's end of turn", async () => {
	const rows: string[] = ["fixture, units | end of turn µs"];
	for (const name of fixtures("engine")) {
		let core = Infinity, units = 0, n = 0;
		for (let round = 0; round < 5; round++) {
			const w = await load(name);
			const { toData } = await import("../src/state");
			let world = createWorld(toData(w.scenario, w.game), w.Equipment.equipment, { spotSide: 0 });
			units = world.state.units.length;
			n = 2 * world.state.players.length;
			const t = performance.now();
			for (let i = 0; i < n; i++) {
				const r = step(world, { type: "endTurn" });
				if (r.ok) world = arriveReinforcements(r.world).world;
			}
			core = Math.min(core, performance.now() - t);
		}
		rows.push(`${name} ${units} | ${(core * 1000 / n).toFixed(0)}`);
	}
	fs.writeSync(2, rows.join("\n") + "\n");
}, 600_000);

//An AI turn on each fixture, every player the AI (src/core/session.ts): the plan of the current
//player's turn alone, then the turn played to its end (its orders, the end of turn, the next player's
//turn start and plan, the reinforcements), in ms, best of 5
test.runIf(!!process.env.BENCH)("Benchmark: an AI turn on the core", async () => {
	const { aiController } = await import("../src/core/ai");
	const { startSession, playTurn } = await import("../src/core/session");
	const rows: string[] = ["fixture, orders | plan ms | turn ms"];
	for (const name of fixtures("engine").filter((f) => !f.startsWith("scripted"))) {
		const best = { plan: Infinity, turn: Infinity };
		let orders = 0;
		for (let round = 0; round < 5; round++) {
			const w = await load(name);
			const { toData } = await import("../src/state");
			const saved = toData(w.scenario, w.game);
			saved.state.players.forEach((p) => { p.type = w.playerType.aiLocal; });
			const world = createWorld(saved, w.Equipment.equipment, { spotSide: -1 });
			let t = performance.now();
			const s = startSession(world, (_type, player) => aiController(player), { loaded: true, localSide: -1 });
			best.plan = Math.min(best.plan, performance.now() - t);
			t = performance.now();
			orders = playTurn(s).length - 1;
			best.turn = Math.min(best.turn, performance.now() - t);
		}
		rows.push(`${name} ${orders} | ${best.plan.toFixed(1)} | ${best.turn.toFixed(1)}`);
	}
	fs.writeSync(2, rows.join("\n") + "\n");
}, 600_000);

//An AI action as the command the game sends for it (the host's processAction), null for what only the screen shows
function commandOf(A: Awaited<ReturnType<typeof load>>["actionType"], a: AIAction): Command | null {
	const unit = a.param[0] as Unit | null, other = a.param[1] as Unit & { row: number; col: number };
	if (unit === null) return null;
	switch (a.type) {
		case A.move: return { type: "move", unit: unit.id, to: { row: other.row, col: other.col } };
		case A.attack: return { type: "attack", unit: unit.id, target: other.id };
		case A.resupply: return { type: "resupply", unit: unit.id };
		case A.reinforce: return { type: "reinforce", unit: unit.id };
		case A.mount: return { type: "mount", unit: unit.id };
		case A.umount: return { type: "unmount", unit: unit.id };
		default: return null;
	}
}

//An AI turn in the game, every player the AI: the turn's start and plan, every order played as the game
//plays it (the commands on the world of the objects, the objects updated after each piece), the end of
//turn with the next player's start: in ms, best of 5
test.runIf(!!process.env.BENCH)("Benchmark: an AI turn in the game", async () => {
	const rows: string[] = ["fixture | AI turn in the game ms"];
	for (const name of fixtures("engine").filter((f) => !f.startsWith("scripted"))) {
		let best = Infinity;
		for (let round = 0; round < 5; round++) {
			const w = await load(name);
			const m = w.m;
			const t = performance.now();
			const ai = new w.AI(m.currentPlayer, m);
			ai.buildActions();
			for (let n = 0, a = ai.getAction(); a && n < 500; n++, a = ai.getAction()) {
				const c = commandOf(w.actionType, a);
				if (c !== null) w.Commands.execute(w.scenario, c);
			}
			w.endTurn();
			best = Math.min(best, performance.now() - t);
		}
		rows.push(`${name} | ${best.toFixed(1)}`);
	}
	fs.writeSync(2, rows.join("\n") + "\n");
}, 600_000);

//The screen's rules in the running game (src/gamerules.ts): what the render loop asks of every unit it
//draws (the unit's own rules: its move range, ammo, fuel, ground, the bridge it stands on) and what a
//click asks of the map (the move and attack hexes, the estimate under the attack cursor, the context
//buttons), on the world kept while nothing wrote into the objects (src/mirror.ts)
test.runIf(!!process.env.BENCH)("Benchmark: the screen's rules on the core", async () => {
	const rows: string[] = ["fixture, units | render loop per unit µs | move+attack hexes µs | estimate µs | context buttons µs"];
	for (const name of fixtures("engine")) {
		const w = await load(name);
		const { m, GameRules: R } = w;
		const units = m.getUnits().filter((u) => u.getPos());
		const pair = units.flatMap((a) => units.filter((d) => a.player.side !== d.player.side && R.isInAttackRange(a, d)).map((d) => [a, d]))[0];
		let sink = 0;
		const loop = () => { for (const u of units) sink += R.getUnitMoveRange(u) + +R.unitUsesAmmo(u) + +R.unitUsesFuel(u) + +R.isGround(u) + +R.isBridgeForSide(u.getHex(), 0); };
		const hexes = () => { R.getMoveRange(m, units[0]); R.getUnitAttackCells(m.map, units[0], m.rows, m.cols); };
		const estimate = () => { if (pair) R.calculateCombatResults(pair[0], pair[1], m.getUnits(), false, true); };
		const buttons = () => { const u = units[0]; R.canMount(u); R.canEmbark(m.map, u); R.canDisembark(m.map, u); R.canResupply(m.map, u); R.canReinforce(m.map, u); };
		rows.push(`${name} ${units.length} | ${(time(20, loop) / units.length).toFixed(2)} | ${time(10, hexes).toFixed(0)}`
			+ ` | ${time(10, estimate).toFixed(0)} | ${time(10, buttons).toFixed(0)}`);
		if (sink < 0) rows.push("");
	}
	fs.writeSync(2, rows.join("\n") + "\n");
}, 600_000);
