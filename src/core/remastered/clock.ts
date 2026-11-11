/**
 * The remastered AI's turn clock (#232): who assaults by the turn limit's rule (#256), the last turns, and the turns an
 * assault is given.
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

/**
 * Whether the side assaults: the side attacking (#256), or one with more objectives to take than the enemy, as a
 * defender is once it has lost some (#231).
 */
export function assaults(w: World, side: number): boolean {
	const attacker = attackerSide(w);
	return attacker === side || w.state.objectives[side].length > w.state.objectives[~side & 1].length;
}

/** Whether the game is in its last turns. */
export const isLate = (w: World): boolean => w.state.turn.turn > w.state.scenario.maxTurns * (1 - LATE_SHARE);

/** The turn an assault is weighed again: the turns left shared among the objectives to take (#232), a few at least. */
export function deadlineOf(w: World, side: number): number {
	const turn = w.state.turn.turn, max = w.state.scenario.maxTurns, left = Math.max(1, w.state.objectives[side].length);
	return Math.min(max, turn + Math.max(MIN_ASSAULT_TURNS, Math.ceil((max - turn) / left)) - 1);
}
