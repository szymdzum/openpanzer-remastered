//The attack cursor's view model: over the target the pointer is on, the two numbers the original game's cursor shows
//(generateAttackCursor, reference/src/render.js), the attacker's losses and the target's, as combatResult counts them
//before the attack (the support fire its side sees included, no dice drawn). Tested in test/view-odds.test.ts
import { attackableUnit } from "../../core/attack";
import { samePlace } from "../../core/geometry";
import { combatResult } from "../../core/combat";
import type { Position, World } from "../../core/types";
import { hexIndex, sideOf, unitById } from "../../core/world";
import type { Selection } from "../map/mapview";

/** A side's loss, shown in its side's colour. */
export interface LossChip {
	side: number;
	loss: number;
}

/** The crosshair over the pointed target: your loss, theirs. */
export interface Glance {
	at: Position;
	yours: LossChip;
	theirs: LossChip;
}

/** Null unless the hovered hex is one of the selected unit's targets. */
export function glanceOf(w: World, sel: Selection | null, at: Position | null, airMode: boolean): Glance | null {
	if (sel === null || at === null || !sel.targets.some((c) => samePlace(c, at))) return null;
	const atk = unitById(w, sel.unit)!, def = attackableUnit(w, atk, hexIndex(w, at.row, at.col), airMode);
	if (def === null) return null;
	const cr = combatResult(w, atk, def, false, null);
	return { at: { row: at.row, col: at.col }, yours: { side: sideOf(w, atk), loss: cr.losses }, theirs: { side: sideOf(w, def), loss: cr.kills } };
}
