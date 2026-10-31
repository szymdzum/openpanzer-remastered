//The arena's report (#604): a matchup's games summed up per side, each measure with its 95% interval,
//and the time its controller planned a turn.
import type { GameResult, SideResult } from "./arena";
import { type Interval, meanInterval, percentile, ratioInterval, sum, wilson } from "./stats";

export const HEADER = ["side (player)", "wins", "victory levels", "took an objective", "first objective, turn",
	"objectives taken", "held at the end", "units lost", "aircraft lost", "destroyed", "lost per objective", "orders refused"];

const MEANS = ["objectivesTaken", "objectivesHeld", "unitsLost", "aircraftLost", "unitsDestroyed"] as const;

/** A matchup's games summed up per side, a table row each (the cells of HEADER). */
export function summary(results: GameResult[]): string[][] {
	return [0, 1].map((s) => {
		const r = results.map((g) => g.sides[s]);
		const firsts = r.map((x) => x.firstObjectiveTurn).filter((t): t is number => t !== null);
		return [
			`${s === 0 ? "axis" : "allies"} (${r[0].player})`,
			share(results.filter((g) => g.winner === s).length, results.length),
			count(results.filter((g) => g.winner === s).map((g) => g.rating)),
			share(firsts.length, results.length),
			firsts.length ? plusMinus(meanInterval(firsts)) : "never",
			...MEANS.map((k) => plusMinus(meanInterval(r.map((x) => x[k])))),
			lostPerObjective(r),
			plusMinus(meanInterval(r.map((x) => x.refused))),
		];
	});
}

export const PLANNING_HEADER = ["side (player)", "turns", "ms a turn", "95th percentile", "worst"];

/** The time a side's controller took to play a turn, over every turn of the games (machine-dependent). */
export function planning(results: GameResult[]): string[][] {
	return [0, 1].map((s) => {
		const ms = results.flatMap((g) => g.sides[s].turnMs);
		return [`${s === 0 ? "axis" : "allies"} (${results[0].sides[s].player})`, String(ms.length),
			ms.length ? (sum(ms) / ms.length).toFixed(1) : "-", fixed(percentile(ms, 95)), fixed(Math.max(...ms))];
	});
}

/** A markdown table row. */
export const row = (cells: readonly string[]): string => "| " + cells.join(" | ") + " |";

/** `k/n (lo-hi%)`: a share of games and its Wilson interval. */
export function share(k: number, n: number): string {
	const w = wilson(k, n);
	return n === 0 ? "-" : `${k}/${n} (${Math.round(w.lo * 100)}-${Math.round(w.hi * 100)}%)`;
}

/** `m ±h`: an estimate and the half width of its interval, `m` alone when there are too few games for one. */
export function plusMinus(i: Interval, digits = 1): string {
	if (!Number.isFinite(i.value)) return "-";
	const half = (i.hi - i.lo) / 2;
	return Number.isFinite(half) ? `${i.value.toFixed(digits)} ±${half.toFixed(digits)}` : i.value.toFixed(digits);
}

function lostPerObjective(r: SideResult[]): string {
	return sum(r.map((x) => x.objectivesTaken)) === 0 ? "-"
		: plusMinus(ratioInterval(r.map((x) => x.unitsLost), r.map((x) => x.objectivesTaken)));
}

function fixed(x: number): string {
	return Number.isFinite(x) ? x.toFixed(1) : "-";
}

function count(xs: string[]): string {
	if (xs.length === 0) return "-";
	const n = new Map<string, number>();
	for (const x of xs) n.set(x, (n.get(x) || 0) + 1);
	return [...n].map(([k, v]) => `${v} ${k}`).join(", ");
}
