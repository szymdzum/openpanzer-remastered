/**
 * What a side knows of the game for the remastered AI: its own units, the enemies it sees, and those it remembers
 * where it last saw them, with a confidence that fades over its turns. The AI reads the enemy only here (#17).
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

import { seesUnit } from "../sight";
import type { UnitId, UnitState, World } from "../types";
import { currentEqid, hexIndex, isSpotted, sideOf } from "../world";

/** An enemy unit as the side last saw it. */
export interface Sighting {
	id: UnitId;
	eqid: number;		//what it is
	moving: number;		//what it moves as: its transport or carrier when it rides one
	row: number;
	col: number;
	strength: number;
	turn: number;		//the turn it was last seen
	confidence: number;	//1 when seen now, less for each of the side's turns since
}

/** What a side knows: its units, the enemies it sees now, and every enemy it knows of, seen or remembered. */
export interface SideView {
	side: number;
	turn: number;
	own: UnitState[];
	seen: UnitState[];
	//The enemies seen now, then the ones remembered: the memory the side's next turn starts from
	enemies: Sighting[];
}

//The confidence an enemy out of sight keeps from one of the side's turns to the next: halved, as it may have
//made a whole move since
const FADE = 0.5;
//Below it the enemy is forgotten: after three turns out of sight
const FORGET_BELOW = 0.1;

/** What the side knows of the world, the enemies of `memory` it doesn't see now remembered where they were. */
export function perceive(w: World, side: number, memory: readonly Sighting[]): SideView {
	const turn = w.state.turn.turn, own: UnitState[] = [], seen: UnitState[] = [];
	for (const u of w.state.units) {
		if (u.row < 0) continue;
		if (sideOf(w, u) === side) own.push(u);
		else if (seesUnit(w, u, side)) seen.push(u);
	}
	const seenIds = new Set(seen.map((u) => u.id));
	const enemies = seen.map((u) => sightingOf(u, turn));
	for (const m of memory) {
		const confidence = FADE ** (turn - m.turn);
		if (!seenIds.has(m.id) && confidence >= FORGET_BELOW && !isSpotted(w, hexIndex(w, m.row, m.col), side))
			enemies.push({ ...m, confidence });
	}
	return { side, turn, own, seen, enemies };
}

function sightingOf(u: UnitState, turn: number): Sighting {
	return { id: u.id, eqid: u.eqid, moving: currentEqid(u), row: u.row, col: u.col, strength: u.strength, turn, confidence: 1 };
}
