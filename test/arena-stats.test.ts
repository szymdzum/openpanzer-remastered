//The arena's statistics and its comparison of two runs (#604, test/arena/): the intervals on known values,
//and the pairing of the games, on made-up results (no game played).
import { describe, expect, test } from "vitest";
import type { GameResult, SideResult } from "./arena/arena";
import { compare, pairGames } from "./arena/compare";
import { isNoise, meanInterval, pairedDifference, pairedRatioDifference, percentile, ratioInterval, tQuantile, wilson } from "./arena/stats";
import { plusMinus, share } from "./arena/table";

describe("The arena's 95% intervals (#604)", () => {
	test("Wilson's interval of 0, 5 and 10 wins in 10 games", () => {
		const none = wilson(0, 10), half = wilson(5, 10), all = wilson(10, 10);
		expect([none.lo, none.hi]).toEqual([0, expect.closeTo(0.2775, 4)]);
		expect([half.lo, half.hi]).toEqual([expect.closeTo(0.2366, 4), expect.closeTo(0.7634, 4)]);
		expect([all.lo, all.hi]).toEqual([expect.closeTo(0.7225, 4), expect.closeTo(1, 9)]);
		expect(share(5, 10)).toBe("5/10 (24-76%)");
	});

	test("Student's t: the table's values, and the expansion close to them beyond it", () => {
		expect(tQuantile(1)).toBe(12.706);
		expect(tQuantile(9)).toBe(2.262);
		expect(tQuantile(39)).toBeCloseTo(2.0227, 3);
		expect(tQuantile(120)).toBeCloseTo(1.9799, 3);
		expect(tQuantile(31)).toBeLessThan(tQuantile(30));
	});

	test("A mean's interval is mean ± t·s/√n", () => {
		const i = meanInterval([1, 2, 3, 4, 5]);
		expect(i.value).toBe(3);
		expect(i.hi - 3).toBeCloseTo(2.776 * Math.sqrt(2.5 / 5), 6);
		expect(plusMinus(i)).toBe("3.0 ±2.0");
		expect(plusMinus(meanInterval([7]))).toBe("7.0");
	});

	test("A ratio of sums: exact when every game has the same ratio, the mean's interval when the denominators are all 1", () => {
		const exact = ratioInterval([2, 4, 6], [1, 2, 3]);
		expect([exact.value, exact.lo, exact.hi]).toEqual([2, 2, 2]);
		const ones = ratioInterval([1, 3, 2, 6], [1, 1, 1, 1]), m = meanInterval([1, 3, 2, 6]);
		expect([ones.value, ones.lo, ones.hi]).toEqual([m.value, expect.closeTo(m.lo, 9), expect.closeTo(m.hi, 9)]);
	});

	test("The paired difference is noise when the runs are the same, real when every game moved the same way", () => {
		const before = [3, 5, 4, 6, 2, 5];
		const same = pairedDifference(before, before);
		expect([same.value, same.lo, same.hi, isNoise(same)]).toEqual([0, 0, 0, true]);
		const moved = pairedDifference(before, before.map((x, i) => x + 2 + (i % 2)));
		expect(moved.value).toBe(2.5);
		expect(isNoise(moved)).toBe(false);
		const mixed = pairedDifference(before, before.map((x, i) => x + (i % 2 ? 1 : -1)));
		expect(isNoise(mixed)).toBe(true);
	});

	test("The paired difference of two ratios of sums", () => {
		const before = { num: [4, 6, 5, 7], den: [2, 2, 2, 2] }, after = { num: [2, 3, 3, 4], den: [2, 2, 2, 2] };
		const d = pairedRatioDifference(before, after);
		expect(d.value).toBeCloseTo(12 / 8 - 22 / 8, 9);
		expect(isNoise(d)).toBe(false);
		expect(isNoise(pairedRatioDifference(before, before))).toBe(true);
	});

	test("The nearest-rank percentile", () => {
		const xs = Array.from({ length: 20 }, (_, i) => 20 - i);
		expect(percentile(xs, 95)).toBe(19);
		expect(percentile(xs, 100)).toBe(20);
		expect(percentile([4], 95)).toBe(4);
	});
});

const side = (player: "ai" | "general", unitsLost: number): SideResult => ({ player, firstObjectiveTurn: 5, objectivesTaken: 1,
	objectivesHeld: 2, unitsLost, unitsDestroyed: 3, refused: 0, turnMs: [10, 20] });

function game(seed: number, lost: number, file = "drpzop01.xml"): GameResult {
	return { match: { file, sides: ["ai", "general"], seed, rules: "remaster" }, turns: 17, end: "turnLimit", winner: seed % 2,
		rating: "", sides: [side("ai", lost), side("general", 4)], orders: 100, ms: 1000 };
}

describe("Two arena runs compared (#604)", () => {
	const run = Array.from({ length: 10 }, (_, i) => game(i + 1, 5 + (i % 3)));

	test("A run compared with itself differs in nothing", () => {
		const out = compare(run, run);
		expect(out[out.length - 1]).toBe("0 differences beyond the noise");
		expect(out.join("\n")).toContain("|  | units lost | 5.90 | 5.90 | 0.00 (0.00 to 0.00) | noise |");
	});

	test("A loss every game more is a difference beyond the noise", () => {
		const out = compare(run, run.map((g) => game(g.match.seed, g.sides[0].unitsLost + 1)));
		expect(out.join("\n")).toContain("|  | units lost | 5.90 | 6.90 | +1.00 (1.00 to 1.00) | **differs** |");
	});

	test("The games are paired by scenario, matchup and seed, in any order", () => {
		const pairs = pairGames(run, [...run].reverse());
		expect(pairs.every((p) => p.before === p.after)).toBe(true);
	});

	test("Runs of different matches are refused", () => {
		expect(() => pairGames(run, run.map((g) => game(g.match.seed + 1, 5)))).toThrow(/different matches: 1 \(.*seed 1\) only before/);
		expect(() => pairGames(run, run.map((g) => game(g.match.seed, 5, "fw82.xml")))).toThrow(/different matches/);
		expect(() => pairGames(run.slice(1), run)).toThrow(/none only before, 1 \(.*seed 1\) only after/);
		expect(() => pairGames([...run, run[0]], run)).toThrow(/the before run played .* twice/);
	});
});
