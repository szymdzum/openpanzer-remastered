/**
 * Turn - what happens between two players' turns and how a game ends: a unit's end of turn, the
 * reinforcements arriving, the turn limit and the outcome
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 *
 * The end of turn itself is a command (commands/turn.ts). The reinforcements arrive after it, as a
 * step of their own (arriveReinforcements): between the two an AI player plans its turn (#94 kept), so
 * its reinforcements don't act on the turn they arrive. The game saves after them (#93).
 */

import { playerSide, terrainEntrenchment, unitClass, unitEntrenchRate } from "../prototypes";
import type { ScenarioOutcome } from "../scenario";
import { beginDraft, emit, finishDraft, place, playerAt, writeUnit } from "./draft";
import type { GameEvent } from "./events";
import { reinforcementDeployPosition } from "./movement";
import type { Draft, OffMapUnit, UnitId, UnitState, World } from "./types";
import { canEntrench, sideHasUnits } from "./units";
import { hexIndex, isSpotted, sideOf, unitData } from "./world";

//Unit.unitEndTurn: entrenchment, the movement points and the turn's flags back, and a unit its enemy
//no longer sees hidden again; fortifications stay seen once seen
export function unitEndTurn(d: Draft, id: UnitId) {
	const u = writeUnit(d, id);
	entrench(d, u);
	u.moveLeft = d.equipment[u.eqid].movpoints;
	u.hasMoved = u.hasFired = u.hasResupplied = u.isSurprised = u.hasOverstrength = false;
	u.hits = 0;
	if (unitData(d, u).uclass !== unitClass.fortification && u.row >= 0 && !seenByEnemy(d, u)) u.tempSpotted = false;
}

//The enemy side spots the unit's hex. The old game asked the side the screen showed, so that side's
//own units stayed seen in the fog for good once they had fired (#75)
function seenByEnemy(w: World, u: UnitState): boolean {
	return isSpotted(w, hexIndex(w, u.row, u.col), ~sideOf(w, u) & 1);
}

//Unit.entrench: up to the terrain's entrenchment at once, then one level at a time as the ticks
//(experience and the class's rate) fill it, at most 5 levels above the terrain's
function entrench(d: Draft, u: UnitState) {
	if (!canEntrench(d, u) || u.row < 0) return;
	const uclass = unitData(d, u).uclass;
	const terrain = terrainEntrenchment[d.data.hexes[hexIndex(d, u.row, u.col)].terrain];
	if (u.entrenchment < terrain) {
		u.entrenchment = terrain;
		u.entrenchTicks = 0;
		return;
	}
	let level = u.entrenchment - terrain;
	let next = 9 * level + 4;
	u.entrenchTicks += +(u.experience / 100) + (terrain + 1) * unitEntrenchRate[uclass];
	while (u.entrenchTicks >= next && u.entrenchment < terrain + 5) {
		u.entrenchTicks -= next;
		u.entrenchment++;
		level++;
		next = 9 * level + 4;
	}
}

//Every player of the side has played the turn (Scenario's hasSidePlayedTurn)
function sidePlayed(w: World, side: number, turn: number): boolean {
	return w.state.players.every((p) => p.side !== side || p.playedTurn >= turn);
}

//The side that just ended its turn played its last one (Scenario.checkDefeat for any side: the game
//asks it only for a side playing on this screen)
export function reachedTurnLimit(w: World, side: number): boolean {
	return w.state.turn.turn >= w.state.scenario.maxTurns && sidePlayed(w, side, w.state.scenario.maxTurns);
}

//How well the winner did by the turn it won on (Scenario.checkVictory)
export function victoryRating(w: World): ScenarioOutcome {
	const turn = w.state.turn.turn, by = w.state.scenario.victoryTurns;
	if (turn <= by[0]) return "briliant";
	if (turn <= by[1]) return "victory";
	if (turn <= by[2]) return "tactical";
	return "lose";
}

//What just happened, for the outcomes the state alone doesn't show: the side a move's capture made
//win (its "victory" event), the side that just ended its turn
export interface LastPlayed {
	victorySide?: number;
	endedSide?: number;
}

//How a game ended: a side took all its objectives (capture), a side has no units left
//(elimination), a side played its last turn (turnLimit)
export type OutcomeKind = "capture" | "elimination" | "turnLimit";

export interface Outcome {
	kind: OutcomeKind;
	winner: number; //the side that won, -1 at a turn limit nobody wins
	loser: number; //the side that lost
	rating: ScenarioOutcome; //the winner's rating by the turn, "lose" at a turn limit nobody wins
}

//Whether the game is over, who won and why (the old engine's Actions.checkOutcome): a capture that took the side's
//last objective, a side with no unit left (sideHasUnits: in the classic rules its units waiting to deploy
//don't count, #115; axis first, so with none on either side the allies win), the ended side's turn
//limit. Null when the game goes on
export function outcome(w: World, last: LastPlayed = {}): Outcome | null {
	if (last.victorySide !== undefined && last.victorySide >= 0)
		return { kind: "capture", winner: last.victorySide, loser: ~last.victorySide & 1, rating: victoryRating(w) };
	let winner = -1;
	if (!sideHasUnits(w, playerSide.axis)) winner = playerSide.allies;
	else if (!sideHasUnits(w, playerSide.allies)) winner = playerSide.axis;
	if (winner >= 0) return { kind: "elimination", winner, loser: ~winner & 1, rating: victoryRating(w) };
	if (last.endedSide !== undefined && last.endedSide >= 0 && reachedTurnLimit(w, last.endedSide))
		return turnLimitOutcome(w, last.endedSide);
	return null;
}

//At the turn limit neither side took all its objectives: the side that holds more of them held out and
//wins, a defender included (the old game made the side that ended its last turn lose whatever it held,
//#231); with as many each, the side that ended its last turn loses, as it did
function turnLimitOutcome(w: World, endedSide: number): Outcome {
	const held = [0, 0];
	for (const h of w.state.map.hexes)
		if (h.victorySide !== -1 && h.owner !== -1) held[playerAt(w, h.owner).side]++;
	if (held[0] === held[1]) return { kind: "turnLimit", winner: -1, loser: endedSide, rating: "lose" };
	const winner = held[0] > held[1] ? 0 : 1;
	return { kind: "turnLimit", winner, loser: ~winner & 1, rating: victoryRating(w) };
}

//The current player's reinforcements up to this turn arrive (Actions.deployReinforcements), in the
//scenario's order (by turn, then as listed): each on its hex or the first free neighbour, those with
//no room stay for a later turn. The world after and the arrivals; the world given when none are due
export function arriveReinforcements(w: World): { world: World; events: GameEvent[] } {
	const s = w.state, player = s.turn.currentPlayer;
	const due = s.reinforcements.filter((r) => r.turn <= s.turn.turn && r.unit.owner === player);
	if (!due.length) return { world: w, events: [] };
	const d = beginDraft(w);
	const left = d.state.reinforcements = s.reinforcements.slice();
	for (const r of due) {
		const at = reinforcementDeployPosition(d, r.unit as OffMapUnit as UnitState, r.row, r.col);
		if (at === null) continue;
		left.splice(left.indexOf(r), 1);
		//(the unit it becomes gets the next id; what it spots on arriving comes after)
		emit(d, { type: "arrived", unit: d.state.nextUnitId, at: { row: at.row, col: at.col } });
		place(d, r.unit, at);
	}
	return { world: finishDraft(d), events: d.events };
}
