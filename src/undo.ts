/**
 * UndoSlot - the last move of a human player's unit, kept so it can be taken back
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 *
 * One move: GameMap.moveUnit saves the unit before it moves, captureHex what the move captured,
 * and the move can be undone if it spotted no new unit and wasn't surprised. Any other action
 * resets it. Undoing copies the saved unit back (Unit.copy), which gives the unit a copy of its
 * player instead of the map's player (#68).
 */

import { Unit } from "./unit";
import type { MapLastMove } from "./map";

export class UndoSlot implements MapLastMove
{
	declare unit: Unit; //Current unit properties
	declare savedUnit: Unit; //Old state unit properties (fuel, movesleft)
	declare oldOwner: number; //If changed owner of the hex
	declare oldFlag: number; //If changed a flag
	declare oldVictorySide: number; //If an objective was captured
	declare prestigeGain: number; //If player got any prestige
	declare scoreGain: number; //If player got any score

	constructor()
	{
		this.unit = null;
		this.savedUnit = null;
		this.oldOwner = null;
		this.oldFlag = null;
		this.oldVictorySide = null;
		this.prestigeGain = 0;
		this.scoreGain = 0;
	}

	clear()
	{
		this.unit = this.savedUnit = null;
		this.oldVictorySide = this.oldOwner = this.oldFlag = null;
		this.prestigeGain = this.scoreGain = 0;
	}

	//Saves unit's properties and hex before it moves, clearing what the slot held
	save(unit: Unit)
	{
		this.clear();
		this.savedUnit = new Unit(unit.eqid);
		this.savedUnit.copy(unit);
		this.savedUnit.setHex(unit.getHex());
	}

	//Whether the last move was unit's and can be undone
	canUndo(unit: Unit): boolean
	{
		if (this.unit !== null && this.unit.id == unit.id)
			return true;
		return false;
	}
}
