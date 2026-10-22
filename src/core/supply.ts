/**
 * Supply - whether a unit can resupply or reinforce, and how much it gets: less outside a city
 * and with enemies around
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

import { terrainType, unitClass } from "../prototypes";
import { adjacent } from "./geometry";
import type { Supply, UnitState, World } from "./types";
import { isAir, isGround, isSea } from "./units";
import { groundUnitAt, hexIndex, onMap, playerOf, sideOf, unitData } from "./world";

//The enemy ground units on the hexes around the unit
function adjacentEnemies(w: World, u: UnitState): number {
	const side = sideOf(w, u);
	let enemies = 0;
	for (const c of adjacent(u.row, u.col)) {
		if (!onMap(w, c.row, c.col)) continue;
		const other = groundUnitAt(w, hexIndex(w, c.row, c.col));
		if (other !== null && sideOf(w, other) !== side) enemies++;
	}
	return enemies;
}

//An airfield of the unit's country under or next to it, or its own carrier under it
function isAirfieldAround(w: World, u: UnitState): boolean {
	const player = playerOf(w, u);
	const hex = hexIndex(w, u.row, u.col);
	const carrier = groundUnitAt(w, hex);
	if ((w.data.hexes[hex].terrain === terrainType.Airfield && w.state.map.hexes[hex].flag === player.country)
		|| (carrier !== null && unitData(w, carrier).uclass === unitClass.carrier && carrier.owner === player.id))
		return true;
	return adjacent(u.row, u.col).some((c) => {
		if (!onMap(w, c.row, c.col)) return false;
		const near = hexIndex(w, c.row, c.col);
		return w.data.hexes[near].terrain === terrainType.Airfield && w.state.map.hexes[near].flag === player.country;
	});
}

//Where a unit can resupply or reinforce: ground units anywhere, air units at an airfield, ships out
//of a port (kept bug #19: the bundle checks for NOT being in a port)
function canSupplyHere(w: World, u: UnitState): boolean {
	if (isGround(w, u)) return true;
	if (isAir(w, u) && isAirfieldAround(w, u)) return true;
	return isSea(w, u) && w.data.hexes[hexIndex(w, u.row, u.col)].terrain !== terrainType.Port;
}

//A unit that hasn't moved, fired or resupplied, short of ammo or fuel (its own or its transport's)
export function canResupply(w: World, u: UnitState): boolean {
	if (u.hasMoved || u.hasFired || u.hasResupplied) return false;
	const own = unitData(w, u, true);
	let needAmmo = u.ammo < own.ammo;
	let needFuel = u.fuel < own.fuel;
	if (u.transport !== null) {
		const t = w.equipment[u.transport.eqid];
		needAmmo = needAmmo || u.transport.ammo < t.ammo;
		needFuel = needFuel || u.transport.fuel < t.fuel;
	}
	if (!needAmmo && !needFuel) return false;
	return canSupplyHere(w, u);
}

//overstrength: above 10, one point per experience bar, once; otherwise up to 10, not after a resupply
export function canReinforce(w: World, u: UnitState, overstrength = false): boolean {
	if (u.hasOverstrength) return false;
	if (overstrength) {
		if (u.strength < 10 || u.experience < 100) return false;
		if (u.strength >= 10 + Math.round(u.experience / 100)) return false;
	} else if (u.hasResupplied || u.strength >= 10) {
		return false;
	}
	return canSupplyHere(w, u);
}

//What a resupply gives: all that's missing for air and naval units, otherwise / 1.3 outside a
//city, / 1.5 with one or two enemies around, / 3 with more, at least 1 ammo and 1 fuel (kept bug
//#95: even when full). isTurnStart: the automatic resupply at a turn's start, only in a city with
//no enemy around
export function resupplyValue(w: World, u: UnitState, isTurnStart = false): Supply {
	if (!canResupply(w, u)) return supply(0, 0, 0, 0);
	const own = unitData(w, u, true);
	let ammo = own.ammo - u.ammo;
	let fuel = own.fuel - u.fuel;
	if (isAir(w, u) || isSea(w, u)) return supply(ammo, fuel, 0, 0);

	let tAmmo = 0, tFuel = 0;
	if (u.transport !== null) {
		const t = w.equipment[u.transport.eqid];
		tAmmo = t.ammo - u.transport.ammo;
		tFuel = t.fuel - u.transport.fuel;
	}
	const enemies = adjacentEnemies(w, u);
	const inCity = w.data.hexes[hexIndex(w, u.row, u.col)].terrain === terrainType.City;
	if (isTurnStart && (enemies > 0 || !inCity)) return supply(0, 0, 0, 0);

	const divisor = supplyDivisor(inCity, enemies);
	ammo = Math.max(1, ammo / divisor[0] / divisor[1]);
	fuel = Math.max(1, fuel / divisor[0] / divisor[1]);
	tAmmo = tAmmo / divisor[0] / divisor[1];
	tFuel = tFuel / divisor[0] / divisor[1];
	return supply(Math.round(ammo), Math.round(fuel), Math.round(tAmmo), Math.round(tFuel));
}

//The two divisions of what a unit gets, applied one after the other: outside a city, then by the
//enemies around
function supplyDivisor(inCity: boolean, enemies: number): [number, number] {
	return [inCity ? 1 : 1.3, enemies > 2 ? 3 : enemies > 0 ? 1.5 : 1];
}

function supply(ammo: number, fuel: number, transportAmmo: number, transportFuel: number): Supply {
	return { ammo, fuel, transportAmmo, transportFuel };
}

//The strength a reinforcement gives: up to 10 (overstrength: 10 plus the experience bars), air
//units all of it, the others divided as resupply is
export function reinforceValue(w: World, u: UnitState, overstrength = false): number {
	if (!canReinforce(w, u, overstrength)) return 0;
	let strength = overstrength ? 10 + Math.round(u.experience / 100) - u.strength : 10 - u.strength;
	if (isAir(w, u)) return strength;
	const divisor = supplyDivisor(w.data.hexes[hexIndex(w, u.row, u.col)].terrain === terrainType.City, adjacentEnemies(w, u));
	strength = strength / divisor[0] / divisor[1];
	return Math.round(strength);
}
