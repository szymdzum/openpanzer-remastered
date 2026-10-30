//What the scripted general (general.ts) reads of the map for its doctrine (#605): the enemy's reach, the
//sector to attack, the reserve, the rear. Only what its side sees.
import { terrainType, unitClass } from "../../src/core/tables";
import { unitAttackRange } from "../../src/core/attack";
import { distance } from "../../src/core/geometry";
import type { Position, UnitState, World } from "../../src/core/types";
import { isGround } from "../../src/core/units";
import { hexIndex, isSpotted, sideOf, unitData } from "../../src/core/world";

/** The share of the mobile units held back in reserve: enough to answer one threat, few enough to attack with the rest. */
export const RESERVE_SHARE = 0.2;
//A unit that moves this far a turn can be sent where it is needed
const MOBILE_MOVES = 4;
//The enemy around an objective that stands in the way of an attack on it
export const SECTOR_RADIUS = 4;
//Own units this close to an objective can join the attack on it
const FORCE_RADIUS = 10;
//An enemy strength point in the way counts this much against an own one in reach: it is often not all seen
const ENEMY_WEIGHT = 0.5;
//A hex further from the force costs this much of a sector's score: the nearer sector is struck sooner
const DISTANCE_WEIGHT = 2;
/** A unit at this strength or below is worn down: it can't hold a line and should withdraw to be reinforced. */
export const WORN = 4;
/** The turns of the enemy's moves within which an objective needs a garrison. */
export const GARRISON_TURNS = 2;
/** The last share of the turns, when the attacker commits everything to the objectives still in reach. */
export const LATE_SHARE = 1 / 3;

/** Whether the general sees the unit: its hex spotted by its side, or the unit seen this turn. */
export function seen(w: World, u: UnitState, side: number): boolean {
	return isSpotted(w, hexIndex(w, u.row, u.col), side) || u.tempSpotted;
}

/** The enemy's ground units the side sees. */
export function enemyGround(w: World, side: number): UnitState[] {
	return w.state.units.filter((e) => e.row >= 0 && sideOf(w, e) !== side && isGround(w, e) && seen(w, e, side));
}

/** Whether one of the enemies can reach and hit the hex within `turns` of its moves. */
export function inReach(w: World, enemies: readonly UnitState[], c: Position, turns = 1): boolean {
	return enemies.some((e) => distance(c.row, c.col, e.row, e.col)
		<= turns * unitData(w, e).movpoints + Math.max(1, unitAttackRange(w, e)));
}

/** Whether the game is in its last turns (LATE_SHARE). */
export function isLate(w: World): boolean {
	return w.state.turn.turn > w.state.scenario.maxTurns * (1 - LATE_SHARE);
}

/**
 * The objective to attack: the own strength in reach of it against the enemy's in its way, less its
 * distance from the force.
 */
export function pickSector(own: readonly UnitState[], enemies: readonly UnitState[], toTake: readonly Position[]): Position | null {
	let best: Position | null = null, bestScore = -Infinity;
	for (const o of toTake) {
		const s = sectorScore(own, enemies, o);
		if (s > bestScore) {
			best = o;
			bestScore = s;
		}
	}
	return best;
}

function sectorScore(own: readonly UnitState[], enemies: readonly UnitState[], o: Position): number {
	const near = (us: readonly UnitState[], radius: number) => us.filter((u) => distance(u.row, u.col, o.row, o.col) <= radius);
	const strength = (us: readonly UnitState[]) => us.reduce((a, u) => a + u.strength, 0);
	const far = own.length ? own.reduce((a, u) => a + distance(u.row, u.col, o.row, o.col), 0) / own.length : 0;
	return strength(near(own, FORCE_RADIUS)) - ENEMY_WEIGHT * strength(near(enemies, SECTOR_RADIUS)) - DISTANCE_WEIGHT * far;
}

/** Whether the attack on the sector broke through: no enemy left in its way. */
export function brokeThrough(enemies: readonly UnitState[], sector: Position): boolean {
	return !enemies.some((e) => distance(e.row, e.col, sector.row, sector.col) <= SECTOR_RADIUS);
}

/** The ground units that can be sent where they are needed: not artillery, not slow. */
export function mobile(w: World, us: readonly UnitState[]): UnitState[] {
	return us.filter((u) => isGround(w, u) && unitData(w, u).uclass !== unitClass.artillery && unitData(w, u).movpoints >= MOBILE_MOVES);
}

/** The reserve: RESERVE_SHARE of the mobile units, the furthest from the enemy. */
export function pickReserve(w: World, own: readonly UnitState[], enemies: readonly UnitState[]): Set<number> {
	const front = (u: UnitState) => Math.min(Infinity, ...enemies.map((e) => distance(u.row, u.col, e.row, e.col)));
	const candidates = mobile(w, own).sort((a, b) => front(b) - front(a) || a.id - b.id);
	return new Set(candidates.slice(0, Math.round(candidates.length * RESERVE_SHARE)).map((u) => u.id));
}

/** How good a hex is to fall back to: out of the enemy's reach, far from it, on a city or airfield of its side. */
export function rearScore(w: World, side: number, enemies: readonly UnitState[], c: Position): number {
	const nearest = Math.min(99, ...enemies.map((e) => distance(c.row, c.col, e.row, e.col)));
	const hex = hexIndex(w, c.row, c.col), owner = w.state.map.hexes[hex].owner, t = w.data.hexes[hex].terrain;
	const town = (t === terrainType.City || t === terrainType.Airfield) && owner !== -1
		&& w.state.players[owner < w.state.players.length ? owner : 0].side === side;
	return (inReach(w, enemies, c) ? 0 : 10) + nearest + (town ? 3 : 0);
}
