/**
 * New game - a game's data and state from a scenario file, as ScenarioLoader loads it and Game starts
 * it (docs/CORE.md)
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 *
 * The files are read elsewhere (src/scenariofile.ts, the equipment's JSON): newGame only turns what
 * they hold into the state, in the old loader's order. The order is behavior: the units get their
 * ids as their hexes come in the file, a unit entering the map marks the enemy units it is the first
 * of its side to see (tempSpotted, as MapBoard.add does), and a unit with a leader draws it from the
 * game stream as the loader reaches it, the reinforcements first.
 */

import { difficultyModifiers, playerType, SCENARIO_START_PRESTIGE, scoreGains, terrainType } from "./tables";
import type { RngStream } from "./random";
import type { CampaignState, EquipmentState, RngStreams } from "./state";
import { startCampaignScenario } from "./campaign";
import { unitCost } from "./costs";
import { createWorld } from "./create";
import { beginDraft, finishDraft, place, writeHex } from "./draft";
import { newLeader } from "./fight";
import { classicRules } from "./rules";
import type {
	Draft, EquipmentTable, GameState, HexState, OffMapUnit, PlayerState, Position, Ruleset, ScenarioData, UnitState, World
} from "./types";
import { isAir, isSea } from "./units";
import { emptySight } from "./world";

//A unit as the file has it: its equipment and owner, the rest null where the file says nothing
export interface FileUnit {
	eqid: number;
	owner: number;
	facing: number | null;
	flag: number | null;
	transport: number | null;
	carrier: number | null;
	experience: number | null;
	entrenchment: number | null;
	strength: number | null;
	leader: boolean;
}

export interface FilePlayer {
	id: number;
	side: number;
	country: number;
	airTransports: number;
	navalTransports: number;
	prestigePerTurn: number[];
	support: number[];		//as listed, 0 for none
}

export interface FileReinforcement {
	turn: number;
	row: number;
	col: number;
	unit: FileUnit;
}

export interface FileHex {
	row: number;
	col: number;
	terrain: number | null;
	road: number | null;
	name: string | null;
	flag: number | null;
	owner: number | null;
	victory: number | null;
	deploy: number | null;
	supply: number | null;
	units: FileUnit[];
}

export interface ScenarioFile {
	rows: number;
	cols: number;
	equipment: string | null;	//the equipment set, the default one when null
	turns: number[];		//the brilliant, victory and tactical victory turns
	date: string;
	atmospheric: number;
	latitude: number;
	ground: number;
	dayTurns: number;
	image: string;
	players: FilePlayer[];
	reinforcements: FileReinforcement[];
	hexes: FileHex[];
}

//What starts a game besides the file
export interface GameSetup {
	file: string;			//the scenario's file name
	name: string;			//from the scenario list
	description: string;		//the scenario list's, or the campaign's intro
	scenario: ScenarioFile;
	imageSize: [number, number];	//the map image's width and height: they size the map
	equipment: EquipmentTable;	//of every country file of the set: a scenario's units aren't all its countries' (#286)
	indexes: EquipmentState["indexes"];	//the equipment lists by unit class of the countries equipmentCountries names
	isAI: number[];			//by player id (uiSettings.isAI): 1 the AI, 2 the scripted AI; ignored in a campaign
	rng: RngStreams | null;		//where the streams are; null: the game stream reads Math.random
	campaign: CampaignState | null;
	carried?: PlayerState | null;	//a campaign's player from its previous scenario (campaign.ts)
	rules?: Ruleset;		//the rules it plays by, classicRules when not given (the leaders it loads)
}

const DEFAULT_EQUIPMENT = "eqp-adlerkorps";

//The equipment country files a scenario needs (Equipment.addPlayersEquipment), by country index:
//-1 for the generic file, then the players' countries and their supporting ones, and the countries
//of the core units a campaign carries in (campaign.ts coreCountries, #182), in the order they load
export function equipmentCountries(file: ScenarioFile, core: number[] = []): number[] {
	const set: { [country: string]: boolean } = { "-1": true };
	for (const p of file.players) {
		set[p.country] = true;
		for (const c of supportCountries(p)) set[c - 1] = true;
	}
	for (const c of core) set[c] = true;
	return Object.keys(set).map(Number);
}

const supportCountries = (p: FilePlayer) => p.support.filter((c) => c > 0);

//The equipment a scenario file's units are (theirs, their transports' and carriers'), which isn't all of
//its players' countries' (#286): the files those are in load beside the countries' (Equipment.addUnitsEquipment)
export function fileEquipment(file: ScenarioFile): number[] {
	const eqids: (number | null)[] = [];
	const add = (u: FileUnit) => eqids.push(u.eqid, u.transport, u.carrier);
	for (const h of file.hexes) h.units.forEach(add);
	for (const r of file.reinforcements) add(r.unit);
	return usedEquipment(eqids);
}

//The equipment a game's units are, on the map, in the reinforcements and in the players' core lists (#286)
export function stateEquipment(state: GameState): number[] {
	const eqids: (number | null)[] = [];
	//(a negative carrier is the carrier being left)
	const add = (u: OffMapUnit) => eqids.push(u.eqid, u.transport === null ? null : u.transport.eqid, Math.abs(u.carrier));
	state.units.forEach(add);
	for (const r of state.reinforcements) add(r.unit);
	for (const p of state.players)
		for (const c of p.core) if (!("onMap" in c)) add("reserve" in c ? c.reserve : c.lost);
	return usedEquipment(eqids);
}

//The ids of the list that are equipment (no transport or carrier: null or 0), once each
function usedEquipment(eqids: (number | null)[]): number[] {
	const used: number[] = [];
	for (const id of eqids) if (id !== null && id > 0 && used.indexOf(id) < 0) used.push(id);
	return used;
}

//The map's size from its image (ScenarioLoader.loadMapImage): hexes 60 and 30 pixels wide in turn,
//50 high; a last column or row cut in half by the image is partial. The file's size is an upper limit
export function mapSize(rows: number, cols: number, width: number, height: number) {
	const c = imageCols(width), r = imageRows(height);
	return { rows: upTo(rows, r.rows), cols: upTo(cols, c.cols), lastRowPartial: r.partial, lastColPartial: c.partial };
}

//The file's size, cut to the image's (none, 0: the image's)
const upTo = (n: number, image: number) => image > 0 && (n > image || n === 0) ? image : n;

function imageCols(width: number) {
	let cols = 1, w = width;
	while (w >= 30) {
		w -= cols % 2 ? 60 : 30;
		cols++;
	}
	return { cols, partial: w < 0 };
}

//A last row cut between 39% and 80% of its height is partial; under 39% it isn't there
function imageRows(height: number) {
	const rows = height / 50, fraction = rows - Math.floor(rows);
	return { rows: fraction >= 0.39 ? Math.ceil(rows) : Math.floor(rows), partial: fraction >= 0.39 && fraction < 0.8 };
}

//Sets the fields given a value (not null), keeps the others
function given<T extends object>(target: T, values: { [K in keyof T]?: T[K] | null }) {
	for (const k of Object.keys(values) as (keyof T)[])
		if (values[k] !== null) target[k] = values[k];
}

//The game a scenario file starts, as Game.newScenario leaves it before its first turn
export function newGame(g: GameSetup): { data: ScenarioData; state: GameState } {
	const { data, state } = emptyGame(g), f = g.scenario;
	const rng: RngStream = { state: g.rng === null ? null : g.rng.game };
	for (const r of f.reinforcements) {
		const u = loadUnit(g, state, rng, r.unit);
		if (u !== null) state.reinforcements.push({ turn: r.turn, row: r.row, col: r.col, unit: u });
	}
	//(Scenario.reinforcements is keyed by turn: they come out by turn, each turn's in the file's order)
	state.reinforcements.sort((a, b) => a.turn - b.turn);
	if (state.rng !== null) state.rng.game = rng.state;
	//The hexes on a draft: it places the units with their sight, and the leaders draw from its stream
	const d = beginDraft(createWorld({ data, state }, g.equipment, { rules: g.rules }));
	for (const h of f.hexes) loadHex(d, g, h);
	const s = finishDraft(d).state;
	//(how many objectives each side has to take now, kept for the game: the side with more attacks, #256)
	data.startObjectives = [s.objectives[0].length, s.objectives[1].length];
	initialScores(s);
	if (g.campaign === null) return { data, state: singleScenario(g, s) };
	//(a campaign's start on a draft too: it removes units and draws the prototype)
	const c = beginDraft(createWorld({ data, state: s }, g.equipment, { rules: g.rules }));
	startCampaignScenario(c, g.campaign, g.carried || null);
	return { data, state: finishDraft(c).state };
}

//The map header and the players: a map of clear hexes, no unit yet. A campaign's difficulty adds
//turns to the last victory turn, which is the turn limit
function emptyGame(g: GameSetup): { data: ScenarioData; state: GameState } {
	const f = g.scenario, size = mapSize(f.rows, f.cols, g.imageSize[0], g.imageSize[1]);
	const turns = f.turns.slice();
	turns[2] = Math.round(turns[2] * (g.campaign !== null ? difficultyModifiers[g.campaign.difficulty].extraTurns : 1));
	const data: ScenarioData = { name: g.name, description: g.description, equipment: f.equipment || DEFAULT_EQUIPMENT,
		image: f.image, startObjectives: null, hexes: [] };
	const state: GameState = {
		version: 1,
		scenario: { file: g.file, date: new Date(Date.parse(f.date)).toISOString(), turnsPerDay: (f.dayTurns || 1) * 2,
			dayTurn: 0, atmospheric: f.atmospheric, ground: f.ground, latitude: f.latitude, maxTurns: turns[2],
			victoryTurns: turns, expPerSide: [{ exp: 0, count: 0 }, { exp: 0, count: 0 }], unitsCostPerSide: [0, 0] },
		map: { rows: size.rows, cols: size.cols, lastRowPartial: size.lastRowPartial, lastColPartial: size.lastColPartial, hexes: [] },
		units: [], nextUnitId: 0,
		players: f.players.map((p) => newPlayer(p, g.campaign)),
		turn: { turn: 1, currentPlayer: f.players.length ? f.players[0].id : -1, undoable: null },
		objectives: [[], []], reinforcements: [],
		rng: g.rng === null ? null : { ...g.rng },
		campaign: g.campaign === null ? null : structuredClone(g.campaign),
		equipment: { indexes: structuredClone(g.indexes) },
	};
	for (let i = 0; i < size.rows * size.cols; i++) {
		data.hexes.push({ terrain: terrainType.Clear, road: 0, name: "", deployment: -1 });
		state.map.hexes.push({ unit: null, air: null, owner: -1, flag: -1, victorySide: -1 });
	}
	return { data, state };
}

//A file's player as the loader reads it: a campaign gives its own country's player each turn at least
//a share of its starting prestige, by the difficulty, not the AI's players (#15: the old loader gave it
//to every player, so an easier level made the AI richer); the first turn's prestige to start with
function newPlayer(p: FilePlayer, campaign: CampaignState | null): PlayerState {
	const min = campaign === null || p.country !== campaign.country ? 0
		: Math.round(campaign.startPrestige * difficultyModifiers[campaign.difficulty].turnPrestige);
	const prestigePerTurn = p.prestigePerTurn.map((v) => v < min ? min : v);
	return { id: p.id, side: p.side, country: p.country, type: playerType.humanLocal, prestige: prestigePerTurn[0],
		prestigePerTurn, score: 0, playedTurn: -1, airTransports: p.airTransports, navalTransports: p.navalTransports,
		supportCountries: supportCountries(p), dossier: {}, core: [] };
}

//The player of an id as Map.getPlayer finds it: by index, the first past the end
const playerAt = (s: GameState, id: number) => id < s.players.length ? s.players[id] : s.players[0];

//A world to ask the unit queries in, while loading
const queries = (g: GameSetup, s: GameState): World => ({ data: null, state: s, equipment: g.equipment, rules: g.rules || classicRules,
	noFOW: false, spotSide: -1, destroyed: new Set(), index: new Map(), sight: emptySight(0), scratch: null });

//An equipment id the equipment knows, else the first it has (Unit's knownEqid: as the key, a string)
function known(g: GameSetup, eqid: number): number {
	return g.equipment[eqid] === undefined ? Object.keys(g.equipment)[0] as unknown as number : eqid;
}

//ScenarioLoader.loadUnit: null for a negative equipment or owner. Its leader drawn now; a ground or
//air unit counts in its side's units' cost and experience
function loadUnit(g: GameSetup, s: GameState, rng: RngStream, fu: FileUnit): OffMapUnit | null {
	if (fu.eqid < 0 || fu.owner < 0) return null;
	const eq = g.equipment, eqid = known(g, fu.eqid);
	const u: OffMapUnit = { eqid, owner: fu.owner >> 0, transport: null, carrier: 0, strength: 10, moveLeft: eq[eqid].movpoints,
		ammo: eq[eqid].ammo, fuel: eq[eqid].fuel, hits: 0, experience: 0, entrenchment: 0, entrenchTicks: 0, leader: -1, facing: 2,
		flag: -1, isCore: false, isMounted: false, hasMoved: false, hasFired: false, hasResupplied: false, hasOverstrength: false,
		isSurprised: false, tempSpotted: false };
	given(u, { facing: fu.facing, flag: fu.flag, carrier: fu.carrier, experience: fu.experience, entrenchment: fu.entrenchment,
		strength: fu.strength });
	if (fu.transport !== null) {
		const t = known(g, fu.transport);
		u.transport = { eqid: t, ammo: eq[t].ammo, fuel: eq[t].fuel };
	}
	const w = queries(g, s);
	if (fu.leader) u.leader = newLeader(w, eq[u.carrier > 0 ? u.carrier : u.eqid].uclass, rng);
	if (!isSea(w, u as UnitState)) countUnit(w, u);
	return u;
}

//A unit in its side's units' cost and experience: what a bought unit's experience and a single
//scenario's starting prestige are made of
function countUnit(w: World, u: OffMapUnit) {
	const s = w.state.scenario, side = playerAt(w.state, u.owner).side;
	s.unitsCostPerSide[side] += unitCost(w, u.eqid, u.transport ? u.transport.eqid : null);
	s.expPerSide[side].exp += u.experience;
	s.expPerSide[side].count++;
}

//ScenarioLoader.loadHexes and Map.setHex: a hex in the map takes what the file sets, its units go
//to their slots (a later one over an earlier, #74), then it becomes an objective of the side that
//has to take it, and its units enter the map, the ground one first
function loadHex(d: Draft, g: GameSetup, h: FileHex) {
	const s = d.state;
	if (h.row >= s.map.rows || h.col >= s.map.cols) return;
	const i = h.row * s.map.cols + h.col, data = d.data.hexes[i];
	if (data === undefined) return;
	const hs = writeHex(d, i);
	given(data, { terrain: h.terrain, road: h.road, name: h.name, deployment: h.deploy });
	given(hs, { flag: h.flag, owner: h.owner, victorySide: h.victory });
	//(supply hexes deploy too, unless the hex has a deploy side)
	if (h.supply !== null && data.deployment === -1) data.deployment = h.supply;
	const slots = hexUnits(d, g, h);
	const at = { row: h.row, col: h.col };
	addObjective(s, hs, at);
	if (slots.ground !== null) place(d, slots.ground, at);
	if (slots.air !== null) place(d, slots.air, at);
}

//A hex's units by slot (Hex.setUnit): the last of each wins
function hexUnits(d: Draft, g: GameSetup, h: FileHex) {
	const slots: { ground: OffMapUnit | null; air: OffMapUnit | null } = { ground: null, air: null };
	for (const fu of h.units) {
		const u = loadUnit(g, d.state, d.rng, fu);
		if (u === null) continue;
		if (isAir(d, u as UnitState)) slots.air = u;
		else slots.ground = u;
	}
	return slots;
}

//An objective already taken by the side it was for is the other side's to take back; once
function addObjective(s: GameState, hs: HexState, at: Position) {
	let side = hs.victorySide;
	if (side === -1) return;
	if (hs.owner !== -1 && side === playerAt(s, hs.owner).side) side = ~side & 1;
	const list = s.objectives[side];
	if (!list.some((c) => c.row === at.row && c.col === at.col)) list.push(at);
}

//Scenario.onLoadFinished: each player's score starts with its side's objectives worth per turn,
//less its units (scaled by a campaign's difficulty, Player.updateScore)
function initialScores(s: GameState) {
	const scores: { [player: string]: number } = {};
	for (const p of s.players)
		scores[p.id] = ((s.objectives[p.side].length * scoreGains.objectivePerTurn) / s.scenario.maxTurns) >> 0;
	for (const u of s.units) scores[playerAt(s, u.owner).id] += u.isCore ? scoreGains.coreUnit : scoreGains.normalUnit;
	const coef = s.campaign !== null ? difficultyModifiers[s.campaign.difficulty].scoreCoef : 1;
	for (const p of s.players) p.score += (scores[p.id] * 1 * coef) >> 0;
}

//Game's setupPlayers and the single scenario's start: the AI where asked; every side starts with
//the prestige its units are short of the other's, at least SCENARIO_START_PRESTIGE (not the tutorial).
//A campaign's players are its own (campaign.ts)
function singleScenario(g: GameSetup, s: GameState): GameState {
	for (const p of s.players) {
		if (g.isAI[p.id] === 1) p.type = playerType.aiLocal;
		else if (g.isAI[p.id] === 2) p.type = playerType.aiScripted;
	}
	if (g.file === "tutorial.xml") return s;
	const cost = s.scenario.unitsCostPerSide;
	for (const p of s.players)
		p.prestige = Math.max(SCENARIO_START_PRESTIGE, SCENARIO_START_PRESTIGE + cost[+!p.side] - cost[p.side]);
	return s;
}
