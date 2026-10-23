//The running game's turns on the core's session (src/coresession.ts, #137) against the old engine's: a
//game of AI players played through Game itself (processTurn, processAIActions, processAction and
//endTurn), its UI a stand-in that finishes the move and the attack at once as the UI's animations do
//at their end (the commands on the core, src/coreplay.ts, in both), once with the old AI and the old
//end of turn (a Game nobody inits) and once on the session (Game.init's drivers). Every action the
//handlers hand out is recorded as harness/replay.js records it (its getAction wrapped), with the state
//then, and every end of turn, then a game saved in the middle of an AI's turn and loaded, played on: the same actions, the same states, the same combat log, image cache and
//what the screen was asked to do
import { expect, test } from "vitest";
import { freshGame, mulberry32, startState, until } from "./lifecycle";
import { difference } from "./aigames";
import type { Game } from "../src/game";
import type { Unit } from "../src/unit";
import type { Cell } from "../src/prototypes";
import type { AIAction } from "../src/ai";

type Mode = "old" | "core";

//harness/replay.sh's items: a few in CI, all with CORE_ALL_ITEMS=1
const ITEMS = process.env.CORE_ALL_ITEMS
	? ["drpzop01.xml", "drstu02.xml", "dr9fr03.xml", "campaign:0", "campaign:10", "scripted:tutorial.xml",
		...scenariolist.filter((s) => s.length > 1).flatMap((s, i) => i % 40 === 20 ? [s[0]] : [])]
	: ["drpzop01.xml", "campaign:0", "scripted:tutorial.xml", scenariolist.filter((s) => s.length > 1)[60][0]];
const TURNS = 3;

function describe(a: AIAction | null) {
	if (!a) return null;
	return { type: a.type, param: (a.param || []).map((p) => {
		if (p && typeof p === "object" && typeof (p as Unit).unitData === "function") return "unit#" + (p as Unit).id;
		if (p && typeof p === "object" && "row" in p) return (p as Cell).row + "," + (p as Cell).col;
		return typeof p === "object" ? "obj" : p;
	}) };
}

//The game played: what each step recorded
async function play(item: string, mode: Mode): Promise<string[]> {
	const game = await freshGame();
	const { AI } = await import("../src/ai");
	const { AIScripted } = await import("../src/aiscripted");
	const { coreDriver } = await import("../src/coresession");
	const { CorePlay } = await import("../src/coreplay");
	const { UIBuilder } = await import("../src/uibuilder");
	const { Rng } = await import("../src/rng");
	const { toData } = await import("../src/state");
	const { CombatLog } = await import("../src/combatlog");
	const { playerType } = await import("../src/prototypes");
	const { GameState } = await import("../src/gamestate");
	const { buildOnCore } = await import("../src/coreload");
	const { ScenarioLoader } = await import("../src/scenarioloader");
	if (mode === "core") {
		AI.driver = AIScripted.driver = coreDriver;
		ScenarioLoader.build = buildOnCore;
	}
	AI.onUnitsDeployed = () => { game.ui.handleReinforcementDeployment(); }; //(Game.init)
	const seed = item.length * 7919;
	Rng.seed(seed);
	Math.random = mulberry32(seed);
	const screen: string[] = [];
	Object.assign(UIBuilder, { showAIStatus() {}, message() {}, messageDynamic() {}, showCampaignEnd() {},
		showPrototypeAwardMessage(eqid: number) { screen.push("prototype " + eqid); } });
	game.ui = stand(game, CorePlay, screen) as unknown as Game["ui"];
	await startState(game, item.startsWith("campaign:") ? item + ":0" : item, [1, 1, 1, 1]);
	const trace: string[] = [];
	const map = () => game.scenario.map;
	const state = () => JSON.stringify(toData(game.scenario, game).state) + JSON.stringify([map().currentUnit ? map().currentUnit.id : null,
		map().getCurrentMoveRange().length, CombatLog.log, map().getUnitImagesList(), game.spotSide, screen.splice(0)]);
	//harness/replay.js makeAllAI: every player the AI, its actions hashed where they are handed out
	const traced = new Set<unknown>();
	const makeAllAI = () => {
		for (const p of map().getPlayers()) {
			if (p.type !== playerType.aiLocal && p.type !== playerType.aiScripted) {
				p.type = playerType.aiLocal;
				p.handler = new AI(p, map());
			}
			//(a campaign carries the player's type: the AI the replay made it, with no handler in the next scenario)
			if (p.handler === null || traced.has(p.handler)) continue;
			const getAction = p.handler.getAction.bind(p.handler);
			p.handler.getAction = () => {
				const a = getAction();
				trace.push(`turn ${map().turn} player#${p.id} ${JSON.stringify(describe(a))}\n${state()}`);
				return a;
			};
			traced.add(p.handler);
		}
	};
	//The turn loop's ticks until the turn given (or a number of actions)
	const ticks = (last: number, actions = Infinity) => {
		const m = map(), start = trace.length;
		for (let tick = 0; tick < 5000 && m.turn < last && trace.length - start < actions && !game.gameEnded && game.scenario.map === m; tick++) {
			makeAllAI();
			const turn = m.turn, player = m.currentPlayer;
			game.waitUIAnimation = false;
			try {
				game.processTurn();
			} catch (e) {
				//(the old game's timer reports it and goes on: the tutorial's attack without its unit, #80)
				trace.push("threw " + (e as Error).message);
			}
			if (m.turn !== turn || m.currentPlayer !== player) trace.push(`end of turn ${turn}\n${state()}`);
		}
	};
	game.uiMessageClicked = true;
	ticks(map().turn + TURNS);
	//A few actions into the next turn, saved and loaded: the AI plans its turn again (#71), then plays on
	ticks(map().turn + 1, 5);
	if (game.gameEnded || game.scenario.map.getUnits().length === 0) return trace;
	game.state.save();
	const before = game.scenario;
	game.state = new GameState(game);
	game.state.restore(game.onScenarioLoadFinished.bind(game, null, true), () => { throw new Error("no save"); });
	await until(() => game.scenario !== before && game.scenario.isLoaded && game.gameStarted, item + " restored");
	traced.clear();
	trace.push("restored\n" + state());
	ticks(map().turn + 2);
	//A campaign's scenario won: the scenario left as the old game leaves it, then the next one, played on
	if (game.campaign !== null && !game.gameEnded) {
		game.continueCampaign("briliant");
		trace.push("won\n" + state());
		const won = game.scenario;
		game.uiMessageClicked = true;
		game.processTurn();
		await until(() => game.scenario !== won && game.scenario.isLoaded && game.gameStarted, item + " next scenario");
		traced.clear();
		trace.push("next scenario\n" + state());
		ticks(map().turn + 2);
	}
	return trace;
}

//The UI as Game calls it: the move and the attack finished at once (their animation's end), the rest
//recorded or nothing
function stand(game: Game, CorePlay: typeof import("../src/coreplay").CorePlay, screen: string[]) {
	const finishAttack = (fin: (h?: object) => unknown) => {
		fin({});
		game.waitUIAnimation = false;
	};
	const attackHooks = () => ({ animate: (_r: unknown, fin: (h?: object) => unknown) => finishAttack(fin) });
	return {
		uiUnitMove(unit: Unit, row: number, col: number) {
			const r = CorePlay.execute(game.scenario, { type: "move", unit: unit.id, to: { row, col } }, {
				animate: (_mr, finish) => {
					finish(false, { attackHooks });
					game.waitUIAnimation = false;
				},
			});
			return r.ok;
		},
		uiUnitAttack(a: Unit, d: Unit) {
			const r = CorePlay.execute(game.scenario, { type: "attack", unit: a.id, target: d.id }, attackHooks());
			return r.ok;
		},
		uiUnitSelect(u: Unit | null) {
			if (u === null) return false;
			game.scenario.map.delCurrentUnit();
			return game.scenario.map.selectUnit(u);
		},
		uiSetUnitOnViewPort() {},
		uiSetCellOnViewPort() {},
		showGameToolTip(text: string) { screen.push("tooltip " + text.length); },
		showAlert(row: number, col: number, text: string, own: boolean) { screen.push(`alert ${row},${col} ${text} ${own}`); },
		handleReinforcementDeployment() { screen.push("deployed"); },
		mainMenuButton(id: string) { screen.push("menu " + id); },
		uiEndTurnInfo() {},
		setNewScenario() {},
	};
}

test.each(ITEMS)("Game plays %s on the core's session as on the old engine, action by action", async (item) => {
	const old = await play(item, "old"), core = await play(item, "core");
	expect(old.length).toBeGreaterThan(10);
	if (process.env.FC_STATS) console.log(item, old.length, old.filter((t) => t.startsWith("end of turn")).length, old.some((t) => t.startsWith("restored")));
	for (let i = 0; i < Math.max(old.length, core.length); i++)
		if (old[i] !== core[i]) throw new Error(`${item}, step ${i}: ${(old[i] || "").split("\n")[0]}${difference(old[i] || "", core[i] || "")}`);
}, 120_000);

test("On the core the handlers plan nothing themselves: they hand out the session's orders", async () => {
	const game = await freshGame();
	const { AI } = await import("../src/ai");
	const { AIScripted } = await import("../src/aiscripted");
	const { coreDriver } = await import("../src/coresession");
	AI.driver = AIScripted.driver = coreDriver;
	await startState(game, "scripted:tutorial.xml", [2, 2, 2, 2]);
	const p = game.scenario.map.getPlayers()[0];
	const ai = new AI(p, game.scenario.map), scripted = new AIScripted(p, game.scenario.map);
	ai.buildActions();
	ai.startTurn();
	ai.planTurn();
	scripted.buildActions();
	expect(ai.getEvaluator()).toBeNull();
	const { actionType } = await import("../src/prototypes");
	//(the tutorial's first message of turn 1, then its second: both handlers ask the same session)
	expect([scripted.getAction().type, ai.getAction().type]).toEqual([actionType.message, actionType.message]);
});
