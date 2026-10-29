/**
 * World - what a query reads (docs/CORE.md): the unit index, the hexes, a unit's player and what it
 * currently is (its carrier, its transport or itself)
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

import type { GameState, PlayerState, Sight, UnitId, UnitState, World } from "./types";

/** Unit id -> its index in the state's unit list (D2). */
export function unitIndex(state: GameState): Map<UnitId, number> {
	const index = new Map<UnitId, number>();
	state.units.forEach((u, i) => index.set(u.id, i));
	return index;
}

export function unitById(w: World, id: UnitId): UnitState | null {
	const i = w.index.get(id);
	return i === undefined ? null : w.state.units[i];
}

/** A hex's index in the state's and the data's hex lists. */
export function hexIndex(w: World, row: number, col: number): number {
	return row * w.state.map.cols + col;
}

export function onMap(w: World, row: number, col: number): boolean {
	return row >= 0 && row < w.state.map.rows && col >= 0 && col < w.state.map.cols;
}

/** The ground (or naval) unit on a hex, null for none. */
export function groundUnitAt(w: World, hex: number): UnitState | null {
	const id = w.state.map.hexes[hex].unit;
	return id === null ? null : unitById(w, id);
}

export function airUnitAt(w: World, hex: number): UnitState | null {
	const id = w.state.map.hexes[hex].air;
	return id === null ? null : unitById(w, id);
}

/** The unit a hex shows (the original's Hex.getUnit): with two, the air one in air mode; otherwise the one there. */
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

/** Whether the unit rides its transport: its fuel and points are a move's, and a move uses the unit's shot too. */
export function isRiding(u: UnitState): boolean {
	return u.isMounted && u.transport !== null;
}

/** What the unit currently is (the original's Unit.getEqid): its carrier, its transport if mounted, or itself. */
export function currentEqid(u: UnitState, forceUnit = false): number {
	if (u.carrier > 0 && !forceUnit) return u.carrier;
	if (isRiding(u) && !forceUnit) return u.transport.eqid;
	return u.eqid;
}

/** The equipment entry of what the unit currently is. */
export function unitData(w: World, u: UnitState, forceUnit = false): EquipmentEntry {
	return w.equipment[currentEqid(u, forceUnit)];
}

/** The movement points left: a carrier's or a transport's whole points (they use them all at once). */
export function movesLeft(w: World, u: UnitState): number {
	if (u.carrier > 0) return w.equipment[u.carrier].movpoints;
	if (isRiding(u)) return w.equipment[u.transport.eqid].movpoints;
	return u.hasMoved ? 0 : u.moveLeft;
}

/** The ammo the unit uses now: its transport's when mounted. */
export function ammoOf(u: UnitState): number {
	return isRiding(u) ? u.transport.ammo : u.ammo;
}

/** The fuel the unit uses now: its transport's when mounted. */
export function fuelOf(u: UnitState): number {
	return isRiding(u) ? u.transport.fuel : u.fuel;
}

/** Whether the side spots the hex (always with the fog of war off). */
export function isSpotted(w: World, hex: number, side: number): boolean {
	return w.noFOW || (side < 2 && w.sight.spot[side][hex] > 0);
}

export function isZOC(w: World, hex: number, side: number): boolean {
	return side < 2 && w.sight.zoc[side][hex] > 0;
}

export function emptySight(hexes: number): Sight {
	return { spot: [new Uint16Array(hexes), new Uint16Array(hexes)], zoc: [new Uint16Array(hexes), new Uint16Array(hexes)] };
}
