//The running game's turns on the core's session (src/coresession.ts, #137): a game of AI players played
//through Game itself (processTurn, processAIActions, processAction and endTurn), its UI a stand-in
//that finishes the move and the attack at once as the UI's animations do at their end. Every action
//the handlers hand out is recorded as harness/replay.js records it (its getAction wrapped), with the
//state then, and every end of turn, then a game saved in the middle of an AI's turn and loaded, played
//on, and a campaign's next scenario: the actions, the states, the combat log, the image cache and what
//the screen was asked to do. Until the old engine went (#137) the same game played on it gave the same
//record step by step; the record's hashes then (test/gameturn.json.gz) pin it since
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { createHash } from "node:crypto";
import { expect, test } from "vitest";
import { freshGame, mulberry32, startState, until } from "./lifecycle";
import type { Game } from "../src/game";
import type { Unit } from "../src/unit";
import type { Cell } from "../src/prototypes";
import type { AIAction } from "../src/ai";

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
async function play(item: string): Promise<string[]> {
	const game = await freshGame();
	const { AI } = await import("../src/ai");
	const { Commands } = await import("../src/commands");
	const { UIBuilder } = await import("../src/uibuilder");
	const { Rng } = await import("../src/rng");
	const { toData } = await import("../src/state");
	const { CombatLog } = await import("../src/combatlog");
	const { playerType } = await import("../src/prototypes");
	const { GameState } = await import("../src/gamestate");
	const { touched } = await import("../src/context");
	const seed = item.length * 7919;
	Rng.seed(seed);
	Math.random = mulberry32(seed);
	const screen: string[] = [];
	Object.assign(UIBuilder, { showAIStatus() {}, message() {}, messageDynamic() {}, showCampaignEnd() {},
		showPrototypeAwardMessage(eqid: number) { screen.push("prototype " + eqid); } });
	game.ui = stand(game, Commands, screen) as unknown as Game["ui"];
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
				touched(); //(the harness runs without the world kept, src/main.ts)
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
function stand(game: Game, Commands: typeof import("../src/commands").Commands, screen: string[]) {
	const finishAttack = (fin: (h?: object) => unknown) => {
		fin({});
		game.waitUIAnimation = false;
	};
	const attackHooks = () => ({ animate: (_r: unknown, fin: (h?: object) => unknown) => finishAttack(fin) });
	return {
		uiUnitMove(unit: Unit, row: number, col: number) {
			const r = Commands.execute(game.scenario, { type: "move", unit: unit.id, to: { row, col } }, {
				animate: (_mr, finish) => {
					finish({ attackHooks });
					game.waitUIAnimation = false;
				},
			});
			return r.ok;
		},
		uiUnitAttack(a: Unit, d: Unit) {
			const r = Commands.execute(game.scenario, { type: "attack", unit: a.id, target: d.id }, attackHooks());
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

//The record's steps as hashes, with the first line of each; a run of the same step is one (a campaign's
//next scenario has no handler for the player the replay made the AI: the turn loop throws at every tick)
function hashes(trace: string[]): { hash: string; line: string }[] {
	const out: { hash: string; line: string }[] = [];
	let n = 0;
	for (const t of trace) {
		const hash = createHash("sha1").update(t).digest("hex").slice(0, 12);
		if (out.length && out[out.length - 1].hash === hash) { n++; continue; }
		if (n > 1) out.push({ hash: "×" + n, line: "" });
		out.push({ hash, line: t.split("\n")[0] });
		n = 1;
	}
	if (n > 1) out.push({ hash: "×" + n, line: "" });
	return out;
}

//The hashes recorded (UPDATE_CONTRACTS=1 writes them again, in a commit that names the issue it fixes,
//as the contracts')
const pinned = path.join(__dirname, "gameturn.json.gz");
const recorded = () => JSON.parse(zlib.gunzipSync(fs.readFileSync(pinned)).toString("utf8")) as Record<string, string[]>;

test.each(ITEMS)("Game plays %s on the core's session as it did beside the old engine, action by action", async (item) => {
	const trace = await play(item), got = hashes(trace);
	expect(trace.length).toBeGreaterThan(10);
	if (process.env.UPDATE_CONTRACTS) {
		fs.writeFileSync(pinned, zlib.gzipSync(JSON.stringify({ ...recorded(), [item]: got.map((g) => g.hash) }), { level: 9 }));
		return;
	}
	const want = recorded()[item];
	expect(want, item + " recorded").toBeDefined();
	const i = want.findIndex((h, k) => !got[k] || got[k].hash !== h);
	expect(i === -1 && got.length === want.length ? "" : `${item}, step ${i}: ${got[i] ? got[i].line : "none"}`).toBe("");
}, 120_000);

test("The handlers plan nothing themselves: they hand out the session's orders", async () => {
	const game = await freshGame();
	const { AI } = await import("../src/ai");
	const { AIScripted } = await import("../src/aiscripted");
	await startState(game, "scripted:tutorial.xml", [2, 2, 2, 2]);
	const p = game.scenario.map.getPlayers()[0];
	const ai = new AI(p, game.scenario.map), scripted = new AIScripted(p, game.scenario.map);
	ai.buildActions();
	scripted.buildActions();
	const { actionType } = await import("../src/prototypes");
	//(the tutorial's first message of turn 1, then its second: both handlers ask the same session)
	expect([scripted.getAction().type, ai.getAction().type]).toEqual([actionType.message, actionType.message]);
});

//What the screen doesn't animate, a resupply, a reinforcement, a mount, plays on in the same tick: the
//turn loop waits only for what the player watches (#8, an AI turn took a minute at an action a second)
test("The AI plays its resupplies, reinforcements and mounts within one tick of the turn loop (#8)", async () => {
	const game = await freshGame();
	const { Commands } = await import("../src/commands");
	const { UIBuilder } = await import("../src/uibuilder");
	const { actionType } = await import("../src/prototypes");
	Object.assign(UIBuilder, { showAIStatus() {}, message() {}, messageDynamic() {} });
	game.ui = stand(game, Commands, []) as unknown as Game["ui"];
	await startState(game, "drpzop01.xml", [1, 1, 1, 1]);
	const map = game.scenario.map, unit = map.getUnits().find((u) => u.player === map.currentPlayer) as Unit;
	const orders: AIAction[] = [actionType.resupply, actionType.reinforce, actionType.mount, actionType.umount,
		actionType.select, actionType.resupply].map((type) => ({ type, param: [unit] }));
	const handed: number[] = [];
	map.currentPlayer.handler.getAction = () => {
		const a = orders.shift() as AIAction;
		handed.push(a.type);
		return a;
	};
	game.uiMessageClicked = true;
	game.waitUIAnimation = false;
	game.processTurn();
	expect(handed).toEqual([actionType.resupply, actionType.reinforce, actionType.mount, actionType.umount, actionType.select]);
});
