/**
 * Ruleset: the rules a game plays by, as data (the movement tables, the class leaders, the combat steps).
 * classicRules is the original's game, which the contracts and verify pin; remasterRules is the default for
 * new games, where the remaster's changes to the mechanics and the AI go. A game plays by one of them from
 * its start to its end (the save names it)
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

import { aiDefaultConfig, groundCondition, leaderType, movTableDry, movTableFrozen, movTableMud } from "./tables";
import { classicCombat } from "./combat";
import type { Ruleset } from "./types";

const L = leaderType;
//The leaders a unit class can get, by unitClass (the original's Leaders.unitClassLeaders): the first is the
//class leader, which every unit with a leader has too, the others are the ones a unit can win
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
	airAttacksNextHex: false,
	checkTargets: false,
	deployOnOwnTowns: false,
	waitingUnitsFight: false,
	wholeLeaderList: false,
	defenderHoldsOut: false,
	captureNeedsObjectives: false,
	terrainLimitsInitiative: false,
	initiativeModifiers: false,
	unmountsWithoutTransport: false,
	mountedGunsDontCapture: false,
	checksTheShop: false,
	reconIgnoresZoc: false,
	airZoc: false,
	weatherChanges: false,
	weatherLimitsCombat: false,
	weatherLimitsSpotting: false,
	weatherLimitsSupply: false,
	snowDoublesFuel: false,
	ai: { config: aiDefaultConfig, attackerEntrenchment: 1 },
};

/** The remaster's rules: the classic ones plus the changes below, each measured in the AI arena (docs/ai/arena.md). */
export const remasterRules: Ruleset = {
	...classicRules,
	name: "remaster",
	//An aircraft hits a ground unit on the next hex as in PG2, for a person and the AI alike, and the
	//core refuses an attack the screen doesn't list (#285)
	airAttacksNextHex: true,
	checkTargets: true,
	//A side with no deployment hex deploys what it buys on its own cities, airfields and ports (#302)
	deployOnOwnTowns: true,
	//A side with units waiting to deploy or to arrive isn't eliminated (#115)
	waitingUnitsFight: true,
	//A new leader can be any of the class's list, its last two included (#78)
	wholeLeaderList: true,
	//At the turn limit the attacker that didn't take all its objectives loses and the defender that held out
	//wins, once both sides have played their last turn (#256)
	defenderHoldsOut: true,
	//A defender that had no objective to take at the start doesn't win by retaking one it lost (#91)
	captureNeedsObjectives: true,
	//The defender's terrain caps both sides' initiative: a fast tank loses its edge in a city or a forest (#14)
	terrainLimitsInitiative: true,
	//Initiative counts experience and a random factor, and is zero for an attacker that is surprised or meets a
	//rugged defense (#18)
	initiativeModifiers: true,
	unmountsWithoutTransport: true,
	//A mounted gun doesn't capture: its own class is tested, not its transport's (#544)
	mountedGunsDontCapture: true,
	//Buy and upgrade offer only what the equipment window did, for the AI too (#444)
	checksTheShop: true,
	//A recon unit enters an enemy zone of control for the hex's cost and moves on; a hidden enemy still
	//surprises it (#4)
	reconIgnoresZoc: true,
	//An aircraft stops next to an enemy aircraft its side sees, as a ground unit does next to an enemy one;
	//ground units and aircraft still ignore each other's zone (#18)
	airZoc: true,
	//The weather changes from round to round, in fronts that last, by the area and the month (#591)
	weatherChanges: true,
	//What the weather does, as the manual says: rain and snow halve the strength a ground unit fires with and
	//keep aircraft and air defence from firing, overcast halves an aircraft's; bad weather halves spotting and the
	//supply out of towns; snow on the ground (frozen) doubles a move's fuel. All Weather Combat ignores it (#1)
	weatherLimitsCombat: true,
	weatherLimitsSpotting: true,
	weatherLimitsSupply: true,
	snowDoublesFuel: true,
	//An attacker's units don't stay glued to their hexes for the entrenchment they dug: away from the
	//enemy, the side that must take objectives gets none of the bonus for staying, the defender all of
	//it (#235)
	ai: { ...classicRules.ai, attackerEntrenchment: 0 },
};

/** The ruleset of a name; a name it doesn't know (a save from before the rulesets) plays the classic rules. */
export const rulesetNamed = (name: string | undefined): Ruleset => name === remasterRules.name ? remasterRules : classicRules;

/** The movement costs of a movement method on the scenario's ground; an unknown ground moves as dry. */
export function moveCosts(rules: Ruleset, ground: number, movmethod: number): number[] {
	const table = ground === groundCondition.frozen || ground === groundCondition.mud ? rules.movement[ground]
		: rules.movement[groundCondition.dry];
	return table[movmethod];
}
