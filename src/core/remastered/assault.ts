/**
 * The remastered AI's assault doctrine (#618): one sector at a time, its battle group, and the order of arms on it
 * each turn: reconnaissance, artillery fire, the armoured attack; the guns brought forward for the next turn.
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

import { isTargetFrom, unitAttackRange } from "../attack";
import { nextToSeenEnemy } from "../ai";
import type { Command } from "../command";
import { estimateAttack } from "../estimate";
import { distance } from "../geometry";
import { moveRange } from "../movement";
import { seesUnit, unitSpotRange } from "../sight";
import { check } from "../step";
import { unitClass } from "../tables";
import { attackerSide } from "../turn";
import type { MoveCell, Position, UnitId, UnitState, World } from "../types";
import { canMount, isGround } from "../units";
import { ammoOf, hexIndex, isSpotted, sideOf, unitData } from "../world";
import { type Analysis, type AnalysisCache, fieldTo, type Sector } from "./analysis";
import { around, UNREACHED } from "./fields";
import { inGroundReach } from "./rear";
import { heldUnits, type Operation } from "./staff";

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
//An enemy influence point around a sector counts this much against an own strength point in reach
const ENEMY_WEIGHT = 1;
//A loss counts this much against a kill (the scripted general's LOSS_WEIGHT)
const LOSS_WEIGHT = 0.7;
//An attack worth ordering kills at least this much
const MIN_KILLS = 1;
//The fewest turns an assault is given before the staff weighs its sector again
const MIN_ASSAULT_TURNS = 3;
//A unit this few turns from another objective to take keeps the classic pull to the nearest: it is nearly there (in
//the arena, 1 sent too many units past objectives they would have taken)
const LOCAL_TURNS = 3;
//The last share of the turns, when an attack on the objective is worth what it costs (the general's LATE_SHARE)
const LATE_SHARE = 1 / 3;

//The attackers in the order they go in: tanks, the anti-tank guns as the second line, then infantry and recon
const WAVES: readonly (readonly number[])[] = [[unitClass.tank], [unitClass.antiTank], [unitClass.infantry, unitClass.recon]];

const samePosition = (a: Position, b: Position) => a.row === b.row && a.col === b.col;
const classOf = (w: World, u: UnitState) => unitData(w, u, true).uclass;
const hexOf = (w: World, p: Position) => hexIndex(w, p.row, p.col);
const standing = (u: UnitState, at: Position): UnitState => samePosition(u, at) ? u : { ...u, row: at.row, col: at.col };

/**
 * Whether the side assaults: the side attacking (#256), or one with more objectives to take than the enemy, as a
 * defender is once it has lost some (#231).
 */
export function assaults(w: World, side: number): boolean {
	const attacker = attackerSide(w);
	return attacker === side || w.state.objectives[side].length > w.state.objectives[~side & 1].length;
}

//Whether the game is in its last turns
const isLate = (w: World): boolean => w.state.turn.turn > w.state.scenario.maxTurns * (1 - LATE_SHARE);

//How a unit marches: in its transport when that goes further
function marchOf(w: World, u: UnitState): EquipmentEntry {
	const own = unitData(w, u, true);
	if (u.transport === null) return own;
	const transport = w.equipment[u.transport.eqid];
	return transport.movpoints > own.movpoints ? transport : own;
}

//The turns of its march a unit needs to reach the hex, on the terrain alone (fields.ts); Infinity where it can't
function turnsTo(w: World, cache: AnalysisCache, u: UnitState, at: Position): number {
	const march = marchOf(w, u), points = fieldTo(w, cache, march.movmethod, [at])[hexOf(w, u)];
	if (points === 0) return 0;
	return march.movpoints <= 0 || points === UNREACHED ? Infinity : Math.ceil(points / march.movpoints);
}

//The player's ground units no operation holds, on the map, that fight
function freeGround(w: World, player: number, held: ReadonlySet<UnitId>): UnitState[] {
	return w.state.units.filter((u) => u.owner === player && u.row >= 0 && !held.has(u.id) && isGround(w, u)
		&& classOf(w, u) !== unitClass.groundTransport && classOf(w, u) !== unitClass.fortification);
}

//What the side brings to a sector, each unit's strength the less the further it marches, less the enemy around it
function sectorScore(w: World, cache: AnalysisCache, units: readonly UnitState[], s: Sector): number {
	const own = units.reduce((n, u) => n + u.strength / (1 + turnsTo(w, cache, u, s.at)), 0);
	return own - ENEMY_WEIGHT * s.enemy;
}

//The objective to take the side strikes best: what it brings there against the enemy's influence around it
function pickSector(w: World, a: Analysis, cache: AnalysisCache, player: number, held: ReadonlySet<UnitId>): Sector | null {
	const units = freeGround(w, player, held), toTake = w.state.objectives[a.side];
	let best: Sector | null = null, bestScore = -Infinity;
	for (const s of a.sectors) {
		if (!toTake.some((o) => samePosition(o, s.at))) continue;
		const score = sectorScore(w, cache, units, s);
		if (score > bestScore) {
			best = s;
			bestScore = score;
		}
	}
	return best;
}

//The turn the assault is weighed again: the turns left shared among the objectives left to take (#232), a few at least
function deadlineOf(w: World, side: number): number {
	const turn = w.state.turn.turn, max = w.state.scenario.maxTurns, left = Math.max(1, w.state.objectives[side].length);
	return Math.min(max, turn + Math.max(MIN_ASSAULT_TURNS, Math.ceil((max - turn) / left)) - 1);
}

/**
 * The operations with the side's assault: the one going on while its sector is still to take, its deadline not passed
 * and it isn't hopeless (the enemy around it stronger than what the side brings, where another sector isn't); else a
 * new one on the sector the side strikes best. None for a side that doesn't assault.
 */
export function withAssault(w: World, a: Analysis, cache: AnalysisCache, player: number, ops: readonly Operation[]): Operation[] {
	const rest = ops.filter((op) => op.kind !== "assault"), current = ops.find((op) => op.kind === "assault");
	if (!assaults(w, a.side)) return rest;
	const held = heldUnits(rest);
	if (current !== undefined && goesOn(w, a, cache, player, held, current)) return ops as Operation[];
	const s = pickSector(w, a, cache, player, held);
	if (s === null) return rest;
	const until = deadlineOf(w, a.side);
	const reason = `assault ${s.at.row},${s.at.col}: enemy ${Math.round(s.enemy)} around it, until turn ${until}`;
	return [...rest, { kind: "assault", at: s.at, units: [], until, reason }];
}

function goesOn(w: World, a: Analysis, cache: AnalysisCache, player: number, held: ReadonlySet<UnitId>, op: Operation): boolean {
	if (w.state.turn.turn > op.until || !w.state.objectives[a.side].some((o) => samePosition(o, op.at))) return false;
	const units = freeGround(w, player, held), sector = a.sectors.find((s) => samePosition(s.at, op.at));
	if (sector === undefined || sectorScore(w, cache, units, sector) >= 0) return true;
	return !a.sectors.some((s) => s !== sector && sectorScore(w, cache, units, s) >= 0);
}

/**
 * Where the classic plan pulls a ground unit: to the assault's sector (#258), but for a unit already near another
 * objective to take, which keeps the pull to the nearest, in the last turns, and for the side defending (#256): its
 * units hold the line while it retakes an objective. Aircraft and ships keep the pull to every objective.
 */
export function pullTo(w: World, cache: AnalysisCache, op: Operation): (u: UnitState) => readonly Position[] {
	return (u) => {
		const side = sideOf(w, u), all = w.state.objectives[side];
		if (!isGround(w, u) || isLate(w) || attackerSide(w) === (~side & 1)) return all;
		const march = marchOf(w, u), hex = hexOf(w, u);
		const nearest = fieldTo(w, cache, march.movmethod, all)[hex], toSector = fieldTo(w, cache, march.movmethod, [op.at])[hex];
		return nearest < toSector && nearest <= LOCAL_TURNS * march.movpoints ? all : [op.at];
	};
}

//What an assault's order reads: the world, the side, the sector, its battle group and the enemies in its way
interface Battle {
	w: World;
	a: Analysis;
	side: number;
	sector: Position;
	group: UnitState[];
	targets: UnitState[];
	late: boolean;
	scouted: Set<UnitId>;
	cells: (u: UnitState) => readonly MoveCell[];
}

function battleOf(w: World, a: Analysis, cache: AnalysisCache, op: Operation, player: number, held: ReadonlySet<UnitId>,
	scouted: Set<UnitId>): Battle {
	const side = a.side, sector = op.at, group = battleGroup(w, cache, sector, player, held);
	const targets = w.state.units.filter((t) => t.row >= 0 && sideOf(w, t) !== side && isGround(w, t) && seesUnit(w, t, side)
		&& distance(t.row, t.col, sector.row, sector.col) <= TARGET_RADIUS);
	targets.sort((x, y) => distance(x.row, x.col, sector.row, sector.col) - distance(y.row, y.col, sector.row, sector.col));
	return { w, a, side, sector, group, targets, late: isLate(w), scouted, cells: rangesOf(w) };
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
 * couldn't fire move into range for the next turn. Null when it has none to give.
 */
export function assaultOrder(w: World, a: Analysis, cache: AnalysisCache, op: Operation, player: number, held: ReadonlySet<UnitId>,
	scouted: Set<UnitId>): AssaultOrder | null {
	const b = battleOf(w, a, cache, op, player, held, scouted);
	return reconOrder(b) ?? fireOrder(b) ?? gunsForward(b, freeGround(w, player, held));
}

//The artillery's fire, then the armour's attack, on the target the armour strikes best
function fireOrder(b: Battle): AssaultOrder | null {
	const main = b.targets.length === 0 ? null : mainTarget(b);
	return artilleryOrder(b, main) ?? attackOrder(b, main);
}

//A recon unit of the group moves where it sees most of the sector it doesn't see yet, once a turn, before anything
//else: its move is phased, the classic plan may move it again after
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

//An attack's estimate as the screen gives it: the support fire it meets counts in its losses, and an attack the
//support fire stops kills nothing
interface Strike {
	unit: UnitState;
	target: UnitState;
	from: Position | null;
	kills: number;
	losses: number;
}

const gainOf = (s: Strike) => s.kills - LOSS_WEIGHT * s.losses;

function strikeFrom(w: World, u: UnitState, t: UnitState, from: Position | null): Strike | null {
	const at = from === null ? u : standing(u, from);
	if (!isTargetFrom(w, at, t)) return null;
	const e = estimateAttack(w, at, t);
	const losses = e.result.losses + e.support.reduce((n, s) => n + s.losses, 0);
	return { unit: u, target: t, from, kills: e.stopped ? 0 : e.result.kills, losses };
}

const onObjective = (w: World, t: UnitState) => w.state.map.hexes[hexOf(w, t)].victorySide !== -1;

/**
 * Whether an attack is worth ordering: it kills, and no more than it loses, but on an objective in the last turns,
 * where taking it is worth what it costs.
 */
function isWorth(b: Battle, s: Strike): boolean {
	if (s.kills < MIN_KILLS || s.losses >= s.unit.strength) return false;
	return s.losses <= s.kills || (b.late && onObjective(b.w, s.target));
}

/** Whether a classic plan's attack loses more than it kills by the estimate, but on an objective in the last turns. */
export function losesMore(w: World, cmd: Command): boolean {
	if (cmd.type !== "attack") return false;
	const u = w.state.units.find((x) => x.id === cmd.unit), t = w.state.units.find((x) => x.id === cmd.target);
	if (u === undefined || t === undefined) return false;
	const s = strikeFrom(w, u, t, null);
	return s !== null && s.losses > s.kills && !(isLate(w) && onObjective(w, t));
}

const canFireNow = (u: UnitState) => !u.hasFired && ammoOf(u) > 0;

//A unit's best strike on the target from where it stands, or (not on its transport, whose move uses its shot) from a
//hex it moves to: a towed gun's step on foot leaves it its shot
function bestStrike(b: Battle, u: UnitState, t: UnitState): Strike | null {
	const here = worthFrom(b, u, t, null);
	return u.hasMoved || u.isMounted ? here : strikeAfterMove(b, u, t, here);
}

//The strike from the hex, when it is worth ordering
function worthFrom(b: Battle, u: UnitState, t: UnitState, from: Position | null): Strike | null {
	const s = strikeFrom(b.w, u, t, from);
	return s !== null && isWorth(b, s) ? s : null;
}

//The best of the strikes from the hexes the unit moves to in range of the target, or `best` when none beats it
function strikeAfterMove(b: Battle, u: UnitState, t: UnitState, best: Strike | null): Strike | null {
	const reach = unitAttackRange(b.w, u);
	for (const c of b.cells(u)) {
		if (!c.canMove || samePosition(c, u) || distance(c.row, c.col, t.row, t.col) > reach) continue;
		const s = worthFrom(b, u, t, { row: c.row, col: c.col });
		if (s !== null && (best === null || gainOf(s) > gainOf(best))) best = s;
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

function bestOf(strikes: readonly (Strike | null)[]): Strike | null {
	let best: Strike | null = null;
	for (const s of strikes) if (s !== null && (best === null || gainOf(s) > gainOf(best))) best = s;
	return best;
}

//A strike's commands, the move to its hex first, when the core allows the first
function strikeCommands(w: World, s: Strike | null): Command[] | null {
	if (s === null) return null;
	const attack: Command = { type: "attack", unit: s.unit.id, target: s.target.id };
	const commands: Command[] = s.from === null ? [attack] : [{ type: "move", unit: s.unit.id, to: s.from }, attack];
	return check(w, commands[0]) === null ? commands : null;
}

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
		const order = gunMove(b, g);
		if (order !== null) return { step: "guns forward", commands: order };
	}
	return null;
}

//How far a hex is from firing on the sector next turn
const gapOf = (b: Battle, g: UnitState, c: Position) => Math.max(0,
	distance(c.row, c.col, b.sector.row, b.sector.col) - unitAttackRange(b.w, g) - TARGET_RADIUS);

//What a gun's hex is judged on, the first that differs decides: how far from firing on the sector, the enemy's threat
//on it, how far from the sector (nearer follows the front), what the move costs
const gunKey = (b: Battle, g: UnitState, c: MoveCell): number[] => [gapOf(b, g, c), b.a.threat.ground[hexOf(b.w, c)],
	distance(c.row, c.col, b.sector.row, b.sector.col), c.cost];

//Whether one key comes before another: the first value that differs decides
function before(a: readonly number[], b: readonly number[]): boolean {
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
	return false;
}

//The move nearer firing on the sector, the mount first when it rides; null when none brings the gun nearer
function gunMove(b: Battle, g: UnitState): Command[] | null {
	const best = gunCell(b, g);
	if (best === null || gapOf(b, g, best.cell) >= gapOf(b, g, g)) return null;
	const move: Command = { type: "move", unit: g.id, to: { row: best.cell.row, col: best.cell.col } };
	const first: Command = best.mounted ? { type: "mount", unit: g.id } : move;
	if (check(b.w, first) !== null) return null;
	return best.mounted ? [first, move] : [move];
}

//The gun's best hex by its key, never beside an enemy, nor into the enemy's reach from out of it
function gunCell(b: Battle, g: UnitState): { cell: MoveCell; mounted: boolean } | null {
	const exposed = inGroundReach(b.a, hexOf(b.w, g));
	let best: { cell: MoveCell; mounted: boolean; key: number[] } | null = null;
	for (const [cells, mounted] of gunCells(b, g)) for (const c of cells) {
		if (!c.canMove || nextToSeenEnemy(b.w, g, c) || (!exposed && inGroundReach(b.a, hexOf(b.w, c)))) continue;
		const key = gunKey(b, g, c);
		if (best === null || before(key, best.key)) best = { cell: c, mounted, key };
	}
	return best;
}

//The hexes a gun moves to: its own move, and its transport's out of the enemy's ground reach (a gun on its truck is
//what the enemy overruns, #315)
function gunCells(b: Battle, g: UnitState): [MoveCell[], boolean][] {
	const out: [MoveCell[], boolean][] = [[moveRange(b.w, g), false]];
	if (canMount(b.w, g) && !g.isMounted)
		out.push([moveRange(b.w, { ...g, isMounted: true }).filter((c) => !inGroundReach(b.a, hexOf(b.w, c))), true]);
	return out;
}
