/**
 * The remastered AI's rule-based commander (#638): its directives from the maps and the turn clock: a hold for each
 * objective in the enemy's reach, the counterattacks and the main effort; and one for each group of reinforcements
 * that arrived together (#639).
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
import { assaults, attacks, type Clock, clockLine, clockOf, deadlineOf } from "./clock";
import { at, type Directive, type GroupDirective, isGroup } from "./directives";
import { freeGround, samePosition, turnsTo } from "./march";
import type { SideView } from "./perception";

/**
 * What the commander is told beside the maps: its player, its last directives (none after a load), the units the
 * staff's operations hold, the analysis's cache for the distance fields, and the player's units that arrived this
 * turn after its plan (its reinforcements, #94), if any.
 */
export interface CommanderMemory {
	player: number;
	directives: readonly Directive[];
	held: ReadonlySet<UnitId>;
	cache: AnalysisCache;
	arrived?: readonly UnitId[];
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
//Reinforcements this near another of a group arrived with it: the scenario sends them together
const GROUP_RADIUS = 3;
//A group joins the main effort when its sector is this many turns of the group's march away or fewer: it fights
//there with the battle group (assault.ts GROUP_TURNS)
const JOIN_TURNS = 2;
//A group relieves a hold within this many turns of its march: further away, the plan's units nearer it are its relief
const RELIEF_TURNS = 4;
//The turns after its arrival a group's directive stands: its march to a relief; then its units are the plan's
const GROUP_FOR = RELIEF_TURNS;

/**
 * The rule-based commander's directives, the first in priority first: a hold for each of the side's objectives a
 * ground enemy can reach soon, the counterattacks the estimate favours, and the main effort, one objective to assault,
 * kept from `memory` while it goes on; then one for each group of the reinforcements that arrived this turn (#639). It
 * keeps no reserve: held back, a fifth of an attacker's mobile units cost it objectives on other seeds than those it
 * was tuned on (docs/ai/arena.md). Pure: no random stream, nothing kept.
 */
export function command(w: World, view: SideView, a: Analysis, memory: CommanderMemory): Directive[] {
	const clock = clockOf(w, a.side), units = freeGround(w, memory.player, memory.held);
	const last = { ...memory, directives: memory.directives.filter((d) => !isGroup(d)) };
	const strikes = counterattacks(w, view, a, last, units, clock);
	const effort = mainEffort(w, a, last, units, clock);
	const sides = holds(w, view, a), out = [...sides, ...strikes, ...(effort === null ? [] : [effort])];
	const groups = groupDirectives(w, view, a, memory, { effort, holds: sides, units });
	return [...out, ...groups].map((d, i) => d.priority === i + 1 ? d : { ...d, priority: i + 1 });
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

//What a group's directive is weighed against: the main effort, the holds and the free ground units
interface Plan {
	effort: Directive | null;
	holds: readonly Directive[];
	units: readonly UnitState[];
}

/**
 * A directive for each group of reinforcements: those of the last directives that still stand, and for each group
 * that arrived together this turn and has none: the main effort if within JOIN_TURNS of its march; else, for a side
 * that doesn't attack, the hold nearest it within RELIEF_TURNS, else a counterattack on the enemy nearest it by an
 * objective the side holds, when the estimate favours the group; none else, its units are the plan's.
 */
function groupDirectives(w: World, view: SideView, a: Analysis, memory: CommanderMemory, plan: Plan): GroupDirective[] {
	const out = memory.directives.filter(isGroup).map((d) => stillStands(w, view, plan, d)).filter((d) => d !== null);
	const taken = new Set<UnitId>();
	for (const d of out) for (const id of d.units) taken.add(id);
	const free = plan.units.filter((u) => memory.arrived?.includes(u.id) && !taken.has(u.id));
	for (const group of groupsOf(free)) {
		const d = groupDirective(w, view, a, memory.cache, plan, group);
		if (d !== null) out.push(d);
	}
	return out;
}

//A group's last directive, its units still free, while it stands: its last turn not passed, the main effort or the
//hold it joined still given, the enemy it counterattacks still seen there
function stillStands(w: World, view: SideView, plan: Plan, d: GroupDirective): GroupDirective | null {
	const units = d.units.filter((id) => plan.units.some((u) => u.id === id));
	const joined = d.task === "assault" ? plan.effort !== null && samePosition(plan.effort.target, d.target)
		: d.task === "counterattack" ? enemyOn(view, d.target) !== undefined : plan.holds.some((h) => samePosition(h.target, d.target));
	if (w.state.turn.turn > d.until || units.length === 0 || !joined) return null;
	return units.length === d.units.length ? d : { ...d, units };
}

//The units in groups, each within GROUP_RADIUS of another of its group, in the order they came
function groupsOf(units: readonly UnitState[]): UnitState[][] {
	const groups: UnitState[][] = [];
	for (const u of units) {
		const near = groups.filter((g) => g.some((x) => distance(x.row, x.col, u.row, u.col) <= GROUP_RADIUS));
		if (near.length === 0) groups.push([u]);
		else near[0].push(u);
		for (const g of near.slice(1)) {
			near[0].push(...g);
			groups.splice(groups.indexOf(g), 1);
		}
	}
	return groups;
}

//The turns of its march the group needs to reach the hex, its units' mean; Infinity when none reaches it
function groupTurns(w: World, cache: AnalysisCache, group: readonly UnitState[], target: Position): number {
	const turns = group.map((u) => turnsTo(w, cache, u, target)).filter((t) => t !== Infinity);
	return turns.length === 0 ? Infinity : turns.reduce((n, t) => n + t, 0) / turns.length;
}

function groupDirective(w: World, view: SideView, a: Analysis, cache: AnalysisCache, plan: Plan, group: UnitState[]): GroupDirective | null {
	const turn = w.state.turn.turn, units = group.map((u) => u.id), lead = group[0];
	const arrived = `${units.length} ${units.length === 1 ? "unit" : "units"} arrived at ${at(lead)}`;
	const effort = plan.effort === null ? null : plan.effort.target;
	if (effort !== null && groupTurns(w, cache, group, effort) <= JOIN_TURNS)
		return { task: "assault", target: effort, priority: 0, until: turn + GROUP_FOR, reason: `${arrived}: join the main effort on ${at(effort)}`, units };
	//An attacker's reinforcements are its attack's: its plan pulls them to the objectives. Sent to relieve an objective
	//behind them, they won fewer games (docs/ai/arena.md)
	if (attacks(w, a.side)) return null;
	const relief = (p: Position) => {
		const turns = groupTurns(w, cache, group, p);
		return turns <= RELIEF_TURNS ? turns : Infinity;
	};
	const hold = nearestTo(plan.holds.map((h) => h.target), relief);
	if (hold !== null) return { task: "hold", target: hold, priority: 0, until: turn + GROUP_FOR, reason: `${arrived}: relieve ${at(hold)}`, units };
	const near = view.seen.filter((t) => isGround(w, t) && a.objectives.hold.some((o) => distance(o.row, o.col, t.row, t.col) <= COUNTER_RADIUS));
	const t = nearestTo(near, (p) => distance(lead.row, lead.col, p.row, p.col));
	if (t === null || favourOn(w, group, enemyOn(view, t)) <= 0) return null;
	return { task: "counterattack", target: { row: t.row, col: t.col }, priority: 0, until: turn, reason: `${arrived}: counterattack ${at(t)}`, units };
}

//The nearest of the hexes by `far`, the first of equally near ones; null when none is reachable
function nearestTo<T extends Position>(hexes: readonly T[], far: (p: Position) => number): T | null {
	let best: T | null = null, nearest = Infinity;
	for (const p of hexes) {
		const d = far(p);
		if (d < nearest) {
			best = p;
			nearest = d;
		}
	}
	return best;
}
