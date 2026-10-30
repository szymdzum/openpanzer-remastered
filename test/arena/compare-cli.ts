//npm run arena:compare -- before.json after.json: two runs' ARENA_OUT files compared (compare.ts), as markdown
import fs from "node:fs";
import type { GameResult } from "./arena";
import { compare } from "./compare";

const read = (file: string) => JSON.parse(fs.readFileSync(file, "utf8")) as GameResult[];
const [before, after] = process.argv.slice(2);
if (!before || !after) {
	process.stderr.write("usage: npm run arena:compare -- before.json after.json\n");
	process.exitCode = 2;
} else {
	try {
		process.stdout.write(compare(read(before), read(after)).join("\n") + "\n");
	} catch (e) {
		process.stderr.write(`arena:compare: ${(e as Error).message}\n`);
		process.exitCode = 1;
	}
}
