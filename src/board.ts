/**
 * MapBoard - the units on a map: the unit list and the ids, placing, moving and removing units
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 *
 * A unit and its hex point at each other (Hex.setUnit and delUnit keep both sides). GameMap places,
 * relocates and removes units through here, which also switches their zone of control and
 * spotting (MapVisibility), in the order GameMap always did. Nothing checks that the destination
 * is free (#74).
 */

import { Equipment } from "./equipment";
import type { GameMap, Hex, UnitImagesList } from "./map";
import type { MapVisibility } from "./visibility";
import type { Unit } from "./unit";

export class MapBoard
{
	declare map: GameMap;
	declare visibility: MapVisibility;
	declare units: Unit[]; //internal list of units
	declare images: UnitImagesList; //a "hash" of unique unit images used for caching
	declare uniqueID: number; //gets assigned as unique unit ID and incremented after each unit is added

	constructor(map: GameMap, visibility: MapVisibility)
	{
		this.map = map;
		this.visibility = visibility;
		this.units = [];
		this.images = {};
		this.uniqueID = 0;
	}

	//Adds a unit already on its hex (Hex.setUnit) to the map: a new id, its icons, its player and
	//flag, then its zone of control and spotting
	add(unit: Unit)
	{
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

		//Set zone of control and spotting range of this unit
		this.visibility.setUnit(unit, true);
	}

	//Puts a unit on hex and adds it to the map
	place(unit: Unit, hex: Hex)
	{
		hex.setUnit(unit);
		this.add(unit);
	}

	//Moves a unit from srcHex to dstHex: its zone of control and spotting off, the hexes, the facing
	//if given, then on again. Returns the enemy units it spotted for the first time
	relocate(unit: Unit, srcHex: Hex, dstHex: Hex, facing?: number): number
	{
		this.visibility.setUnit(unit, false); //remove old ZOC and spotting range
		srcHex.delUnit(unit);
		dstHex.setUnit(unit);
		if (facing !== undefined)
			unit.facing = facing;
		return this.visibility.setUnit(unit, true); //set new ZOC and spotting range
	}

	//Takes a unit off hex with its zone of control and spotting (it stays in the unit list)
	remove(unit: Unit, hex: Hex)
	{
		this.visibility.setUnit(unit, false); //remove old ZOC and spotting range
		hex.delUnit(unit);
	}
}
