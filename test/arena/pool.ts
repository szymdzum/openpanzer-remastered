//The arena's games played on a few processes at once (#604), each a worker.ts run by node: a game depends only on
//its match, so the results are the same whichever process plays it and in whatever order.
import { spawn } from "node:child_process";
import path from "node:path";
import readline from "node:readline";
import type { GameResult, Match } from "./arena";

const ROOT = path.resolve(__dirname, "../..");	//(run under Vitest, which gives __dirname)

/** Plays the matches on `jobs` worker processes; the results in the matches' order. */
export async function playMatches(matches: readonly Match[], jobs: number, progress?: (done: number) => void): Promise<GameResult[]> {
	const results: GameResult[] = [];
	const queue = { next: 0, done: 0 };
	const take = (): number | null => queue.next < matches.length ? queue.next++ : null;
	const got = (i: number, r: GameResult) => {
		results[i] = r;
		if (progress) progress(++queue.done);
	};
	await Promise.all(Array.from({ length: Math.max(1, Math.min(jobs, matches.length)) }, () => worker(matches, take, got)));
	return results;
}

//One process: a match sent, its result read, the next sent, until none is left
function worker(matches: readonly Match[], take: () => number | null, got: (i: number, r: GameResult) => void): Promise<void> {
	const child = spawn(process.execPath, ["--import", path.join(ROOT, "cli/register.mjs"), path.join(ROOT, "test/arena/worker.ts")],
		{ cwd: ROOT, env: { ...process.env, TZ: "Europe/Warsaw" }, stdio: ["pipe", "pipe", "inherit"] });
	const send = () => {
		const i = take();
		if (i === null) child.stdin.end();
		else child.stdin.write(JSON.stringify({ i, match: matches[i] }) + "\n");
	};
	readline.createInterface({ input: child.stdout }).on("line", (line) => {
		const { i, result } = JSON.parse(line) as { i: number; result: GameResult };
		got(i, result);
		send();
	});
	send();
	return new Promise((resolve, reject) => {
		child.on("error", reject);
		child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`an arena worker exited with ${code}`)));
	});
}
