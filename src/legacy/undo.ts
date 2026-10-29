/**
 * UndoSlot - the last move of a human player's unit while it can be taken back, as the screen and the
 * save read it (the game's state keeps it: turn.undoable, docs/STATE.md D5)
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 *
 * The unit, the unit as it was before the move (where it stood, its fuel and moves...) and what the
 * move's capture changed. The core plays the undo (src/core/commands/undo.ts); the game's objects hold
 * the slot as the state has it (src/legacy/mirror.ts).
 */

import type { Unit } from "./unit";

export class UndoSlot {
	declare unit: Unit; //Current unit properties
	declare savedUnit: Unit; //Old state unit properties (fuel, movesleft)
	declare oldOwner: number; //If changed owner of the hex
	declare oldFlag: number; //If changed a flag
	declare oldVictorySide: number; //If an objective was captured
	declare prestigeGain: number; //If player got any prestige
	declare scoreGain: number; //If player got any score
	declare objectiveIndex: number; //Where the objective captured was in its side's list (#141), null for none

	constructor() {
		this.unit = null;
		this.savedUnit = null;
		this.oldOwner = null;
		this.oldFlag = null;
		this.oldVictorySide = null;
		this.prestigeGain = 0;
		this.scoreGain = 0;
		this.objectiveIndex = null;
	}

	clear() {
		this.unit = this.savedUnit = null;
		this.oldVictorySide = this.oldOwner = this.oldFlag = this.objectiveIndex = null;
		this.prestigeGain = this.scoreGain = 0;
	}

	//Whether the last move was unit's and can be undone
	canUndo(unit: Unit): boolean {
		if (this.unit !== null && this.unit.id == unit.id)
			return true;
		return false;
	}
}
