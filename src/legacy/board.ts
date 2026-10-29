/**
 * MapBoard - the units on a map: the unit list and the ids, the image cache, a unit put on the map
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 *
 * A unit and its hex point at each other (Hex.setUnit and delUnit keep both sides). A game's objects
 * are made from its state (src/legacy/state.ts fromData) and follow it (src/legacy/mirror.ts): the spotting and
 * zone of control are the core's, computed from the units.
 */

import { Equipment } from "./equipment";
import type { GameMap, Hex, UnitImagesList } from "./map";
import type { Unit } from "./unit";

export class MapBoard {
	declare map: GameMap;
	declare units: Unit[]; //internal list of units
	declare images: UnitImagesList; //a "hash" of unique unit images used for caching
	declare uniqueID: number; //gets assigned as unique unit ID and incremented after each unit is added

	constructor(map: GameMap) {
		this.map = map;
		this.units = [];
		this.images = {};
		this.uniqueID = 0;
	}

	//Adds a unit already on its hex (Hex.setUnit) to the map: a new id, its icons, its player and flag
	add(unit: Unit) {
		//Assign an unique id to the unit
		unit.id = this.uniqueID;
		this.uniqueID++;

		this.units.push(unit);
		this.images[unit.eqid] = Equipment.equipment[unit.eqid].icon; //unit.getIcon(); //TODO rewrite this

		if (unit.transport !== null)
			this.images[unit.transport.eqid] = unit.transport.icon;

		if (unit.carrier > 0)
			this.images[unit.carrier] = Equipment.equipment[unit.carrier].icon;

		//Sets the player struct
		unit.player = this.map.getPlayer(unit.owner);

		//Some units have no flag defined put player country flag
		if (unit.flag == -1)
			unit.flag = unit.player.country + 1;
	}

	//Puts a unit on hex and adds it to the map
	place(unit: Unit, hex: Hex) {
		hex.setUnit(unit);
		this.add(unit);
	}
}
