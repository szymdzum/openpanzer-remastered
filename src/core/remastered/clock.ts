/**
 * The remastered AI's turn clock (#232): who attacks by the turn limit's rule (#256), the turns left for the objectives
 * left to take, whether the attack is behind its schedule, and the last turns.
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

import { attackerSide } from "../turn";
import type { World } from "../types";

//The last share of the turns, when an attack on the objective is worth what it costs (the general's LATE_SHARE)
const LATE_SHARE = 1 / 3;
//The fewest turns an assault is given before the commander weighs its sector again
const MIN_ASSAULT_TURNS = 3;
//The attacker is behind schedule when the share of its objectives still to take is this much over the share of the
//turns left: the march to the first objective takes turns that take nothing
const SCHEDULE_SLACK = 0.25;

/**
 * Whether the side attacks: the scenario's attacker, which loses at the turn limit unless it took every objective
 * (#256); with none (as many objectives each at the start), the side with more left to take (#231).
 */
export function attacks(w: World, side: number): boolean {
	const attacker = attackerSide(w);
	return attacker >= 0 ? attacker === side : w.state.objectives[side].length > w.state.objectives[~side & 1].length;
}

/** Whether the side assaults: it attacks, or it has lost more objectives than the attacker has left to take. */
export function assaults(w: World, side: number): boolean {
	return attacks(w, side) || w.state.objectives[side].length > w.state.objectives[~side & 1].length;
}

/** The turn clock of a side: its turns left, this one included, for its objectives left to take. */
export interface Clock {
	attacks: boolean;
	turnsLeft: number;
	toTake: number;
	//The attacker has a larger share of its objectives left than of its turns, beyond SCHEDULE_SLACK
	behind: boolean;
	late: boolean;
}

export function clockOf(w: World, side: number): Clock {
	const turn = w.state.turn.turn, max = w.state.scenario.maxTurns, toTake = w.state.objectives[side].length;
	const turnsLeft = Math.max(0, max - turn + 1), attacking = attacks(w, side), start = w.data.startObjectives;
	const behind = attacking && start !== null && start[side] > 0 && toTake / start[side] > turnsLeft / max + SCHEDULE_SLACK;
	return { attacks: attacking, turnsLeft, toTake, behind, late: isLate(w) };
}

const count = (n: number, what: string) => `${n} ${what}${n === 1 ? "" : "s"}`;

/** The clock in words: "3 objectives in 6 turns: behind schedule". */
export function clockLine(c: Clock): string {
	const pace = `${count(c.toTake, "objective")} in ${count(c.turnsLeft, "turn")}`;
	if (!c.attacks) return `${pace}: defending`;
	return `${pace}${c.late ? ": the last turns" : c.behind ? ": behind schedule" : ""}`;
}

/** Whether the side is pressed for time: the last turns, or its attack behind schedule. */
export function pressed(w: World, side: number): boolean {
	return isLate(w) || clockOf(w, side).behind;
}

/** Whether the game is in its last turns. */
export const isLate = (w: World): boolean => w.state.turn.turn > w.state.scenario.maxTurns * (1 - LATE_SHARE);

/** The turn an assault is weighed again: the turns left shared among the objectives to take (#232), a few at least. */
export function deadlineOf(w: World, side: number): number {
	const turn = w.state.turn.turn, max = w.state.scenario.maxTurns, left = Math.max(1, w.state.objectives[side].length);
	return Math.min(max, turn + Math.max(MIN_ASSAULT_TURNS, Math.ceil((max - turn) / left)) - 1);
}
