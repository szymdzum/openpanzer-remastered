/**
 * SaveGame - the saved game: versioned JSON of the state and its scenario data, and the import of saves of the
 * format before
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 *
 * A save is { version, rules, data, state } (docs/STATE.md D3, D11), self-contained: the scenario file isn't
 * read again. readSave also reads version 2 (no objectives kept at the start, #256) and 1 (no rules chosen:
 * the classic ones), and imports a save of the format before (GameStateExport, the JSON of the game's
 * objects). What that one never stored is listed as unknown, and the load keeps the game's own there.
 * GameState (src/app/storage.ts) reads and writes the saves, loads the equipment and the campaign; this
 * builds the scenario.
 */

import { Equipment } from "../legacy/equipment";
import type { PlayerDossier } from "../core/state";
import type { RulesetName } from "../core/types";
import { createWorld } from "../core/create";
import { withoutDestroyed } from "../core/fight";
import { rulesetNamed } from "../core/rules";
import { Scenario } from "../legacy/scenario";
import { campaignFromData, type CampaignHost, fromData, offMapUnit, toData } from "../legacy/state";
import type { CampaignState, CoreUnit, GameState, HexState, OffMapUnit, PlayerState, Position, ReinforcementState, ScenarioData, ScenarioState, UnitState } from "../core/state";

export const SAVE_VERSION = 3;

export interface SaveFile {
	version: typeof SAVE_VERSION;
	rules: RulesetName;
	data: ScenarioData;
	state: GameState;
}

/**
 * What a save of the format before never stored. The import fills these with placeholders and the load keeps
 * the game's own: the scenario list's description, the equipment lists as loaded, the random streams where
 * they are, Game's campaign progress, the campaign's starting prestige (from the campaign loaded). A load
 * starts without the undo of the last move and the core units of the players who don't play the campaign
 * (#149). The next id is the one after the highest.
 */
export type UnknownPart = "description" | "equipment" | "rng" | "campaignProgress" | "startPrestige" | "undo"
	| "reserves" | "nextUnitId";

export interface ReadSave {
	save: SaveFile;
	unknown: UnknownPart[];
}

export function writeSave(scenario: Scenario, host: CampaignHost | null, rules: RulesetName): SaveFile {
	const { data, state } = toData(scenario, host);
	return { version: SAVE_VERSION, rules, data, state };
}

/** Null when the JSON is neither this format nor the one before (a later version too). */
export function readSave(json: string): ReadSave | null {
	let o: unknown;
	try {
		o = JSON.parse(json);
	} catch {
		return null;
	}
	return readSaveObject(o);
}

export function readSaveObject(o: unknown): ReadSave | null {
	if (!o || typeof o !== "object")
		return null;
	const s = o as Partial<SaveFile> & Partial<GameStateExport>;
	if (s.version === SAVE_VERSION && s.data && s.state)
		return { save: { ...s, rules: rulesOf(s) } as SaveFile, unknown: [] };
	//(version 2 has no objectives at the start, #256; version 1 no rules either: its games play the classic ones)
	const version = s.version as number;
	if ((version === 1 || version === 2) && s.data && s.state)
		return { save: { version: SAVE_VERSION, rules: version === 1 ? "classic" : rulesOf(s), data: withoutStartObjectives(s.data),
			state: s.state }, unknown: [] };
	if (s.version === undefined && s.scenario && s.scenario.file && s.players)
		return importSave(s as GameStateExport);
	return null;
}

const rulesOf = (s: Partial<SaveFile>): RulesetName => s.rules === "remaster" ? "remaster" : "classic";

//The objectives at the start are unknown, in their place before the hexes. The turn limit and the captures play
//by the rules for a game whose attacker isn't known then (src/core/turn.ts attackerSide, #256)
function withoutStartObjectives(data: ScenarioData): ScenarioData {
	const { hexes, ...rest } = data;
	return { ...rest, startObjectives: null, hexes };
}

/**
 * The scenario of a save without the units it holds destroyed (#290). The equipment of the players' countries
 * is loaded already; a campaign's part comes later, campaignFromSave.
 */
export function scenarioFromSave(read: ReadSave): Scenario {
	const data = { ...read.save.data };
	const state = { ...read.save.state };
	const unknown = (part: UnknownPart) => read.unknown.includes(part);
	if (unknown("description"))
		data.description = new Scenario(state.scenario.file).getDescription();
	if (unknown("equipment"))
		state.equipment = { indexes: Equipment.equipmentIndexes };
	//(a unit the save holds with no strength left comes off the map, #290; the world only for that)
	if (!state.units.some((u) => u.strength <= 0))
		return fromData({ data, state });
	const w = withoutDestroyed(createWorld({ data, state }, Equipment.equipment, { rules: rulesetNamed(read.save.rules) }));
	return fromData({ data, state: w.state });
}

/** Call once host's campaign is loaded. */
export function campaignFromSave(read: ReadSave, host: CampaignHost, scenario: Scenario) {
	const c = { ...read.save.state.campaign, id: host.campaign.id };
	if (read.unknown.includes("campaignProgress"))
		c.progress = host.getCampaignProgress();
	campaignFromData(host, c, scenario);
}

//The format before: the JSON of the game's objects, as the original's exportGameState wrote it. A local save
//wrote the scenario, the players and the campaign's progress as items of their own.
export interface GameStateExport {
	scenario: SavedScenario;
	players: SavedPlayer[];
	campaign: CampaignSave | null;
}

//The campaign progress of a save of the format before: the campaign player's core unit list as it was
export interface CampaignSave {
	id: number;
	file?: string;			//finds the campaign again if the list changed
	scenario: number;
	country: number;
	difficulty?: number;
	coreUnits: SavedUnit[];
}

interface SavedUnit extends OffMapUnit {
	id: number;
	isDeployed: boolean;
	destroyed: boolean;
}

interface SavedHex {			//{} for a hex with nothing but the defaults
	unit?: SavedUnit | null;
	airunit?: SavedUnit | null;
	terrain?: number;
	road?: number;
	owner?: number;
	flag?: number;
	isDeployment?: number;
	victorySide?: number;
	name?: string;
}

interface SavedScenario {
	name: string;
	maxTurns: number;
	date: string;
	atmosferic: number;
	latitude: number;
	ground: number;
	turnsPerDay: number;
	dayTurn?: number;
	reinforcements: { [turn: string]: { row: number; col: number; unit: SavedUnit }[] };
	file: string;
	expPerSide?: { exp: number; count: number }[];
	unitsCostPerSide?: number[];
	eqp?: string;			//missing in older saves: the equipment set stays the one the game has
	map: {
		rows: number;
		cols: number;
		isLastRowPartial?: boolean;
		isLastColPartial?: boolean;
		map: SavedHex[][];
		terrainImage: string;
		victoryTurns: number[];
		maxTurns: number;
		turn: number;
		sidesVictoryHexes: Position[][];
		currentPlayer: { id: number } | null;
	};
}

interface SavedPlayer {
	id: number;
	side: number;
	country: number;
	prestige: number;
	score: number;
	dossier?: PlayerDossier;	//missing in older saves
	playedTurn: number;
	type: number;
	airTransports: number;
	navalTransports: number;
	supportCountries?: number[];
	prestigePerTurn?: number[];
}

export function importSave(old: GameStateExport): ReadSave {
	const s = old.scenario, m = s.map, c = old.campaign;
	const unknown: UnknownPart[] = ["description", "equipment", "rng", "campaignProgress", "undo", "reserves", "nextUnitId"];
	if (c)
		unknown.push("startPrestige");
	const data: ScenarioData = { name: s.name, description: "", equipment: s.eqp, image: m.terrainImage, startObjectives: null, hexes: [] };
	const { hexes, units, renumbered } = importMap(old, data);
	const players = old.players.map(playerOf);
	const player = c ? players.find((p) => p.country === c.country) : null;
	if (player)
		player.core = campaignCore(c.coreUnits, renumbered ? [] : units);
	const state: GameState = {
		version: 1,
		scenario: importScenario(s),
		map: { rows: m.rows, cols: m.cols, lastRowPartial: m.isLastRowPartial === true, lastColPartial: m.isLastColPartial === true, hexes },
		units,
		nextUnitId: Math.max(-1, ...units.map((u) => u.id)) + 1,
		players,
		turn: { turn: m.turn, currentPlayer: m.currentPlayer ? m.currentPlayer.id : -1, undoable: null },
		objectives: [m.sidesVictoryHexes[0].map(position), m.sidesVictoryHexes[1].map(position)],
		reinforcements: importReinforcements(s.reinforcements || {}),
		rng: null,
		campaign: c ? importCampaign(c) : null,
		equipment: { indexes: {} },
	};
	return { save: { version: SAVE_VERSION, rules: "classic", data, state }, unknown };
}

//(a save older than a field has the scenario's start there)
function importScenario(s: SavedScenario): ScenarioState {
	return {
		file: s.file, date: s.date, turnsPerDay: s.turnsPerDay, dayTurn: s.dayTurn || 0, atmospheric: s.atmosferic,
		ground: s.ground, latitude: s.latitude, maxTurns: s.map.maxTurns, victoryTurns: s.map.victoryTurns.slice(),
		expPerSide: s.expPerSide ? [{ ...s.expPerSide[0] }, { ...s.expPerSide[1] }] : [{ exp: 0, count: 0 }, { exp: 0, count: 0 }],
		unitsCostPerSide: s.unitsCostPerSide ? [s.unitsCostPerSide[0], s.unitsCostPerSide[1]] : [0, 0],
	};
}

function importCampaign(c: CampaignSave): CampaignState {
	return { id: c.id, file: c.file || "", scenario: c.scenario, country: c.country, difficulty: c.difficulty || 0,
		startPrestige: 0, progress: { isStart: false, removeNonCampaignUnits: false, awardPrototype: false } };
}

function or<T>(value: T | undefined, otherwise: T): T {
	return value === undefined ? otherwise : value;
}

//The units on the hexes come in the order of their ids, the order they were placed in. A save whose ids
//aren't unique (stale ids, #64) has them numbered again in hex order.
function importMap(old: GameStateExport, data: ScenarioData): { hexes: HexState[]; units: UnitState[]; renumbered: boolean } {
	const hexes: HexState[] = [];
	const onMap: { unit: SavedUnit; row: number; col: number; hex: HexState; air: boolean }[] = [];
	old.scenario.map.map.forEach((line, row) => line.forEach((h, col) => {
		data.hexes.push({ terrain: or(h.terrain, 0), road: or(h.road, 0), name: or(h.name, ""), deployment: or(h.isDeployment, -1) });
		const hex: HexState = { unit: null, air: null, owner: or(h.owner, -1), flag: or(h.flag, -1), victorySide: or(h.victorySide, -1) };
		hexes.push(hex);
		if (h.unit)
			onMap.push({ unit: h.unit, row, col, hex, air: false });
		if (h.airunit)
			onMap.push({ unit: h.airunit, row, col, hex, air: true });
	}));
	const ids = onMap.map((x) => x.unit.id);
	const keepIds = new Set(ids).size === ids.length && ids.every((id) => id >= 0);
	if (keepIds)
		onMap.sort((a, b) => a.unit.id - b.unit.id);
	const units = onMap.map((x, i): UnitState => {
		const o = offMapUnit(x.unit), id = keepIds ? x.unit.id : i;
		if (x.air)
			x.hex.air = id;
		else
			x.hex.unit = id;
		return { id, eqid: o.eqid, owner: o.owner, row: x.row, col: x.col, ...o };
	});
	return { hexes, units, renumbered: !keepIds };
}

//(integer keys enumerate in ascending order)
function importReinforcements(reinforcements: SavedScenario["reinforcements"]): ReinforcementState[] {
	const list: ReinforcementState[] = [];
	for (const t of Object.keys(reinforcements))
		for (const r of reinforcements[t])
			list.push({ turn: +t, row: r.row, col: r.col, unit: offMapUnit(r.unit) });
	return list;
}

function position(c: Position): Position {
	return { row: c.row, col: c.col };
}

function playerOf(p: SavedPlayer): PlayerState {
	return {
		id: p.id, side: p.side, country: p.country, type: p.type, prestige: p.prestige,
		prestigePerTurn: (p.prestigePerTurn || []).slice(), score: p.score, playedTurn: p.playedTurn,
		airTransports: p.airTransports, navalTransports: p.navalTransports, supportCountries: (p.supportCountries || []).slice(),
		dossier: p.dossier && p.dossier.units ? structuredClone(p.dossier) : {},
		core: [],
	};
}

//A deployed unit is the map's unit with its id (gone when the ids were numbered again), a destroyed one lost,
//the others wait to be deployed
function campaignCore(coreUnits: SavedUnit[], units: UnitState[]): CoreUnit[] {
	const core: CoreUnit[] = [];
	for (const u of coreUnits) {
		if (!u.isDeployed)
			core.push({ reserve: offMapUnit(u) });
		else if (u.destroyed)
			core.push({ lost: offMapUnit(u) });
		else if (units.some((x) => x.id === u.id))
			core.push({ onMap: u.id });
	}
	return core;
}
