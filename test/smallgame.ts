//A small game built by hand, no scenario file (the scenario loader and the save need the DOM's XML
//parser and storage): a 12 x 12 clear map, a German side 0 (a human player) against a Soviet side
//1 (the AI), four units each and a victory hex for each side. Loads the two countries' equipment
import fs from "node:fs";
import path from "node:path";
import { GameMap, Player } from "../src/map";
import { Unit } from "../src/unit";
import { Equipment, type EquipmentCountryFile } from "../src/equipment";
import { playerType } from "../src/prototypes";

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

//Fills map (a new one by default) with the small game, with units (eqid, owner, row, col) instead
//of smallGameUnits when given
export function smallGame(map = new GameMap(), units = smallGameUnits): { map: GameMap; players: Player[] } {
	map.rows = map.cols = 12;
	map.allocMap();
	const players = [[0, 0, 7], [1, 1, 19]].map(([id, side, country]) => {
		const p = new Player();
		p.id = id; p.side = side; p.country = country;
		p.type = id === 1 ? playerType.aiLocal : playerType.humanLocal;
		map.addPlayer(p);
		return p;
	});
	for (const [eqid, owner, row, col] of units) {
		const u = new Unit(eqid);
		u.owner = owner;
		u.player = players[owner]; //addUnit sets it too, but a unit added earlier may spot this one
		map.map[row][col].setUnit(u);
	}
	map.map[2][2].victorySide = 1; map.map[2][2].owner = 0;
	map.map[10][10].victorySide = 0; map.map[10][10].owner = 1;
	for (let r = 0; r < map.rows; r++)
		for (let c = 0; c < map.cols; c++)
			map.setHex(r, c);
	return { map, players };
}
