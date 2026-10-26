/**
 * Estimate - an attack before it is made, as its sequence will play it (fight.ts resolveAttack and
 * endAttack) with the estimate in place of the dice: the support fire the attacker's side can see,
 * the attack, and what follows for the defender. Draws nothing: the attack preview's numbers (#347)
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

import { unitClass } from "../prototypes";
import { supportFireUnits } from "./attack";
import { attackResult, isLossOverRetreatThreshold, shouldDefenderRetreat } from "./combat";
import { directionTo } from "./geometry";
import { isBridgeForSide, retreatPosition } from "./movement";
import type { CombatResult, Contribution, UnitId, UnitState, World } from "./types";
import { hexIndex, isSpotted, sideOf } from "./world";

//A support fire shot on the attacker: the gun and the strength it is estimated to take
export interface SupportShot {
	unit: UnitId;
	losses: number;
}

//What happens to the defender after the attack: destroyed, it falls back, or it surrenders with
//nowhere to go; null: it holds
export type DefenderFate = "destroyed" | "retreats" | "surrenders" | null;

//An attack estimated: the attack's own result and what each combat step contributed to it (an
//overrun's kills are the defender's strength, no return fire), the support fire before it, whether
//the support fire's losses stop the attack, and the defender's fate. kills and losses are the
//target's and the attacker's from the attack alone, each at most the unit's strength
export interface AttackEstimate {
	result: CombatResult;
	record: Contribution[];
	support: SupportShot[];
	stopped: boolean;
	fate: DefenderFate;
}

//The guns that will fire on the attacker first that its side sees (combat.ts combatResult counts
//only those): none when the attacker is surprised
function seenSupport(w: World, atk: UnitState, def: UnitState): UnitState[] {
	if (atk.isSurprised) return [];
	const side = sideOf(w, atk);
	return supportFireUnits(w, atk, def).filter((s) => isSpotted(w, hexIndex(w, s.row, s.col), side) || s.tempSpotted);
}

//The defender as it stands after the attack, for its retreat: its losses taken, facing the attacker
//unless on a bridge of its side, off its transport when it is infantry attacked mounted (fight.ts)
function defenderAfter(w: World, atk: UnitState, def: UnitState, kills: number): UnitState {
	const facing = isBridgeForSide(w, hexIndex(w, def.row, def.col), sideOf(w, def)) ? def.facing
		: directionTo(def.row, def.col, atk.row, atk.col);
	const dismount = def.isMounted && !def.isSurprised && w.equipment[def.eqid].uclass === unitClass.infantry;
	return { ...def, strength: def.strength - kills, facing, isMounted: dismount ? false : def.isMounted };
}

//The defender's fate after the attack's estimated kills (fight.ts endAttack)
function fateOf(w: World, atk: UnitState, def: UnitState, kills: number): DefenderFate {
	if (kills >= def.strength) return "destroyed";
	const after = defenderAfter(w, atk, def, kills);
	if (!shouldDefenderRetreat(w, atk, after, def.strength)) return null;
	return retreatPosition(w, after) === null ? "surrenders" : "retreats";
}

//atk's attack on def estimated, as resolveAttack plays it: the overrun decided first by the
//estimate at full strength; else the support fire, then the attack with the strength the support
//fire left the attacker
export function estimateAttack(w: World, atk: UnitState, def: UnitState): AttackEstimate {
	const record: Contribution[] = [];
	const first = attackResult(w, atk, def, null);
	if (first.isOverrun) {
		const result = attackResult(w, atk, def, null, record);
		record.push({ name: "overrun", side: "attacker", field: "kills", before: result.kills, after: def.strength });
		const overrun = { ...result, kills: def.strength, losses: 0, defcanfire: false };
		return { result: overrun, record, support: [], stopped: false, fate: "destroyed" };
	}
	const support = seenSupport(w, atk, def).map((s) => ({ unit: s.id, losses: attackResult(w, s, atk, null).kills }));
	const left = Math.max(0, atk.strength - support.reduce((n, s) => n + s.losses, 0));
	const stopped = left <= 0 || isLossOverRetreatThreshold(left, atk.strength);
	const result = attackResult(w, { ...atk, strength: left }, def, null, record);
	result.kills = Math.min(result.kills, def.strength);
	result.losses = Math.min(result.losses, left);
	return { result, record, support, stopped, fate: stopped ? null : fateOf(w, atk, def, result.kills) };
}
