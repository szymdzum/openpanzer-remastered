/**
 * The remastered AI's assault doctrine (#618): one sector at a time, its battle group, and the order of arms on it
 * each turn: reconnaissance, artillery fire, the armoured attack; the guns brought forward for the next turn.
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

import { unitAttackRange } from "../attack";
import { nextToSeenEnemy } from "../ai";
import type { Command } from "../command";
import { distance } from "../geometry";
import { moveRange } from "../movement";
import { seesUnit, unitSpotRange } from "../sight";
import { check } from "../step";
import { unitClass } from "../tables";
import type { MoveCell, Position, UnitId, UnitState, World } from "../types";
import { canMount, firesOnlyBeforeMoving, isGround } from "../units";
import { isSpotted, sideOf, unitData } from "../world";
import { type Analysis, type AnalysisCache, fieldTo } from "./analysis";
import { attacks, clockOf, isLate, pressed } from "./clock";
import { around } from "./fields";
import { classOf, freeGround, hexOf, marchOf, samePosition, turnsTo } from "./march";
import { inGroundReach } from "./rear";
import type { Operation } from "./staff";
import { better, canFireNow, isWorth, onObjective, type Strike, strikeCommands, strikeFrom } from "./strike";

/** The step of the assault's sequence an order belongs to. */
export type AssaultStep = "recon" | "counter-battery" | "preparation" | "attack" | "guns forward";

/** The assault's next order: its step and its commands, a move first when the attack needs one. */
export interface AssaultOrder {
	step: AssaultStep;
	commands: Command[];
}

//The turns of its march within which a unit joins the assault's battle group: it fights there this turn or the next
const GROUP_TURNS = 2;
//The enemies this near the sector are in the assault's way: on the objective and around it (analysis.ts SECTOR_RADIUS)
const TARGET_RADIUS = 2;
//The hexes a recon unit scouts around the sector: the targets and the guns that would cover them
const SCOUT_RADIUS = 4;
//A unit this few turns from another objective to take goes for the nearest: it is nearly there (in the arena, 1 sent
//too many units past objectives they would have taken)
const LOCAL_TURNS = 3;
//The attackers in the order they go in: tanks, the anti-tank guns as the second line, then infantry and recon
const WAVES: readonly (readonly number[])[] = [[unitClass.tank], [unitClass.antiTank], [unitClass.infantry, unitClass.recon]];

/**
 * The objectives that pull a unit in the planner: the assault's sector for a ground unit (#258), but for one already
 * near another objective to take, which goes for the nearest, and for the side defending (#256): its units hold the
 * line while it retakes an objective, and those of `standFast` are pulled nowhere. In the last turns the objectives
 * the unit still reaches in the turns left (#232), every one when it reaches none. Aircraft and ships are pulled to
 * every objective.
 */
export function pullTo(w: World, cache: AnalysisCache, op: Operation | undefined, standFast: ReadonlySet<UnitId>)
	: (u: UnitState) => readonly Position[] {
	return (u) => {
		const side = sideOf(w, u), all = w.state.objectives[side];
		if (standFast.has(u.id)) return [];
		if (!isGround(w, u) || !attacks(w, side) || op === undefined) return all;
		if (isLate(w)) return inReachOf(w, cache, u, all);
		const march = marchOf(w, u), hex = hexOf(w, u);
		const nearest = fieldTo(w, cache, march.movmethod, all)[hex], toSector = fieldTo(w, cache, march.movmethod, [op.at])[hex];
		return nearest < toSector && nearest <= LOCAL_TURNS * march.movpoints ? all : [op.at];
	};
}

//The objectives the unit reaches in the turns left, all of them when it reaches none
function inReachOf(w: World, cache: AnalysisCache, u: UnitState, all: readonly Position[]): readonly Position[] {
	const left = clockOf(w, sideOf(w, u)).turnsLeft, near = all.filter((o) => turnsTo(w, cache, u, o) <= left);
	return near.length === 0 ? all : near;
}

//What an assault's order reads: the world, the side, the sector, its battle group and the enemies in its way
interface Battle {
	w: World;
	a: Analysis;
	side: number;
	sector: Position;
	group: UnitState[];
	targets: UnitState[];
	//The last turns, or the attack behind schedule: an attack on an objective is worth what it costs
	pressed: boolean;
	scouted: Set<UnitId>;
	cells: (u: UnitState) => readonly MoveCell[];
}

function battleOf(w: World, a: Analysis, cache: AnalysisCache, op: Operation, player: number, held: ReadonlySet<UnitId>,
	scouted: Set<UnitId>): Battle {
	const side = a.side, sector = op.at, group = battleGroup(w, cache, sector, player, held);
	const targets = w.state.units.filter((t) => t.row >= 0 && sideOf(w, t) !== side && isGround(w, t) && seesUnit(w, t, side)
		&& distance(t.row, t.col, sector.row, sector.col) <= TARGET_RADIUS);
	targets.sort((x, y) => distance(x.row, x.col, sector.row, sector.col) - distance(y.row, y.col, sector.row, sector.col));
	return { w, a, side, sector, group, targets, pressed: pressed(w, side), scouted, cells: rangesOf(w) };
}

/** The assault's battle group: the free ground units within GROUP_TURNS of its sector, and the guns that reach it. */
export function battleGroup(w: World, cache: AnalysisCache, sector: Position, player: number, held: ReadonlySet<UnitId>): UnitState[] {
	return freeGround(w, player, held).filter((u) => turnsTo(w, cache, u, sector) <= GROUP_TURNS || isGunOn(w, u, sector));
}

const isArtillery = (w: World, u: UnitState) => classOf(w, u) === unitClass.artillery;

//An artillery piece whose gun reaches the sector's targets from where it stands
const isGunOn = (w: World, u: UnitState, at: Position) => isArtillery(w, u)
	&& distance(u.row, u.col, at.row, at.col) <= unitAttackRange(w, u) + TARGET_RADIUS;

/**
 * The assault's next order on its sector, in the order of arms: a recon unit scouts it, the artillery fires on the
 * enemy guns that would support the target, then on the target, the armour attacks the target, and the guns that
 * couldn't fire move into range for the next turn. A counterattack's: the fire and the attack only. Null when it has
 * none to give.
 */
export function assaultOrder(w: World, a: Analysis, cache: AnalysisCache, op: Operation, player: number, held: ReadonlySet<UnitId>,
	scouted: Set<UnitId>): AssaultOrder | null {
	const b = battleOf(w, a, cache, op, player, held, scouted);
	if (op.kind === "counterattack") return fireOrder(b);
	return reconOrder(b) ?? fireOrder(b) ?? gunsForward(b, freeGround(w, player, held));
}

//The artillery's fire, then the armour's attack, on the target the armour strikes best
function fireOrder(b: Battle): AssaultOrder | null {
	const main = b.targets.length === 0 ? null : mainTarget(b);
	return artilleryOrder(b, main) ?? attackOrder(b, main);
}

//A recon unit of the group moves where it sees most of the sector it doesn't see yet, once a turn, before anything
//else: its move is phased, the planner may move it again after
function reconOrder(b: Battle): AssaultOrder | null {
	const unseen = around(b.w, [hexOf(b.w, b.sector)], SCOUT_RADIUS).filter((h) => !isSpotted(b.w, h, b.side));
	if (unseen.length === 0) return null;
	for (const u of b.group) {
		if (!canScout(b, u)) continue;
		b.scouted.add(u.id);
		const move = moveTo(b.w, u, scoutCell(b, u, unseen));
		if (move !== null) return { step: "recon", commands: [move] };
	}
	return null;
}

const canScout = (b: Battle, u: UnitState) => classOf(b.w, u) === unitClass.recon && !u.hasMoved && !u.isMounted && !b.scouted.has(u.id);

//The move to the cell, when there is one and the core allows it
function moveTo(w: World, u: UnitState, cell: Position | null): Command | null {
	const move: Command | null = cell === null ? null : { type: "move", unit: u.id, to: { row: cell.row, col: cell.col } };
	return move !== null && check(w, move) === null ? move : null;
}

function scoutCell(b: Battle, u: UnitState, unseen: readonly number[]): MoveCell | null {
	const cols = b.w.state.map.cols, range = unitSpotRange(b.w, u);
	const sees = (c: Position) => unseen.filter((h) => distance(c.row, c.col, Math.floor(h / cols), h % cols) <= range).length;
	let best: MoveCell | null = null, most = sees(u);
	for (const c of moveRange(b.w, u)) {
		if (!c.canMove || nextToSeenEnemy(b.w, u, c)) continue;
		const n = sees(c);
		if (n > most || (n === most && best !== null && c.cost < best.cost)) {
			best = c;
			most = n;
		}
	}
	return best;
}

/**
 * Whether a classic plan's attack loses more than it kills by the estimate, but on an objective in the last turns or
 * behind schedule.
 */
export function losesMore(w: World, cmd: Command): boolean {
	if (cmd.type !== "attack") return false;
	const u = w.state.units.find((x) => x.id === cmd.unit), t = w.state.units.find((x) => x.id === cmd.target);
	if (u === undefined || t === undefined) return false;
	const s = strikeFrom(w, u, t, null);
	return s !== null && s.losses > s.kills && !(pressed(w, sideOf(w, u)) && onObjective(w, t));
}

//A unit's best strike on the target from where it stands, or from a hex it moves to: not on its transport, whose move
//uses its shot, nor artillery in the remaster rules, where any move does (#625)
function bestStrike(b: Battle, u: UnitState, t: UnitState): Strike | null {
	const here = worthFrom(b, u, t, null);
	return u.hasMoved || u.isMounted || firesOnlyBeforeMoving(b.w, u) ? here : strikeAfterMove(b, u, t, here);
}

//The strike from the hex, when it is worth ordering
function worthFrom(b: Battle, u: UnitState, t: UnitState, from: Position | null): Strike | null {
	const s = strikeFrom(b.w, u, t, from);
	return s !== null && isWorth(b.w, s, b.pressed) ? s : null;
}

//The best of the strikes from the hexes the unit moves to in range of the target, or `best` when none beats it
function strikeAfterMove(b: Battle, u: UnitState, t: UnitState, best: Strike | null): Strike | null {
	const reach = unitAttackRange(b.w, u);
	for (const c of b.cells(u)) {
		if (!c.canMove || samePosition(c, u) || distance(c.row, c.col, t.row, t.col) > reach) continue;
		best = better(best, worthFrom(b, u, t, { row: c.row, col: c.col }));
	}
	return best;
}

//The move ranges of a call, each made once
function rangesOf(w: World): (u: UnitState) => readonly MoveCell[] {
	const made = new Map<UnitId, MoveCell[]>();
	return (u) => {
		let cells = made.get(u.id);
		if (cells === undefined) made.set(u.id, cells = moveRange(w, u));
		return cells;
	};
}

const isAttacker = (w: World, u: UnitState) => WAVES.some((wave) => wave.includes(classOf(w, u)));

//The group's attackers that could reach the target this turn: its move and its gun's range
function attackersOn(b: Battle, t: UnitState): UnitState[] {
	return b.group.filter((u) => isAttacker(b.w, u) && canFireNow(u)
		&& distance(u.row, u.col, t.row, t.col) <= (u.hasMoved ? 0 : unitData(b.w, u).movpoints) + unitAttackRange(b.w, u));
}

//The armour's target, the objective's defender, and each attacker's best strike on it: the armour going for the
//units around it as well cost the attacker objectives in the arena (its tanks spent there didn't take the hexes)
function mainTarget(b: Battle): { target: UnitState; strikes: Strike[] } | null {
	const t = b.targets.find((x) => samePosition(x, b.sector));
	if (t === undefined) return null;
	const strikes = attackersOn(b, t).map((u) => bestStrike(b, u, t)).filter((s) => s !== null);
	return strikes.length === 0 ? null : { target: t, strikes };
}

//The enemy guns that would fire in support of the target: its artillery against a ground attacker beside it, its air
//defence against an aircraft over it
function coveringGuns(b: Battle, t: UnitState): UnitState[] {
	return b.w.state.units.filter((g) => g.row >= 0 && g.id !== t.id && sideOf(b.w, g) === sideOf(b.w, t) && seesUnit(b.w, g, b.side)
		&& isCover(b.w, g) && distance(g.row, g.col, t.row, t.col) <= unitAttackRange(b.w, g) + 1);
}

const isCover = (w: World, g: UnitState) => [unitClass.artillery, unitClass.airDefence, unitClass.flak].includes(classOf(w, g));

//The group's artillery fires before the assault: first on the guns covering the main target, then on it, then on any
//enemy in the sector's way
function artilleryOrder(b: Battle, main: { target: UnitState } | null): AssaultOrder | null {
	const guns = b.group.filter((u) => isArtillery(b.w, u) && canFireNow(u));
	if (guns.length === 0) return null;
	const waves: [AssaultStep, UnitState[]][] = [["counter-battery", main === null ? [] : coveringGuns(b, main.target)],
		["preparation", main === null ? [] : [main.target]], ["preparation", b.targets]];
	for (const [step, targets] of waves) {
		const strikes: Strike[] = [];
		for (const g of guns) for (const t of targets) {
			const x = bestStrike(b, g, t);
			if (x !== null) strikes.push(x);
		}
		const commands = strikeCommands(b.w, bestOf(strikes));
		if (commands !== null) return { step, commands };
	}
	return null;
}

const bestOf = (strikes: readonly (Strike | null)[]) => strikes.reduce(better, null);

//The armour attacks the main target, wave by wave, from the hex that gives each attacker the best estimate
function attackOrder(b: Battle, main: { strikes: Strike[] } | null): AssaultOrder | null {
	if (main === null) return null;
	for (const wave of WAVES) {
		const commands = strikeCommands(b.w, bestOf(main.strikes.filter((x) => wave.includes(classOf(b.w, x.unit)))));
		if (commands !== null) return { step: "attack", commands };
	}
	return null;
}

//A gun that can't fire on the sector from where it stands moves toward a hex in range of it for the next turn (#234),
//out of the enemy's ground reach, in its transport when that goes further
function gunsForward(b: Battle, units: readonly UnitState[]): AssaultOrder | null {
	for (const g of units) {
		if (!isArtillery(b.w, g) || g.hasMoved || g.hasFired || isGunOn(b.w, g, b.sector)) continue;
		const order = gunMove(b, g, b.sector);
		if (order !== null) return { step: "guns forward", commands: order };
	}
	return null;
}

/** What a gun's move reads: the world and the side's maps. */
export interface GunPark {
	w: World;
	a: Analysis;
}

//How far a hex is from firing on the hexes around `front` next turn
const gapOf = (w: World, g: UnitState, c: Position, front: Position) => Math.max(0,
	distance(c.row, c.col, front.row, front.col) - unitAttackRange(w, g) - TARGET_RADIUS);

//What a gun's hex is judged on, the first that differs decides: how far from firing on the front, the enemy's threat
//on it, how far from the front (nearer follows it), what the move costs
const gunKey = (p: GunPark, g: UnitState, c: MoveCell, front: Position): number[] => [gapOf(p.w, g, c, front),
	p.a.threat.ground[hexOf(p.w, c)], distance(c.row, c.col, front.row, front.col), c.cost];

//Whether one key comes before another: the first value that differs decides
function before(a: readonly number[], b: readonly number[]): boolean {
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
	return false;
}

/**
 * A gun's move nearer firing on the hexes around `front` (#234), the mount first when it rides: never beside an enemy,
 * nor into the enemy's ground reach from out of it, on its transport only out of that reach. Null when no hex brings
 * it nearer.
 */
export function gunMove(p: GunPark, g: UnitState, front: Position): Command[] | null {
	const best = gunCell(p, g, front);
	if (best === null || gapOf(p.w, g, best.cell, front) >= gapOf(p.w, g, g, front)) return null;
	const move: Command = { type: "move", unit: g.id, to: { row: best.cell.row, col: best.cell.col } };
	const first: Command = best.mounted ? { type: "mount", unit: g.id } : move;
	if (check(p.w, first) !== null) return null;
	return best.mounted ? [first, move] : [move];
}

//The gun's best hex by its key, never beside an enemy, nor into the enemy's reach from out of it
function gunCell(p: GunPark, g: UnitState, front: Position): { cell: MoveCell; mounted: boolean } | null {
	const exposed = inGroundReach(p.a, hexOf(p.w, g));
	let best: { cell: MoveCell; mounted: boolean; key: number[] } | null = null;
	for (const [cells, mounted] of gunCells(p, g)) for (const c of cells) {
		if (!c.canMove || nextToSeenEnemy(p.w, g, c) || (!exposed && inGroundReach(p.a, hexOf(p.w, c)))) continue;
		const key = gunKey(p, g, c, front);
		if (best === null || before(key, best.key)) best = { cell: c, mounted, key };
	}
	return best;
}

//The hexes a gun moves to: its own move, and its transport's out of the enemy's ground reach (a gun on its truck is
//what the enemy overruns, #315)
function gunCells(p: GunPark, g: UnitState): [MoveCell[], boolean][] {
	const out: [MoveCell[], boolean][] = [[moveRange(p.w, g), false]];
	if (canMount(p.w, g) && !g.isMounted)
		out.push([moveRange(p.w, { ...g, isMounted: true }).filter((c) => !inGroundReach(p.a, hexOf(p.w, c))), true]);
	return out;
}
