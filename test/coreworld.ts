//Worlds of the new core built by hand (src/core/, docs/CORE.md): a small map, two players, the units
//given, for tests that read like the rule they test. The equipment is the game's, read from its files
import fs from "node:fs";
import path from "node:path";
import { createWorld, type WorldOptions } from "../src/core/create";
import type { EquipmentTable, GameState, ScenarioData, UnitState, World } from "../src/core/types";
import type { Dossier, PlayerState } from "../src/state";

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
	units: HandUnit[];
}

//A world on a hand-built map: player 0 (side 0, Germany) and player 1 (side 1, Poland), the units
//in the order given with ids 0, 1...
export function handWorld(map: HandMap, equipment: EquipmentTable = germanyPoland, options: WorldOptions = {}): World {
	const { rows, cols } = map;
	const data: ScenarioData = { name: "hand", description: "", equipment: "eqp-adlerkorps", image: "", hexes: [] };
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

function player(id: number, country: number): PlayerState {
	return { id, side: id, country, type: 0, prestige: 0, prestigePerTurn: [], score: 0, playedTurn: 0, airTransports: 0,
		navalTransports: 0, supportCountries: [], dossier: {} as Dossier, core: [] };
}
