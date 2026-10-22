/**
 * Turn - what happens between two players' turns and how a game ends: a unit's end of turn, the
 * reinforcements arriving, the turn limit and the outcome
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 *
 * The end of turn itself is a command (commands/turn.ts). The reinforcements arrive after it, as a
 * step of their own (arriveReinforcements): between the two the old game saves (#93 kept) and an AI
 * player plans its turn (#94 kept), so its reinforcements don't act on the turn they arrive.
 */

import type { Outcome } from "../actions";
import { playerSide, terrainEntrenchment, unitClass, unitEntrenchRate } from "../prototypes";
import type { ScenarioOutcome } from "../scenario";
import { beginDraft, emit, finishDraft, place, writeUnit } from "./draft";
import type { GameEvent } from "./events";
import { reinforcementDeployPosition } from "./movement";
import type { Draft, OffMapUnit, UnitId, UnitState, World } from "./types";
import { canEntrench } from "./units";
import { hexIndex, sideOf, unitData } from "./world";

//Whether the side the screen shows sees a hex (Hex.isSpotted of game.spotSide): -1, no side, sees none
function shownTo(w: World, hex: number, side: number): boolean {
	return w.noFOW || (side >= 0 && side < 2 && w.sight.spot[side][hex] > 0);
}

//Unit.unitEndTurn: entrenchment, the movement points and the turn's flags back, and a unit the
//screen's side no longer sees hidden again. Kept: #75, the screen's side (spotSide), not the unit's
//enemy, decides whether it hides; fortifications stay seen once seen
export function unitEndTurn(d: Draft, id: UnitId) {
	const u = writeUnit(d, id);
	entrench(d, u);
	u.moveLeft = d.equipment[u.eqid].movpoints;
	u.hasMoved = u.hasFired = u.hasResupplied = u.isSurprised = u.hasOverstrength = false;
	u.hits = 0;
	if (unitData(d, u).uclass !== unitClass.fortification && u.row >= 0
		&& !shownTo(d, hexIndex(d, u.row, u.col), d.spotSide))
		u.tempSpotted = false;
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

//Whether the game is over, who won and why (Actions.checkOutcome): a capture that took the side's
//last objective, a side with no unit on the map (kept #115: its units waiting to deploy don't count;
//axis first, so with none on either side the allies win), the ended side's turn limit. Null when
//the game goes on
export function outcome(w: World, last: LastPlayed = {}): Outcome | null {
	if (last.victorySide !== undefined && last.victorySide >= 0)
		return { kind: "capture", winner: last.victorySide, loser: ~last.victorySide & 1, rating: victoryRating(w) };
	const alive = (side: number) => w.state.units.some((u) => sideOf(w, u) === side);
	let winner = -1;
	if (!alive(playerSide.axis)) winner = playerSide.allies;
	else if (!alive(playerSide.allies)) winner = playerSide.axis;
	if (winner >= 0) return { kind: "elimination", winner, loser: ~winner & 1, rating: victoryRating(w) };
	if (last.endedSide !== undefined && last.endedSide >= 0 && reachedTurnLimit(w, last.endedSide))
		return { kind: "turnLimit", winner: -1, loser: last.endedSide, rating: "lose" };
	return null;
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
