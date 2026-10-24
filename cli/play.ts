//The command-line player (#279): a scenario played on the core from the terminal, the person's side
//against the AI, headless from a save file, or with --live on the game's page with its animations.
//npm run -s play -- help
import path from "node:path";
import { type Answer, answer, type Args, flagInt, HELP, parseArgs, runOn, UsageError } from "./commands";
import { scenarioList } from "./files";
import { fileFront, isHumanTurn, newSave, open, playAI, readSave, startFirstTurn, world, writeSave } from "./game";
import { SIDES } from "./known";
import { describe } from "./report";
import { status } from "./board";

async function newGameAnswer(args: Args, file: string): Promise<Answer> {
	const side = flagInt(args, "side", 0), seed = flagInt(args, "seed", Date.now() % 100000);
	const g = open(await newSave(args.words[1], [side], seed), true), before = world(g);
	//(a new game whose first player is the AI: it plays its first turn, its purchases included)
	g.save.report = isHumanTurn(g) ? [] : [...startFirstTurn(g.session), ...playAI(g)];
	writeSave(file, g);
	return answer([`new game of ${args.words[1]}, you play ${SIDES[side]}, seed ${seed}, saved in ${file}`,
		...describe(world(g), before, side, g.save.report), ...status(world(g), side)], { file, side, seed });
}

function scenariosAnswer(): Answer {
	const list = scenarioList().filter((e) => e.length > 1);
	return answer(list.map((e) => `${e[0]}  ${e[1]}`), list.map((e) => ({ file: e[0], name: e[1] })));
}

//The commands that need no game, or make one
const NO_GAME: { [verb: string]: (args: Args, file: string) => Answer | Promise<Answer> } = {
	help: () => answer([HELP], null),
	scenarios: scenariosAnswer,
	new: newGameAnswer,
};

//A call played headless: the game loaded from file and saved back when it played
export function run(args: Args, file: string): Promise<Answer> {
	const verb = args.words[0] ?? "help";
	if (NO_GAME[verb]) return Promise.resolve(NO_GAME[verb](args, file));
	return runOn(args, fileFront(open(readSave(file)), file));
}

//A call played on the game's page: the dev server started with "npm run play:live" hands it to the page
//(cli/page.ts) and its answer back
async function runLive(argv: string[], url: string): Promise<Answer> {
	const r = await fetch(url.replace(/\/$/, "") + "/__cli", { method: "POST", body: JSON.stringify(argv) });
	const reply = await r.json() as { answer?: Answer; error?: string; usage?: boolean };
	if (reply.error !== undefined) throw reply.usage ? new UsageError(reply.error) : new Error(reply.error);
	return reply.answer;
}

const liveUrl = (args: Args) => args.flags.has("live") ? process.env.OPENPANZER_LIVE || "http://127.0.0.1:8644" : process.env.OPENPANZER_LIVE;
const local = (verb: string | undefined) => verb === undefined || verb === "help" || verb === "scenarios";
const errorText = (e: unknown) => e instanceof Error ? e.message : JSON.stringify(e);
const output = (args: Args, a: Answer) => args.flags.has("json") ? JSON.stringify(a.data, null, 1) : a.lines.join("\n");
const saveFile = (args: Args) => path.resolve((args.flags.get("game") as string) || process.env.OPENPANZER_PLAY || ".play/game.json");
const exitCode = (e: unknown) => e instanceof UsageError ? 2 : 1;

function call(argv: string[], args: Args): Promise<Answer> {
	const url = liveUrl(args);
	return url && !local(args.words[0]) ? runLive(argv, url) : run(args, saveFile(args));
}

async function main() {
	const argv = process.argv.slice(2), args = parseArgs(argv);
	try {
		process.stdout.write(output(args, await call(argv, args)) + "\n");
	} catch (e) {
		process.stderr.write(errorText(e) + "\n");
		process.exitCode = exitCode(e);
	}
}

//(run as the program, not when a test imports it)
if (path.resolve(process.argv[1] ?? "") === path.resolve(new URL(import.meta.url).pathname)) await main();
