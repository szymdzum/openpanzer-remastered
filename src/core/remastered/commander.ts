/**
 * The remastered AI's rule-based commander (#638): its directives from the maps and the turn clock: a hold for each
 * objective in the enemy's reach, the counterattacks and the main effort.
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

import { unitAttackRange } from "../attack";
import { estimateAttack } from "../estimate";
import { adjacent, distance } from "../geometry";
import { unitClass } from "../tables";
import type { Position, UnitId, UnitState, World } from "../types";
import { canCapture, firesOnlyBeforeMoving, isGround } from "../units";
import { ammoOf, onMap, unitData } from "../world";
import type { Analysis, AnalysisCache, Sector } from "./analysis";
import { assaults, type Clock, clockLine, clockOf, deadlineOf } from "./clock";
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
//An enemy at this strength or below is worn down (the scripted general's WORN)
const WORN = 4;
//A worn-down enemy this near an objective the side holds, out of its holes (this entrenchment or less), is worth a
//defender's counterattack
const COUNTER_RADIUS = 3;
const OPEN_ENTRENCHMENT = 1;
//The turns a counterattack on an objective just lost stands: its taker digs in after that
const COUNTER_TURNS = 2;
//A loss counts this much against a kill in a counterattack's estimate (the scripted general's LOSS_WEIGHT)
const LOSS_WEIGHT = 0.7;

/**
 * The rule-based commander's directives, the first in priority first: a hold for each of the side's objectives a
 * ground enemy can reach soon, the counterattacks the estimate favours, and the main effort, one objective to assault,
 * kept from `memory` while it goes on. It keeps no reserve: held back, a fifth of an attacker's mobile units cost it
 * objectives on other seeds than those it was tuned on (docs/ai/arena.md). Pure: no random stream, nothing kept.
 */
export function command(w: World, view: SideView, a: Analysis, memory: CommanderMemory): Directive[] {
	const clock = clockOf(w, a.side), units = freeGround(w, memory.player, memory.held);
	const strikes = counterattacks(w, view, a, memory, units, clock);
	const effort = mainEffort(w, a, memory, units, clock);
	const out = [...holds(w, view, a), ...strikes, ...(effort === null ? [] : [effort])];
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
 * The counterattacks: those of the last directives that still stand, one on an objective the side held at its last
 * directives and has lost, and, for a side that defends, one on a worn-down enemy out of its holes near an objective
 * it holds (an attacker's units are its main effort's); a new one only when the estimate favours the units in reach.
 */
function counterattacks(w: World, view: SideView, a: Analysis, memory: CommanderMemory, units: readonly UnitState[], clock: Clock): Directive[] {
	const turn = w.state.turn.turn;
	const out = memory.directives.filter((d) => d.task === "counterattack" && d.until >= turn && enemyOn(view, d.target) !== undefined);
	const isNew = (p: Position) => !out.some((d) => samePosition(d.target, p));
	for (const lost of justLost(w, a, memory).filter(isNew)) {
		const gain = favourOn(w, units, enemyOn(view, lost));
		if (gain > 0) out.push({ task: "counterattack", target: lost, priority: 0, until: turn + COUNTER_TURNS - 1,
			reason: `counterattack ${at(lost)}: just lost, the estimate gives ${gain.toFixed(1)} for the units in reach` });
	}
	for (const t of clock.attacks ? [] : view.seen.filter((x) => isWornInTheOpen(w, a, x) && isNew(x))) {
		if (favourOn(w, units, t) > 0) out.push({ task: "counterattack", target: { row: t.row, col: t.col }, priority: 0, until: turn,
			reason: `counterattack ${at(t)}: ${unitData(w, t).name} worn down to ${t.strength} near our objective` });
	}
	return out;
}

//The objectives the commander's last directives held that are now the side's to take
function justLost(w: World, a: Analysis, memory: CommanderMemory): Position[] {
	const toTake = w.state.objectives[a.side];
	return memory.directives.filter((d) => (d.task === "hold" || d.task === "delay") && toTake.some((o) => samePosition(o, d.target)))
		.map((d) => d.target);
}

const enemyOn = (view: SideView, p: Position) => view.seen.find((t) => samePosition(t, p));

const isWornInTheOpen = (w: World, a: Analysis, t: UnitState) => isGround(w, t) && t.strength <= WORN && t.entrenchment <= OPEN_ENTRENCHMENT
	&& a.objectives.hold.some((o) => distance(o.row, o.col, t.row, t.col) <= COUNTER_RADIUS);

//What the estimate gives the units that can strike the enemy this turn, kills less LOSS_WEIGHT of their losses; 0
//without a target
function favourOn(w: World, units: readonly UnitState[], t: UnitState | undefined): number {
	if (t === undefined) return 0;
	let gain = 0;
	for (const u of units) {
		const from = strikeHex(w, u, t);
		if (from === null) continue;
		const e = estimateAttack(w, samePosition(u, from) ? u : { ...u, row: from.row, col: from.col }, t);
		const losses = e.result.losses + e.support.reduce((n, s) => n + s.losses, 0);
		gain += (e.stopped ? 0 : e.result.kills) - LOSS_WEIGHT * losses;
	}
	return gain;
}

//Where a unit would strike the enemy from this turn: its hex when in range, else the hex beside the enemy nearest
//it when its move takes it there (the way and the hex's unit aside: an estimate, not an order)
function strikeHex(w: World, u: UnitState, t: UnitState): Position | null {
	if (u.hasFired || ammoOf(u) <= 0) return null;
	const range = unitAttackRange(w, u), gap = distance(u.row, u.col, t.row, t.col);
	if (gap <= range) return u;
	const moves = !u.hasMoved && !u.isMounted && !firesOnlyBeforeMoving(w, u);
	return moves && gap <= unitData(w, u).movpoints + range ? nearestBeside(w, u, t) : null;
}

function nearestBeside(w: World, u: Position, t: Position): Position | null {
	let best: Position | null = null, nearest = Infinity;
	for (const c of adjacent(t.row, t.col)) {
		const d = distance(c.row, c.col, u.row, u.col);
		if (onMap(w, c.row, c.col) && d < nearest) {
			best = c;
			nearest = d;
		}
	}
	return best;
}

/**
 * The side's assault: the one of its last directives while its sector is still to take, its deadline not passed and it
 * isn't hopeless (the enemy around it stronger than what the side brings, where another sector isn't); else a new one
 * on the sector the side strikes best. In the last turns only on a sector still in reach (#232). None for a side that
 * doesn't assault.
 */
function mainEffort(w: World, a: Analysis, memory: CommanderMemory, units: readonly UnitState[], clock: Clock): Directive | null {
	if (!assaults(w, a.side)) return null;
	const sectors = sectorsLeft(w, a, memory.cache, units, clock);
	const current = memory.directives.find((d) => d.task === "assault");
	if (current !== undefined && goesOn(w, a, memory.cache, units, sectors, current)) return current;
	const s = pickSector(w, memory.cache, units, sectors);
	if (s === null) return null;
	const until = deadlineOf(w, a.side);
	return { task: "assault", target: s.at, priority: 0, until,
		reason: `assault ${at(s.at)}: enemy ${Math.round(s.enemy)} around it, until turn ${until}; ${clockLine(clock)}` };
}

//The sectors still to take; in the last turns those a unit that can take one reaches in the turns left, if any
function sectorsLeft(w: World, a: Analysis, cache: AnalysisCache, units: readonly UnitState[], clock: Clock): Sector[] {
	const toTake = w.state.objectives[a.side], left = a.sectors.filter((s) => toTake.some((o) => samePosition(o, s.at)));
	if (!clock.late) return left;
	const takers = units.filter((u) => canCapture(w, u));
	const near = left.filter((s) => takers.some((u) => turnsTo(w, cache, u, s.at) <= clock.turnsLeft));
	return near.length === 0 ? left : near;
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
