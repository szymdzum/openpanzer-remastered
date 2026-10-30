//The AI arena (#46): games played headless on the core's session (src/core/session.ts), every player a
//program, the AI or the scripted general (general.ts), and what each side achieved. The same scenario
//and seeds before and after a change to the AI say, with numbers, whether it plays better.
//
//The first player starts and plays its first turn, its purchases and deployment included, as in the game
//(startSession's fresh, #292; the old game's AI ended it at once when it started a new scenario).
import { JSDOM } from "jsdom";
import { aiController } from "../../src/core/ai";
import { remasteredController } from "../../src/core/remastered/controller";
import type { Controller } from "../../src/core/controller";
import { createWorld } from "../../src/core/create";
import { rulesetNamed } from "../../src/core/rules";
import { newGame } from "../../src/core/newgame";
import type { GameEvent } from "../../src/core/events";
import { type Advance, advance, type Session, startSession } from "../../src/core/session";
import { outcome, victoryRating } from "../../src/core/turn";
import type { RulesetName, World } from "../../src/core/types";
import { sideOf } from "../../src/core/world";
import { playerType } from "../../src/core/tables";
import { setupOf } from "../corefiles";
import { FIRST_GENERAL, generalController } from "./general";

//Who can play a side: a name and its controller (general1: the first general, #236, for a comparison; remastered:
//the remastered AI, #409, whatever the rules)
const CONTROLLERS = { ai: aiController, remastered: remasteredController, general: generalController,
	general1: (p: number) => generalController(p, FIRST_GENERAL) } satisfies Record<string, (player: number) => Controller>;

export type Player = keyof typeof CONTROLLERS;

export const isPlayer = (name: string): name is Player => Object.prototype.hasOwnProperty.call(CONTROLLERS, name);

/** Whether the player is a general (general.ts), whose orders the core should never refuse. */
export const isGeneral = (player: Player): boolean => player.startsWith("general");

export interface Match {
	file: string;
	sides: [Player, Player];	//who plays side 0 (axis) and side 1 (allies)
	seed: number;
	turns?: number;		//the last turn to play, when not the scenario's
	rules?: RulesetName;	//the rules it plays by, the remaster's when not given (#53)
}

//What a side did in one game
export interface SideResult {
	player: Player;
	firstObjectiveTurn: number | null;	//the turn it first took an objective
	objectivesTaken: number;		//captures of objectives
	objectivesHeld: number;			//at the end
	unitsLost: number;
	unitsDestroyed: number;			//the enemy's
	refused: number;			//its orders the core refused (the AI plans its turn at its start, #94)
	turnMs: number[];			//the time spent in its controller's calls, each turn (machine-dependent)
}

export interface GameResult {
	match: Match;
	turns: number;				//the last turn played
	end: "capture" | "elimination" | "turnLimit" | "stuck";
	winner: number;				//-1: nobody at the turn limit
	rating: string;				//the winner's victory level, "" without a winner
	sides: [SideResult, SideResult];
	orders: number;
	ms: number;
}

//A game being played: its session and what each side did so far
interface Play {
	match: Match;
	s: Session;
	sides: [SideResult, SideResult];
	owners: Map<number, number>;	//unit id -> side, for the units an event names after they are gone
	clock: number[];		//by player id: the ms spent in its controller in its turn so far
	orders: number;
	endedSide: number;		//the side of the last turn ended
}

//Plays one game to its end: a victory, or the last turn of every player
export function playMatch(match: Match): GameResult {
	const t0 = performance.now();
	const clock: number[] = [];
	const s = sessionOf(match, clock);
	const g: Play = { match, s, sides: [side(match.sides[0]), side(match.sides[1])], owners: new Map(), clock, orders: 0,
		endedSide: -1 };
	const maxTurns = Math.min(match.turns || Infinity, s.world.state.scenario.maxTurns);
	remember(s.world, g.owners);
	for (let n = 0; n < 200_000 && s.ended === null && s.world.state.turn.turn <= maxTurns; n++) {
		const turn = s.world.state.turn.turn;
		const a = advance(s);
		if (a.kind === "ended") break;
		took(g, a, turn);
	}
	//A victory ends the turn it came in; a turn never played (past the last) isn't timed
	if (s.ended !== null && s.ended.kind !== "turnLimit") turnPlayed(g, s.world.state.turn.currentPlayer);
	const held = objectivesHeld(s.world);
	g.sides[0].objectivesHeld = held[0];
	g.sides[1].objectivesHeld = held[1];
	return { match, turns: Math.min(s.world.state.turn.turn, maxTurns), ...endOf(s, g.endedSide), sides: g.sides,
		orders: g.orders, ms: Math.round(performance.now() - t0) };
}

function took(g: Play, a: Exclude<Advance, { kind: "ended" }>, turn: number) {
	if (a.kind === "order") g.orders += ordered(g.match, g.sides, g.s.world, a);
	else {
		g.endedSide = g.s.world.state.players[a.player].side;
		turnPlayed(g, a.player);
	}
	tally(g.sides, g.owners, turn, a.kind === "order" ? a.events : [...a.events, ...a.arrived]);
	remember(g.s.world, g.owners);
}

function turnPlayed(g: Play, player: number) {
	g.sides[g.s.world.state.players[player].side].turnMs.push(Math.round((g.clock[player] || 0) * 100) / 100);
	g.clock[player] = 0;
}

let parser: DOMParser | null = null;
//The page's XML parser under Vitest, jsdom's in a worker process (worker.ts): jsdom's either way
const xmlParser = (): DOMParser => parser ??= typeof DOMParser !== "undefined" ? new DOMParser() : new new JSDOM().window.DOMParser();

//The scenario started as the game starts it, every player a program, each timed
function sessionOf(match: Match, clock: number[]): Session {
	const rng = { game: match.seed, ai: match.seed + 7919 };
	const setup = { ...setupOf(match.file, rng, null, undefined, [], xmlParser()), rules: rulesetNamed(match.rules || "remaster") };
	const created = newGame(setup);
	for (const p of created.state.players) p.type = playerType.aiLocal;
	const world = createWorld(created, setup.equipment, { spotSide: -1, rules: setup.rules });
	const controllerOf = (p: number) => timed(CONTROLLERS[match.sides[world.state.players[p].side]](p), clock);
	return startSession(world, (_type, p) => controllerOf(p), { fresh: true, localSide: -1 });
}

//A controller whose calls add the time they take to its player's clock
function timed(c: Controller, clock: number[]): Controller {
	const time = <T>(call: () => T): T => {
		const t0 = performance.now();
		const r = call();
		clock[c.player] = (clock[c.player] || 0) + performance.now() - t0;
		return r;
	};
	return { player: c.player, join: (w) => time(() => c.join(w)), startTurn: (w) => time(() => c.startTurn(w)),
		plan: (w) => time(() => c.plan(w)), next: (w) => time(() => c.next(w)) };
}

//An order played: 1 for a command; a refused one counted against its side
function ordered(match: Match, sides: SideResult[], w: World, a: Extract<Advance, { kind: "order" }>): number {
	if (a.refusal !== null) {
		const by = w.state.players[a.player].side;
		sides[by].refused++;
		if (process.env.ARENA_DEBUG && isGeneral(match.sides[by]))
			process.stderr.write(`${match.file} seed ${match.seed} turn ${w.state.turn.turn}: ${JSON.stringify(a.order)} refused, ${a.refusal.reason}\n`);
	}
	return "command" in a.order ? 1 : 0;
}

//The losses and the captures of objectives an advance's events tell
function tally(sides: SideResult[], owners: Map<number, number>, turn: number, events: GameEvent[]) {
	for (const e of events) {
		const by = e.type === "destroyed" || e.type === "captured" ? owners.get(e.unit) : undefined;
		if (by === undefined) continue;
		if (e.type === "destroyed") {
			sides[by].unitsLost++;
			sides[~by & 1].unitsDestroyed++;
		} else if (e.type === "captured" && e.objective) {
			sides[by].objectivesTaken++;
			if (sides[by].firstObjectiveTurn === null) sides[by].firstObjectiveTurn = turn;
		}
	}
}

//How the game ended: a victory, stuck, or the turn limit, as the core's outcome has it (src/core/turn.ts): in
//the remaster rules the attacker loses unless it took all its objectives (#256), in the classic ones nobody
//wins. A game cut short of the turn limit (Match.turns) has no winner
function endOf(s: Session, endedSide: number): Pick<GameResult, "end" | "winner" | "rating"> {
	if (s.ended !== null && s.ended.kind === "victory") return { end: s.ended.how, winner: s.ended.side, rating: victoryRating(s.world) };
	if (s.ended !== null && s.ended.kind === "stuck") return { end: "stuck", winner: -1, rating: "" };
	const o = outcome(s.world, { endedSide });
	if (o === null || o.winner < 0) return { end: "turnLimit", winner: -1, rating: "" };
	return { end: "turnLimit", winner: o.winner, rating: o.rating };
}

function side(player: Player): SideResult {
	return { player, firstObjectiveTurn: null, objectivesTaken: 0, objectivesHeld: 0, unitsLost: 0, unitsDestroyed: 0, refused: 0,
		turnMs: [] };
}

function remember(w: World, owners: Map<number, number>) {
	for (const u of w.state.units) if (!owners.has(u.id)) owners.set(u.id, sideOf(w, u));
}

export function objectivesHeld(w: World): [number, number] {
	const held: [number, number] = [0, 0];
	for (const h of w.state.map.hexes)
		if (h.victorySide !== -1 && h.owner !== -1) held[w.state.players[h.owner < w.state.players.length ? h.owner : 0].side]++;
	return held;
}
