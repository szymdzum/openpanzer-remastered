/**
 * The remastered AI's planner (#627): the next order of a unit no operation holds, chosen afresh on the world as it
 * is after every order: an empty objective taken, the attacks by the estimate, the guns' first, each unit from the hex
 * worth most to it, then the moves.
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

import { unitAttackRange } from "../attack";
import type { Command } from "../command";
import { cellsInRange, distance } from "../geometry";
import { moveRange, unitMoveRange } from "../movement";
import { nextToSeenEnemy, seesUnit } from "../sight";
import { check } from "../step";
import { unitClass } from "../tables";
import type { MoveCell, Position, UnitId, UnitState, World } from "../types";
import { canCapture, canMount, firesOnlyBeforeMoving, isAir, isGround, isSea } from "../units";
import { groundUnitAt, sideOf } from "../world";
import { type Advance, advanceOf, type Footing, footingOf, type Ground, isWorn, marchCommands, pullFor } from "./advance";
import type { Analysis, AnalysisCache } from "./analysis";
import { classOf, hexOf, samePosition } from "./march";
import type { Rides } from "./staff";
import { canFireNow, onObjective, type Strike, strikeCommands, strikeFrom, strikeWorth } from "./strike";

//What the planner found for a unit, kept until something changes within `reach` of where the unit stood
interface Kept<T> {
	at: Position;
	reach: number;
	found: T;
}

/**
 * What the planner keeps through a turn so that an order doesn't cost a look at every unit: each unit's order as it
 * last found it and the empty objectives none reaches, forgotten when a unit near them moved, fought, went or came;
 * and the enemies struck this turn. The controller's, like its operations (docs/STATE.md D6): a turn starts with none.
 */
export interface PlannerMemo {
	world: World | null;
	units: Map<UnitId, UnitState>;
	orders: Map<UnitId, Kept<UnitOrder | null>>;
	captures: Map<number, Kept<null>>;
	struck: Set<UnitId>;
	stops: WeakMap<readonly MoveCell[], Set<number>>;
}

export const newMemo = (): PlannerMemo => ({ world: null, units: new Map(), orders: new Map(), captures: new Map(), struck: new Set(),
	stops: new WeakMap() });

/** What the planner reads for an order: the world, the side's maps and what the staff made of the directives. */
export interface Planning {
	w: World;
	a: Analysis;
	cache: AnalysisCache;
	player: number;
	//The units the staff's operations order
	held: ReadonlySet<UnitId>;
	//Whether the side is the scenario's attacker (clock.ts), and whether it assaults: it, or a defender that lost more
	attacks: boolean;
	assaults: boolean;
	//The last turns, or the attack behind schedule: an attack on an objective is worth what it costs
	pressed: boolean;
	goals: (u: UnitState) => readonly Position[];
	ridesTo: Rides;
	//The main effort's objective and the objectives the commander holds: the enemies by them are struck first
	sector: Position | null;
	holds: readonly Position[];
	memo: PlannerMemo;
}

//A strike with what decides its place among the others: its arm, then its worth
interface Valued {
	strike: Strike;
	arm: number;
	worth: number;
}

//A unit's next order: its commands, the strike they end with if any, and its rank among the moves
interface UnitOrder {
	commands: Command[];
	strike: Valued | null;
	rank: number;
}

//A change this far beyond a unit's move and range may still bring an enemy into its sight
const SIGHT_MARGIN = 4;
//An empty objective is looked at again when something changes this near it: a turn's march of the fastest units
const CAPTURE_REACH = 12;
//An enemy on an objective to take is worth this much more to strike, in the points a hex is weighed in: it is the way
//in (the classic AI's)
const ON_OBJECTIVE = 350;
//An enemy already struck this turn is worth this much more: the units finish what they started (the classic AI's)
const STRUCK = 100;
//An enemy within this distance of the main effort's objective is in its way, worth SECTOR_TARGET more
const SECTOR_RADIUS = 2;
const SECTOR_TARGET = 50;
//An enemy beside an objective the commander holds would take it next: worth THREAT_TARGET more
const THREAT_TARGET = 100;
//A strength point a worn-down unit would lose costs its strike this much more: it has few left (#6)
const WORN_LOSS = 50;
//A strike may cost a unit one strength point in this many, no more (the classic AI's)
const MIN_STRENGTH_PER_LOSS = 2.5;
//The arms in the order they fire: artillery and fortifications, whose fire wears the target down for the others,
//ships, aircraft, then the units that close with the enemy
const ARMS = { guns: 0, ships: 1, aircraft: 2, assault: 3 };
//Infantry takes an objective before any other unit, then a strength point counts more than the move's cost (staff.ts)
const INFANTRY_FIRST = 1000;
const PER_STRENGTH = 10;

/**
 * The planner's next order, a move first when an attack or a ride needs one: an empty objective in reach taken, else
 * the free units' attacks, the guns' before the others' and the one worth most first, else their moves, the unit
 * nearest its objective first. Null when no free unit has anything left to do. It draws from no random stream: equal
 * choices go to the unit first in the list and the first hex of its range.
 */
export function plannerOrder(p: Planning): Command[] | null {
	recall(p.memo, p.w);
	const g = groundOf(p);
	return captureOrder(p, g) ?? unitsOrder(p, g);
}

//Forgets what was found for the units near a unit that changed since the last order: moved, hit, gone or new
function recall(m: PlannerMemo, w: World) {
	if (m.world === w) return;
	const now = new Map<UnitId, UnitState>(), changed: Position[] = [];
	for (const u of w.state.units) {
		now.set(u.id, u);
		const was = m.units.get(u.id);
		if (was === u) continue;
		changed.push(u);
		if (was !== undefined) changed.push(was);
	}
	for (const [id, was] of m.units) if (!now.has(id)) changed.push(was);
	forget(m.orders, changed);
	forget(m.captures, changed);
	m.units = now;
	m.world = w;
}

function forget<K>(kept: Map<K, Kept<unknown>>, changed: readonly Position[]) {
	for (const [key, k] of kept)
		if (changed.some((c) => distance(c.row, c.col, k.at.row, k.at.col) <= k.reach)) kept.delete(key);
}

//The map as the units' moves read it, the move ranges made once an order
function groundOf(p: Planning): Ground {
	const w = p.w, side = w.state.players[p.player].side, onFoot = new Map<UnitId, MoveCell[]>(), riding = new Map<UnitId, MoveCell[]>();
	const cells = (u: UnitState) => {
		let c = onFoot.get(u.id);
		if (c === undefined) onFoot.set(u.id, c = u.isMounted ? moveRange(w, u).filter((x) => samePosition(x, u) || p.ridesTo(u, x)) : moveRange(w, u));
		return c;
	};
	const rides = (u: UnitState) => {
		let c = riding.get(u.id);
		if (c === undefined) riding.set(u.id, c = ridesOf(p, u, cells(u)));
		return c;
	};
	const targets = w.state.units.filter((t) => t.row >= 0 && sideOf(w, t) !== side && seesUnit(w, t, side));
	return { w, a: p.a, cache: p.cache, player: p.player, side, assaults: p.assaults, pull: pullFor(p.attacks), goals: p.goals, targets, cells, rides };
}

//The hexes only its transport takes a unit to, where a ride may end and not beside an enemy the side sees: it would
//stand there in its truck
function ridesOf(p: Planning, u: UnitState, onFoot: readonly MoveCell[]): MoveCell[] {
	if (u.isMounted || !canMount(p.w, u)) return [];
	const walked = new Set(onFoot.map((c) => hexOf(p.w, c)));
	return moveRange(p.w, { ...u, isMounted: true }).filter((c) => !walked.has(hexOf(p.w, c)) && !nextToSeenEnemy(p.w, u, c) && p.ridesTo(u, c));
}

const freeUnits = (p: Planning) => p.w.state.units.filter((u) => u.owner === p.player && u.row >= 0 && !p.held.has(u.id));

//A free ground unit that can capture moves onto an objective to take that stands empty in its reach
function captureOrder(p: Planning, g: Ground): Command[] | null {
	for (const o of p.w.state.objectives[g.side]) {
		const hex = hexOf(p.w, o);
		if (groundUnitAt(p.w, hex) !== null || p.memo.captures.has(hex)) continue;
		const u = captorOf(p, g, o);
		const move: Command | null = u === null ? null : { type: "move", unit: u.id, to: { row: o.row, col: o.col } };
		if (move !== null && check(p.w, move) === null) return [move];
		p.memo.captures.set(hex, { at: o, reach: CAPTURE_REACH, found: null });
	}
	return null;
}

function captorOf(p: Planning, g: Ground, o: Position): UnitState | null {
	let best: UnitState | null = null, most = -Infinity;
	for (const u of freeUnits(p)) {
		if (u.hasMoved || !isGround(p.w, u) || !canCapture(p.w, u) || distance(u.row, u.col, o.row, o.col) > unitMoveRange(p.w, u)) continue;
		const cell = g.cells(u).find((c) => c.canMove && samePosition(c, o));
		if (cell === undefined) continue;
		const worth = (classOf(p.w, u) === unitClass.infantry ? INFANTRY_FIRST : 0) + u.strength * PER_STRENGTH - cell.cost;
		if (worth > most) {
			best = u;
			most = worth;
		}
	}
	return best;
}

//Nothing found for the unit, kept until something changes beside it: the core refused what was found
const nothingFor = (u: UnitState): Kept<null> => ({ at: { row: u.row, col: u.col }, reach: SIGHT_MARGIN, found: null });

//Whether an order comes before another: one that strikes before one that only moves; of two strikes the first arm's,
//then the one worth more; of two moves the lower rank's
function comesBefore(a: UnitOrder, b: UnitOrder): boolean {
	if (a.strike === null || b.strike === null) return b.strike === null && (a.strike !== null || a.rank < b.rank);
	return a.strike.arm < b.strike.arm || (a.strike.arm === b.strike.arm && a.strike.worth > b.strike.worth);
}

//The free units' next order: the one that comes before the others', the first unit's of equal ones
function unitsOrder(p: Planning, g: Ground): Command[] | null {
	for (;;) {
		let best: { unit: UnitState; order: UnitOrder } | null = null;
		for (const u of freeUnits(p)) {
			const order = orderOf(p, g, u);
			if (order !== null && (best === null || comesBefore(order, best.order))) best = { unit: u, order };
		}
		if (best === null) return null;
		if (check(p.w, best.order.commands[0]) === null) return best.order.commands;
		p.memo.orders.set(best.unit.id, nothingFor(best.unit));
	}
}

//The unit's order as it was last found, looked for when nothing is kept
function orderOf(p: Planning, g: Ground, u: UnitState): UnitOrder | null {
	let k = p.memo.orders.get(u.id);
	if (k === undefined) {
		const reach = (u.hasMoved ? 0 : unitMoveRange(p.w, u)) + unitAttackRange(p.w, u) + SIGHT_MARGIN;
		p.memo.orders.set(u.id, k = { at: { row: u.row, col: u.col }, reach, found: findOrder(p, g, u) });
	}
	return k.found;
}

//A unit that weighs its hexes strikes and moves by what the hex and the strike are worth together; another fires
//from where it can, else moves; a unit left on its transport without a move gets off it
function findOrder(p: Planning, g: Ground, u: UnitState): UnitOrder | null {
	const footing = footingOf(g, u);
	if (footing !== null) return weighed(p, g, u, footing) ?? dismount(p.w, u);
	const strike = bestStrike(strikesOf(p, g, u)), commands = strike === null ? null : strikeCommands(p.w, strike.strike);
	if (commands !== null) return { commands, strike, rank: 0 };
	return moved(advanceOf(g, u)) ?? dismount(p.w, u);
}

const moved = (m: Advance | null): UnitOrder | null => m === null ? null : { commands: m.commands, strike: null, rank: m.rank };

function dismount(w: World, u: UnitState): UnitOrder | null {
	const unmount: Command = { type: "unmount", unit: u.id };
	return u.isMounted && u.carrier === 0 && !u.hasMoved && check(w, unmount) === null ? { commands: [unmount], strike: null, rank: -1 } : null;
}

function armOf(w: World, u: UnitState): number {
	if (isAir(w, u)) return ARMS.aircraft;
	if (isSea(w, u)) return ARMS.ships;
	const uclass = classOf(w, u);
	return uclass === unitClass.artillery || uclass === unitClass.fortification ? ARMS.guns : ARMS.assault;
}

//Whether the unit fires only from where it stands: it has moved, it rides its transport (whose move uses its shot), or
//it is a gun in the remaster's rules, where any move does (#625)
const firesInPlace = (w: World, u: UnitState) => u.hasMoved || u.isMounted || firesOnlyBeforeMoving(w, u);

//The unit's best strike from each hex it can fire from, by hex: where it stands, and the hexes of its move
function strikesOf(p: Planning, g: Ground, u: UnitState): Map<number, Valued> {
	const by = new Map<number, Valued>();
	if (!canFireNow(u) || u.carrier !== 0) return by;
	const stays = firesInPlace(p.w, u), range = unitAttackRange(p.w, u), reach = range + (stays ? 0 : unitMoveRange(p.w, u));
	for (const t of g.targets) {
		if (distance(u.row, u.col, t.row, t.col) > reach) continue;
		for (const from of stays ? [null] : hexesOn(p, g, u, t, range)) keepBest(by, hexOf(p.w, from ?? u), valued(p, strikeFrom(p.w, u, t, from)));
	}
	return by;
}

function keepBest(by: Map<number, Valued>, hex: number, v: Valued | null) {
	const best = by.get(hex);
	if (v !== null && (best === undefined || v.worth > best.worth)) by.set(hex, v);
}

function bestStrike(strikes: ReadonlyMap<number, Valued>): Valued | null {
	let best: Valued | null = null;
	for (const v of strikes.values()) if (best === null || v.worth > best.worth) best = v;
	return best;
}

//Where the unit attacks the target from: where it stands, then the hexes of its move in range of the target (the
//target's own for an aircraft over it)
function hexesOn(p: Planning, g: Ground, u: UnitState, t: UnitState, range: number): (Position | null)[] {
	const out: (Position | null)[] = [null], stops = stopsOf(p, g, u), { rows, cols } = p.w.state.map;
	for (const c of [...cellsInRange(t.row, t.col, range, rows, cols), { row: t.row, col: t.col }])
		if (stops.has(hexOf(p.w, c)) && !samePosition(c, u) && distance(c.row, c.col, t.row, t.col) <= range) out.push(c);
	return out;
}

//The hexes the unit can end its move on, by hex: made once a unit and order
function stopsOf(p: Planning, g: Ground, u: UnitState): ReadonlySet<number> {
	const cells = g.cells(u);
	let stops = p.memo.stops.get(cells);
	if (stops === undefined) p.memo.stops.set(cells, stops = new Set(cells.filter((c) => c.canMove).map((c) => hexOf(p.w, c))));
	return stops;
}

//A strike worth ordering with its worth: the estimate's kills and losses by class, more for an enemy the directives
//name
function valued(p: Planning, s: Strike | null): Valued | null {
	if (s === null || !isAllowed(p, s)) return null;
	const spared = isWorn(p.w, s.unit) ? WORN_LOSS * s.losses : 0;
	return { strike: s, arm: armOf(p.w, s.unit), worth: strikeWorth(p.w, s) + namedWorth(p, s.target) - spared };
}

//Whether the planner orders a strike: none that loses more than it kills by the estimate (#618), but on an objective
//for a side pressed for time; none that costs the unit more than a share of its strength; and none of a worn-down
//unit that loses as much as it kills (#6). One that kills nothing and loses nothing is ordered: it wears the target's
//entrenchment down for the next
function isAllowed(p: Planning, s: Strike): boolean {
	if (s.losses * MIN_STRENGTH_PER_LOSS > s.unit.strength || (isWorn(p.w, s.unit) && s.losses > 0 && s.losses >= s.kills)) return false;
	return s.losses <= s.kills || (p.pressed && onObjective(p.w, s.target));
}

function namedWorth(p: Planning, t: UnitState): number {
	const side = p.w.state.players[p.player].side, near = (o: Position, radius: number) => distance(t.row, t.col, o.row, o.col) <= radius;
	let worth = isGround(p.w, t) && p.w.state.objectives[side].some((o) => samePosition(o, t)) ? ON_OBJECTIVE : 0;
	if (p.memo.struck.has(t.id)) worth += STRUCK;
	if (p.sector !== null && near(p.sector, SECTOR_RADIUS)) worth += SECTOR_TARGET;
	if (p.holds.some((o) => near(o, 1))) worth += THREAT_TARGET;
	return worth;
}

//Where a unit that weighs its hexes ends its turn and what it strikes from there
interface Stand {
	cell: MoveCell | null;
	mounted: boolean;
	strike: Valued | null;
	worth: number;
}

//The order of a unit that weighs its hexes: to the hex where the hex and the strike from it are worth most together,
//on foot or on its transport (no strike after a ride), when that beats staying. A unit no objective leads moves only
//to strike: with nothing to do it stays in its holes
function weighed(p: Planning, g: Ground, u: UnitState, footing: Footing): UnitOrder | null {
	const strikes = strikesOf(p, g, u), here = strikes.get(hexOf(p.w, u)) ?? null;
	let best: Stand = { cell: null, mounted: false, strike: here, worth: footing.worth(u) + footing.holes + (here === null ? 0 : here.worth) };
	const look = (cells: readonly MoveCell[], mounted: boolean) => {
		for (const c of cells) {
			const stand = standOn(u, footing, c, mounted ? null : strikes.get(hexOf(p.w, c)) ?? null);
			if (stand !== null && stand.worth > best.worth) best = { ...stand, mounted };
		}
	};
	if (!u.hasMoved) {
		look(g.cells(u), false);
		look(g.rides(u), true);
	}
	return standOrder(p.w, u, best, footing.rank);
}

//The unit on a hex of its move with the strike it has from there (none after a ride); null for a hex it can't stop on,
//and for one without a strike when no objective leads the unit
function standOn(u: UnitState, footing: Footing, c: MoveCell, from: Valued | null): Stand | null {
	const strike = u.isMounted ? null : from;
	if (!c.canMove || samePosition(c, u) || (strike === null && !footing.led)) return null;
	return { cell: c, mounted: false, strike, worth: footing.worth(c) + (strike === null ? 0 : strike.worth) };
}

function standOrder(w: World, u: UnitState, s: Stand, rank: number): UnitOrder | null {
	if (s.strike !== null) {
		const commands = strikeCommands(w, s.strike.strike);
		return commands === null ? null : { commands, strike: s.strike, rank };
	}
	const commands = s.cell === null ? null : marchCommands(w, u, s.cell, s.mounted);
	return commands === null ? null : { commands, strike: null, rank };
}
