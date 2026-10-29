/**
 * Attack - who can fire on whom, from how far, and who fires in support
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

import { leaderType, unitClass } from "../prototypes";
import { canStartAttackOn } from "./equipment";
import { cellsInRange, distance } from "./geometry";
import type { Position, UnitState, World } from "./types";
import { hasLeader, isAir, isEnemy, isGone, unitUsesAmmo } from "./units";
import { ammoOf, currentEqid, hexIndex, isSpotted, sideOf, unitAt, unitData } from "./world";

//A gun range of 0 fires at the neighbours
export function unitAttackRange(w: World, u: UnitState): number {
	let range = unitData(w, u).gunrange;
	if (range === 0) range = 1;
	if (hasLeader(w, u, leaderType.marksman)) range += 1;
	return range;
}

//Whether u can fire on target, range aside: it has ammo, the target is an enemy, and an air target
//only for a unit with an air attack
export function canFire(w: World, u: UnitState, target: UnitState): boolean {
	if (isGone(w, u) || ammoOf(u) <= 0 || isGone(w, target) || !isEnemy(w, u, target)) return false;
	return !(isAir(w, target) && unitData(w, u).airatk <= 0);
}

//Whether u still has its shot this turn ("can fire"): it hasn't fired (an attack, or a move on its transport,
//uses it: moves.ts burn), what it is now uses ammo, and it has some left (its transport's when mounted).
//Not whether anything is in range: attackCells says that (#436)
export function canFireThisTurn(w: World, u: UnitState): boolean {
	return !u.hasFired && unitUsesAmmo(w, u) && ammoOf(u) > 0;
}

//Whether u can start an attack on target (some units only fire back at some targets)
export function canInitiateAttack(w: World, u: UnitState, target: UnitState): boolean {
	if (isGone(w, u) || isGone(w, target)) return false;
	if (isEnemy(w, u, target) && !canStartAttackOn(w.equipment, currentEqid(u), currentEqid(target))) return false;
	return canFire(w, u, target);
}

//The unit of a hex u can attack (Hex.getAttackableUnit): the one shown in airMode first, then the
//other (with one unit on the hex both modes show it: checked once)
export function attackableUnit(w: World, u: UnitState, hex: number, airMode: boolean): UnitState | null {
	const spotted = isSpotted(w, hex, sideOf(w, u));
	const first = unitAt(w, hex, airMode);
	if (canTarget(w, u, first, spotted)) return first;
	const second = unitAt(w, hex, !airMode);
	return second !== first && canTarget(w, u, second, spotted) ? second : null;
}

//A unit u's side sees (its hex is spotted, or it fired from hiding) and u can start an attack on
function canTarget(w: World, u: UnitState, target: UnitState | null, spotted: boolean): boolean {
	return target !== null && (spotted || target.tempSpotted) && canInitiateAttack(w, u, target);
}

//The hexes with a unit u can attack, in the order of cellsInRange, then its own hex (an air unit
//above a ground one, an air defence below an air unit). A hex with two targets is listed twice. A
//unit that fired or has no ammo, none
export function attackCells(w: World, u: UnitState): Position[] {
	if (u.hasFired || ammoOf(u) <= 0) return [];
	const range = unitAttackRange(w, u);
	const air = isAir(w, u);
	const groundAnywhere = hitsGroundAnywhere(w, air, range);
	const cells = cellsInRange(u.row, u.col, range, w.state.map.rows, w.state.map.cols);
	cells.push({ row: u.row, col: u.col });

	const allowed: Position[] = [];
	for (const cell of cells) {
		const below = cell.row === u.row && cell.col === u.col;
		for (let n = timesListed(w, u, hexIndex(w, cell.row, cell.col), below, air, groundAnywhere); n > 0; n--)
			allowed.push(cell);
	}
	return allowed;
}

//Whether u hits a ground unit on any hex in its range: an aircraft of range 1 only below it, but on the
//next hex too in the remaster's rules, as in PG2 (#285)
const hitsGroundAnywhere = (w: World, air: boolean, range: number) => !air || range > 1 || w.rules.airAttacksNextHex;

//How many times attackCells lists a hex: once for a ground target (groundAnywhere: on any hex in range,
//else only below), once for an air target (an air unit only an air one)
function timesListed(w: World, u: UnitState, hex: number, below: boolean, air: boolean, groundAnywhere: boolean): number {
	let n = 0;
	if (attackableUnit(w, u, hex, false) !== null) {
		if (groundAnywhere) return 1;
		if (below) n++;
	}
	const target = attackableUnit(w, u, hex, true);
	if (target !== null && (!air || isAir(w, target))) n++;
	return n;
}

export function isInAttackRange(w: World, u: UnitState, target: UnitState): boolean {
	if (u.row < 0 || target.row < 0) return false;
	return distance(u.row, u.col, target.row, target.col) <= unitAttackRange(w, u);
}

//Whether target is one of the screen's targets of u where it stands (attackCells), whether u can still
//fire or not: in range, a unit u's side sees and u can start an attack on, and for an aircraft of range
//1 a ground unit only below it unless the rules let it hit the next hex
export function isTargetFrom(w: World, u: UnitState, target: UnitState): boolean {
	if (!isInAttackRange(w, u, target)) return false;
	if (!canTarget(w, u, target, isSpotted(w, hexIndex(w, target.row, target.col), sideOf(w, u)))) return false;
	const below = u.row === target.row && u.col === target.col;
	return below || isAir(w, target) || hitsGroundAnywhere(w, isAir(w, u), unitAttackRange(w, u));
}

//The units that fire on the attacker when it attacks def from next to it: def's side's artillery
//against a ground attacker, its flak, air defence and fighters against an air one, in range of the
//attacker. In the order of the unit list
export function supportFireUnits(w: World, atk: UnitState, def: UnitState): UnitState[] {
	if (distance(atk.row, atk.col, def.row, def.col) > 1) return [];
	const side = sideOf(w, def), airAttack = isAir(w, atk);
	const support: UnitState[] = [];
	for (const u of w.state.units) {
		if (sideOf(w, u) !== side || u.id === def.id) continue;
		const ud = unitData(w, u);
		const range = ud.gunrange === 0 ? 1 : ud.gunrange;
		if (distance(u.row, u.col, atk.row, atk.col) > range) continue;
		const supports = airAttack
			? ud.uclass === unitClass.flak || ud.uclass === unitClass.airDefence || ud.uclass === unitClass.fighter
			: ud.uclass === unitClass.artillery;
		if (supports && canFire(w, u, atk)) support.push(u);
	}
	return support;
}
