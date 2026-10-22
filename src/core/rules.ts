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

const L = leaderType;
//The leaders a unit class can get, by unitClass (Leaders.unitClassLeaders): the first is the class
//leader, which every unit with a leader has too, the others are the ones a unit can win
const leaders = [
	[],
	[L.tenaciousDefense, L.aggressiveAttack, L.aggressiveManeuver, L.battlefieldIntelligence, L.determinedDefense,
		L.ferociousDefense, L.firstStrike, L.infiltrationTactics, L.liberator],
	[L.aggressiveTankManeuver, L.aggressiveAttack, L.aggressiveManeuver, L.battlefieldIntelligence, L.determinedDefense,
		L.firstStrike, L.infiltrationTactics, L.liberator],
	[L.eliteReconVeteran, L.aggressiveAttack, L.aggressiveManeuver, L.battlefieldIntelligence, L.determinedDefense,
		L.firstStrike, L.infiltrationTactics, L.liberator],
	[L.tankKiller, L.aggressiveAttack, L.aggressiveManeuver, L.battlefieldIntelligence, L.determinedDefense,
		L.ferociousDefense, L.firstStrike, L.infiltrationTactics, L.liberator],
	[], [], [],
	[L.marksman, L.aggressiveAttack, L.aggressiveManeuver, L.battlefieldIntelligence, L.determinedDefense, L.fireDiscipline,
		L.infiltrationTactics],
	[L.mechanizedVeteran, L.aggressiveAttack, L.aggressiveManeuver, L.determinedDefense, L.fireDiscipline, L.infiltrationTactics],
	[L.skilledInterceptor, L.aggressiveAttack, L.aggressiveManeuver, L.battlefieldIntelligence, L.determinedDefense, L.firstStrike],
	[L.skilledAssault, L.aggressiveAttack, L.aggressiveManeuver, L.determinedDefense, L.fireDiscipline, L.firstStrike],
	[], [], [], [], [], [], [], [], [], [],
];

export const classicRules: Ruleset = {
	name: "classic",
	movement: [movTableDry, movTableFrozen, movTableMud],
	leaders,
	classLeaders: leaders.map((list) => list.length ? list[0] : -1),
	combat: classicCombat,
};

//The movement costs of a movement method on the scenario's ground (Scenario.setMoveTable: an
//unknown ground condition moves as on dry ground)
export function moveCosts(rules: Ruleset, ground: number, movmethod: number): number[] {
	const table = ground === groundCondition.frozen || ground === groundCondition.mud ? rules.movement[ground]
		: rules.movement[groundCondition.dry];
	return table[movmethod];
}
