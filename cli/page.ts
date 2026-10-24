//The command-line player on the game's page (#279, "npm run play:live"): the dev server hands the page a
//call's words (vite.config.mts cliBridge) and the page plays it as a person would, the moves and attacks
//through the screen's own actions with their animations, the end of turn through its button, so the AI
//then plays its turn on the screen. A person watches the game the program plays
import type { Command } from "../src/commands";
import { Commands } from "../src/commands";
import { check } from "../src/core/step";
import type { World } from "../src/core/types";
import { gameInputs, worldOf } from "../src/mirror";
import { newGameRules, playerType, uiSettings } from "../src/prototypes";
import { game } from "../src/session";
import { answer, type Answer, type Args, flagInt, flagRules, type Front, pageResultOf, parseArgs, runOn, UsageError } from "./commands";
import { status } from "./board";
import { SIDES } from "./known";
import { changes } from "./report";

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

//Waits until ready says so (the animations done, the AI's turn played), at most limit ms
async function until(ready: () => boolean, limit: number) {
	for (const end = Date.now() + limit; Date.now() < end && !ready(); ) await sleep(100);
}

const world = (): World => worldOf(game.scenario, game, gameInputs(game));
const humanSide = () => game.scenario.map.getPlayers().find((p) => p.type === playerType.humanLocal)?.side ?? 0;
const humanTurn = () => game.scenario.map.currentPlayer.type === playerType.humanLocal && !game.gameEnded;
const settled = () => !game.waitUIAnimation;
let report: string[] = [];

function show(id: number) {
	const u = game.scenario.map.getUnitById(id);
	if (!u) return;
	game.ui.uiSetUnitOnViewPort(u);
	game.ui.uiUnitSelect(u);
}

type Animated = Extract<Command, { type: "move" | "attack" }>;

//A move or an attack through the screen's actions, the unit selected first as a person selects it,
//then the animation played to its end
async function animate(cmd: Animated) {
	const map = game.scenario.map, unit = map.getUnitById(cmd.unit);
	show(cmd.unit);
	await sleep(300);
	game.waitUIAnimation = true;
	if (cmd.type === "move") game.ui.uiUnitMove(unit, cmd.to.row, cmd.to.col, map.getCurrentMoveRange());
	else game.ui.uiUnitAttack(unit, map.getUnitById(cmd.target));
	await until(settled, 30_000);
}

//A command played as the screen plays it: a move or an attack animated, anything else as its button
async function animated(cmd: Command) {
	if (cmd.type === "move" || cmd.type === "attack") return animate(cmd);
	Commands.execute(game.scenario, cmd);
	if ("unit" in cmd) show(cmd.unit);
}

//The end of turn as its button takes it (two clicks: the first asks for confirmation), then the AI's
//turn on the screen until the person plays again
async function endTurn() {
	const button = document.getElementById("endturn");
	button.click();
	await sleep(150);
	button.click();
	await sleep(500);
	await until(() => game.gameEnded || (humanTurn() && settled()), 30 * 60_000);
}

const front: Front = {
	world,
	get side() { return humanSide(); },
	humanTurn,
	act: async (cmd) => {
		const refusal = humanTurn() ? check(world(), cmd) : { reason: "not your turn" };
		if (refusal === null) await animated(cmd);
		return { events: null, refusal };
	},
	end: async () => {
		const before = world();
		await endTurn();
		report = changes(before, world(), humanSide());
		return null;
	},
	report: () => report,
	result: () => pageResultOf(world(), game.session ? game.session.ended : null, game.gameEnded, humanSide()),
};

//The scenario's opening message would cover the map: closed once, after "new". Never on a later call: the
//message shown then may be the end of the game, whose OK opens the main menu (#311)
function uncover() {
	for (const id of ["uiokbut"]) {
		const b = document.getElementById(id);
		if (b && b.offsetParent !== null) b.click();
	}
}

//A new game of a scenario file as the scenario menu's play button starts it, the person on side, the AI
//the other (the page's dice: its own seed)
function hide(id: string) {
	const e = document.getElementById(id);
	if (e) e.style.display = "none";
}

const loaded = () => game.scenario.isLoaded && game.session !== null;

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
	uncover();
	report = [];
	return answer([`new game of ${file} on the page, you play ${SIDES[side]}, ${game.rules} rules`, ...status(world(), side)]);
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
