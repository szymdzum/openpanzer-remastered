/**
 * AI scores - what the AI thinks of a hex for a unit, of an attack, of the attacks from a hex and
 * of the nearest objective
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

import { type AIConfig, roadType, terrainEntrenchment, terrainInitiative, terrainType, unitClass } from "./tables";
import { nextRandom, type RngStream } from "./random";
import { attackCells, attackableUnit, canInitiateAttack } from "./attack";
import { combatResult } from "./combat";
import { playerAt } from "./draft";
import { adjacent, distance } from "./geometry";
import type { Position, UnitId, UnitState, World } from "./types";
import { canEntrench, isAir, isCloseCombatTerrain, isEnemy, isGround } from "./units";
import { hexIndex, isSpotted, playerOf, sideOf, unitAt, unitData } from "./world";
import { spotsUnit } from "./sight";

/** An enemy unit the AI attacks this turn; losses: the strength it expects it to lose so far. */
export interface EnemyUnit {
	isAttacked: boolean;
	losses: number;
	isKilled: boolean;
}

export interface AIPlan {
	enemyUnits: Map<UnitId, EnemyUnit>;
	takenPositions: PlannedPosition[];	//hexes its units were ordered to move to
	freedPositions: PlannedPosition[];	//hexes its units were ordered to leave
	objectives: Position[];		//the side's objectives to take, in the order of its list (D7, #141)
}

//A hex an AI unit was ordered to move to or to leave; air: the slot it takes or frees is the air above
//it, not the ground (#74, #225).
interface PlannedPosition extends Position {
	air: boolean;
}

/** The world as the turn started and the plan so far: the AI plans its whole turn before playing any of it. */
export interface Scorer {
	readonly w: World;
	readonly player: number;
	readonly config: AIConfig;
	readonly plan: AIPlan;
	readonly rng: RngStream;
}

export interface AttackScore {
	score: number;
	kills: number;
}

//One draw of the AI's stream (an index 0 to 7 into the settings' factors). The order of the draws is
//behavior: each cell and attack score draws once, except where it returns early.
function randomFactor(s: Scorer): number {
	return s.config.randomFactor[Math.floor(nextRandom(s.rng) * 8)];
}

/** A copy of the unit standing on cell: the state is unchanged, the hex's own unit stays where it was. */
export function standingOn(u: UnitState, cell: Position): UnitState {
	return u.row === cell.row && u.col === cell.col ? u : { ...u, row: cell.row, col: cell.col };
}

/**
 * The index of the hex among the freed ones, for its air (air true), its ground (false) or either
 * (undefined); -1 when the plan didn't free it.
 */
export function findFreed(plan: AIPlan, cell: Position, air?: boolean): number {
	return plan.freedPositions.findIndex((c) => c.row === cell.row && c.col === cell.col && (air === undefined || c.air === air));
}

//Whether the plan sent a unit to the hex's slot already: an aircraft over a hex leaves its ground free
//(#225).
function isTaken(plan: AIPlan, cell: Position, air: boolean): boolean {
	return plan.takenPositions.some((c) => c.row === cell.row && c.col === cell.col && c.air === air);
}

function expectedKilled(plan: AIPlan, id: UnitId): boolean {
	const e = plan.enemyUnits.get(id);
	return e !== undefined && e.isKilled;
}

/**
 * isPotential: a hex scored for a move, where an attack on a unit expected killed or with too many losses
 * counts as its score or 0, not as the bad attack score. Those return before the draw; a unit it can't
 * start an attack on scores 0, drawn all the same.
 */
export function attackScore(s: Scorer, u: UnitState, cell: Position, isPotential: boolean): AttackScore {
	const target = attackableUnit(s.w, u, hexIndex(s.w, cell.row, cell.col), false);
	if (!canInitiateAttack(s.w, u, target)) {
		randomFactor(s);
		return { score: 0, kills: 0 };
	}
	const r = targetScore(s, u, target, isPotential);
	return r.drawn ? { score: r.score * randomFactor(s), kills: r.kills } : { score: r.score, kills: r.kills };
}

//What the attack would kill and lose, by class; 100 more to finish a unit already attacked. drawn: scored
//to the end, its random factor still to draw.
function targetScore(s: Scorer, u: UnitState, target: UnitState, isPotential: boolean): AttackScore & { drawn: boolean } {
	const { w, config } = s, enemy = s.plan.enemyUnits.get(target.id);
	if (enemy !== undefined && enemy.isKilled) return { score: isPotential ? 0 : config.badAttackScore, kills: 0, drawn: false };
	let score = enemy !== undefined && enemy.isAttacked ? 100 : 0;
	//Kept bug (#17): the support fire of the hidden units counts
	const cr = combatResult(w, u, target, true, null);
	score = score + (cr.kills * config.unitClassKillValue[unitData(w, target).uclass]
		- cr.losses * config.unitClassLossCost[unitData(w, u).uclass]);
	if (cr.losses >= u.strength || u.strength / cr.losses < config.minStrengthLossRatio)
		return { score: isPotential ? score : config.badAttackScore, kills: cr.kills, drawn: false };
	return { score: targetHexScore(s, u, target, score), kills: cr.kills, drawn: true };
}

function targetHexScore(s: Scorer, u: UnitState, target: UnitState, score: number): number {
	const targetHex = hexIndex(s.w, target.row, target.col);
	if (s.w.state.map.hexes[targetHex].victorySide !== -1) score += 350;
	if (!spotsUnit(s.w, target, sideOf(s.w, u))) score *= s.config.unspottedFactor;
	return score;
}

export function attackPotential(s: Scorer, u: UnitState, cell: Position): number {
	const there = standingOn(u, cell);
	let score = 0;
	for (const c of attackCells(s.w, there)) score += attackScore(s, there, c, true).score;
	return score;
}

/**
 * The score of u standing on cell. canMove: the move range says it can stop there (a hex another AI unit
 * of its kind leaves counts as free: an aircraft leaving frees the air above a ground unit, not the
 * ground, #74). A hex another AI unit of its kind was ordered to is taken (#225): -5000, before the draw.
 */
export function cellScore(s: Scorer, u: UnitState, cell: Position, canMove: boolean): number {
	const air = isAir(s.w, u);
	if (isTaken(s.plan, cell, air)) return -5000;
	if (!canMove && findFreed(s.plan, cell, air) < 0) return -5000;

	const w = s.w, hex = hexIndex(w, cell.row, cell.col), side = sideOf(w, u);
	const uclass = unitData(w, u).uclass;
	let score = 0;
	if (!isSpotted(w, hex, ~side & 1)) score -= 40;
	if (!isSpotted(w, hex, side)) score += 30;
	if (w.state.map.hexes[hex].victorySide === -1 && w.data.hexes[hex].deployment === s.player) score -= 100;
	if (uclass === unitClass.fighter || uclass === unitClass.tacticalBomber || uclass === unitClass.levelBomber)
		return score * randomFactor(s);

	score += terrainScore(w, u, hex) + occupyScore(s, u, hex, findFreed(s.plan, cell, false) >= 0) + neighboursScore(s, u, cell);
	return score * randomFactor(s);
}

function terrainScore(w: World, u: UnitState, hex: number): number {
	const terrain = w.data.hexes[hex].terrain;
	let score = 0;
	if (canEntrench(w, u) && u.entrenchment < terrainEntrenchment[terrain]) score += 50;
	if (terrainInitiative[w.data.hexes[hexIndex(w, u.row, u.col)].terrain] < terrainInitiative[terrain]) score += 20;
	if ((terrain === terrainType.River || terrain === terrainType.Stream) && w.data.hexes[hex].road === roadType.none) score -= 70;
	if (isCloseCombatTerrain(terrain)) score += closeCombatScore(unitData(w, u).uclass);
	return score + flagScore(w, u, hex);
}

function flagScore(w: World, u: UnitState, hex: number): number {
	const flag = w.state.map.hexes[hex].flag;
	return flag !== -1 && flag !== playerOf(w, u).country && isGround(w, u) ? 50 : 0;
}

//Close combat terrain: good for infantry, a little for guns, bad for the rest.
function closeCombatScore(uclass: number): number {
	if (uclass === unitClass.infantry) return 120;
	return uclass === unitClass.artillery || uclass === unitClass.antiTank || uclass === unitClass.airDefence ? 10 : -50;
}

//An objective the unit can stand on: free, freed by an AI unit, its own, or held by a unit expected to
//be killed. Only the hex's ground unit counts (isFreed: the AI's ground unit leaves the hex, not an
//aircraft above it, #207).
function occupyScore(s: Scorer, u: UnitState, hex: number, isFreed: boolean): number {
	const h = s.w.state.map.hexes[hex];
	if (h.victorySide === -1) return 0;
	if (h.unit !== null && !isFreed && h.unit !== u.id && !expectedKilled(s.plan, h.unit)) return 0;
	const uclass = unitData(s.w, u).uclass;
	if (uclass === unitClass.artillery) return 50;
	if (uclass === unitClass.infantry) return 600;
	return uclass === unitClass.tank ? 350 : 300;
}

//The neighbours: friends that stay (artillery more), enemies or friends leaving, objectives (more when
//not the side's own). A friend leaves when the plan freed its own slot: a ground unit stays when the
//aircraft above it was ordered away (#207). Kept from the bundle: the last row and column are left out.
function neighboursScore(s: Scorer, u: UnitState, cell: Position): number {
	const { rows, cols } = s.w.state.map;
	let score = 0;
	for (const c of adjacent(cell.row, cell.col))
		if (c.row >= 0 && c.col >= 0 && c.row < rows - 1 && c.col < cols - 1) score += neighbourScore(s, u, c);
	return score;
}

function neighbourScore(s: Scorer, u: UnitState, c: Position): number {
	const w = s.w, hex = hexIndex(w, c.row, c.col), artillery = unitData(w, u).uclass === unitClass.artillery;
	const other = unitAt(w, hex, false);
	let score = 0;
	if (other !== null && other.id !== u.id) {
		if (!isEnemy(w, u, other) && findFreed(s.plan, c, isAir(w, other)) < 0) score += unitData(w, other).uclass === unitClass.artillery ? 100 : 20;
		else score += artillery ? -100 : 40;
	}
	const h = w.state.map.hexes[hex];
	//A victory hex with no owner (-1) is nobody's (#100)
	if (h.victorySide !== -1) score += objectiveNearScore(unitData(w, u).uclass, h.owner !== -1 && playerAt(w, h.owner).side === sideOf(w, u));
	return score;
}

//An objective next to the hex: more for infantry, less when the side holds it.
function objectiveNearScore(uclass: number, owned: boolean): number {
	if (uclass === unitClass.artillery || uclass === unitClass.flak) return 50;
	if (uclass === unitClass.infantry) return owned ? 70 : 100;
	return owned ? 50 : 70;
}

/**
 * The nearest of the objectives to take (the first of equally near ones) and a score growing as it
 * gets closer; standing on one scores most.
 */
export function objectiveScore(s: Scorer, cell: Position): { cell: Position | null; score: number } {
	let best: Position | null = null, score = 0;
	for (const o of s.plan.objectives) {
		const d = distance(cell.row, cell.col, o.row, o.col);
		if (d <= 0) return { cell, score: s.config.objectiveScore + 100 };
		if (s.config.objectiveScore / d > score) {
			score = s.config.objectiveScore / d;
			best = o;
		}
	}
	return { cell: best, score: Math.round(score) };
}
