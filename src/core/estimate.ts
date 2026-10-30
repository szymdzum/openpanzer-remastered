/**
 * An attack before it is made, as fight.ts resolveAttack and endAttack will play it with the estimate in
 * place of the dice: the support fire, the attack, what follows for the defender. Draws nothing.
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

import { supportFireUnits } from "./attack";
import {
	attackResult, dismountsWhenAttacked, isBrokenOff, isLossOverRetreatThreshold, isPinned, shouldDefenderRetreat, suppressedFor
} from "./combat";
import { directionTo } from "./geometry";
import { isBridgeForSide, retreatPosition } from "./movement";
import type { CombatResult, Contribution, UnitId, UnitState, World } from "./types";
import { hexIndex, isSpotted, sideOf } from "./world";

export interface SupportShot {
	unit: UnitId;
	losses: number;
	suppressed: number;
}

/** What happens to the defender after the attack; it surrenders when it has nowhere to retreat, null: it holds. */
export type DefenderFate = "destroyed" | "retreats" | "surrenders" | null;

/**
 * An attack estimated: its result with what each combat step contributed (an overrun's kills are the
 * defender's strength, no return fire), the support fire before it, and whether that fire's losses stop
 * the attack. kills and losses are from the attack alone, each at most the unit's strength.
 */
export interface AttackEstimate {
	result: CombatResult;
	record: Contribution[];
	support: SupportShot[];
	stopped: boolean;
	fate: DefenderFate;
}

//Only the guns its side sees count (combat.ts combatResult); none when the attacker is surprised.
function seenSupport(w: World, atk: UnitState, def: UnitState): UnitState[] {
	if (atk.isSurprised) return [];
	const side = sideOf(w, atk);
	return supportFireUnits(w, atk, def).filter((s) => isSpotted(w, hexIndex(w, s.row, s.col), side) || s.tempSpotted);
}

//As fight.ts leaves it: facing the attacker unless on a bridge of its side, off its transport when infantry.
function defenderAfter(w: World, atk: UnitState, def: UnitState, kills: number): UnitState {
	const facing = isBridgeForSide(w, hexIndex(w, def.row, def.col), sideOf(w, def)) ? def.facing
		: directionTo(def.row, def.col, atk.row, atk.col);
	const dismount = dismountsWhenAttacked(w, def);
	return { ...def, strength: def.strength - kills, facing, isMounted: dismount ? false : def.isMounted };
}

function fateOf(w: World, atk: UnitState, def: UnitState, result: CombatResult): DefenderFate {
	if (result.kills >= def.strength) return "destroyed";
	const after = defenderAfter(w, atk, def, result.kills);
	const pinned = isPinned(w, atk, after, suppressedFor(def) + result.defSuppress);
	if (!pinned && !shouldDefenderRetreat(w, atk, after, def.strength)) return null;
	return retreatPosition(w, after) === null ? "surrenders" : "retreats";
}

/** The overrun is decided first at full strength; else the support fire, then the attack with the strength it left. */
export function estimateAttack(w: World, atk: UnitState, def: UnitState): AttackEstimate {
	const record: Contribution[] = [];
	const first = attackResult(w, atk, def, null);
	if (first.isOverrun) {
		const result = attackResult(w, atk, def, null, record);
		record.push({ name: "overrun", side: "attacker", field: "kills", before: result.kills, after: def.strength });
		const overrun = { ...result, kills: def.strength, losses: 0, defcanfire: false };
		return { result: overrun, record, support: [], stopped: false, fate: "destroyed" };
	}
	const support = seenSupport(w, atk, def).map((s): SupportShot => {
		const r = attackResult(w, s, atk, null);
		return { unit: s.id, losses: r.kills, suppressed: r.defSuppress };
	});
	const left = Math.max(0, atk.strength - support.reduce((n, s) => n + s.losses, 0));
	const suppressed = support.reduce((n, s) => n + s.suppressed, 0), weakened = { ...atk, strength: left };
	const stopped = left <= 0 || isLossOverRetreatThreshold(left, atk.strength) || isBrokenOff(w, weakened, suppressed);
	const result = attackResult(w, weakened, def, null, record, suppressed);
	result.kills = Math.min(result.kills, def.strength);
	result.losses = Math.min(result.losses, left);
	return { result, record, support, stopped, fate: stopped ? null : fateOf(w, atk, def, result) };
}
