//The deployment: the person's reserve units, the zone their side deploys on, and the picked unit on the hovered hex.
//Every rule is the deploy command's own (src/core/commands/units.ts): where it may go is its check, how it lands its
//deployedAs. Tested without the DOM (test/view-map.test.ts).
import type { Command } from "../../core/command";
import { asUnit } from "../../core/commands/common";
import { deployedAs } from "../../core/commands/units";
import { deploymentHexes } from "../../core/deployment";
import type { OffMapUnit, Position, World } from "../../core/types";
import { isAir } from "../../core/units";
import { hexIndex, unitData } from "../../core/world";
import { type Edge, outlineOf } from "./mapview";
import { isYourTurn, refusalOf } from "../store/model";
import { listSprite } from "../hud/unitlist";

//index is the unit's place in its player's core list, as the deploy command takes it
export interface ReserveUnit {
	index: number;
	name: string;
	strength: number;
}

//The zone while a reserve unit is picked; free: the hexes with no unit in either slot (tinted, a taken one keeps only
//its line); waiting: how many units wait in the reserve
export interface Deployment {
	unit: ReserveUnit;
	zone: Position[];
	free: Position[];
	outline: Edge[];
	waiting: number;
}

//The picked unit on the hovered hex where it can be placed, drawn at 55%, and the tag beside it (DOM): title
//"Place Pz IIIE", note how it lands and that it can't go back
export interface Ghost {
	row: number;
	col: number;
	icon: string;
	facing: number;
	title: string;
	note: string;
}

const reserveAt = (w: World, index: number): OffMapUnit | null => {
	const c = w.state.players[w.state.turn.currentPlayer].core[index];
	return c !== undefined && "reserve" in c ? c.reserve : null;
};

//The current player's reserve, in the core list's order, when a person plays it here: none on another's turn
export function reserveOf(w: World): ReserveUnit[] {
	const units: ReserveUnit[] = [];
	if (!isYourTurn(w)) return units;
	w.state.players[w.state.turn.currentPlayer].core.forEach((c, index) => {
		if ("reserve" in c) units.push({ index, name: w.equipment[c.reserve.eqid].name, strength: c.reserve.strength });
	});
	return units;
}

export interface Tray {
	units: (ReserveUnit & { sprite: string, picked: boolean })[];
}

export function trayOf(w: World, picked: number | null): Tray {
	const units = reserveOf(w).map((r) => ({ ...r, sprite: listSprite(w.equipment[reserveAt(w, r.index)!.eqid]), picked: r.index === picked }));
	return { units };
}

//The zone of the side whose turn it is, with the reserve unit at index picked; null when it isn't in the reserve
export function deploymentOf(w: World, index: number | null): Deployment | null {
	const reserve = reserveOf(w), unit = reserve.find((r) => r.index === index);
	if (unit === undefined) return null;
	const { cols, hexes } = w.state.map;
	const zone = deploymentHexes(w, w.state.players[w.state.turn.currentPlayer].side).map((hex) => ({ row: Math.floor(hex / cols), col: hex % cols }));
	const free = zone.filter((c) => {
		const h = hexes[hexIndex(w, c.row, c.col)];
		return h.unit === null && h.air === null;
	});
	return { unit, zone, free, outline: outlineOf(w, zone), waiting: reserve.length };
}

//The deploy command of the picked unit on a hex, when the core takes it
export function placeOn(w: World, d: Deployment | null, at: Position | null): Command | null {
	if (d === null || at === null) return null;
	const cmd: Command = { type: "deploy", index: d.unit.index, to: { row: at.row, col: at.col } };
	return refusalOf(w, cmd) === null ? cmd : null;
}

//The picked unit on the hovered hex, where it can be placed: as the deploy would place it, an aircraft in the air
//slot, a ground unit on the ocean embarked
export function ghostOf(w: World, d: Deployment | null, at: Position | null): Ghost | null {
	if (placeOn(w, d, at) === null) return null;
	const unit = reserveAt(w, d!.unit.index)!, placed = deployedAs(w, unit, hexIndex(w, at!.row, at!.col));
	const how = isAir(w, asUnit(unit)) ? "air" : placed !== unit ? "embarked" : null;
	return { row: at!.row, col: at!.col, icon: unitData(w, asUnit(placed)).icon, facing: unit.facing,
		title: "Place " + d!.unit.name, note: (how === null ? "" : how + " · ") + "can't go back to the reserve" };
}
