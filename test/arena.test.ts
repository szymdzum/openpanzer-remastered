//The AI arena (#46, test/arena/): games played headless, the AI against the AI and against the scripted
//general (#236), and what each side achieved. Off unless ARENA=1 (a few minutes): `npm run arena` prints
//the tables docs/ai/arena.md keeps. ARENA_FILES (comma separated) and ARENA_SEEDS pick the games;
//ARENA_OUT writes every game's result as JSON. One game always runs, to keep the general playing
import fs from "node:fs";
import { expect, test } from "vitest";
import { type GameResult, type Match, type Player, playMatch, summary } from "./arena/arena";

test("The scripted general plays six turns against the AI, every order allowed (#236)", () => {
	const g = playMatch({ file: "drpzop01.xml", sides: ["general", "ai"], seed: 1, turns: 6 });
	expect(g.sides[0].refused).toBe(0);
	expect(g.sides[0].unitsDestroyed).toBeGreaterThan(0);
}, 120_000);

const MATCHUPS: [Player, Player][] = [["ai", "ai"], ["general", "ai"], ["ai", "general"], ["general", "general"]];

test.runIf(!!process.env.ARENA)("The AI arena", () => {
	const files = (process.env.ARENA_FILES || "drpzop01.xml").split(",");
	const seeds = Array.from({ length: +(process.env.ARENA_SEEDS || 10) }, (_, i) => i + 1);
	const all: GameResult[] = [];
	const out: string[] = [];
	for (const file of files) {
		out.push(`\n### ${file}, ${seeds.length} seeds\n`,
			"| side (player) | wins | victory levels | first objective, turn (games) | objectives taken | held at the end | units lost | destroyed | lost per objective | orders refused |",
			"|---|---|---|---|---|---|---|---|---|---|");
		for (const sides of MATCHUPS) {
			const results = seeds.map((seed): GameResult => playMatch({ file, sides, seed } as Match));
			all.push(...results);
			out.push(`| **${sides[0]} vs ${sides[1]}** | | | | | | | | | |`, ...summary(results).map((r) => "| " + r + " |"));
			const ends = results.map((g) => g.end === "turnLimit" ? "limit" : `${g.end} t${g.turns}`);
			out.push(`| ends: ${[...new Set(ends)].map((e) => `${ends.filter((x) => x === e).length}× ${e}`).join(", ")}; `
				+ `${Math.round(results.reduce((a, g) => a + g.ms, 0) / results.length)} ms a game | | | | | | | | | |`);
		}
	}
	if (process.env.ARENA_OUT) fs.writeFileSync(process.env.ARENA_OUT, JSON.stringify(all, null, 1));
	fs.writeSync(2, out.join("\n") + "\n"); //(past Vitest, which keeps a passing test's console)
	expect(all.every((g) => g.sides.every((x) => x.player === "ai" || x.refused === 0)), "the general's orders are all allowed").toBe(true);
}, 3_600_000);
