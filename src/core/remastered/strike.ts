/**
 * An attack of the remastered AI's before it is ordered: what the estimate gives it from a hex, the support fire it
 * meets counted, and whether it is worth ordering (#618).
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

import { isTargetFrom } from "../attack";
import type { Command } from "../command";
import { estimateAttack } from "../estimate";
import { check } from "../step";
import type { Position, UnitState, World } from "../types";
import { ammoOf, unitData } from "../world";
import { hexOf, samePosition } from "./march";

//A loss counts this much against a kill (the scripted general's LOSS_WEIGHT)
const LOSS_WEIGHT = 0.7;
//An attack worth a move kills at least this much
const MIN_KILLS = 1;

/**
 * An attack's estimate as the screen gives it: the support fire it meets counts in its losses, and an attack the
 * support fire stops kills nothing. `from`: the hex the unit moves to first, null when it fires from where it stands.
 */
export interface Strike {
	unit: UnitState;
	target: UnitState;
	from: Position | null;
	kills: number;
	losses: number;
	//The target's hex is empty after it: destroyed, surrendered or retreating
	empties: boolean;
}

/** What a strike is worth: its kills less a share of its losses. */
export const gainOf = (s: Strike) => s.kills - LOSS_WEIGHT * s.losses;

const standing = (u: UnitState, at: Position): UnitState => samePosition(u, at) ? u : { ...u, row: at.row, col: at.col };

/** The unit's attack on the target from the hex (null: where it stands); null when it isn't its target from there. */
export function strikeFrom(w: World, u: UnitState, t: UnitState, from: Position | null): Strike | null {
	const at = from === null ? u : standing(u, from);
	if (!isTargetFrom(w, at, t)) return null;
	const e = estimateAttack(w, at, t);
	const losses = e.result.losses + e.support.reduce((n, s) => n + s.losses, 0);
	return { unit: u, target: t, from, kills: e.stopped ? 0 : e.result.kills, losses, empties: e.fate !== null };
}

export const onObjective = (w: World, t: Position) => w.state.map.hexes[hexOf(w, t)].victorySide !== -1;

//What a strength point killed is worth by the target's class, and what one lost costs by the attacker's, in the points
//a hex is weighed in (advance.ts): the classic AI's values. Its artillery, its transports and what they carry are worth
//most; a tank's loss is cheap, a gun's or an aircraft's dear
const KILL_WORTH = [0, 50, 25, 30, 10, 10, 5, 150, 150, 10, 50, 100, 100, 150, 50, 50, 50, 100, 150, 50, 50, 50];
const LOSS_COST = [0, 5, 5, 10, 10, 5, 10, 40, 20, 10, 5, 30, 30, 40, 15, 10, 10, 40, 40, 10, 10, 10];

/** What a strike is worth beside a hex's worth: its kills by the target's class less its losses by the unit's. */
export function strikeWorth(w: World, s: Strike): number {
	return s.kills * KILL_WORTH[unitData(w, s.target).uclass] - s.losses * LOSS_COST[unitData(w, s.unit).uclass];
}

/**
 * Whether an attack is worth ordering: it kills, and no more than it loses, but on an objective for a side pressed
 * for time (the last turns, behind schedule), where taking it is worth what it costs.
 */
export function isWorth(w: World, s: Strike, pressed: boolean): boolean {
	if (s.kills < MIN_KILLS || s.losses >= s.unit.strength) return false;
	return s.losses <= s.kills || (pressed && onObjective(w, s.target));
}

export const canFireNow = (u: UnitState) => !u.hasFired && ammoOf(u) > 0;

/** The better of two strikes by what they are worth, the first when equal. */
export function better(a: Strike | null, b: Strike | null): Strike | null {
	if (a === null || b === null) return a ?? b;
	return gainOf(b) > gainOf(a) ? b : a;
}

/** A strike's commands, the move to its hex first, when the core allows the first. */
export function strikeCommands(w: World, s: Strike | null): Command[] | null {
	if (s === null) return null;
	const attack: Command = { type: "attack", unit: s.unit.id, target: s.target.id };
	const commands: Command[] = s.from === null ? [attack] : [{ type: "move", unit: s.unit.id, to: s.from }, attack];
	return check(w, commands[0]) === null ? commands : null;
}
