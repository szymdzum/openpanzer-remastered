//The deployment (#345, the Deployment card): the person's core units waiting in the reserve, the brass zone of
//the hexes their side deploys on, and the reserve unit picked shown on the hovered hex where a click places it.
//Plain functions of the core's World, tested without the DOM (test/view-map.test.ts); every rule is the deploy
//command's own (src/core/commands/units.ts): where it may go is its check, how it lands its deployedAs.
import type { Command } from "../core/command";
import { asUnit } from "../core/commands/common";
import { deployedAs } from "../core/commands/units";
import { deploymentHexes } from "../core/deployment";
import type { OffMapUnit, Position, World } from "../core/types";
import { isAir } from "../core/units";
import { hexIndex, unitData } from "../core/world";
import { type Edge, outlineOf } from "./mapview";
import { isYourTurn, refusalOf } from "./model";
import { listSprite } from "./unitlist";

//A unit in the reserve: its place in its player's core list (the deploy command's index), its name and strength
export interface ReserveUnit {
	index: number;
	name: string;
	strength: number;
}

//The zone while a reserve unit is picked: the side's deployment hexes, those free (tinted: no unit in either slot,
//a taken one keeps only its line), the one outline round them, and the unit picked with how many wait in the reserve
export interface Deployment {
	unit: ReserveUnit;
	zone: Position[];
	free: Position[];
	outline: Edge[];
	waiting: number;
}

//The picked unit on the hovered hex where it can be placed: its sprite and facing at 55%, and the tag beside it
//(DOM): "Place Pz IIIE", then how it lands and that it can't go back
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

//The reserve tray (Deployment): the reserve's units with their sprites, the one picked
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
