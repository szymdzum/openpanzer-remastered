//The old game played headless the way Game plays it (game.ts processTurn, processAIActions,
//processAction and endTurn; ui.ts uiUnitMove, uiUnitAttack and the animations' ends, finished at once),
//one advance at a time like the core's session (src/core/session.ts), for the differential tests of
//the AI and the tutorial as controllers (test/core-ai.test.ts)
import { freshGame, mulberry32, startState } from "./lifecycle";
import { readFixture, restoreState } from "./contracts";
import { resync } from "./invariants";
import type { AIAction } from "../src/ai";
import type { Unit } from "../src/unit";
import type { Command } from "../src/commands";
import type { Order, ViewEvent } from "../src/core/controller";
import type { SessionEnd } from "../src/core/session";

//The game's modules (fresh for every game: the equipment lists are module state, #22)
async function modules() {
	const { game } = await import("../src/game");
	const { AI } = await import("../src/ai");
	const { AIScripted } = await import("../src/aiscripted");
	const { Commands } = await import("../src/commands");
	const { Actions } = await import("../src/actions");
	const { UIBuilder } = await import("../src/uibuilder");
	const { GameRules } = await import("../src/gamerules");
	const { GameMap } = await import("../src/map");
	const { Equipment } = await import("../src/equipment");
	const { Rng } = await import("../src/rng");
	const { toData } = await import("../src/state");
	const prototypes = await import("../src/prototypes");
	return { game, AI, AIScripted, Commands, Actions, UIBuilder, GameRules, GameMap, Equipment, Rng, toData, ...prototypes };
}
type Modules = Awaited<ReturnType<typeof modules>>;

export interface OldGame extends Modules {
	m: Modules["game"]["scenario"]["map"];
	localSide: number;
	ended: SessionEnd | null;
	view: ViewEvent[]; //what the game asked of the screen since the last advance
}

//What one advance did on the old game: the action played, as the core's order, or the end of turn with
//what the next player's turn start did (the commands its calls amount to) and the state then
export type OldAdvance =
	| { kind: "order"; order: Order; refusal: string | null }
	| { kind: "endTurn"; started: Command[]; startedState: string | null; view: ViewEvent[] }
	| { kind: "ended" };

//Game's getLocalSide: the sides of the human and the scripted players, 2 when both
function localSideOf(o: Modules): number {
	let sides = 1, side = -1;
	for (const p of o.game.scenario.map.getPlayers())
		if (p.type === o.playerType.humanLocal || p.type === o.playerType.aiScripted) {
			if (side !== -1 && side !== p.side) sides++;
			side = p.side;
		}
	return sides > 1 ? 2 : side;
}

//A replay item (harness/replay.sh) started as the replay starts it: the streams seeded, every player
//the AI ("scripted:<file>": the scenario's scripted players), the local side as Game counted it at
//the load, before the human players became the AI (harness/replay.js makeAllAI)
export async function startItem(item: string, seed: number): Promise<OldGame> {
	const game = await freshGame();
	const o = await modules();
	o.Rng.seed(seed);
	await startState(game, item.startsWith("campaign:") ? item + ":0" : item, [1, 1, 1, 1]);
	Math.random = mulberry32(seed);
	return setUp(o, localSideOf(o), false);
}

//Where the tutorial's turns 1 and 2 meant its units to be when turn 3 starts, and turn 3 when turn 4
//starts, by unit id: a new game never gets there (the turn-2 freeze, #80). The allied infantry in the
//city is gone by then
const TUTORIAL_PLACES: Record<number, [number, number, number][]> = {
	3: [[3, 15, 10], [2, 7, 15], [6, 8, 14], [5, 9, 14], [0, 7, 9], [1, 7, 13], [7, 8, 15]],
	4: [[3, 15, 10], [2, 14, 11], [6, 14, 9], [5, 14, 8], [0, 11, 9], [1, 13, 13], [7, 12, 12]],
};
const TUTORIAL_CITY_DEFENDER = 4;

//The tutorial started as from turn turn, as a game loaded on that turn, its units where its script
//meant them to be (turns 3 and 4): its scripted players are made again (makeScriptedPlayers), which
//queues that turn's actions
export async function startTutorialAt(turn: number, seed: number): Promise<OldGame> {
	const g = await startItem("scripted:tutorial.xml", seed);
	g.m.turn = turn;
	const places = TUTORIAL_PLACES[turn];
	if (places === undefined) return g;
	g.m.getUnitById(TUTORIAL_CITY_DEFENDER).destroyed = true;
	g.m.updateUnitList();
	for (const [id, row, col] of places) {
		const u = g.m.getUnitById(id), p = u.getPos();
		g.m.map[p.row][p.col].delUnit(u);
		g.m.map[row][col].setUnit(u);
	}
	resync(g);
	return g;
}

//Game.setupPlayers on a load: a scripted player gets its handler, made after its constructor ran (a
//constructor that handed the player over past turn 4 is overridden). What they asked of the screen
export function makeScriptedPlayers(g: OldGame): ViewEvent[] {
	for (const p of g.m.getPlayers())
		if (p.type === g.playerType.aiScripted) p.handler = new g.AIScripted(p, g.m);
	return g.view.splice(0);
}

//An engine fixture restored as a save is loaded: every player the AI but the scripted ones (the
//tutorial's, which queue their turn when they are made), the screen showing the local side. The AI whose
//turn it is plans it again (planLoadedTurn, #71)
export async function startFixture(name: string, seed: number): Promise<OldGame> {
	await restoreState(readFixture("engine", name).state);
	const o = await modules();
	Math.random = mulberry32(seed);
	o.Rng.seed(seed);
	const m = o.game.scenario.map;
	for (const p of m.getPlayers()) if (p.type !== o.playerType.aiScripted) p.type = o.playerType.aiLocal;
	const g = setUp(o, localSideOf(o), true);
	for (const p of m.getPlayers()) if (p.type === o.playerType.aiScripted) p.handler = new o.AIScripted(p, m);
	return g;
}

//Game's startLoadedTurn: the AI whose turn it is plans it
export function planLoadedTurn(g: OldGame) {
	if (g.m.currentPlayer.type === g.playerType.aiLocal) (g.m.currentPlayer.handler as InstanceType<OldGame["AI"]>).planTurn();
}

//The players the AI plays get its handler (the scripted ones keep theirs), the screen shows the local
//side, the game's UI is a stand-in that records what it is asked to show
function setUp(o: Modules, localSide: number, loaded: boolean): OldGame {
	const m = o.game.scenario.map;
	const g: OldGame = { ...o, m, localSide, ended: null, view: [] };
	for (const p of m.getPlayers())
		if (p.type !== o.playerType.aiScripted && (loaded || p.type !== o.playerType.aiLocal)) {
			p.type = o.playerType.aiLocal;
			p.handler = new o.AI(p, m);
		}
	o.game.ui = { showAlert() {}, handleReinforcementDeployment() {}, mainMenuButton() { g.view.push({ type: "mainMenu" }); },
		setNewScenario() {} } as unknown as typeof o.game.ui;
	o.game.spotSide = shownSide(g);
	return g;
}

//Game.setCurrentSide
function shownSide(g: OldGame): number {
	return g.localSide === 2 ? g.m.currentPlayer.side : g.localSide;
}

const isProgram = (g: OldGame, type: number) => type === g.playerType.aiLocal || type === g.playerType.aiScripted;

//The game's state as JSON (the core's is compared with it)
export function oldState(g: OldGame): string {
	return JSON.stringify(g.toData(g.game.scenario, g.game).state);
}

//An action as the core's order (Game.processAction): a unit that isn't there is id -1, which the
//command refuses; the tutorial's attack with no unit is where the game got stuck (#80)
export function orderOf(g: Pick<OldGame, "actionType" | "UIBuilder">, a: AIAction): Order | null {
	if (!a || !a.param) return null;
	const p = a.param, A = g.actionType, id = (u: Unit | null) => u ? u.id : -1;
	switch (a.type) {
		case A.move: return { command: { type: "move", unit: id(p[0]), to: { row: p[1].row, col: p[1].col } } };
		case A.attack:
			if (!p[0] || !p[1]) return { view: { type: "stuck", reason: "an attack without its unit (#80)", unit: p[0] ? p[0].id : null,
				target: p[1] ? p[1].id : null } };
			return { command: { type: "attack", unit: p[0].id, target: p[1].id } };
		case A.resupply: return { command: { type: "resupply", unit: id(p[0]) } };
		case A.reinforce: return { command: { type: "reinforce", unit: id(p[0]) } };
		case A.mount: return { command: { type: "mount", unit: id(p[0]) } };
		case A.umount: return { command: { type: "unmount", unit: id(p[0]) } };
		case A.select: return { view: { type: "select", unit: p[0] ? p[0].id : null } };
		case A.message: return { view: { type: "message", text: (p[0] as string).split(g.UIBuilder.currencyIcon).join("{prestige}"),
			at: { row: p[1].row, col: p[1].col } } };
		case A.viewport: return { view: { type: "viewport", at: { row: p[0].row, col: p[0].col } } };
		default: return null;
	}
}

//Plays the current player's next action as the game does, or ends its turn when there is none
export function oldAdvance(g: OldGame): OldAdvance {
	if (g.ended !== null) return { kind: "ended" };
	const p = g.m.currentPlayer;
	const action = isProgram(g, p.type) ? p.handler.getAction() : null;
	const order = orderOf(g, action);
	if (order === null) return endTurn(g);
	if ("view" in order) {
		if (order.view.type === "stuck") g.ended = { kind: "stuck", reason: order.view.reason };
		return { kind: "order", order, refusal: null };
	}
	return { kind: "order", order, refusal: play(g, action, order.command) };
}

//game.ts processAction and ui.ts: the move along the move range shown (setMoveRange), finished at once
//(the surprise attack's target with air mode off, #77, as the engine contract plays it); the attack only
//in range; the rest as commands. A unit that isn't there: the game threw before the move (the next
//tick plays the next action), the command refuses the others. The refusal, null when it ran
function play(g: OldGame, a: AIAction, cmd: Command): string | null {
	const sc = g.game.scenario;
	const won = (how: "capture" | "elimination") => (side: number) => { g.ended = g.ended || { kind: "victory", side, how }; };
	//A retreat's move ends when its animation does, after the attack's victory check: a capture there wins too
	const retreats: [Unit, unknown][] = [];
	const finish = { onVictory: won("elimination"), onRetreat: (u: Unit, _c: unknown, mr: unknown) => { retreats.push([u, mr]); } };
	let r: { ok: boolean };
	if (cmd.type === "move") {
		if (!a.param[0]) return "no such unit";
		g.m.setMoveRange(a.param[0] as Unit);
		r = g.Commands.execute(sc, { ...cmd, cells: g.m.getCurrentMoveRange() }, { finish: { onVictory: won("capture") }, surprise: finish });
	} else if (cmd.type === "attack") {
		if (!g.GameRules.isInAttackRange(a.param[0] as Unit, a.param[1] as Unit)) return "skipped";
		r = g.Commands.execute(sc, cmd, { finish });
	} else {
		r = g.Commands.execute(sc, cmd);
	}
	for (const [u, mr] of retreats) g.Actions.finishMove(g.m, u, mr as never, false, { onVictory: won("capture") });
	return "refusal" in r ? (r as { refusal: { reason: string } }).refusal.reason : null;
}

//Game.endTurn: the end of turn command (the next AI or scripted player starts and plans its turn in
//Map.endTurn's turn driver: what its start did is recorded there), the defeat at the turn limit for a
//local side, the save point, the side shown, the reinforcements
function endTurn(g: OldGame): OldAdvance {
	const side = g.m.currentPlayer.side;
	const started: Command[] = [];
	let startedState: string | null = null;
	const onPlayerTurn = g.GameMap.onPlayerTurn;
	g.GameMap.onPlayerTurn = (p, map) => {
		const undo = recordStart(g.m, started);
		try {
			onPlayerTurn(p, map);
		} finally {
			undo();
		}
		if (isProgram(g, p.type)) startedState = oldState(g);
	};
	let defeat: boolean;
	try {
		const r = g.Commands.execute(g.game.scenario, { type: "endTurn" }, { localSide: g.localSide });
		defeat = "result" in r && r.result;
	} finally {
		g.GameMap.onPlayerTurn = onPlayerTurn;
	}
	const view = g.view.splice(0);
	if (defeat) {
		g.ended = { kind: "turnLimit", side };
		return { kind: "endTurn", started, startedState, view };
	}
	g.game.spotSide = shownSide(g);
	g.game.deployReinforcements(g.m.turn, g.m.currentPlayer.id);
	return { kind: "endTurn", started, startedState, view };
}

//The AI's purchases and deployment as the commands they amount to (Player.buyUnit with no transport,
//Map.deployPlayerUnit where it succeeds), while its turn starts. Undoes the recording
export function recordStart(m: OldGame["m"], started: Command[]): () => void {
	type Player = (typeof m)["currentPlayer"];
	const proto = (m.currentPlayer.constructor as unknown as { prototype: Player }).prototype;
	const buy = Object.getOwnPropertyDescriptor(proto, "buyUnit"), deploy = m.deployPlayerUnit;
	proto.buyUnit = function(this: Player, eqid: number, transport?: number) {
		const before = this.getCoreUnitList().length, r = (buy.value as Player["buyUnit"]).call(this, eqid, transport) as boolean;
		if (this.getCoreUnitList().length > before) started.push({ type: "buy", eqid, transport: transport === undefined ? -1 : transport });
		return r;
	};
	m.deployPlayerUnit = function(player, index, row, col) {
		const r = deploy.call(m, player, index, row, col);
		if (r) started.push({ type: "deploy", index, to: { row, col } });
		return r;
	};
	return () => {
		Object.defineProperty(proto, "buyUnit", buy);
		m.deployPlayerUnit = deploy;
	};
}

//Where two texts first differ
export function difference(want: string, got: string): string {
	let d = 0;
	while (d < want.length && want[d] === got[d]) d++;
	const cut = (x: string) => x.slice(Math.max(0, d - 200), d + 200);
	return "\n    old  " + cut(want) + "\n    core " + cut(got);
}
