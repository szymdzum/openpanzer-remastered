/**
 * MapVisibility - the spotting and zone of control counters of a map's hexes
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 *
 * Every hex counts the units of side 0 and 1 that have it in their zone of control and in their
 * spotting range. GameMap.allocMap makes the counters here and gives each Hex its own (Hex.isZOC and
 * isSpotted read them for the screen). They hold the core's sight, computed from the units (docs/
 * STATE.md D10): the game's objects get it after each command (src/mirror.ts). The harness switches
 * them by hand when it moves units by hand (GameRules.setZOCRange and setSpotRange, Hex.setZOC and
 * setSpotted); a counter doesn't go below 0.
 */

import type { GameMap } from "./map";

//The counters of one hex, by side
export class HexCounters {
	declare zoc: number[]; //Hex is in a unit zone of control from side 0 or 1
	declare spot: number[]; //Hex is spotted by a unit from side 0 or 1

	constructor() {
		this.zoc = [0, 0];
		this.spot = [0, 0];
	}
}

export class MapVisibility {
	declare map: GameMap;
	declare counters: HexCounters[][];

	constructor(map: GameMap) {
		this.map = map;
		this.counters = [];
	}

	//New counters, all 0, for a board of rows x cols (the hexes GameMap.allocMap makes next)
	alloc(rows: number, cols: number) {
		this.counters = new Array(rows);
		for (let i = 0; i < rows; i++) {
			this.counters[i] = new Array(cols);
			for (let j = 0; j < cols; j++)
				this.counters[i][j] = new HexCounters();
		}
	}

	//Switches one side's counter on (+1) or off (-1), counters don't go below 0
	static set(propList: number[], side: number, on: boolean) {
		if (side < propList.length) {
			if (on)
				propList[side]++;
			else if (propList[side] > 0)
				propList[side]--;
		}
	}

	//Whether one side's counter is above 0
	static isSet(propList: number[], side: number): boolean {
		if (side < propList.length && propList[side] > 0)
			return true;
		return false;
	}
}
