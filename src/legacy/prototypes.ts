/**
 * Prototypes - Generic data structures
 *
 * http://www.linuxconsulting.ro
 * http://openpanzer.net
 *
 * Copyright (c) 2012 Nicu Pavel
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 *
 * Reconstructed from the Panzer Marshal 3.2.14 bundle, names and comments
 * carried over from the openpanzer 2.9 source where the code matches.
 */

import { leaderType } from "../core/tables";

export let weatherConditionNames = ["Fair", "Overcast", "Raining", "Snowing"];

//The country names by equipment set, a country's index in its set (Equipment.getCountryName reads them)
export let countryNames: { [eqpName: string]: string[] } = {
	"eqp-adlerkorps": ["Slovakia", "Belgium", "Bulgaria", "Czechoslovakia", "Denmark", "Finland",
		"France", "Germany", "Greece", "USA", "Hungary", "Turkey", "Italy", "Netherlands", "Norway",
		"Poland", "Portugal", "Romania", "Croatia", "Russia", "Sweden", "Allied Yugoslavia",
		"United Kingdom", "Yugoslavia", "Nationalist Spain", "Republican Spain", "Australia", "Canada",
		"Ethiopia", "New Zealand", "South Africa"],
	"eqp-pacific": ["New Zealand", "Panzerzug", "India", "Australia", "Hungary", "Japan", "France",
		"Germany", "Bulgaria", "U.S. Army", "Canada", "Turkey", "Italy", "Romania", "Thailand",
		"Nationalist Chinese", "Philippines", "Netherlands", "Afrika Korps", "Russia", "Poland",
		"Communist Chinese", "United Kingdom", "Mongolia", "Manchukuo", "U.S. Marines", "Republican",
		"Allied Forces", "Captured Equipment", "Axis Forces", "Arab Countries"]
};

//Lookup table used for rotation of animations for a certain direction
//Our animations are by default facing North table gives the radians for rotate
export let directionToRadians =
[
	Math.PI, //S
	5*Math.PI/6, //SSE
	3*Math.PI/4, //SE
	2*Math.PI/3, //ESE
	Math.PI/2, //E
	Math.PI/3, //ENE
	Math.PI/4, //NE
	Math.PI/6, //NNE
	0, //N
	11*Math.PI/6, //NNW
	7*Math.PI/4, //NW
	5*Math.PI/3, //WNW
	3*Math.PI/2, //W
	4*Math.PI/3, //WSW
	5*Math.PI/4, //SW
	7*Math.PI/6 //SSW
];

export let actionType = {
	move: 0,
	attack: 1,
	resupply: 2,
	reinforce: 3,
	upgrade: 4,
	buy: 5,
	deploy: 6,
	mount: 7,
	umount: 8,
	select: 9,
	endturn: 10,
	message: 11,
	viewport: 12
} as const; //(literal types: a program's action is a union by its type, src/legacy/ai.ts AIAction)

//What triggered end of the campaign/scenario
export let endGameType = {
	moveCapture: "moveCapture",			//Captured all objectives
	noTurnsLeft: "noTurnsLeft",			//No more turns left
	noEnemyLeft: "noEnemyLeft"			//All enemy units destroyed
};

export let endGameLossText: { [endType: string]: string } = {
	moveCapture: "Enemy has captured all your objectives !<br>",
	noTurnsLeft: "You don't have any turns left !<br>",
	noEnemyLeft: "All your units had been destroyed !<br>"
};

//The leaders' names and descriptions, by leaderType (Leaders.description is the same list)
export let leaderDescriptions: [string, string][] = [];
leaderDescriptions[leaderType.mechanizedVeteran] = [
	"Mechanized Veteran",
	"Air Defence unit may move and fire in the same turn."
];
leaderDescriptions[leaderType.tankKiller] = [
	"Tank Killer",
	"Anti-Tank unit will not receive a penalty for movement into combat."
];
leaderDescriptions[leaderType.marksman] = [
	"Marksman",
	"The artillery unit attack range is increased by one hex."
];
leaderDescriptions[leaderType.skilledInterceptor] = [
	"Skilled Interceptor",
	"Fighter unit can intercept multiple enemy fighters in the defensive phase."
];
leaderDescriptions[leaderType.tenaciousDefense] = [
	"Tenacious Defense",
	"The infantry unit ground defense factor is increased by 4."
];
leaderDescriptions[leaderType.eliteReconVeteran] = [
	"Elite Recon Veteran",
	"Recon unit spotting range is increased by two hexes."
];
leaderDescriptions[leaderType.skilledAssault] = [
	"Skilled Assault",
	"The tactical bomber cannot be surprised (out of the sun) while moving."
];
leaderDescriptions[leaderType.aggressiveTankManeuver] = [
	"Aggressive Tank Maneuver",
	"Tank movement factor is increased by 1."
];
leaderDescriptions[leaderType.aggressiveAttack] = [
	"Aggressive Attack",
	"Each of the unit attack values is increased by 2."
];
leaderDescriptions[leaderType.aggressiveManeuver] = [
	"Aggressive Maneuver",
	"The unit movement factor is increased by 1."
];
leaderDescriptions[leaderType.allWeatherCombat] = [
	"All Weather Combat",
	"The air unit is not affected by weather conditions. Note: This can only be awarded air units."
];
leaderDescriptions[leaderType.alpineTraining] = [
	"Alpine Training",
	"When moving the unit treats forest and mountain hexes as clear terrain."
];
leaderDescriptions[leaderType.battlefieldIntelligence] = [
	"Battlefield Intelligence",
	"The unit cannot be surprised."
];
leaderDescriptions[leaderType.bridging] = [
	"Bridging",
	"When moving the unit treats passable river hexes as rough terrain."
];
leaderDescriptions[leaderType.combatSupport] = [
	"Combat Support",
	"The unit provides both Resilience and Skilled Ground Attack abilities to all adjoining units during combat phases. Will aid inflicting losses and save from loses by 2 to 3 points each battle."
];
leaderDescriptions[leaderType.determinedDefense] = [
	"Determined Defense",
	"Each of the unit defense factors is increased by 2."
];
leaderDescriptions[leaderType.devastatingFire] = [
	"Devastating Fire",
	"The unit may fire twice in a turn."
];
leaderDescriptions[leaderType.ferociousDefense] = [
	"Ferocious Defense",
	"The unit entrenchment cannot be ignored by enemy units."
];
leaderDescriptions[leaderType.fireDiscipline] = [
	"Fire Discipline",
	"The unit will expend only one-half of an ammunition point each time it attacks."
];
leaderDescriptions[leaderType.firstStrike] = [
	"First Strike",
	"The unit will fire first against an enemy unit if it wins the initiative in a combat round."
];
leaderDescriptions[leaderType.forestCamouflage] = [
	"Forest Camouflage",
	"If in a forest hex the unit cannot be spotted by enemy units unless they move adjacent to it."
];
leaderDescriptions[leaderType.infiltrationTactics] = [
	"Infiltration Tactics",
	"The unit ignores enemy unit entrenchment when calculating combat results."
];
leaderDescriptions[leaderType.influence] = [
	"Influence",
	"Allows the unit to upgrade to better equipment at reduced prestige point cost."
];
leaderDescriptions[leaderType.liberator] = [
	"Liberator",
	"You receive double the normal number of prestige points for all objective and victory hexes captured by the unit."
];
leaderDescriptions[leaderType.overwatch] = [
	"Overwatch",
	"The unit will fire at any enemy unit that moves within its range. The enemy unit is automatically surprised, allowing your unit to fire first and at the enemy\u2019s close assault, rather than its ground defense, factor."
];
leaderDescriptions[leaderType.overwhelmingAttack] = [
	"Overwhelming Attack",
	"When attacking the unit will have an indeterminate number of the suppression points it would otherwise inflict converted to kills."
];
leaderDescriptions[leaderType.reconMovement] = [
	"Recon Movement",
	"The unit is permitted phased movement, just like reconnaissance units."
];
leaderDescriptions[leaderType.resilience] = [
	"Resilience",
	"The unit will suffer 1 to 3 fewer step casualties than normal units when attacked."
];
leaderDescriptions[leaderType.shockTactics] = [
	"Shock Tactics",
	"Any suppression which the unit inflicts on an enemy unit will last the entire player turn, not just the specific combat round."
];
leaderDescriptions[leaderType.skilledGroundAttack] = [
	"Skilled Ground Attack",
	"The unit will inflict 1 to 3 more step casualties than normal units when attacking."
];
leaderDescriptions[leaderType.skilledReconnaissance] = [
	"Skilled Reconnaissance",
	"The unit spotting range is increased by one hex."
];
leaderDescriptions[leaderType.streetFighter] = [
	"Street Fighter",
	"The unit ignores an enemy unit city entrenchment when calculating combat results."
];
leaderDescriptions[leaderType.superiorManeuver] = [
	"Superior Maneuver",
	"The unit may bypass enemy unit zones of control."
];

export let difficultyType = { historical: 0, tactical: 1, operational: 2 };

//The constructors are classes so other modules can type `new Cell(...)`. Fields are `declare`d:
//they emit nothing and the constructor bodies assign them as before
export class Cell {
	declare row: number;
	declare col: number;

	constructor(row: number, col: number) {
		this.row = row;
		this.col = col;
	}
}
//A movement or attack range cell (the core's MoveCell, src/core/movement.ts): its range from the
//selected unit, the cost to enter and to leave it, its terrain cost, whether the unit can stop and pass
//there
export interface extendedCell extends Cell {
	range: number;
	cin: number;
	cout: number;
	cost: number;
	canMove: boolean;
	canPass: boolean;
}

//A cell of a path (the core's shortest path), the cell before it as prev
export interface pathCell extends Cell {
	cost: number;
	prev: pathCell | null;
	dist: number;
	isVisible?: boolean; //on the cells of a move the enemy sees, render reads it
}

export class movementResults {
	declare isVisible: boolean;
	declare surpriseCell: Cell; //[] until a surprise contact sets it (see GameMap.moveUnit)
	declare isVictorySide: number;
	declare passedCells: Cell[];
	declare isCapture: boolean;

	constructor() {
		this.isVisible = false; //Move is at least partially visible on the player screen
		this.surpriseCell = [] as unknown as Cell; //Where did the surprise contact took place
		this.isVictorySide = -1; //Did it end in a scenario win for a side
		this.passedCells = []; //Which cell it passed so we can draw the animation in render accordingly
		this.isCapture = false; //Did it capture any kind of objective
	}
}

//An attack's results (the core's, src/core/combat.ts): the losses and the suppression of both sides,
//the experience gained, whether the defender fired back, the leaders gained, an overrun (a tank's) or
//a rugged defense (infantry's)
export interface combatResults {
	kills: number;
	losses: number;
	atkSuppress: number;
	defSuppress: number;
	atkExpGained: number;
	defExpGained: number;
	defcanfire: boolean;
	atkLeaderGain: boolean;
	defLeaderGain: boolean;
	isOverrun: boolean;
	isRugged: boolean;
}

export class Supply {
	declare ammo: number;
	declare fuel: number;
	declare transportAmmo: number;
	declare transportFuel: number;

	constructor(ammo: number, fuel: number, transportAmmo?: number, transportFuel?: number) {
		this.ammo = ammo;
		this.fuel = fuel;
		this.transportAmmo = transportAmmo || 0;
		this.transportFuel = transportFuel || 0;
	}
}
