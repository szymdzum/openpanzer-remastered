//The scripted general (#236): a reference player for the AI arena (#46), a Controller like the AI's
//(src/core/controller.ts), so the session plays it as it plays the AI. It buys and deploys as the AI
//does (the AI's own turn start), then plays its turn one order at a time on the world as it is after
//the last one, as a person does:
//  1. resupply what is short of ammo or fuel, reinforce what is worn down, away from the enemy;
//  2. pick a target with the combat estimate, the one its units can hurt most for the least loss, and
//     fire on it in order: artillery, then aircraft, then the assault, until it is destroyed or no unit
//     can hurt it cheaply; then the next target;
//  3. move: onto an empty objective in reach, then toward the nearest objective to take (an attacker),
//     or onto its own objectives left empty (a defender); aircraft short of fuel back to an airfield.
//     A ground unit on an objective its side holds never leaves it: it fires from there.
//It sees what its side sees (fog of war) and asks the core whether an order is allowed (check) before
//it gives it, so the session never refuses it. Its doctrine (#605, Doctrine, docs/ai/arena.md) adds an
//attacker's sector and reserve, garrisons and withdrawals, and the attacker's sense of time.
import type { Command } from "../../src/core/command";
import { terrainType, unitClass } from "../../src/core/tables";
import { aiController } from "../../src/core/ai";
import { attackableUnit, isInAttackRange, unitAttackRange } from "../../src/core/attack";
import { combatResult } from "../../src/core/combat";
import type { Controller } from "../../src/core/controller";
import { distance } from "../../src/core/geometry";
import { moveRange } from "../../src/core/movement";
import { check } from "../../src/core/step";
import { attackerSide } from "../../src/core/turn";
import type { MoveCell, Position, UnitState, World } from "../../src/core/types";
import { canMount, isAir, isGround, unitUsesFuel } from "../../src/core/units";
import { groundUnitAt, hexIndex, sideOf, unitById, unitData } from "../../src/core/world";
import { brokeThrough, enemyGround, GARRISON_TURNS, inReach, isLate, pickReserve, pickSector, rearScore, SECTOR_RADIUS, seen,
	WORN } from "./doctrine";

//What the general weighs: an attack is worth its expected kills less this much per expected loss
const LOSS_WEIGHT = 0.7;
//A target is chosen only when its units together expect at least this much (kills less losses)
const TARGET_MIN = 1.5;
//A defender's units are its line: a loss weighs as much as a kill (it counterattacks only when the estimate favours it)
const DEFENCE_LOSS_WEIGHT = 1;
//In the last turns the attacker pays more for the objectives still in reach
const LATE_LOSS_WEIGHT = 0.4;
//A target in the way of the sector's attack is worth this much more
const SECTOR_TARGET_BONUS = 1;
//A reserve unit is sent to a threatened objective before a unit this many hexes nearer
const RESERVE_PREFERENCE = 3;
//A unit this many turns of its moves from an objective to take goes for it, the sector or not: it is already there
const LOCAL_TURNS = 2;
//A garrison is sent this many strength points stronger before one a hex nearer
const STRENGTH_PER_HEX = 3;
//The units beside an objective the enemy can reach this turn: a garrison alone is overrun
const SUPPORTS = 2;
//An enemy beside an objective of its side's is worth this much more to strike: it would take it next
const THREAT_TARGET_BONUS = 2;

type Role = "attack" | "defend";

/** What the general does beyond its first version (#605): each part can be left out. */
export interface Doctrine {
	sector: boolean;	//an attacker sends its units to one objective at a time
	reserve: boolean;	//a share of the mobile units held back, out of the enemy's reach
	depth: boolean;		//garrisons on the objectives in the enemy's reach, worn-down units withdrawn, careful counterattacks
	clock: boolean;		//the start's attacker attacks to the end, and in the last turns commits everything
}

const FULL: Doctrine = { sector: true, reserve: true, depth: true, clock: true };

/** The first general (#236), for a comparison: none of the doctrine. */
export const FIRST_GENERAL: Doctrine = { sector: false, reserve: false, depth: false, clock: false };

export function generalController(player: number, doctrine: Doctrine = FULL): Controller {
	const ai = aiController(player);
	let considered = new Set<string>();	//"phase:unit" already decided this turn
	let focus: number | null = null;	//the target being fired on
	let pending: Command | null = null;	//the attack after a move to its hex
	let ranges = new Map<number, MoveCell[]>(), rangesOf: World | null = null;	//the move ranges of a world
	let sector: Position | null = null;	//the objective the attack goes for, until it falls
	let reserve = new Set<number>(), reserved = false;	//the units held back, chosen once
	let sends = new Map<number, number>();	//by objective (hex): the units still to send there this turn
	let contactsOf: World | null = null, contactList: Position[] = [];	//the objectives in contact, of a world
	return {
		player,
		join: (w) => ai.join(w),
		startTurn: (w) => ai.startTurn(w),
		plan(w) {
			considered = new Set();
			focus = null;
			pending = null;
			sends = new Map();
			if (doctrine.sector) sector = sectorOf(w);
			if (doctrine.reserve) reserve = reserveOf(w);
			return w;
		},
		next(w) {
			const cmd = nextCommand(w);
			return cmd === null ? null : { command: cmd };
		},
	};

	//moveRange, once per unit and world (a command makes a new world)
	function rangeOf(w: World, u: UnitState): MoveCell[] {
		if (rangesOf !== w) {
			ranges = new Map();
			rangesOf = w;
		}
		let r = ranges.get(u.id);
		if (r === undefined) ranges.set(u.id, r = moveRange(w, u));
		return r;
	}

	function nextCommand(w: World): Command | null {
		if (pending !== null) {
			const cmd = pending;
			pending = null;
			if (check(w, cmd) === null) return cmd;
		}
		return supplyOrder(w) || (doctrine.depth ? garrisonOrder(w) : null) || attackOrder(w) || fallBackOrder(w) || moveOrder(w);
	}

	//The doctrine's moves before the others: a worn-down unit's withdrawal, the reserve's
	function fallBackOrder(w: World): Command | null {
		return (doctrine.depth ? withdrawOrder(w) : null) || (doctrine.reserve ? reserveOrder(w) : null);
	}

	//Once per unit and phase in a turn: the general never gives the same order twice
	function once(phase: string, u: UnitState): boolean {
		const k = phase + ":" + u.id;
		if (considered.has(k)) return false;
		considered.add(k);
		return true;
	}

	//A ground unit on an objective its side holds stays there: an objective left empty is the enemy's to walk into
	function garrison(w: World, u: UnitState): boolean {
		const side = sideOf(w, u);
		return isGround(w, u) && w.state.objectives[~side & 1].some((o) => o.row === u.row && o.col === u.col);
	}

	function own(w: World): UnitState[] {
		return w.state.units.filter((u) => u.owner === player && u.row >= 0);
	}

	function supplyOrder(w: World): Command | null {
		for (const u of own(w)) {
			if (considered.has("supply:" + u.id)) continue;
			const cmd = supplyCommand(w, u);
			if (cmd !== null) {
				once("supply", u);
				return cmd;
			}
		}
		return null;
	}

	//A resupply for a unit short of ammo or fuel, else a reinforcement for one worn down, away from the
	//enemy (an aircraft resupplies on its airfield whatever is around)
	function supplyCommand(w: World, u: UnitState): Command | null {
		if (u.hasMoved || u.hasFired) return null;
		const type = supplyNeed(w, u);
		const cmd: Command | null = type === null ? null : { type, unit: u.id };
		return cmd !== null && check(w, cmd) === null ? cmd : null;
	}

	function supplyNeed(w: World, u: UnitState): "resupply" | "reinforce" | null {
		const enemyNear = enemiesWithin(w, u, 1) > 0;
		if (shortOf(w, u, unitData(w, u, true)) && (isAir(w, u) || !enemyNear)) return "resupply";
		return u.strength <= 5 && !enemyNear ? "reinforce" : null;
	}

	//Short of ammo (a third or less) or fuel (a third or less, half for an aircraft, which falls when it runs out)
	function shortOf(w: World, u: UnitState, max: { ammo: number; fuel: number }): boolean {
		if (max.ammo > 0 && u.ammo <= max.ammo / 3) return true;
		return unitUsesFuel(w, u) && max.fuel > 0 && u.fuel <= max.fuel * (isAir(w, u) ? 0.5 : 0.34);
	}

	function enemiesWithin(w: World, u: UnitState, range: number): number {
		const side = sideOf(w, u);
		return w.state.units.filter((e) => e.row >= 0 && sideOf(w, e) !== side && seen(w, e, side)
			&& distance(u.row, u.col, e.row, e.col) <= range).length;
	}

	//The next attack on the target being fired on, else on the next target
	function attackOrder(w: World): Command | null {
		const t = focus === null ? null : unitById(w, focus);
		const next = t !== null && t.row >= 0 ? bestAttack(w, t) : null;
		if (next !== null) return issue(w, next) || attackOrder(w);
		focus = null;
		const target = pickTarget(w);
		if (target === null) return null;
		focus = target.id;
		const first = bestAttack(w, target);
		return first === null ? null : issue(w, first) || attackOrder(w);
	}

	//The enemy unit its side sees that its units can hurt most (targetValue), when worth it
	function pickTarget(w: World): UnitState | null {
		const side = w.state.players[player].side;
		let best: { target: UnitState; value: number } | null = null;
		for (const t of w.state.units) {
			if (t.row < 0 || sideOf(w, t) === side || !seen(w, t, side)) continue;
			const value = targetValue(w, t);
			if (value >= TARGET_MIN && (best === null || value > best.value)) best = { target: t, value };
		}
		return best === null ? null : best.target;
	}

	//A move to the attack's hex first, when it needs one; the attack follows at the next call. Null when
	//the core refuses it (a move range hex the path can't reach): the unit attacks nothing more this turn
	function issue(w: World, a: Attack): Command | null {
		const attack: Command = { type: "attack", unit: a.unit.id, target: a.target.id };
		const cmd: Command = a.from === null ? attack : { type: "move", unit: a.unit.id, to: a.from };
		if (check(w, cmd) !== null) {
			considered.add("attack:" + a.unit.id);
			return null;
		}
		if (a.from !== null) pending = attack;
		return cmd;
	}

	//What the units that can still fire expect against t together, each from its best hex: kills
	//(up to t's strength) less the weighted losses, more for a target on an objective
	function targetValue(w: World, t: UnitState): number {
		let kills = 0, losses = 0;
		for (const a of attacksOn(w, t)) {
			kills += a.kills;
			losses += a.losses;
		}
		const onObjective = w.state.map.hexes[hexIndex(w, t.row, t.col)].victorySide !== -1 ? 2 : 0;
		return Math.min(kills, t.strength) - lossWeight(w) * losses + onObjective + doctrineBonus(w, t);
	}

	//The next attack on t in the order of arms: artillery, aircraft, then the rest; the cheapest of a kind
	function bestAttack(w: World, t: UnitState): Attack | null {
		const k = lossWeight(w);
		const all = attacksOn(w, t).filter((a) => a.kills >= 1 && score(a, k) > 0);
		if (all.length === 0) return null;
		all.sort((a, b) => armOrder(w, a.unit) - armOrder(w, b.unit) || score(b, k) - score(a, k));
		return all[0];
	}

	function armOrder(w: World, u: UnitState): number {
		const c = unitData(w, u).uclass;
		if (c === unitClass.artillery) return 0;
		if (isAir(w, u)) return 1;
		return 2;
	}

	//Each own unit's best attack on t: from where it stands, or from a hex it can move to
	function attacksOn(w: World, t: UnitState): Attack[] {
		const out: Attack[] = [];
		for (const u of own(w)) {
			const a = attackOf(w, u, t);
			if (a !== null) out.push(a);
		}
		return out;
	}

	//u's best attack on t: from where it stands, or (not a garrison, not artillery that can fire from
	//where it is) from a hex it can move to
	function attackOf(w: World, u: UnitState, t: UnitState): Attack | null {
		if (!canFire(w, u)) return null;
		const here = attackFrom(w, u, t, null);
		return firesInPlace(w, u, here) ? here : attackAfterMove(w, u, t, here);
	}

	function canFire(w: World, u: UnitState): boolean {
		return !u.hasFired && u.ammo > 0 && !considered.has("attack:" + u.id) && !withdrawing(w, u);
	}

	//A unit that fires from where it stands: moved, holding its hex, in reserve, or artillery in range
	function firesInPlace(w: World, u: UnitState, here: Attack | null): boolean {
		return u.hasMoved || holding(w, u) || reserve.has(u.id) || (here !== null && unitData(w, u).uclass === unitClass.artillery);
	}

	//u's best attack on t from the hexes it can move to, or best when none beats it
	function attackAfterMove(w: World, u: UnitState, t: UnitState, best: Attack | null): Attack | null {
		const range = unitAttackRange(w, u), k = lossWeight(w);
		for (const c of rangeOf(w, u)) {
			if (!c.canMove || (c.row === u.row && c.col === u.col) || distance(c.row, c.col, t.row, t.col) > range) continue;
			const a = attackFrom(w, u, t, { row: c.row, col: c.col });
			if (a !== null && (best === null || score(a, k) > score(best, k))) best = a;
		}
		return best;
	}

	//u's attack on t from a hex (null: where it stands), with the core's estimate; null when it can't
	function attackFrom(w: World, u: UnitState, t: UnitState, from: Position | null): Attack | null {
		const at = from === null ? u : { ...u, row: from.row, col: from.col };
		if (!canHit(w, at, t)) return null;
		const r = combatResult(w, at, t, false, null);
		return { unit: u, target: t, from, kills: r.kills, losses: r.losses };
	}

	function moveOrder(w: World): Command | null {
		const side = w.state.players[player].side, role = roleNow(w, side);
		const toTake = w.state.objectives[side], toHold = w.state.objectives[~side & 1];
		for (const u of own(w)) {
			if (u.hasMoved || holding(w, u) || !once("move", u)) continue;
			const cells = rangeOf(w, u).filter((c) => c.canMove && !(c.row === u.row && c.col === u.col));
			if (cells.length === 0) continue;
			const cmd = isAir(w, u) ? airMove(w, u, cells) : groundMove(w, u, cells, role, toTake, toHold);
			if (cmd !== null && check(w, cmd) === null) return cmd;
		}
		return null;
	}

	//An aircraft short of fuel goes back to its side's nearest airfield in reach; the others stay
	function airMove(w: World, u: UnitState, cells: Position[]): Command | null {
		if (!shortOf(w, u, unitData(w, u, true))) return null;
		const fields = cells.filter((c) => {
			const hex = hexIndex(w, c.row, c.col);
			const owner = w.state.map.hexes[hex].owner;
			return w.data.hexes[hex].terrain === terrainType.Airfield && owner !== -1
				&& w.state.players[owner < w.state.players.length ? owner : 0].side === sideOf(w, u);
		});
		if (fields.length === 0) return null;
		fields.sort((a, b) => distance(u.row, u.col, a.row, a.col) - distance(u.row, u.col, b.row, b.col));
		return { type: "move", unit: u.id, to: fields[0] };
	}

	function groundMove(w: World, u: UnitState, cells: Position[], role: Role, toTake: Position[], toHold: Position[]): Command | null {
		if (!isGround(w, u) || reserve.has(u.id)) return null;
		const empty = cells.find((c) => toTake.some((o) => o.row === c.row && o.col === c.col));
		if (empty !== undefined) return { type: "move", unit: u.id, to: empty };
		if (role === "defend") return defendMove(w, u, cells, toHold);
		//(worn down units stay back)
		if (u.strength <= 4 || toTake.length === 0) return null;
		return mountFirst(w, u) || advance(w, u, cells, goalOf(w, u, toTake));
	}

	//A defender's unit moves only onto an objective of its side's left empty
	function defendMove(w: World, u: UnitState, cells: Position[], toHold: Position[]): Command | null {
		const unheld = cells.filter((c) => toHold.some((o) => o.row === c.row && o.col === c.col)
			&& groundUnitAt(w, hexIndex(w, c.row, c.col)) === null);
		return unheld.length > 0 ? { type: "move", unit: u.id, to: unheld[0] } : null;
	}

	//The nearest objective to take, or the sector for a unit not already near one
	function goalOf(w: World, u: UnitState, toTake: Position[]): Position {
		const s = sector, near = nearest(u, toTake);
		const local = distance(u.row, u.col, near.row, near.col) <= LOCAL_TURNS * unitData(w, u).movpoints;
		return s !== null && !local && toTake.some((o) => same(o, s)) ? s : near;
	}

	//Infantry mounts its transport while no enemy is near; it moves at the next call, mounted
	function mountFirst(w: World, u: UnitState): Command | null {
		if (u.isMounted || !canMount(w, u) || enemiesWithin(w, u, 3) > 0) return null;
		const mount: Command = { type: "mount", unit: u.id };
		if (check(w, mount) !== null) return null;
		considered.delete("move:" + u.id);
		return mount;
	}

	//Toward the objective, the nearest hex to it, cover preferred; artillery keeps out of the enemy's reach
	function advance(w: World, u: UnitState, cells: Position[], target: Position): Command | null {
		const now = distance(u.row, u.col, target.row, target.col);
		const artillery = unitData(w, u).uclass === unitClass.artillery;
		let best: Position | null = null, bestScore = -Infinity;
		for (const c of cells) {
			const d = distance(c.row, c.col, target.row, target.col);
			if (d >= now) continue;
			if (artillery && enemiesWithin(w, { ...u, row: c.row, col: c.col }, 1) > 0) continue;
			const s = -d + defenseOf(w, c);
			if (s > bestScore) { best = c; bestScore = s; }
		}
		return best === null ? null : { type: "move", unit: u.id, to: best };
	}

	//A small preference for cover: cities, forests, hills, fortifications
	function defenseOf(w: World, c: Position): number {
		const t = w.data.hexes[hexIndex(w, c.row, c.col)].terrain;
		return t === terrainType.City || t === terrainType.Forest || t === terrainType.Hill || t === terrainType.Fortification ? 0.5 : 0;
	}

	function nearest(u: UnitState, cells: Position[]): Position {
		let best = cells[0];
		for (const c of cells)
			if (distance(u.row, u.col, c.row, c.col) < distance(u.row, u.col, best.row, best.col)) best = c;
		return best;
	}

	//With the sense of time, the side that had more objectives to take at the start attacks to the end: it wins
	//only by taking them all. A defender attacks while it has more to retake than the enemy has left to take
	function roleNow(w: World, side: number): Role {
		return doctrine.clock && attackerSide(w) === side ? "attack" : roleOf(w, side);
	}

	function lossWeight(w: World): number {
		const role = roleNow(w, w.state.players[player].side);
		if (doctrine.depth && role === "defend") return DEFENCE_LOSS_WEIGHT;
		return doctrine.clock && role === "attack" && isLate(w) ? LATE_LOSS_WEIGHT : LOSS_WEIGHT;
	}

	//More for a target in the way of the sector's attack, more still for one beside an objective of its side's
	function doctrineBonus(w: World, t: UnitState): number {
		const s = sector, sectorBonus = s !== null && distance(t.row, t.col, s.row, s.col) <= SECTOR_RADIUS ? SECTOR_TARGET_BONUS : 0;
		return sectorBonus + (contacts(w).some((o) => distance(t.row, t.col, o.row, o.col) <= 1) ? THREAT_TARGET_BONUS : 0);
	}

	//A worn-down unit that holds nothing keeps its moves to fall back
	function withdrawing(w: World, u: UnitState): boolean {
		return doctrine.depth && isGround(w, u) && u.strength <= WORN && !holding(w, u);
	}

	//The attacker's objective until it falls; none for a defender, nor in the last turns (every objective then)
	function sectorOf(w: World): Position | null {
		const side = w.state.players[player].side, toTake = w.state.objectives[side];
		if (roleNow(w, side) !== "attack" || (doctrine.clock && isLate(w))) return null;
		const s = sector;
		if (s !== null && toTake.some((o) => same(o, s))) return s;
		return pickSector(own(w).filter((u) => isGround(w, u)), enemyGround(w, side), toTake);
	}

	//An attacker's reserve, chosen at its first turn, for good once the sector's attack broke through or the last turns
	//came; a defender holds its line with every unit
	function reserveOf(w: World): Set<number> {
		const side = w.state.players[player].side, enemies = enemyGround(w, side);
		if (roleNow(w, side) !== "attack") return new Set();
		if (!reserved) {
			reserved = true;
			reserve = pickReserve(w, own(w), enemies);
		}
		if ((doctrine.clock && isLate(w)) || (sector !== null && brokeThrough(enemies, sector))) return new Set();
		return new Set([...reserve].filter((id) => unitById(w, id) !== null));
	}

	//An objective of its side's in the enemy's reach gets a garrison, the nearest unit that can go there (a
	//reserve's first), and once the enemy is a move away SUPPORTS units beside it: a line the enemy must break first
	function garrisonOrder(w: World): Command | null {
		const side = w.state.players[player].side, enemies = enemyGround(w, side);
		for (const o of w.state.objectives[~side & 1]) {
			const cmd = sendOne(w, o, side, enemies) ? garrisonMove(w, o) : null;
			if (cmd !== null) return cmd;
		}
		return null;
	}

	//Whether o, an objective of its side's in the enemy's reach, still needs a unit sent this turn (counted)
	function sendOne(w: World, o: Position, side: number, enemies: readonly UnitState[]): boolean {
		const hex = hexIndex(w, o.row, o.col), held = groundUnitAt(w, hex);
		if ((held !== null && sideOf(w, held) !== side) || !inReach(w, enemies, o, GARRISON_TURNS)) return false;
		if (!sends.has(hex)) sends.set(hex, (held === null ? 1 : 0) + (inReach(w, enemies, o) ? supportsWanted(w, o, enemies) : 0));
		const left = sends.get(hex) as number;
		sends.set(hex, left - 1);
		return left > 0;
	}

	//SUPPORTS beside it, more while the enemy around it is stronger than its own units there (a unit is 10 points)
	function supportsWanted(w: World, o: Position, enemies: readonly UnitState[]): number {
		const around = (us: readonly UnitState[], r: number) => us.filter((u) => distance(u.row, u.col, o.row, o.col) <= r);
		const strength = (us: readonly UnitState[]) => us.reduce((a, u) => a + u.strength, 0);
		const mine = around(own(w).filter((u) => isGround(w, u)), 2);
		const beside = mine.filter((u) => distance(u.row, u.col, o.row, o.col) === 1).length;
		return Math.max(SUPPORTS - beside, Math.ceil((strength(around(enemies, 3)) - strength(mine)) / 10));
	}

	//The objectives of its side's in the enemy's reach (GARRISON_TURNS), once per world
	function contacts(w: World): Position[] {
		if (contactsOf !== w) {
			const side = w.state.players[player].side, enemies = enemyGround(w, side);
			contactsOf = w;
			contactList = doctrine.depth && roleNow(w, side) === "attack" ? w.state.objectives[~side & 1].filter((o) => inReach(w, enemies, o, GARRISON_TURNS)) : [];
		}
		return contactList;
	}

	//A garrison, or (the doctrine's depth) a unit beside an objective in the enemy's reach: it holds its hex
	function holding(w: World, u: UnitState): boolean {
		return garrison(w, u) || (doctrine.depth && isGround(w, u) && contacts(w).some((o) => distance(u.row, u.col, o.row, o.col) === 1));
	}

	function garrisonMove(w: World, o: Position): Command | null {
		const free = own(w).filter((u) => isGround(w, u) && !u.hasMoved && !holding(w, u) && !considered.has("move:" + u.id)
			&& unitData(w, u).uclass !== unitClass.artillery);
		const cost = (u: UnitState) => distance(u.row, u.col, o.row, o.col) - (reserve.has(u.id) ? RESERVE_PREFERENCE : 0)
			- u.strength / STRENGTH_PER_HEX;
		free.sort((a, b) => cost(a) - cost(b) || a.id - b.id);
		for (const u of free) {
			const to = toward(w, u, o);
			const cmd: Command | null = to === null ? null : { type: "move", unit: u.id, to };
			if (cmd === null || check(w, cmd) !== null) continue;
			once("move", u);
			reserve.delete(u.id);
			return cmd;
		}
		return null;
	}

	//The hex of u's move range nearest to o, when nearer than u is
	function toward(w: World, u: UnitState, o: Position): Position | null {
		let best: Position | null = null, d = distance(u.row, u.col, o.row, o.col);
		for (const c of rangeOf(w, u)) {
			const dc = distance(c.row, c.col, o.row, o.col);
			if (c.canMove && dc < d) {
				best = { row: c.row, col: c.col };
				d = dc;
			}
		}
		return best;
	}

	function withdrawOrder(w: World): Command | null {
		const side = w.state.players[player].side, enemies = enemyGround(w, side);
		for (const u of own(w)) {
			if (!withdrawing(w, u) || u.hasMoved || !inReach(w, enemies, u) || !once("move", u)) continue;
			const cmd = allowedMove(w, u, bestHex(w, u, (c) => rearScore(w, side, enemies, c)));
			if (cmd !== null) return cmd;
		}
		return null;
	}

	//The reserve waits out of the enemy's reach, near the sector or else the objectives it holds
	function reserveOrder(w: World): Command | null {
		const side = w.state.players[player].side, enemies = enemyGround(w, side);
		for (const u of own(w)) {
			const cmd = reserve.has(u.id) && !u.hasMoved && once("move", u) ? allowedMove(w, u, holdHex(w, u, side, enemies)) : null;
			if (cmd !== null) return cmd;
		}
		return null;
	}

	function holdHex(w: World, u: UnitState, side: number, enemies: readonly UnitState[]): Position | null {
		const anchor = sector ?? nearestOf(u, [...w.state.objectives[~side & 1], ...w.state.objectives[side]]);
		if (anchor === null) return null;
		return bestHex(w, u, (c) => (inReach(w, enemies, c) ? -100 : 0) - distance(c.row, c.col, anchor.row, anchor.col));
	}

	//A move of u to the hex, when there is one and the core allows it
	function allowedMove(w: World, u: UnitState, to: Position | null): Command | null {
		const cmd: Command | null = to === null ? null : { type: "move", unit: u.id, to };
		return cmd !== null && check(w, cmd) === null ? cmd : null;
	}

	//The hex of u's move range that scores best, when better than where u stands
	function bestHex(w: World, u: UnitState, value: (c: Position) => number): Position | null {
		let best: Position | null = null, bestValue = value(u);
		for (const c of rangeOf(w, u)) {
			const v = c.canMove ? value(c) : -Infinity;
			if (v > bestValue) {
				best = { row: c.row, col: c.col };
				bestValue = v;
			}
		}
		return best;
	}

	function nearestOf(u: UnitState, cells: Position[]): Position | null {
		return cells.length === 0 ? null : nearest(u, cells);
	}

	function score(a: Attack, k: number): number {
		return a.kills - k * a.losses;
	}
}

//Whether a unit at "at" can fire on t: in range, a target it can attack, and an aircraft with range 1
//above its ground target (it bombs the hex it is over)
function canHit(w: World, at: UnitState, t: UnitState): boolean {
	if (!isInAttackRange(w, at, t)) return false;
	const hex = hexIndex(w, t.row, t.col);
	if (attackableUnit(w, at, hex, isAir(w, t)) !== t && attackableUnit(w, at, hex, !isAir(w, t)) !== t) return false;
	return !isAir(w, at) || isAir(w, t) || unitAttackRange(w, at) > 1 || (at.row === t.row && at.col === t.col);
}

//An attacker has more objectives to take than its enemy holds of its own to defend; a defender the other way
export function roleOf(w: World, side: number): Role {
	return w.state.objectives[side].length > w.state.objectives[~side & 1].length ? "attack" : "defend";
}

interface Attack {
	unit: UnitState;
	target: UnitState;
	from: Position | null;
	kills: number;
	losses: number;
}

const same = (a: Position, b: Position) => a.row === b.row && a.col === b.col;
