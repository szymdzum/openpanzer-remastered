/**
 * State - the game as plain data: toData reads it off the engine's objects, fromData builds them again
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 *
 * The shape and its decisions (D1-D11) are docs/STATE.md's. toData returns the scenario's static
 * data (ScenarioData, D3) and the state (GameState): no object points at another, a unit is
 * referred to by its id, a player by its index (D4), so a state can be copied with structuredClone
 * and compared with a deep equal. The harness and the engine contract compare it (#127); it will be
 * the save (#128) and the new core's state (#129).
 *
 * fromData builds the old engine's objects from it: the scenario, the map and its hexes, the
 * players, the units in their order and with their ids (D1, D2), the core lists, the undo slot,
 * the equipment lists, the game's and the AI's random streams (D8), and the campaign's progress
 * when given the game. It doesn't load anything: the equipment of the players' countries is loaded
 * already, and so is the campaign.
 *
 * What the old engine has and the state doesn't, on purpose: the selection (D6), the players'
 * handlers (picked from their type, D6), the spotting and zone of control counters (derived, D10:
 * fromData counts them again from the units, the drift of #72 and #73 is lost), the unit icons, a
 * reserve or reinforcement unit's stale id (D1), a destroyed unit still in the unit list (only
 * between an attack and the updateUnitList after it) and the fields only ever written
 * (hasRessuplied, nodossier, hasAnimation).
 */

import { Cell } from "./prototypes";
import { Equipment, type EquipmentIndexes } from "./equipment";
import { Transport, Unit } from "./unit";
import { type GameMap, Player, type PlayerDossier } from "./map";
import { Scenario } from "./scenario";
import { Rng } from "./rng";
import type { Campaign } from "./campaign";

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

//The equipment lists by country and unit class as the game holds them now (D9): the AI's
//purchases remove from them (#22) and the purchase window sorts them in place, so the lists
//themselves, not only what was removed, decide what the AI buys next and which transport a unit
//embarks on. Goes when #22 is fixed
export interface EquipmentState {
	indexes: { [country: string]: EquipmentIndexes };
}

//What toData and fromData read and set of the game beside its scenario (Game): the campaign and
//its progress in Game's closure. setCampaignProgress also links the scenario's campaign player
export interface CampaignHost {
	campaign: Campaign | null;
	getCampaignProgress(): CampaignProgress;
	setCampaignProgress(progress: CampaignProgress, scenario: Scenario): void;
}

export interface SavedGame {
	data: ScenarioData;
	state: GameState;
}

//The scenario (and, given the game, its campaign) as plain data. Only reads
export function toData(scenario: Scenario, host?: CampaignHost | null): SavedGame {
	const m = scenario.map;
	const units = m.getUnits();
	const data: ScenarioData = { name: scenario.name, description: scenario.getDescription(), equipment: scenario.eqp,
		image: m.terrainImage, hexes: [] };
	const hexes: HexState[] = [];
	for (let r = 0; r < m.rows; r++)
		for (let c = 0; c < m.cols; c++) {
			const h = m.map[r][c];
			data.hexes.push({ terrain: h.terrain, road: h.road, name: h.name, deployment: h.isDeployment });
			hexes.push({ unit: h.unit ? h.unit.id : null, air: h.airunit ? h.airunit.id : null, owner: h.owner,
				flag: h.flag, victorySide: h.victorySide });
		}
	const state: GameState = {
		version: 1,
		scenario: {
			file: scenario.file,
			date: scenario.date.toISOString(),
			turnsPerDay: scenario.turnsPerDay,
			dayTurn: scenario.dayTurn,
			atmospheric: scenario.atmosferic,
			ground: scenario.ground,
			latitude: scenario.latitude,
			maxTurns: m.maxTurns,
			victoryTurns: m.victoryTurns.slice(),
			expPerSide: [{ ...scenario.expPerSide[0] }, { ...scenario.expPerSide[1] }],
			unitsCostPerSide: [scenario.unitsCostPerSide[0], scenario.unitsCostPerSide[1]],
		},
		map: { rows: m.rows, cols: m.cols, lastRowPartial: m.isLastRowPartial, lastColPartial: m.isLastColPartial, hexes },
		units: units.map(unitState),
		nextUnitId: m.getBoard().uniqueID,
		players: m.getPlayers().map((p) => playerState(p, units)),
		turn: { turn: m.turn, currentPlayer: m.currentPlayer ? m.currentPlayer.id : -1, undoable: undoState(m) },
		objectives: [m.sidesVictoryHexes[0].map(position), m.sidesVictoryHexes[1].map(position)],
		reinforcements: reinforcements(scenario),
		rng: rngStreams(),
		campaign: host && host.campaign ? campaignState(host.campaign, host.getCampaignProgress()) : null,
		equipment: { indexes: structuredClone(Equipment.equipmentIndexes) },
	};
	return { data, state };
}

//Where the game's and the AI's streams are (D8): the cosmetic stream isn't state. Null while the
//game stream isn't seeded: it reads Math.random then (src/rng.ts), whose position nobody can read
function rngStreams(): RngStreams | null {
	return Rng.game.state === null || Rng.ai.state === null ? null : { game: Rng.game.state, ai: Rng.ai.state };
}

function position(c: Position): Position {
	return { row: c.row, col: c.col };
}

//A unit's fields but its id and position: of a Unit, or of a unit in a save of the format before
export function offMapUnit(u: OffMapUnit): OffMapUnit {
	return {
		eqid: u.eqid, owner: u.owner,
		transport: u.transport ? { eqid: u.transport.eqid, ammo: u.transport.ammo, fuel: u.transport.fuel } : null,
		carrier: u.carrier, strength: u.strength, moveLeft: u.moveLeft, ammo: u.ammo, fuel: u.fuel, hits: u.hits,
		experience: u.experience, entrenchment: u.entrenchment, entrenchTicks: u.entrenchTicks, leader: u.leader,
		facing: u.facing, flag: u.flag, isCore: u.isCore, isMounted: u.isMounted, hasMoved: u.hasMoved, hasFired: u.hasFired,
		hasResupplied: u.hasResupplied, hasOverstrength: u.hasOverstrength, isSurprised: u.isSurprised, tempSpotted: u.tempSpotted,
	};
}

function unitState(u: Unit): UnitState {
	const p = u.getPos(), o = offMapUnit(u);
	return { id: u.id, eqid: o.eqid, owner: o.owner, row: p ? p.row : -1, col: p ? p.col : -1, ...o };
}

function playerState(p: Player, units: Unit[]): PlayerState {
	return {
		id: p.id, side: p.side, country: p.country, type: p.type, prestige: p.prestige,
		prestigePerTurn: p.prestigePerTurn.slice(), score: p.score, playedTurn: p.playedTurn,
		airTransports: p.airTransports, navalTransports: p.navalTransports, supportCountries: p.supportCountries.slice(),
		dossier: structuredClone(p.dossier),
		core: p.getCoreUnitList().map((u): CoreUnit => units.includes(u) ? { onMap: u.id }
			: u.destroyed ? { lost: offMapUnit(u) } : { reserve: offMapUnit(u) }),
	};
}

//The undo slot while its unit can be undone (canUndoMove): with no unit the rest is never read
function undoState(m: GameMap): UndoState | null {
	const slot = m.getUndoSlot();
	if (slot.unit === null)
		return null;
	return { unit: slot.unit.id, before: unitState(slot.savedUnit), oldOwner: slot.oldOwner, oldFlag: slot.oldFlag,
		oldVictorySide: slot.oldVictorySide, prestigeGain: slot.prestigeGain, scoreGain: slot.scoreGain };
}

//Scenario.reinforcements by turn key: integer keys enumerate in ascending order
function reinforcements(scenario: Scenario): ReinforcementState[] {
	const list: ReinforcementState[] = [];
	for (const t of Object.keys(scenario.reinforcements))
		for (const r of scenario.reinforcements[t] || [])
			list.push({ turn: +t, row: r.row, col: r.col, unit: offMapUnit(r.unit) });
	return list;
}

//A campaign whose data is still loading (Game.newCampaign, before its first scenario) has no
//scenario yet: -1
function campaignState(c: Campaign, progress: CampaignProgress): CampaignState {
	const data = c.getCampaignData();
	return { id: c.id, file: c.file, scenario: data ? data.indexOf(c.getCurrentScenario()) : -1, country: c.country,
		difficulty: c.difficulty, startPrestige: c.startprestige, progress: { ...progress } };
}

//A new running scenario from saved data: the objects GameState's load would make, with what the
//load loses kept (the ids, the order, the core lists, the undo slot...). Sets the equipment lists
//and the movement table (global), and with host the campaign's scenario and Game's progress: the
//equipment and the campaign are loaded already
export function fromData(saved: SavedGame, host?: CampaignHost | null): Scenario {
	const { data, state } = saved;
	const s = state.scenario;
	const scenario = new Scenario(s.file);
	scenario.name = data.name;
	scenario.setDescription(data.description);
	scenario.maxTurns = s.maxTurns;
	scenario.date = new Date(s.date);
	scenario.atmosferic = s.atmospheric;
	scenario.latitude = s.latitude;
	scenario.ground = s.ground;
	scenario.turnsPerDay = s.turnsPerDay;
	scenario.dayTurn = s.dayTurn;
	scenario.expPerSide = [{ ...s.expPerSide[0] }, { ...s.expPerSide[1] }];
	scenario.unitsCostPerSide = [s.unitsCostPerSide[0], s.unitsCostPerSide[1]];
	scenario.eqp = data.equipment;
	Equipment.equipmentIndexes = structuredClone(state.equipment.indexes);

	const m = scenario.map;
	m.rows = state.map.rows;
	m.cols = state.map.cols;
	m.isLastRowPartial = state.map.lastRowPartial;
	m.isLastColPartial = state.map.lastColPartial;
	m.terrainImage = data.image;
	m.victoryTurns = s.victoryTurns.slice();
	m.maxTurns = s.maxTurns;
	m.turn = state.turn.turn;
	m.allocMap();
	for (let r = 0; r < m.rows; r++)
		for (let c = 0; c < m.cols; c++) {
			const h = m.map[r][c], d = data.hexes[r * m.cols + c], x = state.map.hexes[r * m.cols + c];
			h.terrain = d.terrain;
			h.road = d.road;
			h.owner = x.owner;
			h.flag = x.flag;
			h.isDeployment = d.deployment;
			h.victorySide = x.victorySide;
			h.name = d.name;
		}
	m.sidesVictoryHexes = [state.objectives[0].map((c) => new Cell(c.row, c.col)), state.objectives[1].map((c) => new Cell(c.row, c.col))];

	const players = state.players.map((p) => newPlayer(p));
	for (const p of players)
		m.addPlayer(p);
	if (state.turn.currentPlayer >= 0)
		m.currentPlayer = m.getPlayer(state.turn.currentPlayer);

	placeUnits(m, state);
	state.players.forEach((p, i) => players[i].setCoreUnitList(p.core.map((c) => coreUnit(m, c))));
	for (const r of state.reinforcements)
		scenario.addReinforcement(r.turn, r.row, r.col, newUnit(r.unit, -1));
	if (state.turn.undoable !== null)
		restoreUndo(m, state.turn.undoable);

	if (state.rng !== null) {
		Rng.game.state = state.rng.game;
		Rng.ai.state = state.rng.ai;
	}
	if (host)
		campaignFromData(host, state.campaign, scenario);
	scenario.isLoaded = true;
	scenario.setMoveTable();
	return scenario;
}

function newPlayer(s: PlayerState): Player {
	const p = new Player();
	p.id = s.id;
	p.side = s.side;
	p.country = s.country;
	p.prestige = s.prestige;
	p.score = s.score;
	p.dossier = structuredClone(s.dossier);
	p.playedTurn = s.playedTurn;
	p.type = s.type;
	p.airTransports = s.airTransports;
	p.navalTransports = s.navalTransports;
	p.supportCountries = s.supportCountries.slice();
	p.prestigePerTurn = s.prestigePerTurn.slice();
	return p;
}

//A unit's objects from its state, with id (the unit list's own, or -1 off the map)
function newUnit(s: OffMapUnit, id: UnitId): Unit {
	const u = new Unit(s.eqid);
	u.id = id;
	setUnitFields(u, s);
	return u;
}

//A unit's fields but its eqid, id and position to the state's (its transport made again when it is
//another one): of a new unit, or of one the game holds (src/mirror.ts)
export function setUnitFields(u: Unit, s: OffMapUnit) {
	u.owner = s.owner;
	u.hasMoved = s.hasMoved;
	u.hasFired = s.hasFired;
	u.hasResupplied = s.hasResupplied;
	u.hasOverstrength = s.hasOverstrength;
	u.isMounted = s.isMounted;
	u.isSurprised = s.isSurprised;
	u.isCore = s.isCore;
	u.tempSpotted = s.tempSpotted;
	u.strength = s.strength;
	u.facing = s.facing;
	u.flag = s.flag;
	if (s.transport === null) {
		u.transport = null;
	} else {
		if (u.transport === null || u.transport.eqid !== s.transport.eqid) u.transport = new Transport(s.transport.eqid);
		u.transport.copy(s.transport as Transport);
	}
	u.carrier = s.carrier;
	u.moveLeft = s.moveLeft;
	u.ammo = s.ammo;
	u.fuel = s.fuel;
	u.hits = s.hits;
	u.experience = s.experience;
	u.entrenchment = s.entrenchment;
	u.entrenchTicks = s.entrenchTicks;
	u.leader = s.leader;
}

//The units in their order with their ids, through the map's own placing (MapBoard.place gives a
//unit the board's next id: set to the unit's first), its player, its zone of control and spotting
//on. Then the hexes' units as the state has them (a unit placed on an occupied hex, #74, leaves
//both units on it and the hex holding one), the fields placing changed (the flag, the spotted
//units' tempSpotted) back, and the next id
function placeUnits(m: GameMap, state: GameState) {
	const board = m.getBoard();
	for (const s of state.units) {
		const u = newUnit(s, s.id);
		board.uniqueID = s.id;
		if (s.row >= 0)
			board.place(u, m.map[s.row][s.col]);
		else
			board.add(u);
	}
	const byId = unitsById(m);
	for (let r = 0; r < m.rows; r++)
		for (let c = 0; c < m.cols; c++) {
			const x = state.map.hexes[r * m.cols + c];
			m.map[r][c].unit = x.unit === null ? null : byId.get(x.unit);
			m.map[r][c].airunit = x.air === null ? null : byId.get(x.air);
		}
	state.units.forEach((s, i) => {
		const u = m.getUnits()[i];
		u.flag = s.flag;
		u.tempSpotted = s.tempSpotted;
	});
	board.uniqueID = state.nextUnitId;
}

function unitsById(m: GameMap): Map<UnitId, Unit> {
	return new Map(m.getUnits().map((u) => [u.id, u]));
}

//A core list entry: the map's unit, or a unit off the map (a lost one was deployed when destroyed)
function coreUnit(m: GameMap, c: CoreUnit): Unit {
	if ("onMap" in c)
		return unitsById(m).get(c.onMap);
	const lost = "lost" in c;
	const u = newUnit(lost ? c.lost : c.reserve, -1);
	u.player = m.getPlayer(u.owner);
	u.isDeployed = lost;
	u.destroyed = lost;
	return u;
}

//The undo slot as UndoSlot.save and the capture left it: the unit before the move on the hex it
//left, then what the capture changed
export function restoreUndo(m: GameMap, s: UndoState) {
	const slot = m.getUndoSlot();
	slot.clear();
	const saved = newUnit(s.before, s.before.id);
	saved.player = m.getPlayer(saved.owner);
	saved.setHex(s.before.row >= 0 ? m.map[s.before.row][s.before.col] : null);
	slot.savedUnit = saved;
	slot.unit = unitsById(m).get(s.unit);
	slot.oldOwner = s.oldOwner;
	slot.oldFlag = s.oldFlag;
	slot.oldVictorySide = s.oldVictorySide;
	slot.prestigeGain = s.prestigeGain;
	slot.scoreGain = s.scoreGain;
}

//The campaign's scenario and Game's progress: the campaign must be the one loaded, fromData doesn't
//load it (Campaign loads asynchronously). A load sets the scenario first and this once the campaign
//is in (src/savegame.ts)
export function campaignFromData(host: CampaignHost, c: CampaignState | null, scenario: Scenario) {
	if (c === null) {
		if (host.campaign !== null)
			throw new Error("fromData: a state without a campaign, the game plays one");
		return;
	}
	if (host.campaign === null || host.campaign.id !== c.id)
		throw new Error("fromData: load campaign " + c.id + " (" + c.file + ") first");
	host.campaign.setScenarioById(c.scenario);
	host.setCampaignProgress({ ...c.progress }, scenario);
}
