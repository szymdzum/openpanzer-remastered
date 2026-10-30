//The arena's statistics (#604): 95% intervals in closed form, so a run says the same in any process.
//Wilson's for a share of games, Student's t for a mean, the delta method for a ratio of sums.

/** An estimate and the bounds of its 95% interval; the bounds are NaN when there are too few games. */
export interface Interval {
	value: number;
	lo: number;
	hi: number;
	n: number;
}

const Z = 1.959963984540054;	//the normal distribution's 97.5th percentile

//Student's t, 97.5th percentile, for 1 to 30 degrees of freedom
const T_TABLE = [12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145,
	2.131, 2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042];

/** Student's t 97.5th percentile: the table up to 30 degrees of freedom, the Cornish-Fisher expansion above. */
export function tQuantile(df: number): number {
	if (df < 1) return NaN;
	if (df <= T_TABLE.length) return T_TABLE[df - 1];
	const z3 = Z ** 3, z5 = Z ** 5, z7 = Z ** 7;
	return Z + (z3 + Z) / (4 * df) + (5 * z5 + 16 * z3 + 3 * Z) / (96 * df ** 2)
		+ (3 * z7 + 19 * z5 + 17 * z3 - 15 * Z) / (384 * df ** 3);
}

/** The Wilson score interval of `k` successes in `n` games. */
export function wilson(k: number, n: number): Interval {
	if (n === 0) return { value: NaN, lo: NaN, hi: NaN, n };
	const p = k / n, z2 = Z * Z;
	const centre = (p + z2 / (2 * n)) / (1 + z2 / n);
	const half = Z / (1 + z2 / n) * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n));
	return { value: p, lo: Math.max(0, centre - half), hi: Math.min(1, centre + half), n };
}

/** The mean and its interval, mean ± t·s/√n. */
export function meanInterval(xs: readonly number[]): Interval {
	const n = xs.length, m = mean(xs);
	return around(m, Math.sqrt(sumOfSquares(xs.map((x) => x - m)) / (n - 1) / n), n);
}

/**
 * The ratio of sums Σnum / Σden and its interval by the delta method: the standard error is
 * √(Σ(numᵢ − R·denᵢ)² / (n(n−1))) / mean(den), and the half width t·SE.
 */
export function ratioInterval(num: readonly number[], den: readonly number[]): Interval {
	const n = num.length, r = sum(num) / sum(den);
	return around(r, standardError(linearised(num, den)), n);
}

/** The paired difference after − before of a mean, with its interval (mean ± t·s/√n of the differences). */
export function pairedDifference(before: readonly number[], after: readonly number[]): Interval {
	return meanInterval(after.map((a, i) => a - before[i]));
}

/**
 * The paired difference of two ratios of sums, after − before, with its delta-method interval: each game's
 * linearised terms (numᵢ − R·denᵢ) / mean(den), after less before, give the standard error.
 */
export function pairedRatioDifference(before: { num: number[]; den: number[] }, after: { num: number[]; den: number[] }): Interval {
	const b = linearised(before.num, before.den), a = linearised(after.num, after.den);
	const d = sum(after.num) / sum(after.den) - sum(before.num) / sum(before.den);
	return around(d, standardError(a.map((x, i) => x - b[i])), a.length);
}

/** Whether an interval says nothing: it contains 0, or there are too few games to say. */
export const isNoise = (i: Interval): boolean => !(i.lo > 0 || i.hi < 0);

/** The nearest-rank percentile `p` (0-100) of the values. */
export function percentile(xs: readonly number[], p: number): number {
	if (xs.length === 0) return NaN;
	const sorted = [...xs].sort((a, b) => a - b);
	return sorted[Math.max(0, Math.ceil(p / 100 * sorted.length) - 1)];
}

export const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);
export const mean = (xs: readonly number[]): number => sum(xs) / xs.length;

function around(value: number, se: number, n: number): Interval {
	const half = tQuantile(n - 1) * se;
	return { value, lo: value - half, hi: value + half, n };
}

//Each game's term of a ratio of sums, linearised: its deviation from the ratio over the mean denominator
function linearised(num: readonly number[], den: readonly number[]): number[] {
	const r = sum(num) / sum(den), d = mean(den);
	return num.map((x, i) => (x - r * den[i]) / d);
}

//The standard error of the mean of terms whose mean is 0 by construction
function standardError(terms: readonly number[]): number {
	const n = terms.length;
	return Math.sqrt(sumOfSquares(terms) / (n * (n - 1)));
}

function sumOfSquares(xs: readonly number[]): number {
	return xs.reduce((a, x) => a + x * x, 0);
}
