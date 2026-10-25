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

export let unitType = { none:-1, soft:0, hard:1, air:2, sea:3 };
export let unitTypeNames = ["Soft", "Hard", "Air", "Sea"];

export let unitClass = {
	none: 0, infantry: 1, tank: 2, recon: 3, antiTank: 4, flak: 5, fortification: 6,
	groundTransport: 7, artillery: 8, airDefence: 9, fighter: 10, tacticalBomber: 11,
	levelBomber: 12, airTransport: 13, submarine: 14, destroyer: 15, battleship: 16,
	carrier: 17, navalTransport: 18, battleCruiser: 19, cruiser: 20, lightCruiser: 21
};

export let unitClassNames =
[
	"No Class", "Infantry", "Tank", "Recon", "Anti Tank", "Flak", "Fortification",
	"Ground Transport", "Artillery", "Air Defence", "Fighter Aircraft", "Tactical Bomber",
	"Level Bomber", "Air Transport", "Submarine", "Destroyer", "Battleship",
	"Aircraft Carrier", "Naval Transport", "Battle Cruiser", "Cruiser", "Light Cruiser"
];

//How fast a unit class entrench
export let unitEntrenchRate = [0, 3, 1, 2, 2, 1, 1, 1, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

//Power of 2 bit masks. Hex with road value 136 means it has a road starting from mid of the hex
//and going NW (128) and one starting from mid of the hex and going SE (8)
export let roadType = {
	none:0, north:1, northeast: 2, eastunused: 4, southeast:8,
	south: 16, southwest: 32, westunused: 64, northwest: 128
};

//Compass (used for unit facing) counter clockwise
export let direction = {
	S:0, SSE:1, SE:2, ESE:3, E:4, ENE:5, NE:6, NNE:7, N:8, NNW:9, NW:10, WNW:11,
	W:12, WSW:13, SW:14, SSW:15
};

export let terrainType = {
	Clear:0, City:1, Airfield:2, Forest:3, Bocage:4, Hill:5, Mountain:6, Sand:7,
	Swamp:8, Ocean:9, River:10, Fortification:11, Port:12, Stream:13, Escarpment:14,
	impassableRiver:15, Rough:16
};

export let terrainNames =
[
	"Clear", "City", "Airfield", "Forest", "Bocage", "Hill", "Mountain", "Sand",
	"Swamp", "Ocean", "River", "Fortification", "Port", "Stream", "Escarpment",
	"Impassable river", "Rough"
];

//Clear, City, Airfield, Forest, Bocage, Hill, Mountain, Sand, Swamp, Ocean, River, Fortification, Port, Stream, Escarpment, impassableRiver, Rough, Roads
export let terrainEntrenchment = [ 0, 3, 0, 2, 2, 1, 2, 0, 0, 0, 0, 4, 1, 0, 0, 0, 2 ];
export let terrainInitiative = [ 99, 1, 99, 3, 3, 5, 1, 99, 2, 99, 99, 3, 5, 99, 99, 99, 3, 1 ];

export let groundCondition = { dry:0, frozen: 1, mud: 2 };
export let groundConditionNames = [ "Dry", "Frozen", "Mud" ];
export let groundFontEncoding = ["6", "8", "7"]; //openpanzer icon font mapping
export let weatherCondition = { fair:0, overcast: 1, rain: 2, snow: 3 };
export let weatherConditionNames = ["Fair", "Overcast", "Raining", "Snowing"];
export let weatherFontEncoding = ["4", "5", "1", "2"]; //openpanzer icon font mapping

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

export let playerSide = { axis: 0, allies: 1 };

export let sideNames =
[
	"Axis",
	"Allies"
];

export let movMethod = {
	tracked: 0, halfTracked: 1, wheeled: 2, leg: 3, towed: 4, air: 5,
	deepnaval: 6, costal: 7, allTerrainTracked: 8, amphibious: 9, naval: 10,
	allTerrainLeg: 11
};

export let movMethodNames =
[
	"Tracked", "Half Tracked", "Wheeled", "Leg", "Towed", "Air", "Deep Naval",
	"Costal", "All Terrain", "Amphibious", "Naval", "Mountain Leg"
];

export let outcomeNames: { [outcome: string]: string } = {
	"lose": "Defeat",
	"victory": "Victory",
	"tactical": "Tactical Victory",
	"briliant": "Brilliant Victory"
};

//How a unit is carried: by sea, by air transport, or by air dropped
export let embarkType = { none: 0, naval: 1, airmobile: 2, airborne: 3 };

//Tables for movement cost for different ground conditions 254 Stop move (but select the tile), 255 Don't enter
export let movTableDry =
[
//Clear, City, Airfield, Forest, Bocage, Hill, Mountain, Sand, Swamp, Ocean, River, Fortification, Port, Stream, Escarpment, impassableRiver, Rough, Roads
[1, 1, 1, 2, 4, 2, 254, 1, 4, 255, 254, 1, 1, 2, 255, 255, 2, 1], //Tracked
[1, 1, 1, 2, 254, 2, 254, 1, 4, 255, 254, 1, 1, 2, 255, 255, 2, 1], //Half Tracked
[2, 1, 1, 4, 254, 3, 254, 3, 254, 255, 254, 2, 1, 4, 255, 255, 2, 1], //Wheeled
[1, 1, 1, 2, 2, 2, 254, 2, 2, 255, 254, 1, 1, 1, 255, 255, 2, 1], //Leg
[1, 1, 1, 1, 1, 1, 254, 1, 255, 255, 254, 1, 1, 254, 255, 255, 1, 1], //Towed
[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], //Air
[255, 255, 255, 255, 255, 255, 255, 255, 255, 1, 255, 255, 1, 255, 255, 255, 255, 255], //Deep Naval
[255, 255, 255, 255, 255, 255, 255, 255, 255, 2, 1, 255, 1, 255, 255, 255, 255, 255], //Costal
[1, 1, 1, 2, 3, 3, 254, 2, 254, 255, 254, 1, 1, 1, 255, 255, 3, 1], //All Terrain Tracked
[1, 1, 1, 2, 4, 2, 254, 1, 3, 254, 3, 1, 1, 2, 255, 255, 2, 1], //Amphibious
[255, 255, 255, 255, 255, 255, 255, 255, 255, 1, 255, 255, 1, 255, 255, 255, 255, 255], //Naval
[1, 1, 1, 1, 2, 1, 1, 2, 2, 255, 254, 1, 1, 1, 255, 255, 1, 1] //All Terrain Leg (Mountain)
];

export let movTableFrozen =
[
//Clear, City, Airfield, Forest, Bocage, Hill, Mountain, Sand, Swamp, Ocean, River, Fortification, Port, Stream, Escarpment, impassableRiver, Rough, Roads
[1, 1, 1, 2, 4, 2, 254, 1, 2, 255, 2, 1, 1, 2, 255, 255, 2, 1], //Tracked
[1, 1, 1, 2, 254, 3, 254, 1, 2, 255, 2, 1, 1, 2, 255, 255, 3, 1], //Half Tracked
[2, 2, 2, 254, 254, 254, 254, 3, 3, 255, 3, 3, 2, 4, 255, 255, 4, 2], //Wheeled
[1, 1, 1, 2, 2, 2, 254, 2, 1, 255, 2, 1, 1, 1, 255, 255, 2, 1], //Leg
[1, 1, 1, 1, 1, 1, 254, 1, 1, 255, 254, 1, 1, 254, 255, 255, 1, 1], //Towed
[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], //Air
[255, 255, 255, 255, 255, 255, 255, 255, 255, 1, 255, 255, 1, 255, 255, 255, 255, 255], //Deep Naval
[255, 255, 255, 255, 255, 255, 255, 255, 255, 2, 255, 255, 1, 255, 255, 255, 255, 255], //Costal
[1, 1, 1, 2, 3, 3, 254, 2, 3, 255, 2, 1, 1, 1, 255, 255, 3, 1], //All Terrain Tracked
[1, 1, 1, 2, 4, 3, 254, 1, 3, 254, 2, 2, 1, 2, 255, 255, 3, 1], //Amphibious
[255, 255, 255, 255, 255, 255, 255, 255, 255, 1, 255, 255, 1, 255, 255, 255, 255, 255], //Naval
[1, 1, 1, 1, 2, 1, 2, 2, 1, 255, 2, 1, 1, 1, 255, 255, 2, 1] //All Terrain Leg (Mountain)
];

export let movTableMud =
[
//Clear, City, Airfield, Forest, Bocage, Hill, Mountain, Sand, Swamp, Ocean, River, Fortification, Port, Stream, Escarpment, impassableRiver, Rough, Roads
[2, 1, 1, 2, 4, 3, 254, 1, 254, 255, 254, 2, 1, 2, 255, 255, 3, 2], //Tracked
[3, 1, 1, 2, 254, 3, 254, 1, 254, 255, 254, 2, 1, 2, 255, 255, 3, 2], //Half Tracked
[4, 2, 2, 254, 254, 254, 254, 3, 254, 255, 254, 4, 2, 4, 255, 255, 254, 2], //Wheeled
[2, 1, 1, 2, 2, 2, 254, 2, 1, 255, 254, 2, 1, 1, 255, 255, 3, 1], //Leg
[2, 1, 1, 1, 1, 2, 254, 1, 255, 255, 254, 2, 1, 254, 255, 255, 2, 2], //Towed (Fortification 2: the bundle had 21, a typo, #23)
[2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], //Air
[255, 255, 255, 255, 255, 255, 255, 255, 255, 1, 255, 255, 1, 255, 255, 255, 255, 255], //Deep Naval
[255, 255, 255, 255, 255, 255, 255, 255, 255, 2, 255, 255, 1, 255, 255, 255, 255, 255], //Costal
[2, 1, 1, 2, 3, 3, 254, 2, 3, 255, 255, 2, 1, 1, 255, 255, 4, 2], //All Terrain Tracked
[1, 1, 1, 2, 4, 3, 254, 1, 3, 254, 3, 2, 1, 2, 255, 255, 3, 1], //Amphibious
[255, 255, 255, 255, 255, 255, 255, 255, 255, 1, 255, 255, 1, 255, 255, 255, 255, 255], //Naval
[2, 1, 1, 1, 3, 1, 3, 2, 1, 255, 254, 2, 1, 1, 255, 255, 3, 1] //All Terrain Leg (Mountain)
];


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

export let playerType = {
	humanLocal: 0,
	humanNetwork: 1,
	aiLocal: 2,
	aiServer: 3,
	aiScripted: 4
};

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
};

//The AI's settings: what it buys, when it reinforces and resupplies, how it scores
export interface AIConfig {
	minReinforceStrength: number; //reinforce below this strength even if the unit can still act
	minAmmo: number; //resupply below this ammo
	minFuel: number; //resupply below this fuel
	objectiveScore: number; //divided by the distance to the nearest objective
	attackLossesThreshold: number; //times the unit class loss cost, the score an attack must beat
	entrenchmentScore: number; //per entrenchment level, for staying in place
	minStrengthLossRatio: number; //minimum strength / expected losses to attack
	badAttackScore: number;
	unspottedFactor: number; //attacks on targets on unspotted hexes
	randomFactor: number[]; //a score is multiplied by one of these, picked at random
	prestigeReserve: number; //prestige not spent on buying units
	airPrestigeRatio: number; //of the prestige over the reserve, for air units
	maxUnitCost: number;
	minUnitCost: number;
	airPurchaseClasses: number[];
	groundPurchaseClasses: number[];
	//By unit class: the cost of losing strength and the value of killing strength
	unitClassLossCost: number[];
	unitClassKillValue: number[];
}

//The settings of the bundle's AI (src/ai.ts and the new core's, src/core/ai.ts)
export let aiDefaultConfig: AIConfig = {
	minReinforceStrength: 4,
	minAmmo: 2,
	minFuel: 5,
	objectiveScore: 4000,
	attackLossesThreshold: 4,
	entrenchmentScore: 50,
	minStrengthLossRatio: 2.5,
	badAttackScore: -1000,
	unspottedFactor: 0.3,
	randomFactor: [0.8, 0.85, 0.9, 0.95, 1, 1.1, 1.15, 1.2],
	prestigeReserve: 1000,
	airPrestigeRatio: 0.3,
	maxUnitCost: 900,
	minUnitCost: 120,
	airPurchaseClasses: [unitClass.fighter, unitClass.tacticalBomber],
	groundPurchaseClasses: [unitClass.infantry, unitClass.infantry, unitClass.artillery, unitClass.antiTank,
		unitClass.tank, unitClass.infantry, unitClass.tank],
	unitClassLossCost: [0, 5, 5, 10, 10, 5, 10, 40, 20, 10, 5, 30, 30, 40, 15, 10, 10, 40, 40, 10, 10, 10],
	unitClassKillValue: [0, 50, 25, 30, 10, 10, 5, 150, 150, 10, 50, 100, 100, 150, 50, 50, 50, 100, 150, 50, 50, 50]
};

//Define prestige gains on different situations
export let prestigeGains = {
	flagCapture: 50,
	objectiveCapture: 150
};

//Define score gains
export let scoreGains = {
	coreUnit: -15, //initial score calculation number of core units * this score
	normalUnit: -5, //initial score calculation number of non core units * this score
	objectivePerTurn: +1000, //initial score calculation number of objectives to capture * this score / turns
	flagCapture: +50,
	objectiveCapture: +100,
	endTurn: -10,
	damage: +10, //per strength unit
	casualty: -5, //per strength unit
	casualtyCore: -10, //per strength unit
	reinforce: -5, //per strength unit
	resupply: -10 //per action
};

//A cloud save remembered in the settings (see UIBuilder), id is the cloud save id
export interface CloudSave {
	name: string;
	id: string;
}

export interface UISettings {
	airMode: boolean;
	strategicZoom: boolean;
	strategicZoomLevel: number;
	mapZoom: boolean;
	zoomLevel: number;
	uiScale: number;
	uiSize: number;
	uiSmallSize: number;
	hexGrid: boolean;
	showGridTerrain: boolean;
	muteUnitSounds: boolean;
	deployMode: boolean;
	markCombatUnits: boolean;
	markOwnUnits: boolean;
	markEnemyUnits: boolean;
	markFOW: boolean;
	noFOW: boolean;
	quickAnimation: boolean;
	hasTouch: boolean;
	use3D: boolean;
	useRetina: boolean;
	hdGraphics: boolean;
	allowZoom: boolean;
	isAI: number[];
	shownEndTurnTip: boolean;
	unitInfoVisibility: boolean;
	lastCloudSave: CloudSave[];
	showInfoToolTips: boolean;
	showDetailInfoToolTips: boolean;
	showHiddenVictoryHexes: boolean;
	classicRules: boolean;
}

//Holds the settings for the game ui and renderer
export let uiSettings: UISettings = {
	airMode: false,			//flag used to select between overlapping ground/air units
	strategicZoom: false,	//flag used to draw map in strategic zoom mode or not
	strategicZoomLevel: 1,	//The strategic map zoom level
	mapZoom: false,			//flag used to draw map in zoomed mode or not
	zoomLevel: 1,			//The mapZoom level
	uiScale: 1.0,			//The scale at which is UI elements are zoomed
	uiSize: 840,			//The size of UI windows width
	uiSmallSize: 470,		//The size of the small UI windows width
	hexGrid: false,			//flag to notify render if it should draw or not hex grid
	showGridTerrain: false,	//if terrain icons should be shown when hex grid in on
	muteUnitSounds: false,	//if unit combat sound should be muted
	deployMode: false,		//used for unit deployment
	markCombatUnits: true,	//To visually mark units that can still attack
	markOwnUnits: false,	//To visually mark own units on map
	markEnemyUnits: false,	//To visually mark enemy units on map
	markFOW: false,			//Make Fog Of War visible
	noFOW: false,			//Play without Fog Of War
	quickAnimation: false,	//Faster unit animations
	hasTouch: false,		//Set in UI if device has touch
	use3D: false,			//use transform3d/translate3d functions for animations
	useRetina: false,		//don't scale on retina displays devicePixelRatio > 1
	hdGraphics: true,		//@2x map and unit images on high density screens (from public/hd/, needs a reload)
	allowZoom: false,		//If user should be able to zoom in/out manually
	isAI: [0, 0, 0, 0],		//which player is played by AI
	shownEndTurnTip: false,	//if the end turn tip was already shown
	unitInfoVisibility: false,
	lastCloudSave: [],
	showInfoToolTips: true,
	showDetailInfoToolTips: false,
	showHiddenVictoryHexes: true,
	classicRules: false		//new games play the classic rules of Panzer Marshal 3.2.14, not the remaster's (#53)
};

//The rules a new game plays by, as the settings choose them (#53)
export const newGameRules = (): "classic" | "remaster" => uiSettings.classicRules ? "classic" : "remaster";

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

export let leaderType = {
	//Class Leaders
	mechanizedVeteran: 		1, 	//Air Defence unit may move and fire in the same turn.
	tankKiller: 			2,	//Anti-Tank unit will not receive a penalty for movement into combat .
	marksman:				3,	//The artillery unit’s attack range is increased by one hex.
	skilledInterceptor:		4,	//Fighter unit can intercept multiple enemy fighters in the defensive phase.
	tenaciousDefense:		5,	//The infantry unit’s ground defense factor is increased by 4.
	eliteReconVeteran:		6,	//Recon unit’s spotting range is increased by two hexes.
	skilledAssault:			7,	//The tactical bomber cannot be surprised ("out of the sun") while moving.
	aggressiveTankManeuver:	8,	//Tank’s movement factor is increased by 1.
	//Random Leaders:
	aggressiveAttack:		9,	//Each of the unit’s attack values is increased by 2.
	aggressiveManeuver:		10,	//The unit’s movement factor is increased by 1.
	allWeatherCombat:		11,	//The air unit is not affected by weather conditions. ''Note: This can only be awarded air units.''
	alpineTraining:			12,	//When moving the unit treats forest and mountain hexes as clear terrain.
	battlefieldIntelligence:13,	//The unit cannot be surprised.
	bridging:				14,	//When moving the unit treats passable river hexes as rough terrain.
	combatSupport:			15,	//The unit provides both Resilience and Skilled Ground Attack abilities to all adjoining units during combat phases. Will aid inflicting losses and save from loses by 2 to 3 points each battle.
	determinedDefense:		16,	//Each of the unit’s defense factors is increased by 2.
	devastatingFire:		17,	//The unit may fire twice in a turn.
	ferociousDefense:		18,	//The unit’s entrenchment cannot be ignored by enemy units.
	fireDiscipline:			19,	//The unit will expend only one-half of an ammunition point each time it attacks.
	firstStrike:			20,	//The unit will fire first against an enemy unit if it wins the initiative in a combat round.
	forestCamouflage:		21,	//If in a forest hex the unit cannot be spotted by enemy units unless they move adjacent to it.
	infiltrationTactics:	22,	//The unit ignores enemy unit entrenchment when calculating combat results.
	influence:				23,	//Allows the unit to upgrade to better equipment at reduced prestige point cost.
	liberator:				24,	//You receive double the normal number of prestige points for all objective and victory hexes captured by the unit.
	overwatch:				25,	//The unit will fire at any enemy unit that moves within its range. The enemy unit is automatically surprised, allowing your unit to fire first and at the enemy’s close assault, rather than its ground defense, factor.
	overwhelmingAttack:		26,	//When attacking the unit will have an indeterminate number of the suppression points it would otherwise inflict converted to kills.
	reconMovement:			27,	//The unit is permitted phased movement, just like reconnaissance units.
	resilience:				28,	//The unit will suffer 1 to 3 fewer step casualties than normal units when attacked.
	shockTactics:			29,	//Any suppression which the unit inflicts on an enemy unit will last the entire player’s turn, not just the specific combat round.
	skilledGroundAttack:	30,	//The unit will inflict 1 to 3 more step casualties than normal units when attacking.
	skilledReconnaissance:	31,	//The unit’s spotting range is increased by one hex.
	streetFighter:			32,	//The unit ignores an enemy unit’s city entrenchment when calculating combat results.
	superiorManeuver:		33	//The unit may bypass enemy units’ zones of control.
};

export let difficultyType = { historical: 0, tactical: 1, operational: 2 };

export interface DifficultyModifier {
	startPrestige: number;
	turnPrestige: number;
	extraTurns: number;
	scoreCoef: number;
}

//Prestige and turn modifiers for each difficultyType
export let difficultyModifiers: { [difficulty: number]: DifficultyModifier } = {
	0: { startPrestige: 0, turnPrestige: 0, extraTurns: 1, scoreCoef: 1 },		//historical
	1: { startPrestige: 0.2, turnPrestige: 0.1, extraTurns: 1.2, scoreCoef: 0.8 },	//tactical
	2: { startPrestige: 0.5, turnPrestige: 0.25, extraTurns: 1.5, scoreCoef: 0.5 }	//operational
};

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

export class mouseInfo {
	declare x: number;
	declare y: number;
	declare rclick: boolean;

	constructor(x: number, y: number, rclick: boolean) {
		this.x = x;
		this.y = y;
		this.rclick = rclick;
	}
}

export class screenPos {
	declare x: number;
	declare y: number;

	constructor(x: number, y: number) {
		this.x = x;
		this.y = y;
	}
}

//"3.2.14" -> "3.2"
export function major_version(version: string): string {
	return version.split(".").slice(0, 2).join(".");
}

export let UNIT_MAX_EXPERIENCE = 500; //Experience cap of a unit
export let UNIT_RETREAT_THRESHOLD = 0.6; //Percentage of losses for which a unit starts to retreat
export let CURRENCY_MULTIPLIER = 12; //PG2 uses this multiplier for unit costs defined in equipment
//The prestige icon in the game's texts: the windows' costs, the tutorial's messages ({prestige})
export const CURRENCY_ICON = "<img src='resources/ui/dialogs/equipment/images/currency.png'/>";
export let UPGRADE_PENALTY = 1.2; //Upgrade costs is multiplied with this value
export let OVERSTRENGTH_PENALTY = 1.2; //Overstrength reinforcement costs is multiplied with this value
export let SCENARIO_START_PRESTIGE = 2000; //Start prestige for scenarios played outside of a campaign
export let PROTOTYPE_MIN_COST = 200; //Don't give players prototypes that are cheaper than this (with CURRENCY_MULTIPLIER)
export let DEBUG_CAMPAIGN = false; //If victory choices buttons should be shown for easy campaign progress
export let DEBUG_AI_MOVES = false; //If we should show AI moves (used in game.js)
export let VERSION = "3.2.14";
export let MAJOR_VERSION = major_version(VERSION);
//The scenario a first start (and the UI's "new game" fallback) plays: Game.defaultScenario
export const DEFAULT_SCENARIO = "tutorial.xml";

export let NATIVE_PLATFORM = "generic";
