/**
 * Ruleset - the rules a game plays by, as data: the movement tables, the class leaders and the
 * combat steps. classicRules is today's game (#116); a remaster ruleset (#53) sits next to it
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

import { groundCondition, leaderType, movTableDry, movTableFrozen, movTableMud } from "../prototypes";
import { classicCombat } from "./combat";
import type { Ruleset } from "./types";

//By unitClass: infantry, tank, recon, antiTank, artillery, airDefence, fighter and tacticalBomber
//have one (Leaders.unitClassLeaders, the first of each list)
const classLeaders = [-1, leaderType.tenaciousDefense, leaderType.aggressiveTankManeuver, leaderType.eliteReconVeteran,
	leaderType.tankKiller, -1, -1, -1, leaderType.marksman, leaderType.mechanizedVeteran, leaderType.skilledInterceptor,
	leaderType.skilledAssault, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1];

export const classicRules: Ruleset = {
	name: "classic",
	movement: [movTableDry, movTableFrozen, movTableMud],
	classLeaders,
	combat: classicCombat,
};

//The movement costs of a movement method on the scenario's ground (Scenario.setMoveTable: an
//unknown ground condition moves as on dry ground)
export function moveCosts(rules: Ruleset, ground: number, movmethod: number): number[] {
	const table = ground === groundCondition.frozen || ground === groundCondition.mud ? rules.movement[ground]
		: rules.movement[groundCondition.dry];
	return table[movmethod];
}
