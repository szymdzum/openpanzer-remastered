/**
 * CoreSession - the running game's turns on the core's session (#137): the players' controllers (the
 * AI, the tutorial), their orders handed out as the old handlers' actions, the end of turn with the
 * next player's turn start, the reinforcements and the save, each mirrored into the game's
 * objects (src/mirror.ts) and told to the screen (src/screen.ts) where the old game told it
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 *
 * The players keep a handler (Player.handler, an AI): its getAction asks the session
 * for the current player's next order and hands it out as the old action (harness/replay.js wraps it
 * to hash the state there), and the host's processAction plays it as before, its commands on the core
 * (src/commands.ts). A handler made while the game runs (the replay makes every player the AI) joins
 * the session with its controller. The session's world is the game's before each call (src/mirror.ts
 * stepWorld: what the screen writes into the objects isn't in it, what the harness writes is).
 */

import { actionType, type Cell, CURRENCY_ICON } from "../prototypes";
import { playerType } from "../core/tables";
import { CombatLog } from "../combatlog";
import { AI, type AIAction, type AIDriver } from "../ai";
import type { GameMap, Player } from "../map";
import { applyData, checkedDifference, gameInputs, stepWorld, unitObject, worldOf } from "../mirror";
import { beginDraft, finishDraft } from "../core/draft";
import { destroyUnits } from "../core/fight";
import { unitById } from "../core/world";
import { aiController } from "../core/ai";
import { tutorialController } from "../core/tutorial";
import type { Command } from "../core/command";
import type { Controller, Order, ViewEvent } from "../core/controller";
import type { GameEvent } from "../core/events";
import { endTurn, nextOrder, type Session, startSession, type StartedTurn } from "../core/session";
import type { Game } from "./game";
import { game as running } from "./running";
import type { Unit } from "../unit";

//The controller of a player of a type (Game.setupPlayers: the AI, the scripted tutorial)
function controllerFor(type: number, player: number): Controller | null {
	if (type === playerType.aiLocal) return aiController(player);
	if (type === playerType.aiScripted) return tutorialController(player);
	return null;
}

//The handler of a player a program plays (Game.setupPlayers): an AI, the tutorial's too, handing out the
//session's orders (a handler made joins its player to the session)
export function handlerFor(player: Player, map: GameMap): AI {
	return new AI(player, map);
}

//The game's world now, of its objects, with the side shown and the fog of war
function synced(game: Game): Session {
	const s = game.session;
	s.world = stepWorld(game.scenario, game, gameInputs(game));
	return s;
}

//The objects to the session's world: they must then mirror it (the checks look)
function mirrored(game: Game) {
	applyData(game.scenario, game.session.world, game);
	const difference = checkedDifference(game.scenario, game.session.world, game);
	if (difference !== "") throw new Error("CoreSession: " + difference);
}

//What a controller asks of the screen outside its orders (the tutorial opens the main menu)
function show(game: Game, views: ViewEvent[]) {
	for (const v of views)
		game.host.screen.view(v);
}

//The session of a scenario whose players were just set up (Game.setupPlayers): their controllers
//join in the players' order; in a new game the AI moving first starts its turn, its purchases and
//deployment mirrored before the screen draws the new map (its moves the turn loop then animates as on
//every turn, #292), and the AI whose turn a loaded game is on plans it again (#71)
export function startGameSession(game: Game, loaded: boolean, localSide: number) {
	game.session = null;
	const w = worldOf(game.scenario, game, gameInputs(game));
	game.session = startSession(w, controllerFor, { loaded, fresh: !loaded, localSide });
	mirrored(game);
	if (game.session.first !== null) show(game, game.session.first.view);
	show(game, game.session.joined);
}

//The handlers' entry: the current player's next order, a handler made while the game runs joining it
//(not while the players are set up: the session starts after)
export const coreDriver: AIDriver = {
	getAction(): AIAction | null {
		return actionOf(running, nextOrder(synced(running)));
	},
	join(player: Player) {
		const game = running;
		if (game.session === null) return;
		const s = synced(game);
		const c = controllerFor(s.world.state.players[player.id].type, player.id);
		s.controllers[player.id] = c;
		if (c === null) return;
		const played = c.join(s.world);
		s.world = played.world;
		mirrored(game);
		show(game, played.view);
	},
};

//A unit of an order as the old action held it: the object, gone from the map or not; none for -1
function unitOf(game: Game, id: number | null | undefined): Unit | null {
	return id === null || id === undefined || id < 0 ? null : unitObject(game.scenario.map, id);
}

const cell = (c: { row: number; col: number }): Cell => ({ row: c.row, col: c.col });

//An order as the old handler's action (the host's processAction plays it): null, no order, ends the turn
function actionOf(game: Game, order: Order | null): AIAction | null {
	if (order === null) return null;
	const u = (id: number | null | undefined) => unitOf(game, id);
	return "view" in order ? viewAction(order.view, u) : commandAction(order.command, u);
}

type UnitOf = (id: number | null | undefined) => Unit | null;

//What the tutorial shows: a selection, a message pointing at a hex, a look at a hex (no controller says
//it is stuck since the tutorial's script plays through, #188)
function viewAction(v: ViewEvent, u: UnitOf): AIAction | null {
	switch (v.type) {
		case "select": return { type: actionType.select, param: [u(v.unit)] };
		case "message": return { type: actionType.message, param: [v.text.split("{prestige}").join(CURRENCY_ICON), cell(v.at)] };
		case "viewport": return { type: actionType.viewport, param: [cell(v.at)] };
		default: return null;
	}
}

//The commands a program sends in its turn, with the units' objects
const unitActions = { resupply: actionType.resupply, reinforce: actionType.reinforce, mount: actionType.mount,
	unmount: actionType.umount } as const;

function commandAction(c: Command, u: UnitOf): AIAction {
	switch (c.type) {
		case "move": return { type: actionType.move, param: [u(c.unit), cell(c.to)] };
		case "attack": return { type: actionType.attack, param: [u(c.unit), u(c.target)] };
		case "resupply": case "reinforce": case "mount": case "unmount": return { type: unitActions[c.type], param: [u(c.unit)] };
		default: throw new Error("CoreSession: no action for " + c.type);
	}
}

//Game.endTurn on the session: the selection cleared (Map.endTurn), the end of turn and the next
//player's turn start and plan; then the screen shows what the AI deployed and the next side; then the
//reinforcements with their alerts, and the save (after them, #93: a reload during the turn has them).
//True when the side that ended lost at the turn limit (only a side that plays on this screen)
export function endGameTurn(game: Game): boolean {
	const m = game.scenario.map;
	m.delMoveSel();
	m.delAttackSel();
	m.delCurrentUnit();
	const s = synced(game);
	let started = false;
	const turnStarted = (st: StartedTurn | null, events: GameEvent[]) => {
		started = true;
		mirrored(game);
		for (const e of events) if (e.type === "resupplied") CombatLog.addResupply(m.getUnitById(e.unit));
		game.host.screen.turnEvents?.(events);
		if (st !== null && st.type === playerType.aiLocal) game.host.screen.unitsPlaced();
		if (st !== null) show(game, st.view);
	};
	const ended = endTurn(s, (st, events) => {
		turnStarted(st, events);
		game.setCurrentSide();
	});
	if (ended.kind !== "endTurn") return false;
	if (!started) turnStarted(ended.started, ended.events);
	if (s.ended !== null && s.ended.kind === "turnLimit") return true;
	mirrored(game);
	arrived(game, ended.arrived);
	game.state.save();
	return false;
}

//Game.deployReinforcements: each one arrived in the combat log, told where the side shown sees it
function arrived(game: Game, events: GameEvent[]) {
	const m = game.scenario.map;
	let any = false;
	for (const e of events) {
		if (e.type !== "arrived") continue;
		any = true;
		const u = m.getUnitById(e.unit);
		CombatLog.addReinforcement(u);
		if (m.map[e.at.row][e.at.col].isSpotted(game.spotSide))
			game.host.screen.reinforced(e.at, game.spotSide === u.player.side);
	}
	if (any) game.host.screen.unitsPlaced();
	if (any) game.host.screen.turnEvents?.(events.filter((e) => e.type === "arrived"));
}

//GameMap.updateUnitList: the units marked destroyed off the map (the harness takes a side's units away
//so), each counted as lost in a campaign's dossier, as the old cleanup did
export function removeDestroyed(m: GameMap) {
	const w = worldOf(running.scenario, running, gameInputs(running));
	const d = beginDraft(w);
	destroyUnits(d, m.getUnits().filter((x) => x.destroyed).map((u) => unitById(d, u.id)));
	applyData(running.scenario, finishDraft(d), running);
}
