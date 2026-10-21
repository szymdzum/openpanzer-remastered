/**
 * Leaders - Unit leaders (special abilities gained with experience) for HTML5 PG2
 *
 * http://www.linuxconsulting.ro
 * http://openpanzer.net
 *
 * Copyright (c) 2012 Nicu Pavel
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 *
 * Reconstructed from the Panzer Marshal 3.2.14 bundle, there is no 2.9 counterpart.
 */

import { leaderType, UNIT_MAX_EXPERIENCE, unitClass } from "./prototypes";
import type { Unit } from "./unit";
import { Rng } from "./rng";

//The Leaders module API. A leader is a leaderType value, -1 for none
export interface LeadersModule
{
	unitClassLeaders: { [uclass: number]: number[] };
	description: [string, string][]; //[name, description] by leaderType
	LEADER_CHANCE_THRESHOLD: number;
	generateLeader(unit: Unit | null): number;
	generateLeaderWithChance(unit: Unit | null, expGained: number): number;
	getUnitClassLeader(unit: Unit | null): number;
	unitHasLeader(unit: Unit | null, leader: number): boolean;
	getUnitLeaderDescriptions(unit: Unit | null): [string, string][];
}

export var Leaders: LeadersModule = (function(Leaders: LeadersModule) { //Module start

//Leaders a unit class can get, by unitClass. The first one is the class leader, which every
//unit with a leader also has, the others are the random leaders generateLeader picks from
Leaders.unitClassLeaders = {};
//[name, description] by leaderType
Leaders.description = [];
//A unit that gained an experience level gets a leader when its 0-10 roll is above this
Leaders.LEADER_CHANCE_THRESHOLD = 8;

Leaders.unitClassLeaders[unitClass.none] = [];
Leaders.unitClassLeaders[unitClass.infantry] = [
	leaderType.tenaciousDefense,
	leaderType.aggressiveAttack,
	leaderType.aggressiveManeuver,
	leaderType.battlefieldIntelligence,
	leaderType.determinedDefense,
	leaderType.ferociousDefense,
	leaderType.firstStrike,
	leaderType.infiltrationTactics,
	leaderType.liberator
];
Leaders.unitClassLeaders[unitClass.tank] = [
	leaderType.aggressiveTankManeuver,
	leaderType.aggressiveAttack,
	leaderType.aggressiveManeuver,
	leaderType.battlefieldIntelligence,
	leaderType.determinedDefense,
	leaderType.firstStrike,
	leaderType.infiltrationTactics,
	leaderType.liberator
];
Leaders.unitClassLeaders[unitClass.recon] = [
	leaderType.eliteReconVeteran,
	leaderType.aggressiveAttack,
	leaderType.aggressiveManeuver,
	leaderType.battlefieldIntelligence,
	leaderType.determinedDefense,
	leaderType.firstStrike,
	leaderType.infiltrationTactics,
	leaderType.liberator
];
Leaders.unitClassLeaders[unitClass.antiTank] = [
	leaderType.tankKiller,
	leaderType.aggressiveAttack,
	leaderType.aggressiveManeuver,
	leaderType.battlefieldIntelligence,
	leaderType.determinedDefense,
	leaderType.ferociousDefense,
	leaderType.firstStrike,
	leaderType.infiltrationTactics,
	leaderType.liberator
];
Leaders.unitClassLeaders[unitClass.flak] = [];
Leaders.unitClassLeaders[unitClass.fortification] = [];
Leaders.unitClassLeaders[unitClass.groundTransport] = [];
Leaders.unitClassLeaders[unitClass.artillery] = [
	leaderType.marksman,
	leaderType.aggressiveAttack,
	leaderType.aggressiveManeuver,
	leaderType.battlefieldIntelligence,
	leaderType.determinedDefense,
	leaderType.fireDiscipline,
	leaderType.infiltrationTactics
];
Leaders.unitClassLeaders[unitClass.airDefence] = [
	leaderType.mechanizedVeteran,
	leaderType.aggressiveAttack,
	leaderType.aggressiveManeuver,
	leaderType.determinedDefense,
	leaderType.fireDiscipline,
	leaderType.infiltrationTactics
];
Leaders.unitClassLeaders[unitClass.fighter] = [
	leaderType.skilledInterceptor,
	leaderType.aggressiveAttack,
	leaderType.aggressiveManeuver,
	leaderType.battlefieldIntelligence,
	leaderType.determinedDefense,
	leaderType.firstStrike
];
Leaders.unitClassLeaders[unitClass.tacticalBomber] = [
	leaderType.skilledAssault,
	leaderType.aggressiveAttack,
	leaderType.aggressiveManeuver,
	leaderType.determinedDefense,
	leaderType.fireDiscipline,
	leaderType.firstStrike
];
Leaders.unitClassLeaders[unitClass.levelBomber] = [];
Leaders.unitClassLeaders[unitClass.airTransport] = [];
Leaders.unitClassLeaders[unitClass.submarine] = [];
Leaders.unitClassLeaders[unitClass.destroyer] = [];
Leaders.unitClassLeaders[unitClass.battleship] = [];
Leaders.unitClassLeaders[unitClass.carrier] = [];
Leaders.unitClassLeaders[unitClass.navalTransport] = [];
Leaders.unitClassLeaders[unitClass.battleCruiser] = [];
Leaders.unitClassLeaders[unitClass.cruiser] = [];
Leaders.unitClassLeaders[unitClass.lightCruiser] = [];

//Leader name and description, by leaderType
Leaders.description[leaderType.mechanizedVeteran] = [
	"Mechanized Veteran",
	"Air Defence unit may move and fire in the same turn."
];
Leaders.description[leaderType.tankKiller] = [
	"Tank Killer",
	"Anti-Tank unit will not receive a penalty for movement into combat."
];
Leaders.description[leaderType.marksman] = [
	"Marksman",
	"The artillery unit attack range is increased by one hex."
];
Leaders.description[leaderType.skilledInterceptor] = [
	"Skilled Interceptor",
	"Fighter unit can intercept multiple enemy fighters in the defensive phase."
];
Leaders.description[leaderType.tenaciousDefense] = [
	"Tenacious Defense",
	"The infantry unit ground defense factor is increased by 4."
];
Leaders.description[leaderType.eliteReconVeteran] = [
	"Elite Recon Veteran",
	"Recon unit spotting range is increased by two hexes."
];
Leaders.description[leaderType.skilledAssault] = [
	"Skilled Assault",
	"The tactical bomber cannot be surprised (out of the sun) while moving."
];
Leaders.description[leaderType.aggressiveTankManeuver] = [
	"Aggressive Tank Maneuver",
	"Tank movement factor is increased by 1."
];
Leaders.description[leaderType.aggressiveAttack] = [
	"Aggressive Attack",
	"Each of the unit attack values is increased by 2."
];
Leaders.description[leaderType.aggressiveManeuver] = [
	"Aggressive Maneuver",
	"The unit movement factor is increased by 1."
];
Leaders.description[leaderType.allWeatherCombat] = [
	"All Weather Combat",
	"The air unit is not affected by weather conditions. Note: This can only be awarded air units."
];
Leaders.description[leaderType.alpineTraining] = [
	"Alpine Training",
	"When moving the unit treats forest and mountain hexes as clear terrain."
];
Leaders.description[leaderType.battlefieldIntelligence] = [
	"Battlefield Intelligence",
	"The unit cannot be surprised."
];
Leaders.description[leaderType.bridging] = [
	"Bridging",
	"When moving the unit treats passable river hexes as rough terrain."
];
Leaders.description[leaderType.combatSupport] = [
	"Combat Support",
	"The unit provides both Resilience and Skilled Ground Attack abilities to all adjoining units during combat phases. Will aid inflicting losses and save from loses by 2 to 3 points each battle."
];
Leaders.description[leaderType.determinedDefense] = [
	"Determined Defense",
	"Each of the unit defense factors is increased by 2."
];
Leaders.description[leaderType.devastatingFire] = [
	"Devastating Fire",
	"The unit may fire twice in a turn."
];
Leaders.description[leaderType.ferociousDefense] = [
	"Ferocious Defense",
	"The unit entrenchment cannot be ignored by enemy units."
];
Leaders.description[leaderType.fireDiscipline] = [
	"Fire Discipline",
	"The unit will expend only one-half of an ammunition point each time it attacks."
];
Leaders.description[leaderType.firstStrike] = [
	"First Strike",
	"The unit will fire first against an enemy unit if it wins the initiative in a combat round."
];
Leaders.description[leaderType.forestCamouflage] = [
	"Forest Camouflage",
	"If in a forest hex the unit cannot be spotted by enemy units unless they move adjacent to it."
];
Leaders.description[leaderType.infiltrationTactics] = [
	"Infiltration Tactics",
	"The unit ignores enemy unit entrenchment when calculating combat results."
];
Leaders.description[leaderType.influence] = [
	"Influence",
	"Allows the unit to upgrade to better equipment at reduced prestige point cost."
];
Leaders.description[leaderType.liberator] = [
	"Liberator",
	"You receive double the normal number of prestige points for all objective and victory hexes captured by the unit."
];
Leaders.description[leaderType.overwatch] = [
	"Overwatch",
	"The unit will fire at any enemy unit that moves within its range. The enemy unit is automatically surprised, allowing your unit to fire first and at the enemy\u2019s close assault, rather than its ground defense, factor."
];
Leaders.description[leaderType.overwhelmingAttack] = [
	"Overwhelming Attack",
	"When attacking the unit will have an indeterminate number of the suppression points it would otherwise inflict converted to kills."
];
Leaders.description[leaderType.reconMovement] = [
	"Recon Movement",
	"The unit is permitted phased movement, just like reconnaissance units."
];
Leaders.description[leaderType.resilience] = [
	"Resilience",
	"The unit will suffer 1 to 3 fewer step casualties than normal units when attacked."
];
Leaders.description[leaderType.shockTactics] = [
	"Shock Tactics",
	"Any suppression which the unit inflicts on an enemy unit will last the entire player turn, not just the specific combat round."
];
Leaders.description[leaderType.skilledGroundAttack] = [
	"Skilled Ground Attack",
	"The unit will inflict 1 to 3 more step casualties than normal units when attacking."
];
Leaders.description[leaderType.skilledReconnaissance] = [
	"Skilled Reconnaissance",
	"The unit spotting range is increased by one hex."
];
Leaders.description[leaderType.streetFighter] = [
	"Street Fighter",
	"The unit ignores an enemy unit city entrenchment when calculating combat results."
];
Leaders.description[leaderType.superiorManeuver] = [
	"Superior Maneuver",
	"The unit may bypass enemy unit zones of control."
];

//Returns a random leader for the unit from its class leaders, -1 if the class has none
//Bug kept: the roll range is length - 3, not length - 1, so it never picks the last two
//leaders of the list and with only 2 leaders it can pick the class leader (index 0)
Leaders.generateLeader = function(unit)
{
	if (!unit) return -1;

	const uclass = unit.unitData().uclass;
	const count = Leaders.unitClassLeaders[uclass].length;

	if (count < 2) return -1;

	const idx = Math.floor(Rng.random() * (count - 1 - 2)) + 1;
	return Leaders.unitClassLeaders[uclass][idx];
}

//Called after combat with the experience the unit gained: a unit at max experience always
//gets a leader, otherwise only when it went up an experience level and wins the roll.
//Returns the new leader or -1
Leaders.generateLeaderWithChance = function(unit, expGained)
{
	if (!unit || unit.leader != -1) return -1;

	const level = (unit.experience / 100) >> 0;
	const prevLevel = ((unit.experience - expGained) / 100) >> 0;
	//rolled even when it isn't used
	const roll = Math.floor(Rng.random() * (10 - level + 1)) + level;

	if (unit.experience >= UNIT_MAX_EXPERIENCE)
		return Leaders.generateLeader(unit);

	if (level - prevLevel <= 0)
		return -1;

	if (roll > Leaders.LEADER_CHANCE_THRESHOLD)
		return Leaders.generateLeader(unit);

	return -1;
}

//The class leader of a unit that has a leader, -1 otherwise
Leaders.getUnitClassLeader = function(unit)
{
	if (unit && unit.leader != -1)
		return Leaders.unitClassLeaders[unit.unitData().uclass][0];
	return -1;
}

//Checks if the unit has the leader, either as its own leader or as its class leader
Leaders.unitHasLeader = function(unit, leader)
{
	if (!unit || unit.leader == -1) return false;
	if (unit.leader == leader) return true;

	const classLeader = Leaders.getUnitClassLeader(unit);
	if (leader == classLeader)
		return true;
	return false;
}

//Returns the [name, description] of the unit leader and of its class leader
Leaders.getUnitLeaderDescriptions = function(unit)
{
	if (!unit || unit.leader == -1) return [];

	const descriptions: [string, string][] = [];
	const classLeader = Leaders.getUnitClassLeader(unit);

	descriptions.push(Leaders.description[unit.leader]);
	descriptions.push(Leaders.description[classLeader]);
	return descriptions;
}
//------------------------ MODULE END ----------------------
return Leaders; }(Leaders || {} as LeadersModule)); //Module end giberish
