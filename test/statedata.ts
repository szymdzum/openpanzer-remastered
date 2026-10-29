//The engine contract's state string as it was before #127 (stateString in
//test/contracts/engine.contract.js, which walked the objects), and the same string built from
//toData (src/legacy/state.ts) and what the screen shows beside the state: the proof that toData carries
//what the contract compared, but for the known losses
import { contractCommon } from "./contracts";
import type { GameMap } from "../src/legacy/map";
import type { Scenario } from "../src/legacy/scenario";
import type { Unit } from "../src/legacy/unit";
import type { EquipmentModule } from "../src/legacy/equipment";
import type { CoreUnit, SavedGame, UnitState } from "../src/core/state";

type Json = Record<string, unknown>;

const { contractSerialize, contractHash } = contractCommon();

//What the contract compared that isn't game state: the spotting and zone of control counters (D10,
//read as set or not, the way a hex tells them) and the side shown. Not the selection (D6), the old
//UI's (#377)
export interface View {
	spotSide: number;
	hexes: string[]; //per hex: zone of control of side 0 and 1, spotted by 0 and 1
}

export function viewOf(m: GameMap, spotSide: number): View {
	const hexes: string[] = [];
	for (let r = 0; r < m.rows; r++)
		for (let c = 0; c < m.cols; c++) {
			const h = m.map[r][c];
			hexes.push([+h.isZOC(0), +h.isZOC(1), +h.isSpotted(0), +h.isSpotted(1)].join(","));
		}
	return { spotSide, hexes };
}

//A unit as plain data, the way common.js's contractUnitState writes it: own fields sorted, the
//player as its id, the transport's fields, the position
function contractUnitState(u: Unit): Json {
	const o: Json = {};
	const fields = u as unknown as Json;
	for (const k of Object.keys(u).sort()) {
		const v = fields[k];
		if (typeof v === "function") continue;
		if (k === "player") o[k] = v ? (v as { id: number }).id : v;
		else if (k === "transport" && v) o[k] = sorted(v as Json);
		else o[k] = v;
	}
	const p = u.getPos();
	o.pos = p ? p.row + "," + p.col : null;
	return o;
}

function sorted(o: Json): Json {
	const out: Json = {};
	for (const k of Object.keys(o).sort())
		if (typeof o[k] !== "function") out[k] = o[k];
	return out;
}

//The fields only ever written, which the state doesn't keep: Unit.reinforce's typo hasRessuplied,
//nodossier (set with destroyed, the unit leaves the list)
const writtenOnly = ["hasRessuplied", "nodossier"];

//The contract's stateString before #127, from the objects. A core unit off the map is written
//without its id: a stale one, which the state drops (D1)
export function contractStateString(sc: Scenario, equipment: EquipmentModule, spotSide: number): string {
	const m = sc.map;
	const reinforcements = Object.keys(sc.reinforcements).reduce((n, t) => n + (sc.reinforcements[t] ? sc.reinforcements[t].length : 0), 0);
	return [m.turn, m.currentPlayer ? m.currentPlayer.id : null,
		JSON.stringify(m.sidesVictoryHexes), sc.date.getTime(), sc.dayTurn, reinforcements,
		contractHash(contractSerialize(equipment.equipmentIndexes)), spotSide].join("|")
		+ "\n" + unitStrings(m).join("\n") + "\n" + playerStrings(m).join("\n") + "\n" + hexStrings(m);
}

function unitStrings(m: GameMap): string[] {
	return m.getUnits().map((u) => {
		const o = contractUnitState(u);
		for (const k of writtenOnly) delete o[k];
		return JSON.stringify(o);
	});
}

function playerStrings(m: GameMap): string[] {
	const list = m.getUnits();
	return m.getPlayers().map((p) => {
		const o: Json = {};
		const fields = p as unknown as Json;
		for (const k of Object.keys(p).sort()) if (typeof fields[k] !== "function" && k !== "handler") o[k] = fields[k];
		o.core = p.getCoreUnitList().map((u) => (list.includes(u) ? u.id : "?") + (u.isDeployed ? "d" : "u"));
		return JSON.stringify(o);
	});
}

function hexStrings(m: GameMap): string {
	let hexes = "";
	for (let r = 0; r < m.rows; r++)
		for (let c = 0; c < m.cols; c++) {
			const h = m.map[r][c];
			hexes += [h.owner, h.flag, h.victorySide, h.unit ? h.unit.id : "", h.airunit ? h.airunit.id : "",
				+h.isZOC(0), +h.isZOC(1), +h.isSpotted(0), +h.isSpotted(1)].join(",") + ";";
		}
	return hexes;
}

//The same string from the state and the view. What the objects have beside the state is what the
//engine sets the same way on every unit in the list: not destroyed (it would have left the list),
//no move animation (the UI's), deployed when on a hex, its player the map's player of its owner,
//the transport's icon its equipment's
export function stateStringFromData(saved: SavedGame, view: View, equipment: EquipmentModule): string {
	const { state } = saved;
	const players = state.players;
	const playerOf = (owner: number) => owner < players.length ? players[owner].id : players[0].id;
	const units = state.units.map((u) => JSON.stringify({ ...sorted(unitFields(u, playerOf, equipment)), pos: u.row >= 0 ? u.row + "," + u.col : null }));
	const ps = players.map((p) => {
		const o = sorted({ airTransports: p.airTransports, country: p.country, dossier: p.dossier, id: p.id,
			navalTransports: p.navalTransports, playedTurn: p.playedTurn, prestige: p.prestige, prestigePerTurn: p.prestigePerTurn,
			score: p.score, side: p.side, supportCountries: p.supportCountries, type: p.type });
		o.core = p.core.map((c) => coreString(c, state.units));
		return JSON.stringify(o);
	});
	let hexes = "";
	state.map.hexes.forEach((h, i) => {
		hexes += [h.owner, h.flag, h.victorySide, h.unit ?? "", h.air ?? "", ...view.hexes[i].split(",")].join(",") + ";";
	});
	return [state.turn.turn, state.turn.currentPlayer >= 0 ? state.turn.currentPlayer : null,
		JSON.stringify(state.objectives), new Date(state.scenario.date).getTime(), state.scenario.dayTurn, state.reinforcements.length,
		contractHash(contractSerialize(state.equipment.indexes)), view.spotSide].join("|")
		+ "\n" + units.join("\n") + "\n" + ps.join("\n") + "\n" + hexes;
}

function unitFields(u: UnitState, playerOf: (owner: number) => number, equipment: EquipmentModule): Json {
	const onHex = u.row >= 0;
	return { ...u, row: undefined, col: undefined, destroyed: false, hasAnimation: false, isDeployed: onHex, player: playerOf(u.owner),
		transport: u.transport ? sorted({ ...u.transport, icon: equipment.equipment[u.transport.eqid].icon }) : null };
}

function coreString(c: CoreUnit, units: UnitState[]): string {
	if ("onMap" in c) {
		const u = units.find((x) => x.id === c.onMap);
		return c.onMap + (u.row >= 0 ? "d" : "u");
	}
	return "lost" in c ? "?d" : "?u";
}
