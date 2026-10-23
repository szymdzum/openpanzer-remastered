//A small game built by hand, no scenario file (the scenario loader and the save need the DOM's XML
//parser and storage): a 12 x 12 clear map, a German side 0 (a human player) against a Soviet side
//1 (the AI), four units each and a victory hex for each side, as the game's objects (src/state.ts
//fromData) with the engine context a game gives them (src/context.ts). Loads the two countries' equipment
import fs from "node:fs";
import path from "node:path";
import { Equipment, type EquipmentCountryFile } from "../src/equipment";
import { playerType } from "../src/prototypes";
import { Scenario } from "../src/scenario";
import { fromData, type GameState, type PlayerState, type SavedGame, type UnitState } from "../src/state";
import { setEngineContext } from "../src/context";
import { worldOf } from "../src/mirror";
import type { GameMap, Player } from "../src/map";

const root = path.resolve(__dirname, "..");
const GAME_DIR = process.env.OPENPANZER_GAME_DIR || path.join(root, "game");

//Germany (8) and the Soviet Union (20), the files the game loads for them (country + 1)
for (const file of [8, 20])
	Equipment.parseCountryEquipment(file, JSON.parse(fs.readFileSync(path.join(GAME_DIR,
		"resources/equipment/eqp-adlerkorps/equipment-country-" + file + ".json"), "utf8")) as EquipmentCountryFile);

//The units, eqid, owner, row and col: two infantry (115), a tank (142) and an artillery (148) for
//Germany; infantry (504), a tank (511), infantry and artillery (498) for the Soviet Union
export const smallGameUnits: [number, number, number, number][] = [
	[115, 0, 3, 3], [142, 0, 4, 4], [115, 0, 5, 3], [148, 0, 3, 5],
	[504, 1, 7, 7], [511, 1, 8, 6], [504, 1, 7, 8], [498, 1, 9, 9],
];

const SIZE = 12;

function player(id: number, country: number, type: number): PlayerState {
	return { id, side: id, country, type, prestige: 0, prestigePerTurn: [], score: 0, playedTurn: -1, airTransports: 0,
		navalTransports: 0, supportCountries: [], dossier: {}, core: [] };
}

//The small game as saved data, with units (eqid, owner, row, col) instead of smallGameUnits when given
export function smallGameData(units = smallGameUnits): SavedGame {
	const hexes = Array.from({ length: SIZE * SIZE }, () => ({ unit: null as number | null, air: null as number | null, owner: -1, flag: -1,
		victorySide: -1 }));
	const state: GameState = {
		version: 1,
		scenario: { file: "small.xml", date: "1941-06-22T00:00:00.000Z", turnsPerDay: 2, dayTurn: 0, atmospheric: 0, ground: 0,
			latitude: 0, maxTurns: 10, victoryTurns: [4, 7, 10], expPerSide: [{ exp: 0, count: 0 }, { exp: 0, count: 0 }],
			unitsCostPerSide: [0, 0] },
		map: { rows: SIZE, cols: SIZE, lastRowPartial: false, lastColPartial: false, hexes },
		units: [], nextUnitId: units.length,
		players: [player(0, 7, playerType.humanLocal), player(1, 19, playerType.aiLocal)],
		turn: { turn: 1, currentPlayer: 0, undoable: null },
		objectives: [[{ row: 10, col: 10 }], [{ row: 2, col: 2 }]], reinforcements: [], rng: { game: 1, ai: 2 }, campaign: null,
		equipment: { indexes: structuredClone(Equipment.equipmentIndexes) },
	};
	hexes[2 * SIZE + 2] = { ...hexes[2 * SIZE + 2], victorySide: 1, owner: 0 };
	hexes[10 * SIZE + 10] = { ...hexes[10 * SIZE + 10], victorySide: 0, owner: 1 };
	units.forEach(([eqid, owner, row, col], id) => {
		const e = Equipment.equipment[eqid];
		const u: UnitState = { id, eqid, owner, row, col, transport: null, carrier: 0, strength: 10, moveLeft: e.movpoints, ammo: e.ammo,
			fuel: e.fuel, hits: 0, experience: 0, entrenchment: 0, entrenchTicks: 0, leader: -1, facing: 2, flag: state.players[owner].country + 1,
			isCore: false, isMounted: false, hasMoved: false, hasFired: false, hasResupplied: false, hasOverstrength: false, isSurprised: false,
			tempSpotted: false };
		state.units.push(u);
		if (e.movmethod === 5) hexes[row * SIZE + col].air = id; //movMethod.air
		else hexes[row * SIZE + col].unit = id;
	});
	const data = { name: "small", description: "", equipment: "eqp-adlerkorps", image: "",
		hexes: hexes.map(() => ({ terrain: 0, road: 0, name: "", deployment: -1 })) };
	return { data, state };
}

//The small game's objects, and the engine context of a game playing it (the side shown: 0)
export function smallGame(units = smallGameUnits, saved = smallGameData(units)): { scenario: Scenario; map: GameMap; players: Player[] } {
	const scenario = fromData(saved, null, new Scenario());
	setEngineContext({ scenario: () => scenario, campaign: () => null, campaignPlayer: () => null, spotSide: () => 0, host: () => null,
		world: () => worldOf(scenario, null, { spotSide: 0, noFOW: false }) });
	return { scenario, map: scenario.map, players: scenario.map.getPlayers() };
}
