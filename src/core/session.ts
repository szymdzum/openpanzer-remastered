/**
 * Session - a game played headless on the core: the players' controllers, the turns in the old game's
 * order, the end of the game. What Game's turn loop does (processTurn, processAIActions, endTurn),
 * without the screen, the clock and the save
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 *
 * A turn: the current player's controller gives its orders one by one, each command stepped (a
 * refused one changes nothing, as the old game's action did nothing), until it has none left. Then
 * the end of turn, and in the old game's order (Map.endTurn, Game.endTurn):
 *   the end of turn step -> the next player's controller starts and plans its turn -> the defeat at
 *   the turn limit -> [the screen's turn start] -> the side the screen shows -> the reinforcements
 *   arrive -> [the save point: after them, #93]
 * Kept: the AI plans before its reinforcements arrive (#94), and the turn limit ends the game only for a
 * side that plays on this screen (localSide, Game's getLocalSide).
 * The game ends at a victory (a capture of the last objective, or a side with no unit left after an
 * attack), at the turn limit of a side on the screen, or where the old game got stuck (#80).
 *
 * A player only a person plays (human, remote) has no controller here: its turns end at once. A new
 * game whose first player is the AI starts that player's turn as on every later one, its purchases,
 * deployment and plan (the option fresh, Session.first; the old game's AI planned nothing then and ended its first turn
 * at once, #292). The scripted tutorial's script plays its first turn itself. A game loaded on an AI's
 * turn plans it again (#71).
 */

import type { Command, Refusal } from "../commands";
import { playerType } from "../prototypes";
import type { Controller, Order, ViewEvent } from "./controller";
import type { GameEvent } from "./events";
import { begin, resume, step } from "./step";
import { arriveReinforcements } from "./turn";
import type { Checkpoint, World } from "./types";
import { sideOf, unitById } from "./world";

//How a game ended: a side won, the side on the screen played its last turn, or the old game got stuck
export type SessionEnd =
	| { kind: "victory"; side: number; how: "capture" | "elimination" }
	| { kind: "turnLimit"; side: number }
	| { kind: "stuck"; reason: string };

//The controller of a player of a type (Game.setupPlayers: the AI, the scripted tutorial), null when
//no program plays it
export type ControllerFor = (type: number, player: number) => Controller | null;

export interface Session {
	world: World;
	//Which sides play on this screen (Game's getLocalSide): -1 none, 0 or 1, 2 both
	readonly localSide: number;
	readonly controllerFor: ControllerFor;
	controllers: (Controller | null)[];	//by player id
	//What the controllers asked of the screen when they joined (the tutorial loaded on its last turn
	//opens the main menu)
	joined: ViewEvent[];
	//The first player's turn start in a new game, when the AI plays it (#292)
	first: StartedTurn | null;
	//The world at the last save point (Game.endTurn's save: after the reinforcements, #93)
	saved: World | null;
	ended: SessionEnd | null;
}

//What one advance did: an order played (refused: the step said no and nothing changed), or a turn
//ended (with the next player's turn start and plan, then the reinforcements that arrived)
export type Advance =
	| { kind: "order"; player: number; order: Order; events: GameEvent[]; refusal: Refusal | null }
	| { kind: "endTurn"; player: number; events: GameEvent[]; started: StartedTurn | null; arrived: GameEvent[] }
	| { kind: "ended" };

//The next player's turn start, when a controller plays it: the player's type then (the tutorial may
//hand it over at its start)
export interface StartedTurn {
	player: number;
	type: number;
	commands: Command[];
	events: GameEvent[];
	view: ViewEvent[];
}

const isProgram = (type: number) => type === playerType.aiLocal || type === playerType.aiScripted;

export interface SessionOptions {
	loaded?: boolean;	//a game loaded on an AI player's turn, which plans it again (#71)
	fresh?: boolean;	//a new game, whose first player, when the AI plays it, starts its turn (#292)
	localSide?: number;	//the sides on this screen, when not the players' types' (Game counts them when the game loads)
}

//Game.setupPlayers and the rest of a scenario's start: the controllers by the players' types, each
//joining in the players' order, the side the screen shows; in a new game the AI moving first starts its
//turn (first), in a loaded one the AI whose turn it is plans it again
export function startSession(w: World, controllerFor: ControllerFor, options: SessionOptions = {}): Session {
	const players = w.state.players;
	const localSide = options.localSide === undefined ? localSideOf(w) : options.localSide;
	const s: Session = { world: w, localSide, controllerFor, controllers: players.map((): Controller | null => null),
		joined: [], first: null, saved: null, ended: null };
	players.forEach((p) => join(s, p.id, p.type));
	s.world = { ...s.world, spotSide: shownSide(s) };
	const current = s.world.state.turn.currentPlayer;
	if (options.loaded && current >= 0 && players[current].type === playerType.aiLocal && s.controllers[current] !== null)
		s.world = s.controllers[current].plan(s.world);
	else if (options.fresh && current >= 0 && players[current].type === playerType.aiLocal)
		s.first = startTurn(s);
	return s;
}

function join(s: Session, player: number, type: number) {
	const c = s.controllers[player] = isProgram(type) ? s.controllerFor(type, player) : null;
	if (c === null) return;
	const played = c.join(s.world);
	s.world = played.world;
	s.joined.push(...played.view);
}

//Game's getLocalSide: the sides of the human and the scripted players, 2 when both
function localSideOf(w: World): number {
	let sides = 1, side = -1;
	for (const p of w.state.players)
		if (p.type === playerType.humanLocal || p.type === playerType.aiScripted) {
			if (side !== -1 && side !== p.side) sides++;
			side = p.side;
		}
	return sides > 1 ? 2 : side;
}

//Game.setCurrentSide: the current player's side in hotseat, else the local side
function shownSide(s: Session): number {
	const current = s.world.state.turn.currentPlayer;
	return s.localSide === 2 && current >= 0 ? s.world.state.players[current].side : s.localSide;
}

//The controller playing the player now, when a program plays it (Game.processTurn)
function controllerOf(s: Session, player: number): Controller | null {
	return isProgram(s.world.state.players[player].type) ? s.controllers[player] : null;
}

//Plays the next order of the current player, or ends its turn when it has none
export function advance(s: Session): Advance {
	if (s.ended !== null) return { kind: "ended" };
	const player = s.world.state.turn.currentPlayer;
	const order = nextOrder(s);
	if (order === null) return endTurn(s);
	if ("view" in order) {
		if (order.view.type === "stuck") s.ended = { kind: "stuck", reason: order.view.reason };
		return { kind: "order", player, order, events: [], refusal: null };
	}
	const r = step(s.world, order.command);
	if ("refusal" in r) return { kind: "order", player, order, events: [], refusal: r.refusal };
	s.world = r.world;
	s.ended = victoryIn(s.world, r.events);
	return { kind: "order", player, order, events: r.events, refusal: null };
}

//The current player's controller's next order, not played yet (a screen shows the state before it:
//harness/replay.js reads it there); null when it has none left, which ends its turn, or when a person
//plays the player
export function nextOrder(s: Session): Order | null {
	const c = controllerOf(s, s.world.state.turn.currentPlayer);
	return c === null ? null : c.next(s.world);
}

//What a command played up to a checkpoint did: refused (nothing changed), or its events so far and the
//checkpoint where it waits for the screen (null: done)
export interface Phase {
	events: GameEvent[];
	refusal: Refusal | null;
	checkpoint: Checkpoint | null;
}

//A command a person sends, or a controller's order a screen animates: played up to its first
//checkpoint (a move or an attack) or whole. A victory in it ends the session; the screen says so when
//it has shown it (the old game ended at the animation's end)
export function play(s: Session, cmd: Command): Phase {
	const r = begin(s.world, cmd);
	if ("refusal" in r) return { events: [], refusal: r.refusal, checkpoint: null };
	s.world = r.world;
	s.ended = s.ended || victoryIn(s.world, r.events);
	return { events: r.events, refusal: null, checkpoint: r.checkpoint };
}

//Plays on from a checkpoint, once the screen has shown it
export function playOn(s: Session, cp: Checkpoint): Phase {
	const r = resume(s.world, cp);
	s.world = r.world;
	s.ended = s.ended || victoryIn(s.world, r.events);
	return { events: r.events, refusal: null, checkpoint: r.checkpoint };
}

//A step's victory: a capture of the last objective, a side with no unit left after an attack, then a
//retreat that took its side's last objective (the old game's retreat finished its move after the attack)
function victoryIn(w: World, events: GameEvent[]): SessionEnd | null {
	for (const e of events)
		if (e.type === "victory") return { kind: "victory", side: e.side, how: e.kind };
	for (const e of events)
		if (e.type === "captured" && e.win) return { kind: "victory", side: sideOf(w, unitById(w, e.unit)), how: "capture" };
	return null;
}

//The end of the current player's turn, the next player's turn start and plan, the defeat at the turn
//limit, the screen's turn start (shown: what a screen does there, in the old game's order: it shows the
//units the AI deployed at its turn start), the side shown, the reinforcements, the save point (#93)
export function endTurn(s: Session, shown?: (started: StartedTurn | null, events: GameEvent[]) => void): Advance {
	const player = s.world.state.turn.currentPlayer, side = s.world.state.players[player].side;
	const r = step(s.world, { type: "endTurn" });
	if ("refusal" in r) throw new Error("the end of turn is never refused");
	s.world = r.world;
	const started = startTurn(s);
	const limit = r.events.some((e) => e.type === "turnLimit" && e.side === side);
	if (limit && (s.localSide === 2 || s.localSide === side)) {
		s.ended = { kind: "turnLimit", side };
		return { kind: "endTurn", player, events: r.events, started, arrived: [] };
	}
	if (shown) shown(started, r.events);
	s.world = { ...s.world, spotSide: shownSide(s) };
	const arrived = arriveReinforcements(s.world);
	s.world = s.saved = arrived.world;
	return { kind: "endTurn", player, events: r.events, started, arrived: arrived.events };
}

//Map.endTurn's turn driver: the next player, when a program plays it, starts and plans its turn
function startTurn(s: Session): StartedTurn | null {
	const player = s.world.state.turn.currentPlayer;
	if (!isProgram(s.world.state.players[player].type)) return null;
	const c = controllerOf(s, player);
	if (c === null) return null;
	const type = s.world.state.players[player].type;
	const played = c.startTurn(s.world);
	s.world = c.plan(played.world);
	//(the tutorial hands its players over to a person and to the AI, which starts with nothing to do)
	if (played.handOver) join(s, player, s.world.state.players[player].type);
	return { player, type, commands: played.commands, events: played.events, view: played.view };
}

//Plays the current player's turn to its end: what each advance did
export function playTurn(s: Session): Advance[] {
	const done: Advance[] = [];
	for (;;) {
		const a = advance(s);
		done.push(a);
		if (a.kind !== "order" || s.ended !== null) return done;
	}
}
