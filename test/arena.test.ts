//The AI arena (#46, test/arena/): games played headless, the AI against the AI and against the scripted
//general (#236), and what each side achieved. Off unless ARENA=1 (a few minutes): `npm run arena` prints
//the tables docs/ai/arena.md keeps, every measure with its 95% interval, and the time each side planned a turn.
//ARENA_SUITE=1 plays the suite (#604); ARENA_FILES (comma separated), ARENA_SEEDS and ARENA_MATCHUPS pick the
//games, ARENA_RULES the rules (remaster, or classic: #53), JOBS the processes; ARENA_OUT writes every game's
//result as JSON. One game always runs, to keep the general playing, and one in a worker process
import fs from "node:fs";
import { expect, test } from "vitest";
import { type GameResult, isPlayer, type Match, type Player, playMatch } from "./arena/arena";
import { playMatches } from "./arena/pool";
import { HEADER, PLANNING_HEADER, planning, row, summary } from "./arena/table";

test("The scripted general plays six turns against the AI, every order allowed (#236)", () => {
	const g = playMatch({ file: "drpzop01.xml", sides: ["general", "ai"], seed: 1, turns: 6 });
	expect(g.sides[0].refused).toBe(0);
	expect(g.sides[0].unitsDestroyed).toBeGreaterThan(0);
}, 120_000);

//The time is the machine's; the number of turns timed is the game's
const untimed = (g: GameResult) => ({ ...g, ms: 0, sides: g.sides.map((s) => ({ ...s, turnMs: s.turnMs.length })) });

test("A match played in a worker process gives the same game as in this one, but for the time (#604)", async () => {
	const match: Match = { file: "pc1long.xml", sides: ["general", "ai"], seed: 3, turns: 4 };
	const [there] = await playMatches([match], 1);
	const here = playMatch(match);
	expect(here.sides[0].turnMs.length).toBeGreaterThan(0);
	expect(untimed(there)).toEqual(untimed(here));
}, 60_000);

//The suite (docs/ai/arena.md, "The suite"): the AI attacking and defending on both sides, small and large maps
const SUITE = ["drpzop01.xml", "fw82.xml", "pc1long.xml", "cm3kursk.xml", "lah_it_08.xml", "it12baxe.xml",
	"dragrom06.xml", "drlutt26.xml"];

const env = process.env;

//ARENA_MATCHUPS, "axis-allies" pairs of players: the AI and the general against each other by default
function matchups(): [Player, Player][] {
	return (env.ARENA_MATCHUPS || "ai-ai,general-ai,ai-general").split(",").map((m) => {
		const sides = m.split("-");
		if (sides.length !== 2 || !sides.every(isPlayer)) throw new Error(`ARENA_MATCHUPS: no such matchup ${m}`);
		return [sides[0], sides[1]];
	});
}

test.runIf(!!env.ARENA)("The AI arena", async () => {
	const files = env.ARENA_FILES ? env.ARENA_FILES.split(",") : env.ARENA_SUITE ? SUITE : ["drpzop01.xml"];
	const seeds = Array.from({ length: +(env.ARENA_SEEDS || (env.ARENA_SUITE ? 40 : 10)) }, (_, i) => i + 1);
	const rules = env.ARENA_RULES === "classic" ? "classic" : "remaster";
	const sides = matchups(), jobs = +(env.JOBS || 3);
	const matches = files.flatMap((file) => sides.flatMap((s) => seeds.map((seed): Match => ({ file, sides: s, seed, rules }))));
	const t0 = performance.now();
	const all = await playMatches(matches, jobs, (done) => {
		if (done % Math.max(1, Math.round(matches.length / 10)) === 0) fs.writeSync(2, `arena: ${done}/${matches.length} games\n`);
	});
	const out = files.flatMap((file) => report(file, `${seeds.length} seeds, ${rules} rules`, sides.map((s) => all.filter((g) =>
		g.match.file === file && g.match.sides.join() === s.join()))));
	out.push(`\n${all.length} games on ${jobs} processes in ${Math.round((performance.now() - t0) / 1000)} s`);
	if (env.ARENA_OUT) fs.writeFileSync(env.ARENA_OUT, JSON.stringify(all, null, 1));
	fs.writeSync(2, out.join("\n") + "\n"); //(past Vitest, which keeps a passing test's console)
	expect(all.every((g) => g.sides.every((x) => x.player === "ai" || x.refused === 0)), "the general's orders are all allowed").toBe(true);
}, 7_200_000);

//A scenario's tables: the measures, then the planning time, a part per matchup
function report(file: string, what: string, byMatchup: GameResult[][]): string[] {
	const blank = (cells: number, first: string) => row([first, ...Array.from({ length: cells - 1 }, () => "")]);
	const out = [`\n### ${file}, ${what}\n`, row(HEADER), row(HEADER.map(() => "---"))];
	for (const results of byMatchup) {
		const ends = results.map((g) => g.end === "turnLimit" ? "limit" : `${g.end} t${g.turns}`);
		out.push(blank(HEADER.length, `**${results[0].match.sides.join(" vs ")}**`), ...summary(results).map(row),
			blank(HEADER.length, `ends: ${[...new Set(ends)].map((e) => `${ends.filter((x) => x === e).length}× ${e}`).join(", ")}; `
				+ `${Math.round(results.reduce((a, g) => a + g.ms, 0) / results.length)} ms a game`));
	}
	out.push(`\nPlanning time, ${file}: the ms each side's controller took a turn\n`, row(PLANNING_HEADER), row(PLANNING_HEADER.map(() => "---")));
	for (const results of byMatchup)
		out.push(blank(PLANNING_HEADER.length, `**${results[0].match.sides.join(" vs ")}**`), ...planning(results).map(row));
	return out;
}
