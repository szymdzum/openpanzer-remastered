//The AI arena (#46): games played headless on the core's session (src/core/session.ts), every player a
//program, the AI or the scripted general (general.ts), and what each side achieved. The same scenario
//and seeds before and after a change to the AI say, with numbers, whether it plays better.
//
//Unlike the game, the first player starts and plays its first turn, its purchases and deployment
//included (cli/game.ts startFirstTurn): the old game's AI ended it at once when it started a new scenario
//(session.ts), which costs an attacker a turn the arena doesn't measure.
import { aiController } from "../../src/core/ai";
import { createWorld } from "../../src/core/create";
import { rulesetNamed } from "../../src/core/rules";
import { newGame } from "../../src/core/newgame";
import type { GameEvent } from "../../src/core/events";
import { type Advance, advance, type Session, startSession } from "../../src/core/session";
import { victoryRating } from "../../src/core/turn";
import type { RulesetName, World } from "../../src/core/types";
import { sideOf } from "../../src/core/world";
import { playerType } from "../../src/prototypes";
import { startFirstTurn } from "../../cli/game";
import { setupOf } from "../corefiles";
import { generalController } from "./general";

export type Player = "ai" | "general";

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

//Plays one game to its end: a victory, or the last turn of every player
export function playMatch(match: Match): GameResult {
	const t0 = performance.now();
	const s = sessionOf(match);
	const sides: [SideResult, SideResult] = [side(match.sides[0]), side(match.sides[1])];
	const maxTurns = Math.min(match.turns || Infinity, s.world.state.scenario.maxTurns);
	const owners = new Map<number, number>();	//unit id -> side, for the units an event names after they are gone
	let orders = 0;
	remember(s.world, owners);
	for (let n = 0; n < 200_000 && s.ended === null && s.world.state.turn.turn <= maxTurns; n++) {
		const turn = s.world.state.turn.turn;
		const a = advance(s);
		if (a.kind === "ended") break;
		if (a.kind === "order") orders += ordered(match, sides, s.world, a);
		tally(sides, owners, turn, a.kind === "order" ? a.events : [...a.events, ...a.arrived]);
		remember(s.world, owners);
	}
	const held = objectivesHeld(s.world);
	sides[0].objectivesHeld = held[0];
	sides[1].objectivesHeld = held[1];
	return { match, turns: Math.min(s.world.state.turn.turn, maxTurns), ...endOf(s, held), sides, orders,
		ms: Math.round(performance.now() - t0) };
}

//The scenario started as the game starts it, every player the AI or the general
function sessionOf(match: Match): Session {
	const setup = { ...setupOf(match.file, { game: match.seed, ai: match.seed + 7919 }), rules: rulesetNamed(match.rules || "remaster") };
	const created = newGame(setup);
	for (const p of created.state.players) p.type = playerType.aiLocal;
	const world = createWorld(created, setup.equipment, { spotSide: -1, rules: setup.rules });
	const controllerOf = (p: number) => match.sides[world.state.players[p].side] === "general" ? generalController(p) : aiController(p);
	const s = startSession(world, (_type, p) => controllerOf(p), { localSide: -1 });
	startFirstTurn(s);
	return s;
}

//An order played: 1 for a command; a refused one counted against its side
function ordered(match: Match, sides: SideResult[], w: World, a: Extract<Advance, { kind: "order" }>): number {
	if (a.refusal !== null) {
		const by = w.state.players[a.player].side;
		sides[by].refused++;
		if (process.env.ARENA_DEBUG && match.sides[by] === "general")
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

//How the game ended: a victory, stuck, or the turn limit, which the side holding more objectives wins (#231)
function endOf(s: Session, held: [number, number]): Pick<GameResult, "end" | "winner" | "rating"> {
	if (s.ended !== null && s.ended.kind === "victory") return { end: s.ended.how, winner: s.ended.side, rating: victoryRating(s.world) };
	if (s.ended !== null && s.ended.kind === "stuck") return { end: "stuck", winner: -1, rating: "" };
	if (held[0] === held[1]) return { end: "turnLimit", winner: -1, rating: "" };
	return { end: "turnLimit", winner: held[0] > held[1] ? 0 : 1, rating: "held" };
}

function side(player: Player): SideResult {
	return { player, firstObjectiveTurn: null, objectivesTaken: 0, objectivesHeld: 0, unitsLost: 0, unitsDestroyed: 0, refused: 0 };
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

//A matchup's games summed up per side, as a markdown table row each
export function summary(results: GameResult[]): string[] {
	const rows: string[] = [];
	for (const s of [0, 1]) {
		const r = results.map((g) => g.sides[s]);
		const wins = results.filter((g) => g.winner === s).length;
		const firsts = r.map((x) => x.firstObjectiveTurn).filter((t): t is number => t !== null);
		const taken = sum(r.map((x) => x.objectivesTaken)), lost = sum(r.map((x) => x.unitsLost));
		const ratings = results.filter((g) => g.winner === s).map((g) => g.rating);
		rows.push([
			`${s === 0 ? "axis" : "allies"} (${r[0].player})`,
			`${wins}/${results.length}`,
			ratings.length ? count(ratings) : "-",
			firsts.length ? `${(sum(firsts) / firsts.length).toFixed(1)} (${firsts.length}/${results.length})` : "never",
			(taken / results.length).toFixed(1),
			(sum(r.map((x) => x.objectivesHeld)) / results.length).toFixed(1),
			(lost / results.length).toFixed(1),
			(sum(r.map((x) => x.unitsDestroyed)) / results.length).toFixed(1),
			taken ? (lost / taken).toFixed(1) : "-",
			(sum(r.map((x) => x.refused)) / results.length).toFixed(1),
		].join(" | "));
	}
	return rows;
}

function sum(xs: number[]): number {
	return xs.reduce((a, b) => a + b, 0);
}

function count(xs: string[]): string {
	const n = new Map<string, number>();
	for (const x of xs) n.set(x, (n.get(x) || 0) + 1);
	return [...n].map(([k, v]) => `${v} ${k}`).join(", ");
}
