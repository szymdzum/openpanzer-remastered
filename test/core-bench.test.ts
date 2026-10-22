//How fast the new core answers the AI's hot queries against the old engine (docs/CORE.md): the move
//range of every unit that can move and the combat estimate of every unit on what it can attack, on each engine
//fixture, and what building the world from toData costs; and how fast its step plays a move and an
//attack against the old engine's command. Off unless BENCH=1 (timings on a shared machine aren't a
//test): BENCH=1 npx vitest run test/core-bench.test.ts prints the tables
import fs from "node:fs";
import { test } from "vitest";
import { fixtures } from "./contracts";
import { load } from "./invariants";
import { createWorld } from "../src/core/create";
import { moveRange } from "../src/core/movement";
import { combatResult } from "../src/core/combat";
import { unitById } from "../src/core/world";
import { step } from "../src/core/step";
import type { Command } from "../src/commands";
import type { Unit } from "../src/unit";

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

test.runIf(!!process.env.BENCH)("Benchmark: the core's move range and combat estimate against the old engine", async () => {
	const rows: string[] = ["fixture, units that can move | move range old/core µs | estimate old/core µs | world from toData µs"];
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
		const moveOld = time(3, () => { for (const u of movers) GR.getMoveRange(m, u); });
		const moveCore = time(3, () => { for (const u of movers) moveRange(world, core(u)); });
		const estOld = time(3, () => { for (const [a, d] of pairs) GR.calculateCombatResults(a, d, m.getUnits(), true, true); });
		const estCore = time(3, () => { for (const [a, d] of pairs) combatResult(world, core(a), core(d), true, null); });
		const build = time(3, () => createWorld(toData(w.scenario), w.Equipment.equipment));
		rows.push(`${name} ${movers.length} | ${per(movers.length, moveOld)} / ${per(movers.length, moveCore)}`
			+ ` | ${per(pairs.length, estOld)} / ${per(pairs.length, estCore)} (${pairs.length} pairs) | ${build.toFixed(0)}`);
	}
	fs.writeSync(2, rows.join("\n") + "\n"); //(past Vitest, which keeps a passing test's console)
}, 600_000);

//The commands played in a row, each unit once: a move to the first hex of its range, or an attack
//on the first unit it can attack, as the old engine offers them at the start
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

//The best of 5 rounds of the commands played in a row, per command in µs: the old engine's (the
//fixture loaded again before each round, not timed) and the core's step (from the same start)
async function timeCommands(name: string, cmds: Command[]): Promise<[number, number]> {
	let old = Infinity, core = Infinity;
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
		old = Math.min(old, performance.now() - t);
	}
	return [old * 1000 / cmds.length, core * 1000 / cmds.length];
}

test.runIf(!!process.env.BENCH)("Benchmark: the core's step against the old engine's command, move and attack", async () => {
	const rows: string[] = ["fixture | moves: old/core µs per command | attacks: old/core µs per command"];
	for (const name of fixtures("engine")) {
		const moves = await commandsOf(name, "move"), attacks = await commandsOf(name, "attack");
		const [mo, mc] = moves.length ? await timeCommands(name, moves) : [0, 0];
		const [ao, ac] = attacks.length ? await timeCommands(name, attacks) : [0, 0];
		rows.push(`${name} | ${moves.length}: ${mo.toFixed(0)} / ${mc.toFixed(0)} | ${attacks.length}: ${ao.toFixed(0)} / ${ac.toFixed(0)}`);
	}
	fs.writeSync(2, rows.join("\n") + "\n");
}, 600_000);
