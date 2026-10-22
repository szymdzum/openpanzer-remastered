/**
 * World - what a query reads (docs/CORE.md): the unit index, the hexes, a unit's player and what it
 * currently is (its carrier, its transport or itself)
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

import type { GameState, PlayerState, Sight, UnitId, UnitState, World } from "./types";

//Unit id -> its index in the state's unit list (D2)
export function unitIndex(state: GameState): Map<UnitId, number> {
	const index = new Map<UnitId, number>();
	state.units.forEach((u, i) => index.set(u.id, i));
	return index;
}

export function unitById(w: World, id: UnitId): UnitState | null {
	const i = w.index.get(id);
	return i === undefined ? null : w.state.units[i];
}

//A hex's index in the state's and the data's hex lists
export function hexIndex(w: World, row: number, col: number): number {
	return row * w.state.map.cols + col;
}

export function onMap(w: World, row: number, col: number): boolean {
	return row >= 0 && row < w.state.map.rows && col >= 0 && col < w.state.map.cols;
}

//The ground (or naval) unit on a hex, null for none
export function groundUnitAt(w: World, hex: number): UnitState | null {
	const id = w.state.map.hexes[hex].unit;
	return id === null ? null : unitById(w, id);
}

export function airUnitAt(w: World, hex: number): UnitState | null {
	const id = w.state.map.hexes[hex].air;
	return id === null ? null : unitById(w, id);
}

//The unit a hex shows (Hex.getUnit): with two units, the air one in air mode; otherwise the one there
export function unitAt(w: World, hex: number, airMode: boolean): UnitState | null {
	const ground = groundUnitAt(w, hex), air = airUnitAt(w, hex);
	if (ground !== null && air !== null) return airMode ? air : ground;
	return ground !== null ? ground : air;
}

export function playerOf(w: World, u: UnitState): PlayerState {
	return w.state.players[u.owner];
}

export function sideOf(w: World, u: UnitState): number {
	return w.state.players[u.owner].side;
}

//What the unit currently is: the carrier it is on, the transport it is mounted on, or itself
//(Unit.getEqid). forceUnit: itself
export function currentEqid(u: UnitState, forceUnit = false): number {
	if (u.carrier > 0 && !forceUnit) return u.carrier;
	if (u.isMounted && u.transport !== null && !forceUnit) return u.transport.eqid;
	return u.eqid;
}

export function unitData(w: World, u: UnitState, forceUnit = false): EquipmentEntry {
	return w.equipment[currentEqid(u, forceUnit)];
}

//The movement points left: a carrier's or a transport's whole points (they use them all at once)
export function movesLeft(w: World, u: UnitState): number {
	if (u.carrier > 0) return w.equipment[u.carrier].movpoints;
	if (u.isMounted && u.transport !== null) return w.equipment[u.transport.eqid].movpoints;
	return u.hasMoved ? 0 : u.moveLeft;
}

//The ammo and fuel the unit uses now: its transport's when mounted
export function ammoOf(u: UnitState): number {
	return u.isMounted && u.transport !== null ? u.transport.ammo : u.ammo;
}

export function fuelOf(u: UnitState): number {
	return u.isMounted && u.transport !== null ? u.transport.fuel : u.fuel;
}

export function isSpotted(w: World, hex: number, side: number): boolean {
	return w.noFOW || (side < 2 && w.sight.spot[side][hex] > 0);
}

export function isZOC(w: World, hex: number, side: number): boolean {
	return side < 2 && w.sight.zoc[side][hex] > 0;
}

//Sight with no unit counted, for a map of hexes hexes
export function emptySight(hexes: number): Sight {
	return { spot: [new Uint16Array(hexes), new Uint16Array(hexes)], zoc: [new Uint16Array(hexes), new Uint16Array(hexes)] };
}
