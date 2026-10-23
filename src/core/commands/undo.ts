/**
 * Undo the last move (D5): the state keeps whether it can be undone and what the move changed
 * (turn.undoable, the old engine's single slot); the states before are the caller's
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

import type { CommandOf } from "../../commands";
import { addScore, emit, playerAt, relocate, writeHex, writePlayer } from "../draft";
import { reselect, updateVictorySides } from "../moves";
import type { CommandHandler } from "../types";
import { hexIndex, unitById } from "../world";
import { unitCheck } from "./common";

//Map.undoLastMove: the unit as it was before the move, back where it stood (it spots from there
//again: #140, the enemy units it sees there are marked seen), the hex it took given back (#141: at
//the end of its side's list), the prestige and score taken back
export const undo: CommandHandler<CommandOf<"undo">> = {
	check(w, cmd) {
		const slot = w.state.turn.undoable;
		return unitCheck(w, cmd.unit, (u) => slot !== null && slot.unit === u.id, "can't undo");
	},
	run(d, cmd) {
		const slot = d.state.turn.undoable, before = slot.before;
		const at = unitById(d, cmd.unit), from = { row: at.row, col: at.col };
		emit(d, { type: "undone", unit: cmd.unit, from, to: { row: before.row, col: before.col } });
		//(Unit.copy: every field but tempSpotted; a transport only when the saved unit has one)
		relocate(d, cmd.unit, before, (u) => {
			Object.assign(u, before, { row: u.row, col: u.col, tempSpotted: u.tempSpotted,
				transport: before.transport !== null ? { ...before.transport } : u.transport });
		});
		reselect(d, cmd.unit);
		const player = playerAt(d, unitById(d, cmd.unit).owner);
		const hex = hexIndex(d, from.row, from.col);
		if (slot.oldOwner !== null) writeHex(d, hex).owner = slot.oldOwner;
		if (slot.oldFlag !== null) writeHex(d, hex).flag = slot.oldFlag;
		if (slot.oldVictorySide !== null) {
			updateVictorySides(d, ~player.side & 1, from);
			writeHex(d, hex).victorySide = slot.oldVictorySide;
		}
		writePlayer(d, player.id).prestige -= slot.prestigeGain;
		addScore(d, player.id, -slot.scoreGain);
		d.state.turn.undoable = null;
	},
};
