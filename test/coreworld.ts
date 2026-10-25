//Worlds of the new core built by hand (src/core/, docs/CORE.md): a small map, two players, the units
//given, for tests that read like the rule they test. The equipment is the game's, read from its files
import fs from "node:fs";
import path from "node:path";
import { createWorld, type WorldOptions } from "../src/core/create";
import type { EquipmentTable, GameState, ScenarioData, UnitState, World } from "../src/core/types";
import type { Dossier, OffMapUnit, PlayerState } from "../src/state";
import { terrainType, unitClass } from "../src/prototypes";

const GAME_DIR = process.env.OPENPANZER_GAME_DIR || path.resolve(__dirname, "../game");

//The equipment of the country files given (country + 1), by eqid, from the default equipment set
export function equipmentOf(files: number[]): EquipmentTable {
	const table: { [eqid: string]: EquipmentEntry } = {};
	for (const file of files) {
		const e = JSON.parse(fs.readFileSync(path.join(GAME_DIR, "resources/equipment/eqp-adlerkorps/equipment-country-"
			+ file + ".json"), "utf8")) as { parsehints: (keyof EquipmentEntry)[]; units: { [eqid: string]: (number | string)[] } };
		for (const [eqid, values] of Object.entries(e.units))
			table[eqid] = Object.fromEntries(e.parsehints.map((k, i) => [k, values[i]])) as unknown as EquipmentEntry;
	}
	return table;
}

//Germany (file 8) and Poland (file 16): the Pz IIA (140), the 7TP (273)
export const germanyPoland = equipmentOf([8, 16]);

//A unit of the hand-built world: its eqid, owner and hex, full strength, ammo, fuel and moves
export type HandUnit = Partial<UnitState> & Pick<UnitState, "eqid" | "owner" | "row" | "col">;

export interface HandMap {
	rows: number;
	cols: number;
	terrain?: (row: number, col: number) => number;	//Clear everywhere
	road?: (row: number, col: number) => number;	//none
	ground?: number;		//dry
	startObjectives?: [number, number];	//the objectives each side had to take at the start: unknown (#256)
	units: HandUnit[];
}

//A world on a hand-built map: player 0 (side 0, Germany) and player 1 (side 1, Poland), the units
//in the order given with ids 0, 1...
export function handWorld(map: HandMap, equipment: EquipmentTable = germanyPoland, options: WorldOptions = {}): World {
	const { rows, cols } = map;
	const data: ScenarioData = { name: "hand", description: "", equipment: "eqp-adlerkorps", image: "", startObjectives: map.startObjectives || null,
		hexes: [] };
	const state: GameState = {
		version: 1,
		scenario: { file: "hand.xml", date: "1939-09-01T00:00:00.000Z", turnsPerDay: 2, dayTurn: 0, atmospheric: 0,
			ground: map.ground || 0, latitude: 0, maxTurns: 10, victoryTurns: [], expPerSide: [{ exp: 0, count: 0 }, { exp: 0, count: 0 }],
			unitsCostPerSide: [0, 0] },
		map: { rows, cols, lastRowPartial: false, lastColPartial: false, hexes: [] },
		units: [], nextUnitId: map.units.length,
		players: [player(0, 7), player(1, 15)],
		turn: { turn: 1, currentPlayer: 0, undoable: null },
		objectives: [[], []], reinforcements: [], rng: null, campaign: null, equipment: { indexes: {} },
	};
	for (let r = 0; r < rows; r++)
		for (let c = 0; c < cols; c++) {
			data.hexes.push({ terrain: map.terrain ? map.terrain(r, c) : 0, road: map.road ? map.road(r, c) : 0, name: "", deployment: -1 });
			state.map.hexes.push({ unit: null, air: null, owner: -1, flag: -1, victorySide: -1 });
		}
	map.units.forEach((h, id) => {
		const e = equipment[h.eqid];
		const u: UnitState = { id, transport: null, carrier: 0, strength: 10, moveLeft: e.movpoints, ammo: e.ammo, fuel: e.fuel,
			hits: 0, experience: 0, entrenchment: 0, entrenchTicks: 0, leader: -1, facing: 0, flag: -1, isCore: false, isMounted: false,
			hasMoved: false, hasFired: false, hasResupplied: false, hasOverstrength: false, isSurprised: false, tempSpotted: false, ...h };
		state.units.push(u);
		const hex = state.map.hexes[u.row * cols + u.col];
		if (e.movmethod === 5) hex.air = id; //movMethod.air
		else hex.unit = id;
	});
	return createWorld({ data, state }, equipment, options);
}

//A core unit of player owner waiting in the reserve, fresh from the equipment
export function reserveUnit(eqid: number, owner = 0, equipment: EquipmentTable = germanyPoland): OffMapUnit {
	const e = equipment[eqid];
	return { eqid, owner, transport: null, carrier: 0, strength: 10, moveLeft: e.movpoints, ammo: e.ammo, fuel: e.fuel, hits: 0, experience: 0,
		entrenchment: 0, entrenchTicks: 0, leader: -1, facing: 2, flag: -1, isCore: true, isMounted: false, hasMoved: false, hasFired: false,
		hasResupplied: false, hasOverstrength: false, isSurprised: false, tempSpotted: false };
}

//The Deployment card's case on a 10 x 10 map seen by side 0, player 0's turn: a German zone of four hexes, the one at
//6,6 on the ocean and a Pz IIA (id 0, core list 0) on 1,2; in the reserve an Infanterie (core list 1) and a Me-109E-3
//(2). Germany's naval transport is the Transportschiffe (546), which a ground unit deployed on the ocean embarks on
export function deployWorld(): World {
	const w = handWorld({ rows: 10, cols: 10, units: [{ eqid: 140, owner: 0, row: 1, col: 2 }, { eqid: 273, owner: 1, row: 8, col: 8 }],
		terrain: (r, c) => r === 6 && c === 6 ? terrainType.Ocean : 0 }, germanyPoland, { spotSide: 0 });
	for (const [row, col] of [[1, 1], [1, 2], [2, 1], [6, 6]]) w.data.hexes[row * 10 + col].deployment = 0;
	w.state.players[0].core = [{ onMap: 0 }, { reserve: reserveUnit(115) }, { reserve: reserveUnit(159) }];
	w.state.equipment.indexes["8"] = { unitclass: { [unitClass.navalTransport]: [546] } };
	return w;
}

function player(id: number, country: number): PlayerState {
	return { id, side: id, country, type: 0, prestige: 0, prestigePerTurn: [], score: 0, playedTurn: 0, airTransports: 0,
		navalTransports: 0, supportCountries: [], dossier: {} as Dossier, core: [] };
}
