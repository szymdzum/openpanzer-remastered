/**
 * Ruleset - the rules a game plays by, as data: the movement tables, the class leaders and the
 * combat steps. classicRules is today's game (#116), the one the contracts and verify pin against the
 * original; remasterRules (#53) the default for new games, where the remaster's changes to the
 * mechanics and the AI go. A game plays by one of them from its start to its end (the save names it)
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

import { aiDefaultConfig, groundCondition, leaderType, movTableDry, movTableFrozen, movTableMud } from "../prototypes";
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
	ai: { config: aiDefaultConfig, attackerEntrenchment: 1 },
};

//The remaster's rules: the classic ones until a change lands here, each measured in the AI arena
//(docs/ai/arena.md)
export const remasterRules: Ruleset = {
	...classicRules,
	name: "remaster",
	//An attacker's units don't stay glued to their hexes for the entrenchment they dug: away from the
	//enemy, the side that must take objectives gets none of the bonus for staying, the defender all of
	//it (#235)
	ai: { ...classicRules.ai, attackerEntrenchment: 0 },
};

//The ruleset of a name; a name it doesn't know (a save from before #53) plays the classic rules
export const rulesetNamed = (name: string | undefined): Ruleset => name === remasterRules.name ? remasterRules : classicRules;

//The movement costs of a movement method on the scenario's ground (Scenario.setMoveTable: an
//unknown ground condition moves as on dry ground)
export function moveCosts(rules: Ruleset, ground: number, movmethod: number): number[] {
	const table = ground === groundCondition.frozen || ground === groundCondition.mud ? rules.movement[ground]
		: rules.movement[groundCondition.dry];
	return table[movmethod];
}
