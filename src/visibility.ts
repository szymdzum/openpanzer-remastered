/**
 * MapVisibility - the spotting and zone of control counters of a map's hexes
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 *
 * Every hex counts the units of side 0 and 1 that have it in their zone of control and in their
 * spotting range. GameMap.allocMap makes the counters here and gives each Hex its own (Hex.isZOC,
 * isSpotted, setZOC and setSpotted read and switch them, GameRules.setZOCRange and setSpotRange
 * call those). GameMap switches a unit's zone of control and spotting through here, at the points
 * it always did: on when a unit is placed or arrives, off before it leaves or is removed.
 *
 * The counters are kept by hand and drift (#72, #73): an off with nothing to remove is dropped (a
 * counter doesn't go below 0), and nothing re-applies a unit whose spotting range or air status
 * changed between its on and its off.
 */

import { GameRules } from "./gamerules";
import type { GameMap } from "./map";
import type { Unit } from "./unit";

//The counters of one hex, by side
export class HexCounters
{
	declare zoc: number[]; //Hex is in a unit zone of control from side 0 or 1
	declare spot: number[]; //Hex is spotted by a unit from side 0 or 1

	constructor()
	{
		this.zoc = [0, 0];
		this.spot = [0, 0];
	}
}

export class MapVisibility
{
	declare map: GameMap;
	declare counters: HexCounters[][];

	constructor(map: GameMap)
	{
		this.map = map;
		this.counters = [];
	}

	//New counters, all 0, for a board of rows x cols (the hexes GameMap.allocMap makes next)
	alloc(rows: number, cols: number)
	{
		this.counters = new Array(rows);
		for (let i = 0; i < rows; i++)
		{
			this.counters[i] = new Array(cols);
			for (let j = 0; j < cols; j++)
				this.counters[i][j] = new HexCounters();
		}
	}

	//A unit's zone of control, then its spotting, on or off. Returns the enemy units it spotted
	//for the first time (on), from GameRules.setSpotRange
	setUnit(unit: Unit, on: boolean): number
	{
		GameRules.setZOCRange(this.map.map, unit, on, this.map.rows, this.map.cols);
		return GameRules.setSpotRange(this.map.map, unit, on, this.map.rows, this.map.cols);
	}

	//Only a unit's spotting, on or off (mounting changes the spotting range)
	setSpotting(unit: Unit, on: boolean): number
	{
		return GameRules.setSpotRange(this.map.map, unit, on, this.map.rows, this.map.cols);
	}

	//Switches one side's counter on (+1) or off (-1), counters don't go below 0
	static set(propList: number[], side: number, on: boolean)
	{
		if (side < propList.length)
		{
			if (on)
				propList[side]++;
			else if (propList[side] > 0)
				propList[side]--;
		}
	}

	//Whether one side's counter is above 0
	static isSet(propList: number[], side: number): boolean
	{
		if (side < propList.length && propList[side] > 0)
			return true;
		return false;
	}
}
