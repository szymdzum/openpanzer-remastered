//How fast the new core answers the AI's hot queries against the old engine (docs/CORE.md): the move
//range of every unit that can move and the combat estimate of every unit on what it can attack, on each engine
//fixture, and what building the world from toData costs. Off unless BENCH=1 (timings on a shared
//machine aren't a test): BENCH=1 npx vitest run test/core-bench.test.ts prints a table
import fs from "node:fs";
import { test } from "vitest";
import { fixtures } from "./contracts";
import { load } from "./invariants";
import { createWorld } from "../src/core/create";
import { moveRange } from "../src/core/movement";
import { combatResult } from "../src/core/combat";
import { unitById } from "../src/core/world";
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
