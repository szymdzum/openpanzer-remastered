//Two arena runs compared (#604): the games paired by scenario, matchup and seed, and each measure's paired
//difference, after less before, with its 95% interval. A difference whose interval contains 0 is noise.
import type { GameResult, Match, Player } from "./arena";
import { type Interval, isNoise, mean, pairedDifference, pairedRatioDifference, sum } from "./stats";
import { row } from "./table";

/** The same game in both runs. */
export interface Pair {
	before: GameResult;
	after: GameResult;
}

/** What makes a game the same game in two runs: its scenario, matchup, seed and last turn (the rules may differ). */
export const matchKey = (m: Match): string => `${m.file} ${m.sides.join("-")} seed ${m.seed}${m.turns ? " turns " + m.turns : ""}`;

/** Pairs the games of two runs; throws when the runs didn't play the same matches. */
export function pairGames(before: readonly GameResult[], after: readonly GameResult[]): Pair[] {
	const b = byKey(before, "before"), a = byKey(after, "after");
	const onlyBefore = [...b.keys()].filter((k) => !a.has(k)), onlyAfter = [...a.keys()].filter((k) => !b.has(k));
	if (onlyBefore.length || onlyAfter.length)
		throw new Error(`the runs played different matches: ${listed(onlyBefore)} only before, ${listed(onlyAfter)} only after`);
	return [...b].map(([k, g]) => ({ before: g, after: a.get(k) as GameResult }));
}

/** The games with the players renamed (`as`: a name to the one to show), to pair one player's games with another's. */
export function playedAs(games: readonly GameResult[], as: ReadonlyMap<string, Player>): GameResult[] {
	const named = (p: Player) => as.get(p) ?? p;
	return games.map((g) => ({ ...g, match: { ...g.match, sides: [named(g.match.sides[0]), named(g.match.sides[1])] },
		sides: [{ ...g.sides[0], player: named(g.sides[0].player) }, { ...g.sides[1], player: named(g.sides[1].player) }] }));
}

//A game's result but for the time it took, which is the machine's
const untimed = (g: GameResult) => JSON.stringify({ ...g, ms: 0, sides: g.sides.map((x) => ({ ...x, turnMs: x.turnMs.length })) });

/** The pairs whose games came out the same in both runs, the time aside. */
export const sameGames = (pairs: readonly Pair[]): number => pairs.filter((p) => untimed(p.before) === untimed(p.after)).length;

//A measure of a side in a game, null where the game doesn't say (no objective taken: no first turn)
interface Measure {
	name: string;
	of: (g: GameResult, s: number) => number | null;
	share?: true;	//a share of games: shown as k/n and the difference in points
}

const MEASURES: Measure[] = [
	{ name: "wins", of: (g, s) => g.winner === s ? 1 : 0, share: true },
	{ name: "took an objective", of: (g, s) => g.sides[s].firstObjectiveTurn === null ? 0 : 1, share: true },
	{ name: "first objective, turn", of: (g, s) => g.sides[s].firstObjectiveTurn },
	{ name: "objectives taken", of: (g, s) => g.sides[s].objectivesTaken },
	{ name: "held at the end", of: (g, s) => g.sides[s].objectivesHeld },
	{ name: "units lost", of: (g, s) => g.sides[s].unitsLost },
	{ name: "destroyed", of: (g, s) => g.sides[s].unitsDestroyed },
	{ name: "orders refused", of: (g, s) => g.sides[s].refused },
];

const HEADER = ["side (player)", "measure", "before", "after", "after - before (95%)", ""];

/** The comparison of two runs as markdown, a table per scenario and matchup; throws when they can't be paired. */
export function compare(before: readonly GameResult[], after: readonly GameResult[]): string[] {
	const groups = new Map<string, Pair[]>(), all = pairGames(before, after);
	for (const p of all) {
		const k = `${p.before.match.file}, ${p.before.match.sides.join(" vs ")}`;
		groups.set(k, [...groups.get(k) || [], p]);
	}
	const out = [`${groups.size} scenarios and matchups, ${before.length} games paired; rules before ${rulesOf(before)}, after ${rulesOf(after)}`];
	let real = 0;
	for (const [k, pairs] of groups) {
		out.push("", `### ${k}, ${pairs.length} seeds`, "", row(HEADER), row(HEADER.map(() => "---")));
		for (const s of [0, 1]) {
			const rows = sideRows(pairs, s);
			real += rows.filter((r) => r[5] === "**differs**").length;
			out.push(...rows.map(row));
		}
	}
	out.push("", `${sameGames(all)} of ${all.length} games the same in both runs but for the time`, `${real} differences beyond the noise`);
	return out;
}

//A measure's row: before, after, the paired difference and whether it is noise
function measureRow(pairs: readonly Pair[], m: Measure, s: number): string[] {
	const both = pairs.map((p) => [m.of(p.before, s), m.of(p.after, s)]).filter((x): x is number[] => x[0] !== null && x[1] !== null);
	const b = both.map((x) => x[0]), a = both.map((x) => x[1]);
	const shown = (xs: number[]) => m.share ? `${sum(xs)}/${xs.length}` : xs.length ? mean(xs).toFixed(2) : "-";
	return ["", m.name, shown(b), shown(a), ...judged(pairedDifference(b, a), m.share ? 100 : 1)];
}

function sideRows(pairs: readonly Pair[], s: number): string[][] {
	const rows = MEASURES.map((m) => measureRow(pairs, m, s));
	rows.push(lostPerObjective(pairs, s), planningTime(pairs, s));
	rows[0][0] = `${s === 0 ? "axis" : "allies"} (${pairs[0].before.sides[s].player})`;
	return rows;
}

function lostPerObjective(pairs: readonly Pair[], s: number): string[] {
	const of = (g: GameResult[]) => ({ num: g.map((x) => x.sides[s].unitsLost), den: g.map((x) => x.sides[s].objectivesTaken) });
	const b = of(pairs.map((p) => p.before)), a = of(pairs.map((p) => p.after));
	const ratio = (x: { num: number[]; den: number[] }) => sum(x.den) ? (sum(x.num) / sum(x.den)).toFixed(2) : "-";
	if (!sum(b.den) || !sum(a.den)) return ["", "lost per objective", ratio(b), ratio(a), "-", ""];
	return ["", "lost per objective", ratio(b), ratio(a), ...judged(pairedRatioDifference(b, a), 1)];
}

//The planning time: machine-dependent, so shown and never judged
function planningTime(pairs: readonly Pair[], s: number): string[] {
	const ms = (g: GameResult[]) => g.flatMap((x) => x.sides[s].turnMs || []);
	const b = ms(pairs.map((p) => p.before)), a = ms(pairs.map((p) => p.after));
	const shown = (xs: number[]) => xs.length ? mean(xs).toFixed(1) : "-";
	return ["", "ms a turn", shown(b), shown(a), b.length && a.length ? signed(mean(a) - mean(b), 1) : "-", "(time: not judged)"];
}

//The difference and its interval, scaled (100: points of a share), and the verdict
function judged(d: Interval, scale: number): string[] {
	if (!Number.isFinite(d.value)) return ["-", ""];
	const unit = scale === 100 ? " pts" : "", digits = scale === 100 ? 1 : 2;
	const bounds = Number.isFinite(d.lo) ? ` (${(d.lo * scale).toFixed(digits)} to ${(d.hi * scale).toFixed(digits)})` : " (too few)";
	return [signed(d.value * scale, digits) + unit + bounds, isNoise(d) ? "noise" : "**differs**"];
}

function signed(x: number, digits: number): string {
	return (x > 0 ? "+" : "") + x.toFixed(digits);
}

function byKey(games: readonly GameResult[], run: string): Map<string, GameResult> {
	const m = new Map<string, GameResult>();
	for (const g of games) {
		const k = matchKey(g.match);
		if (m.has(k)) throw new Error(`the ${run} run played ${k} twice`);
		m.set(k, g);
	}
	return m;
}

function listed(keys: string[]): string {
	return keys.length === 0 ? "none" : `${keys.length} (${keys.slice(0, 3).join(", ")}${keys.length > 3 ? ", ..." : ""})`;
}

function rulesOf(games: readonly GameResult[]): string {
	return [...new Set(games.map((g) => g.match.rules || "remaster"))].join(", ");
}
