/**
 * createWorld: a world for the queries from a game's data and state, with the derived parts (the unit
 * index, the sight) built beside the state.
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

import { classicRules } from "./rules";
import { computeSight } from "./sight";
import type { EquipmentTable, GameState, Ruleset, ScenarioData, Sight, UnitId, World } from "./types";
import { emptySight, unitIndex } from "./world";

export interface WorldOptions {
	rules?: Ruleset;		//classicRules
	noFOW?: boolean;
	spotSide?: number;		//-1, no side
	destroyed?: ReadonlySet<UnitId>;
	sight?: Sight;			//given instead of computed (a test reads the legacy objects' counters)
}

/** The world of a saved game, its sight computed unless the options give one. */
export function createWorld(saved: { data: ScenarioData; state: GameState }, equipment: EquipmentTable,
	options: WorldOptions = {}): World {
	const { data, state } = saved;
	const w: World = {
		data, state, equipment, rules: options.rules || classicRules, noFOW: !!options.noFOW,
		spotSide: options.spotSide === undefined ? -1 : options.spotSide,
		destroyed: options.destroyed || new Set(), index: unitIndex(state),
		sight: options.sight || emptySight(state.map.rows * state.map.cols), scratch: null,
	};
	return options.sight ? w : { ...w, sight: computeSight(w) };
}
