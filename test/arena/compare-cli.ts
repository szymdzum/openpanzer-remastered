//npm run arena:compare -- before.json after.json [--as remastered=ai]: two runs' ARENA_OUT files compared (compare.ts),
//as markdown; --as names a player of either run as another, to pair one player's games with another's (#610)
import fs from "node:fs";
import { type GameResult, isPlayer, type Player } from "./arena";
import { compare, playedAs } from "./compare";

const read = (file: string) => JSON.parse(fs.readFileSync(file, "utf8")) as GameResult[];

//A --as pair: a player's name and the one it is shown as
function renamed(text: string): [string, Player] {
	const [from, to] = text.split("=");
	if (!isPlayer(from) || !isPlayer(to)) throw new Error(`--as wants two players, as remastered=ai: got "${text}"`);
	return [from, to];
}

const renames = (args: string[]) => new Map(args.flatMap((a, i) => args[i - 1] === "--as" ? [renamed(a)] : []));

const argv = process.argv.slice(2), files = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--as");
const [before, after] = files;
if (!before || !after) {
	process.stderr.write("usage: npm run arena:compare -- before.json after.json [--as remastered=ai]\n");
	process.exitCode = 2;
} else {
	try {
		const as = renames(argv);
		process.stdout.write(compare(playedAs(read(before), as), playedAs(read(after), as)).join("\n") + "\n");
	} catch (e) {
		process.stderr.write(`arena:compare: ${(e as Error).message}\n`);
		process.exitCode = 1;
	}
}
