/**
 * The remastered AI's reserve on the map (#638): the units a `reserve` directive holds back wait out of the enemy's
 * reach, as near the directive's hex as they get, until the commander commits them.
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

import { nextToSeenEnemy } from "../ai";
import type { Command } from "../command";
import { distance } from "../geometry";
import { moveRange } from "../movement";
import { check } from "../step";
import type { MoveCell, Position, UnitId, UnitState, World } from "../types";
import { canMount } from "../units";
import { unitById } from "../world";
import type { Analysis } from "./analysis";
import { hexOf } from "./march";
import { inGroundReach } from "./rear";
import type { Operation, Rides } from "./staff";

//A hex in the enemy's reach is worse for a waiting unit than any distance from where it waits
const IN_REACH = 1000;

//How good a hex is to wait on: out of the enemy's ground reach first, then near the hex the reserve is kept for
const waitValue = (w: World, a: Analysis, c: Position, near: Position) => (inGroundReach(a, hexOf(w, c)) ? -IN_REACH : 0)
	- distance(c.row, c.col, near.row, near.col);

/**
 * The next move of a reserve unit to a better hex to wait on, in its transport when that goes further (a mount, then
 * the move). `waited`: the units already looked at this turn. Null when none has a move to make.
 */
export function reserveMarch(w: World, a: Analysis, ops: readonly Operation[], rides: Rides, waited: Set<UnitId>): Command[] | null {
	for (const op of ops) {
		if (op.kind !== "reserve") continue;
		for (const id of op.units) {
			const u = unitById(w, id);
			if (u === null || u.hasMoved || waited.has(id)) continue;
			waited.add(id);
			const march = waitMove(w, a, u, op.at, rides);
			if (march !== null) return march;
		}
	}
	return null;
}

function waitMove(w: World, a: Analysis, u: UnitState, near: Position, rides: Rides): Command[] | null {
	let best: { cell: MoveCell; ride: boolean } | null = null, bestValue = waitValue(w, a, u, near);
	const look = (cells: readonly MoveCell[], ride: boolean) => {
		for (const c of cells) {
			const value = c.canMove ? waitValue(w, a, c, near) : -Infinity;
			if (value > bestValue) {
				best = { cell: c, ride };
				bestValue = value;
			}
		}
	};
	look(moveRange(w, u), false);
	if (canMount(w, u) && !u.isMounted) look(moveRange(w, { ...u, isMounted: true }).filter((c) => !nextToSeenEnemy(w, u, c) && rides(u, c)), true);
	return best === null ? null : marchCommands(w, u, best);
}

function marchCommands(w: World, u: UnitState, to: { cell: MoveCell; ride: boolean }): Command[] | null {
	const move: Command = { type: "move", unit: u.id, to: { row: to.cell.row, col: to.cell.col } };
	const first: Command = to.ride ? { type: "mount", unit: u.id } : move;
	if (check(w, first) !== null) return null;
	return to.ride ? [first, move] : [move];
}
