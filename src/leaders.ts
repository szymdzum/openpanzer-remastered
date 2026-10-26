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

import { leaderDescriptions, leaderType, unitClass } from "./prototypes";
import type { Unit } from "./unit";

//The Leaders module API. A leader is a leaderType value, -1 for none
export interface LeadersModule {
	unitClassLeaders: { [uclass: number]: number[] };
	description: [string, string][]; //[name, description] by leaderType
	getUnitClassLeader(unit: Unit | null): number;
	getUnitLeaderDescriptions(unit: Unit | null): [string, string][];
}

export var Leaders: LeadersModule = (function(Leaders: LeadersModule) { //Module start

//Leaders a unit class can get, by unitClass. The first one is the class leader, which every
//unit with a leader also has, the others are the random leaders a unit can get (the core's
//classicRules holds the same lists, src/core/rules.ts)
Leaders.unitClassLeaders = {};
//[name, description] by leaderType (src/prototypes.ts: the new UI reads them there)
Leaders.description = leaderDescriptions;

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


//The class leader of a unit that has a leader, -1 otherwise
Leaders.getUnitClassLeader = function(unit) {
	if (unit && unit.leader != -1)
		return Leaders.unitClassLeaders[unit.unitData().uclass][0];
	return -1;
}

//Checks if the unit has the leader, either as its own leader or as its class leader
//Returns the [name, description] of the unit leader and of its class leader
Leaders.getUnitLeaderDescriptions = function(unit) {
	if (!unit || unit.leader == -1) return [];

	const descriptions: [string, string][] = [];
	const classLeader = Leaders.getUnitClassLeader(unit);

	descriptions.push(Leaders.description[unit.leader]);
	descriptions.push(Leaders.description[classLeader]);
	return descriptions;
}
//------------------------ MODULE END ----------------------
return Leaders; }(Leaders || {} as LeadersModule)); //Module end giberish
