/**
 * The remastered AI's care of its units out of the fight: a unit short of ammunition or fuel resupplied before
 * contact, no ride ending in the enemy's reach but near an objective (#315), or a defender's that plays last (#626).
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

import type { Command } from "../command";
import { distance } from "../geometry";
import { check } from "../step";
import { canResupply, reinforcement } from "../supply";
import { unitClass } from "../tables";
import type { Position, UnitId, UnitState, World } from "../types";
import { canUnmount, isAir, unitUsesFuel } from "../units";
import { hexIndex, unitById, unitData } from "../world";
import type { Analysis } from "./analysis";
import { attacks } from "./clock";
import { isFree, type Rides } from "./staff";

//Short of ammunition or fuel: a third left or less, half the fuel for an aircraft, which falls when it runs out (the
//scripted general's rule)
const SHORT = 1 / 3;
const AIRCRAFT_FUEL_SHORT = 1 / 2;

const hexOf = (w: World, p: Position) => hexIndex(w, p.row, p.col);

/** Whether a ground enemy the side knows of reaches the hex next turn: it has influence there (analysis.ts). */
export const inGroundReach = (a: Analysis, hex: number): boolean => a.influence.enemy[hex] > 0;

//A ride may end in the enemy's reach this near an objective, to take or to hold: arriving in time decides it (in the
//arena, without it the attacker came too late on a crowded map and the defender's reserve too late to its objective)
const RIDE_TO_OBJECTIVE = 2;

//Every unit gets off its transport at the new round (commands/turn.ts): only an enemy that plays after the player in
//the round finds its units on their transports
const enemyPlaysAfter = (w: World, player: number) => w.state.players.some((p) => p.id > player
	&& p.side !== w.state.players[player].side);

const anywhere: Rides = () => true;

/**
 * Where the remastered AI ends a ride: out of the reach of the enemy's ground units (#315), or near an objective.
 * Its aircraft reach nearly everywhere, so they don't count: the ride is what the enemy's tanks and guns overrun.
 *
 * A defender that no enemy plays after in the round rides anywhere: its units are off their transports before the
 * enemy moves, and kept out of its reach they came late to the line (#626). An attacker keeps the rule then too: in
 * the arena it lost fewer units for its objectives out of reach.
 */
export function rideOutOfReach(w: World, a: Analysis, player: number): Rides {
	if (!enemyPlaysAfter(w, player) && !attacks(w, w.state.players[player].side)) return anywhere;
	return (_u, cell) => !inGroundReach(a, hexOf(w, cell))
		|| [...a.objectives.take, ...a.objectives.hold].some((o) => distance(o.row, o.col, cell.row, cell.col) <= RIDE_TO_OBJECTIVE);
}

/** A resupply for a unit no operation holds, short of ammunition or fuel, out of the enemy's reach: before contact. */
export function resupplyOrder(w: World, a: Analysis, player: number, held: ReadonlySet<UnitId>): Command | null {
	for (const u of w.state.units) {
		if (!isFree(u, player, held) || u.hasFired || u.hasResupplied || !isShort(w, u)) continue;
		const hex = hexOf(w, u);
		if (isAir(w, u) ? a.threat.air[hex] > 0 : inGroundReach(a, hex)) continue;
		const resupply: Command = { type: "resupply", unit: u.id };
		if (check(w, resupply) === null) return resupply;
	}
	return null;
}

function isShort(w: World, u: UnitState): boolean {
	const own = unitData(w, u, true);
	if (own.ammo > 0 && u.ammo <= own.ammo * SHORT) return true;
	return unitUsesFuel(w, u) && own.fuel > 0 && u.fuel <= own.fuel * (isAir(w, u) ? AIRCRAFT_FUEL_SHORT : SHORT);
}

/**
 * An unmount for a unit no operation holds that started the turn on its transport (`mounted`) within the enemy's
 * ground reach (#315): it moves on foot from there, or stays.
 */
export function unmountOrder(w: World, a: Analysis, player: number, held: ReadonlySet<UnitId>, mounted: ReadonlySet<UnitId>)
	: Command | null {
	for (const id of mounted) {
		const u = unitById(w, id);
		if (u === null || !isFree(u, player, held) || !canUnmount(u) || !inGroundReach(a, hexOf(w, u))) continue;
		const unmount: Command = { type: "unmount", unit: u.id };
		if (check(w, unmount) === null) return unmount;
	}
	return null;
}

//A unit worn down below this strength is reinforced before it does anything else, and one with less ammunition or
//fuel than this resupplied, wherever it stands: it can't fight as it is (the classic AI's thresholds)
const WORN_OUT = 4;
const LOW_AMMO = 2;
const LOW_FUEL = 5;

const isLow = (w: World, u: UnitState) => u.ammo < LOW_AMMO || (unitUsesFuel(w, u) && u.fuel < LOW_FUEL);

//The reinforcement of a unit the player's prestige, read from the world, pays a point of: not of a fortification
function reinforced(w: World, u: UnitState): Command | null {
	if (unitData(w, u, true).uclass === unitClass.fortification || reinforcement(w, u).bought < 1) return null;
	const reinforce: Command = { type: "reinforce", unit: u.id };
	return check(w, reinforce) === null ? reinforce : null;
}

function resupplied(w: World, u: UnitState): Command | null {
	const resupply: Command = { type: "resupply", unit: u.id };
	return canResupply(w, u) && check(w, resupply) === null ? resupply : null;
}

const canBeSupplied = (u: UnitState, player: number, held: ReadonlySet<UnitId>) => isFree(u, player, held) && !u.hasFired && !u.hasResupplied;

/**
 * The supply a unit no operation holds can't fight without, before its other orders: a reinforcement when it is worn
 * out, a resupply when it is nearly out of ammunition or fuel.
 */
export function urgentSupply(w: World, player: number, held: ReadonlySet<UnitId>): Command | null {
	for (const u of w.state.units) {
		if (!canBeSupplied(u, player, held)) continue;
		const cmd = (u.strength < WORN_OUT ? reinforced(w, u) : null) ?? (isLow(w, u) ? resupplied(w, u) : null);
		if (cmd !== null) return cmd;
	}
	return null;
}

/**
 * The supply of a unit no operation holds that neither moved nor fired this turn: a reinforcement while the player
 * can pay for one, else a resupply.
 */
export function idleSupply(w: World, player: number, held: ReadonlySet<UnitId>): Command | null {
	for (const u of w.state.units) {
		const cmd = canBeSupplied(u, player, held) ? reinforced(w, u) ?? resupplied(w, u) : null;
		if (cmd !== null) return cmd;
	}
	return null;
}
