/**
 * State types - the game as plain data (the shapes of docs/STATE.md); toData and fromData, which read and
 * build the old engine's objects from them, are src/legacy/state.ts's
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

export type UnitId = number;
export type PlayerId = number;

export interface Position {
	row: number;
	col: number;
}

//What doesn't change during a game (D3): read-only, shared, never copied by a step
export interface ScenarioData {
	name: string;
	description: string;
	equipment: string;		//the equipment set (Scenario.eqp); absent when imported from a save without it
	image: string;			//the map image (GameMap.terrainImage)
	//How many objectives each side had to take at the scenario's start: the side with more attacks (#256).
	//Null in a save from before it was kept
	startObjectives: [number, number] | null;
	hexes: HexData[];		//flat, index row * cols + col (the size is the state's, MapState)
}

export interface HexData {
	terrain: number;
	road: number;			//roadType bit mask
	name: string;
	deployment: number;		//the player id that deploys here, -1 for none
}

export interface GameState {
	version: 1;
	scenario: ScenarioState;
	map: MapState;
	units: UnitState[];		//the units on the map, in the order they were placed (D2)
	nextUnitId: UnitId;		//lost by today's save (#85)
	players: PlayerState[];		//index == player id (D4)
	turn: TurnState;
	objectives: [Position[], Position[]];	//each side's victory hexes still to take, in their order (D7)
	reinforcements: ReinforcementState[];	//by turn, each turn's in their order
	rng: RngStreams | null;		//null while the game stream reads Math.random (a test seeds that)
	campaign: CampaignState | null;
	equipment: EquipmentState;
}

export interface ScenarioState {
	file: string;			//the scenario it was loaded from, for the record (D3)
	date: string;			//ISO date of the current turn
	turnsPerDay: number;
	dayTurn: number;		//lost by today's save (#55)
	atmospheric: number;
	ground: number;			//dry, frozen, mud: picks the movement table
	latitude: number;
	maxTurns: number;
	victoryTurns: number[];		//the last turns of a brilliant, a victory and a tactical victory
	expPerSide: [SideExperience, SideExperience];	//lost by today's save (#83)
	unitsCostPerSide: [number, number];
}

//The experience of a side's units at the start and how many there were: outside a campaign a
//bought unit gets the enemy side's average (Scenario.getSideUnitsAvgExp)
export interface SideExperience {
	exp: number;
	count: number;
}

export interface MapState {
	rows: number;
	cols: number;
	lastRowPartial: boolean;	//lost by today's save (#54)
	lastColPartial: boolean;
	hexes: HexState[];		//flat, index row * cols + col
}

//Only what changes during a game (D3)
export interface HexState {
	unit: UnitId | null;
	air: UnitId | null;
	owner: PlayerId;		//-1 for none
	flag: number;			//a country, -1 for none
	victorySide: number;		//-1 when not an objective
}

export interface UnitState {
	id: UnitId;			//given when the unit enters the map, never changed (D1)
	eqid: number;
	owner: PlayerId;		//no player object (D4)
	row: number;			//-1, -1: in the unit list on no hex (Player.setPlayerToHQ leaves its units so)
	col: number;
	transport: TransportState | null;
	carrier: number;		//an eqid, 0 for none; negative while disembarking
	strength: number;
	moveLeft: number;
	ammo: number;
	fuel: number;
	hits: number;
	experience: number;
	entrenchment: number;
	entrenchTicks: number;
	leader: number;			//-1 for none
	facing: number;
	flag: number;
	isCore: boolean;
	isMounted: boolean;
	hasMoved: boolean;
	hasFired: boolean;
	hasResupplied: boolean;
	hasOverstrength: boolean;
	isSurprised: boolean;
	tempSpotted: boolean;		//lost by today's save (#84)
}

export interface TransportState {
	eqid: number;
	ammo: number;
	fuel: number;
}

//A unit not on the map has no id (D1)
export type OffMapUnit = Omit<UnitState, "id" | "row" | "col">;

export interface PlayerState {
	id: PlayerId;
	side: number;
	country: number;
	type: number;			//human, AI, scripted, remote: the controller is not state (D6)
	prestige: number;
	prestigePerTurn: number[];
	score: number;
	playedTurn: number;
	airTransports: number;
	navalTransports: number;
	supportCountries: number[];
	dossier: Dossier;
	core: CoreUnit[];		//the player's core units in their order (#142)
}

//Campaign stats of a player, unit counts by unit class and scenario names by outcome
export interface PlayerDossier {
	units?: {
		lostaux?: { [uclass: number]: number };
		lostcore?: { [uclass: number]: number };
		killed?: { [uclass: number]: number };
	};
	outcomes?: { [outcome: string]: string[] }; //outcomeNames keys
}

//The campaign's statistics of a player: the units lost (core and auxiliary) and killed by unit
//class, the scenario names by outcome. Empty until Player.initDossier
export type Dossier = PlayerDossier;

//A core unit deployed (on the map, by id), bought or sent to HQ and waiting to be deployed (#149),
//or destroyed on the map and still in the list until the player goes to HQ (setPlayerToHQ drops it)
export type CoreUnit = { onMap: UnitId } | { reserve: OffMapUnit } | { lost: OffMapUnit };

export interface TurnState {
	turn: number;
	currentPlayer: PlayerId;	//lost by today's save (#71); -1 without players
	undoable: UndoState | null;	//the last move, while it can be taken back (D5)
}

//The last move of a human player's unit while it can be undone (UndoSlot): the unit, the unit as
//it was before the move (where it stood, its fuel and moves...) and what the move's capture
//changed, to put back
export interface UndoState {
	unit: UnitId;
	before: UnitState;
	oldOwner: number | null;	//null: the move captured nothing
	oldFlag: number | null;
	oldVictorySide: number | null;
	prestigeGain: number;
	scoreGain: number;
	objectiveIndex?: number;	//where the objective taken was in its side's list (#141); absent when none, or saved before
}

export interface ReinforcementState {
	turn: number;			//a number, not a string (#55)
	row: number;
	col: number;
	unit: OffMapUnit;
}

//The game's and the AI's random streams (D8): mulberry32, its whole state one 32-bit number
export type RngState = number;
export interface RngStreams {
	game: RngState;
	ai: RngState;
}

export interface CampaignState {
	id: number;			//its index in campaignlist
	file: string;			//its data file, which finds it again if the list changes
	scenario: number;		//the index of the scenario played in the campaign's data
	country: number;		//the campaign player's country
	difficulty: number;
	startPrestige: number;
	progress: CampaignProgress;
}

//What Game keeps in its closure between a campaign's scenarios
export interface CampaignProgress {
	isStart: boolean;		//the first scenario: its prestige, dossier and core units are set when it loads
	removeNonCampaignUnits: boolean;	//a later one: the scenario's own units on the deployment hexes go
	awardPrototype: boolean;	//after a brilliant victory: a prototype unit in the next scenario
}

//The index lists of a country file: equipment ids by unit class
export interface EquipmentIndexes {
	unitclass?: { [uclass: string]: number[] };
}

//The equipment lists by country and unit class as the game holds them now (D9): the purchase window
//sorts them in place, so their order decides what the AI buys next and which transport a unit
//embarks on. The AI's purchases no longer remove from them (#22)
export interface EquipmentState {
	indexes: { [country: string]: EquipmentIndexes };
}

export interface SavedGame {
	data: ScenarioData;
	state: GameState;
}
