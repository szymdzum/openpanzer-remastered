//A process of the arena's pool (pool.ts): reads a match a line on stdin, plays it, writes its result a line on
//stdout, until stdin closes. Run by node with the command-line player's hooks (cli/register.mjs).
import readline from "node:readline";
import { type Match, playMatch } from "./arena";

for await (const line of readline.createInterface({ input: process.stdin })) {
	const { i, match } = JSON.parse(line) as { i: number; match: Match };
	process.stdout.write(JSON.stringify({ i, result: playMatch(match) }) + "\n");
}
