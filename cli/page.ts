//The command-line player on the game's page (#279, "npm run play:live"): the dev server hands the page a
//call's words (vite.config.mts cliBridge) and the page plays it on the game host (src/host.ts) and the
//screen the page runs (src/screen.ts: the old UI, or the new one under ?ui=new, #378): the moves and attacks
//shown by the screen as a program's are, with their animations where it has them, the end of turn the
//host's, so the AI then plays its turn on the screen. A person watches the game the program plays
import type { Command } from "../src/commands";
import { check } from "../src/core/step";
import type { World } from "../src/core/types";
import { newGameRules, uiSettings } from "../src/prototypes";
import { game } from "../src/session";
import { answer, type Answer, type Args, flagInt, flagRules, type Front, pageResultOf, parseArgs, runOn, UsageError } from "./commands";
import { status } from "./board";
import { SIDES } from "./known";
import { CombatLog } from "../src/combatlog";
import { fightRecorder } from "./fightlog";
import { changes, fightLines } from "./report";

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

//Waits until ready says so (the animations done, the AI's turn played), at most limit ms
async function until(ready: () => boolean, limit: number) {
	for (const end = Date.now() + limit; Date.now() < end && !ready(); ) await sleep(100);
}

//The running game's world, as the screen reads it (the host's)
function world(): World {
	const w = game.host.world();
	if (w === null) throw new UsageError("no game on the page: start one with \"new\"");
	return w;
}
//The side the person plays (the AI the other, newGame), the Axis without one
const humanSide = () => game.host.personSides() === 1 ? 1 : 0;
//The person can play: their turn, nothing of the AI's still shown, no message to click away first
const humanTurn = () => game.host.personRefusal() === null;
//The screen has shown every step (no move or attack it still animates)
const settled = () => !game.host.showingStep();
let report: string[] = [];
const fights = fightRecorder(CombatLog);

//What the AI's turn did as the side saw it: its fights and the side's support fire, from the screen's
//combat log, then what changed between the worlds before and after (#307)
const turnReport = (before: World) => [...fightLines(world(), humanSide(), fights.take()), ...changes(before, world(), humanSide())];

//The unit selected and looked at on the screen, as a program's pick is shown (null: none)
const select = (unit: number | null) => game.host.screen.view({ type: "select", unit });

type Animated = Extract<Command, { type: "move" | "attack" }>;

//A move or an attack shown by the screen as a program's is (src/screen.ts move, attack): the unit selected
//first as a person selects it, the step played whole, then shown to its end (its shown). The move takes its
//path from the unit's move range, as the host gives a program's
async function animate(cmd: Animated) {
	const screen = game.host.screen, map = game.scenario.map, unit = map.getUnitById(cmd.unit);
	select(cmd.unit);
	await sleep(300);
	let shown = false;
	const done = () => { shown = true; };
	if (cmd.type === "move") {
		map.setMoveRange(unit);
		screen.move(unit, cmd.to, map.getCurrentMoveRange(), done);
	} else {
		screen.attack(unit, map.getUnitById(cmd.target), done);
	}
	await until(() => shown && settled(), 30_000);
}

//A command played on the screen: a move or an attack shown as above, anything else as the person's command
//through the host, its unit selected then
async function animated(cmd: Command) {
	if (cmd.type === "move" || cmd.type === "attack") return animate(cmd);
	game.host.command(cmd);
	if ("unit" in cmd) select(cmd.unit);
}

//The person's end of turn on the host, nothing selected, then the AI's turn on the screen until the person
//plays again
async function endTurn() {
	select(null);
	game.host.command({ type: "endTurn" });
	await sleep(500);
	await until(() => game.gameEnded || (humanTurn() && settled()), 30 * 60_000);
}

const front: Front = {
	world,
	get side() { return humanSide(); },
	humanTurn,
	act: async (cmd) => {
		const refusal = game.host.personRefusal() ?? check(world(), cmd);
		if (refusal === null) await animated(cmd);
		return { events: null, refusal };
	},
	end: async () => {
		const before = world();
		fights.take();
		await endTurn();
		report = turnReport(before);
		return null;
	},
	report: () => report,
	result: () => pageResultOf(world(), game.session ? game.session.ended : null, game.gameEnded, humanSide()),
};

//The scenario's opening message would cover the map: closed after "new", by its OK on whichever screen
//shows it (the old UI's; the new UI's, which shows its messages one after the other: the page's first
//scenario's briefing can still be open before it). Never on a later call: the message shown then may be the
//end of the game, whose OK opens the main menu (#311)
async function uncover() {
	const open = () => [...document.querySelectorAll<HTMLElement>("#uiokbut, .pm-message .ft button")].find((b) => b.offsetParent !== null);
	for (let n = 0, b = open(); n < 5 && b !== undefined; n++, b = open()) {
		b.click();
		await sleep(200); //(the next message drawn)
	}
}

//A new game of a scenario file as the scenario menu's play button starts it, the person on side, the AI
//the other (the page's dice: its own seed)
function hide(id: string) {
	const e = document.getElementById(id);
	if (e) e.style.display = "none";
}

const loaded = () => game.scenario.isLoaded && game.session !== null;

//A new game whose first player is the AI: its turn played on the screen, then told (#307)
async function firstAITurn(): Promise<string[]> {
	const before = world();
	fights.take();
	await until(() => game.gameEnded || (humanTurn() && settled()), 30 * 60_000);
	return turnReport(before);
}

async function newGame(args: Args): Promise<Answer> {
	const file = args.words[1], side = flagInt(args, "side", 0), entry = scenariolist.find((e) => e[0] === file);
	if (!entry) throw new UsageError(`no scenario ${file} in the scenario list`);
	uiSettings.isAI.forEach((_ai, p) => { uiSettings.isAI[p] = p === side ? 0 : 1; });
	game.campaign = null;
	game.rules = flagRules(args, newGameRules());
	game.newScenario(file, (entry as unknown as string[])[2]);
	["gameToolTip", "smScen", "startmenu"].forEach(hide);
	await until(loaded, 30_000);
	await sleep(500);
	await uncover();
	report = humanTurn() ? [] : await firstAITurn();
	return answer([`new game of ${file} on the page, you play ${SIDES[side]}, ${game.rules} rules`, ...report, ...status(world(), side)]);
}

const playing = () => game?.scenario?.isLoaded === true && game.session !== null;

async function handle(argv: string[]): Promise<Answer> {
	const args = parseArgs(argv);
	if (args.words[0] === "new") return newGame(args);
	if (!playing()) throw new UsageError("no game on the page: start one with \"new\"");
	return runOn(args, front);
}

const failure = (e: unknown) => ({ error: e instanceof Error ? e.message : JSON.stringify(e), usage: e instanceof UsageError });

import.meta.hot?.on("cli:request", (data: { id: number; argv: string[] }) => {
	handle(data.argv).then((a) => ({ answer: a }), failure)
		.then((reply) => import.meta.hot.send("cli:response", { id: data.id, ...reply }), () => {});
});
