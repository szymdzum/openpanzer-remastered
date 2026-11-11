/**
 * The remastered AI's rule-based commander (#638): its directives from the maps: a hold for each objective in the
 * enemy's reach and the main effort.
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

import { distance } from "../geometry";
import { unitClass } from "../tables";
import type { Position, UnitId, UnitState, World } from "../types";
import type { Analysis, AnalysisCache, Sector } from "./analysis";
import { assaults, deadlineOf } from "./clock";
import { at, type Directive } from "./directives";
import { freeGround, samePosition, turnsTo } from "./march";
import type { SideView } from "./perception";

/**
 * What the commander is told beside the maps: its player, its last directives (none after a load), the units the
 * staff's operations hold, and the analysis's cache for the distance fields.
 */
export interface CommanderMemory {
	player: number;
	directives: readonly Directive[];
	held: ReadonlySet<UnitId>;
	cache: AnalysisCache;
}

/** A source of directives: the rules of `command`, or anything that answers in the same data. */
export type Commander = (w: World, view: SideView, a: Analysis, memory: CommanderMemory) => unknown;

//The turns of the enemy's moves within which an objective is held by a garrison: one could be there before it otherwise
const HOLD_TURNS = 2;
//The turns after the first a hold stands; then the commander weighs the objective again, the enemy has moved
const HOLD_FOR = 2;
//An enemy influence point around a sector counts this much against an own strength point in reach
const ENEMY_WEIGHT = 1;
/**
 * The rule-based commander's directives, the first in priority first: a hold for each of the side's objectives a
 * ground enemy can reach soon, and the main effort, one objective to assault, kept from `memory` while it goes on.
 * Pure: no random stream, nothing kept.
 */
export function command(w: World, view: SideView, a: Analysis, memory: CommanderMemory): Directive[] {
	const effort = mainEffort(w, a, memory, freeGround(w, memory.player, memory.held));
	const out = [...holds(w, view, a), ...(effort === null ? [] : [effort])];
	return out.map((d, i) => d.priority === i + 1 ? d : { ...d, priority: i + 1 });
}

//A hold for each objective a ground enemy the side knows of (seen or remembered, #17) can reach within HOLD_TURNS moves
function holds(w: World, view: SideView, a: Analysis): Directive[] {
	const out: Directive[] = [], until = w.state.turn.turn + HOLD_FOR;
	for (const target of a.objectives.hold) {
		const nearest = nearestEnemy(w, view, target);
		if (nearest !== Infinity) out.push({ task: "hold", target, priority: 0, until,
			reason: `hold ${at(target)}: enemy ${nearest} ${nearest === 1 ? "hex" : "hexes"} away` });
	}
	return out;
}

//The hexes to the nearest ground enemy that reaches the hex within HOLD_TURNS of its moves, Infinity when none does
function nearestEnemy(w: World, view: SideView, target: Position): number {
	let nearest = Infinity;
	for (const s of view.enemies) {
		if (w.equipment[s.eqid].uclass > unitClass.airDefence) continue;
		const d = distance(target.row, target.col, s.row, s.col);
		if (d <= HOLD_TURNS * w.equipment[s.moving].movpoints && d < nearest) nearest = d;
	}
	return nearest;
}

/**
 * The side's assault: the one of its last directives while its sector is still to take, its deadline not passed and it
 * isn't hopeless (the enemy around it stronger than what the side brings, where another sector isn't); else a new one
 * on the sector the side strikes best. None for a side that doesn't assault.
 */
function mainEffort(w: World, a: Analysis, memory: CommanderMemory, units: readonly UnitState[]): Directive | null {
	if (!assaults(w, a.side)) return null;
	const toTake = w.state.objectives[a.side], sectors = a.sectors.filter((s) => toTake.some((o) => samePosition(o, s.at)));
	const current = memory.directives.find((d) => d.task === "assault");
	if (current !== undefined && goesOn(w, a, memory.cache, units, sectors, current)) return current;
	const s = pickSector(w, memory.cache, units, sectors);
	if (s === null) return null;
	const until = deadlineOf(w, a.side);
	return { task: "assault", target: s.at, priority: 0, until,
		reason: `assault ${at(s.at)}: enemy ${Math.round(s.enemy)} around it, until turn ${until}` };
}

//What the side brings to a sector, each unit's strength the less the further it marches, less the enemy around it
function sectorScore(w: World, cache: AnalysisCache, units: readonly UnitState[], s: Sector): number {
	const own = units.reduce((n, u) => n + u.strength / (1 + turnsTo(w, cache, u, s.at)), 0);
	return own - ENEMY_WEIGHT * s.enemy;
}

//The sector the side strikes best: what it brings there against the enemy's influence around it
function pickSector(w: World, cache: AnalysisCache, units: readonly UnitState[], sectors: readonly Sector[]): Sector | null {
	let best: Sector | null = null, bestScore = -Infinity;
	for (const s of sectors) {
		const score = sectorScore(w, cache, units, s);
		if (score > bestScore) {
			best = s;
			bestScore = score;
		}
	}
	return best;
}

//Whether the assault goes on: its sector among those left, its deadline not passed, and not hopeless. Another sector
//counts against a hopeless one even when it was taken since the turn's analysis: the side broke through there
function goesOn(w: World, a: Analysis, cache: AnalysisCache, units: readonly UnitState[], sectors: readonly Sector[], d: Directive): boolean {
	const sector = sectors.find((s) => samePosition(s.at, d.target));
	if (w.state.turn.turn > d.until || sector === undefined) return false;
	if (sectorScore(w, cache, units, sector) >= 0) return true;
	return !a.sectors.some((s) => s !== sector && sectorScore(w, cache, units, s) >= 0);
}
