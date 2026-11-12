/**
 * The remastered AI as a controller: at each of its turns it reads what its side knows (perception.ts) and maps it
 * (analysis.ts); its commander directs, its staff's operations (staff.ts) order the units they hold and its planner
 * (planner.ts) the rest, one order at a time.
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

import { aiController } from "../ai";
import type { Command } from "../command";
import type { Controller, Played } from "../controller";
import type { GameEvent } from "../events";
import { check, step } from "../step";
import type { Position, UnitId, UnitState, World } from "../types";
import { unitById } from "../world";
import { type Analysis, type AnalysisCache, analyse } from "./analysis";
import { assaultOrder, pullTo } from "./assault";
import { deploymentOrder } from "./deployment";
import { assaults, attacks, pressed } from "./clock";
import { command, type Commander } from "./commander";
import { type Directive, type Dropped, isGroup, type Validated, validateDirectives } from "./directives";
import { perceive, type Sighting, type SideView } from "./perception";
import { newMemo, plannerOrder, type PlannerMemo } from "./planner";
import { purchases } from "./purchases";
import { idleSupply, resupplyOrder, rideOutOfReach, unmountOrder, urgentSupply } from "./rear";
import { reserveMarch } from "./reserve";
import { garrisonFire, garrisonMarch, garrisonSupply, heldUnits, holdingOperations, occupation, type Operation, standFast, withStrikes } from "./staff";

/**
 * The remastered controller, with what it made of its last turn (null before it planned one): its commander's
 * directives, those dropped by the check, and its staff's operations.
 */
export interface RemasteredController extends Controller {
	readonly view: SideView | null;
	readonly analysis: Analysis | null;
	readonly directives: readonly Directive[];
	readonly dropped: readonly Dropped[];
	readonly operations: readonly Operation[];
}

//What the controller keeps through one of its turns: the hex its last attack hit, the second command of an order (an
//attack after its move, a move after its mount), and what its staff and planner looked at already
interface TurnMemory {
	attacked: Position | null;
	pending: Command | null;
	supplied: Set<UnitId>;
	scouted: Set<UnitId>;	//the recon units the assault sent forward
	mounted: Set<UnitId>;	//the units on their transports at the turn's start
	waited: Set<UnitId>;	//the reserve's units the staff looked at this turn for a move to where they wait
	planner: PlannerMemo;
	orders: number;
}

//Orders in one turn past which the controller ends it: a guard against a turn that would never end, far above any
//real turn's (Zitadelle's biggest army gives about 300)
const MAX_ORDERS = 2000;

const newTurn = (): TurnMemory => ({ attacked: null, pending: null, supplied: new Set(), scouted: new Set(), mounted: new Set(),
	waited: new Set(), planner: newMemo(), orders: 0 });

const NO_UNITS: ReadonlySet<UnitId> = new Set();

const one = (cmd: Command | null): Command[] | null => cmd === null ? null : [cmd];

/**
 * The remastered AI. Its commander (`commander`: the rules of commander.ts when not given) answers in directives,
 * checked before the staff reads them; the staff's operations are made from them alone and hold some units over turns
 * (a garrison on each objective to hold, a unit onto an objective its attack emptied). It resupplies units before
 * contact and ends no ride in the enemy's reach but near an objective, unless it defends and no enemy plays after it
 * in the round. Its planner (planner.ts) orders the units no operation holds, one order at a time on the world as it
 * is: every order is asked of the core first (`check`), so it gives none the core refuses. At the turn's start it buys
 * what its army lacks for the directives (purchases.ts) and deploys for them (deployment.ts). Its reinforcements arrive
 * after its plan (#94): before its next order it looks at the side again and its commander gives them their part.
 *
 * It draws from no random stream: of equal choices the first wins.
 * What it remembers (the enemies last seen, the fields that don't change, the directives, the operations) is the
 * controller's, not state (docs/STATE.md D6): a loaded game starts with none and plans the turn again.
 */
export function remasteredController(player: number, commander: Commander = command): RemasteredController {
	const cache: AnalysisCache = new Map(), destroyed = new Set<UnitId>();
	let memory: readonly Sighting[] = [], view: SideView | null = null, analysis: Analysis | null = null;
	let operations: Operation[] = [], directives: Directive[] = [], dropped: Dropped[] = [], held = new Set<UnitId>(), turn = newTurn();
	let target: UnitId | null = null;
	//The player's units the plan knew of, and those that arrived since, until the commander hears of them: its
	//reinforcements (#639)
	let known = new Set<UnitId>(), arrived: UnitId[] = [];
	//An enemy its last attack took off the map was seen destroyed
	const watch = (w: World) => {
		if (target !== null && unitById(w, target) === null) destroyed.add(target);
		target = null;
	};
	const setOperations = (ops: Operation[]) => {
		operations = ops;
		held = heldUnits(ops);
	};
	const sideOfPlayer = (w: World) => w.state.players[player].side;
	//What the side knows and its maps, of the world as it is
	const look = (w: World) => {
		view = perceive(w, sideOfPlayer(w), memory.filter((s) => !destroyed.has(s.id)));
		memory = view.enemies;
		analysis = analyse(w, view, cache);
	};
	//The units that arrived after the plan (the session deploys a player's reinforcements after it, #94): the side
	//looks again before the next order, and its commander gives them their part
	const refresh = (w: World) => {
		const come = w.state.units.filter((u) => u.owner === player && !known.has(u.id));
		if (come.length === 0) return;
		for (const u of come) {
			known.add(u.id);
			arrived.push(u.id);
			if (u.isMounted) turn.mounted.add(u.id);
		}
		look(w);
	};
	function review(w: World, v: SideView, a: Analysis) {
		const orders = direct(w, v, a, { directives, dropped, operations }, { player, commander, cache, arrived });
		//The commander hears of the units once, where they arrived: those it gives no directive then are the plan's
		arrived = [];
		directives = orders.directives;
		dropped = orders.dropped;
		setOperations(orders.operations);
	}

	//The planner's order for a unit no operation holds, read from the directives: the main effort's sector, the
	//objectives held and the line that stands fast by them
	function plannerNext(w: World, a: Analysis, v: SideView): Command[] | null {
		const side = sideOfPlayer(w), sector = operations.find((op) => op.kind === "assault"), plain = directives.filter((d) => !isGroup(d));
		const attacking = attacks(w, side), line = attacking ? NO_UNITS : standFast(w, v, cache, player, held, plain);
		return plannerOrder({ w, a, cache, player, held, attacks: attacking, assaults: assaults(w, side), pressed: pressed(w, side),
			goals: groupGoals(directives, line, pullTo(w, cache, sector, line)), ridesTo: rideOutOfReach(w, a, player),
			sector: sector === undefined ? null : sector.at, holds: plain.filter((d) => d.task === "hold" || d.task === "delay").map((d) => d.target),
			memo: turn.planner });
	}

	//The orders of the counterattacks, then of the assault, in the directives' order
	function strikeOrder(w: World, a: Analysis): Command[] | null {
		for (const op of operations) {
			const order = op.kind === "assault" || op.kind === "counterattack" ? assaultOrder(w, a, cache, op, player, held, turn.scouted) : null;
			if (order !== null) return order.commands;
		}
		return null;
	}

	//The turn's orders, the first source that has one: onto an objective just emptied, off a transport in the enemy's
	//reach, a garrison's march, the reserve's to where it waits, the supply a unit can't fight without and a resupply
	//before contact, the counterattacks' and the assault's, the planner's for the free units; then what the garrisons
	//and the units that did nothing do last: fire from their objectives, reinforce, resupply
	const sources: ((w: World, a: Analysis, v: SideView) => Command[] | null)[] = [
		(w) => one(occupyOrder(w)),
		(w, a, v) => {
			review(w, v, a);
			return one(unmountOrder(w, a, player, held, turn.mounted));
		},
		(w, a) => garrisonMarch(w, operations, rideOutOfReach(w, a, player)),
		(w, a) => reserveMarch(w, a, operations, rideOutOfReach(w, a, player), turn.waited),
		(w) => one(urgentSupply(w, player, held)),
		(w, a) => one(resupplyOrder(w, a, player, held)),
		strikeOrder,
		plannerNext,
		(w) => one(garrisonFire(w, operations) ?? garrisonSupply(w, operations, turn.supplied) ?? idleSupply(w, player, held)),
	];

	function ordered(w: World): Command | null {
		const pending = turn.pending;
		turn.pending = null;
		if (pending !== null && check(w, pending) === null) return pending;
		if (analysis === null || view === null) return null;
		for (const source of sources) {
			const cmds = source(w, analysis, view);
			if (cmds === null) continue;
			turn.pending = cmds.length > 1 ? cmds[1] : null;
			return cmds[0];
		}
		return null;
	}

	function occupyOrder(w: World): Command | null {
		const at = turn.attacked;
		turn.attacked = null;
		const o = at === null ? null : occupation(w, player, at, held);
		if (o === null) return null;
		setOperations([...operations, o.op]);
		return o.move;
	}

	function nextCommand(w: World): Command | null {
		if (turn.orders >= MAX_ORDERS) return null;
		const cmd = ordered(w);
		if (cmd === null) return null;
		turn.orders++;
		if (cmd.type === "attack") {
			target = cmd.target;
			turn.planner.struck.add(cmd.target);
			const t = unitById(w, cmd.target);
			turn.attacked = t === null ? null : { row: t.row, col: t.col };
		}
		return cmd;
	}

	return {
		player,
		get view() {
			return view;
		},
		get analysis() {
			return analysis;
		},
		get directives() {
			return directives;
		},
		get dropped() {
			return dropped;
		},
		get operations() {
			return operations;
		},
		join: (w) => ({ world: w, commands: [], events: [], view: [] }),
		//The directives of the side's view before the purchases, kept for nothing: the plan asks again once they deployed
		startTurn(w) {
			watch(w);
			const v = perceive(w, sideOfPlayer(w), memory.filter((s) => !destroyed.has(s.id))), a = analyse(w, v, cache);
			const asked = commander(w, v, a, { player, directives, held, cache });
			const plain = validateDirectives(asked, w, a.side).directives.filter((d) => !isGroup(d));
			return muster(w, { player, view: v, analysis: a, cache, directives: plain });
		},
		plan(w) {
			watch(w);
			look(w);
			destroyed.clear();
			turn = newTurn();
			known = new Set(w.state.units.filter((u) => u.owner === player).map((u) => u.id));
			arrived = [];
			for (const u of w.state.units) if (u.owner === player && u.isMounted) turn.mounted.add(u.id);
			review(w, view as SideView, analysis as Analysis);
			return w;
		},
		next(w) {
			watch(w);
			if (view !== null) refresh(w);
			const cmd = nextCommand(w);
			return cmd === null ? null : { command: cmd };
		},
	};
}

/** What the turn's start reads: the player, its side's view and maps, and its commander's directives. */
interface Muster {
	player: number;
	view: SideView;
	analysis: Analysis;
	cache: AnalysisCache;
	directives: readonly Directive[];
}

//The purchases for the plan, then the deployment, one unit at a time on the world as it is; each asked of the core
function muster(w: World, m: Muster): Played {
	let world = w;
	const commands: Command[] = [], events: GameEvent[] = [];
	const play = (cmd: Command) => {
		const r = step(world, cmd);
		if (!r.ok) return false;
		world = r.world;
		commands.push(cmd);
		events.push(...r.events);
		return true;
	};
	for (const p of purchases(w, m.view, m.directives, m.player)) play({ type: "buy", eqid: p.eqid, transport: p.transport });
	for (let cmd = deploymentOrder(world, m.analysis, m.cache, m.directives, m.player); cmd !== null && play(cmd);
		cmd = deploymentOrder(world, m.analysis, m.cache, m.directives, m.player));
	return { world, commands, events, view: [] };
}

//The objectives that pull a unit: a group's target for its units, but for those of the line, which stand fast
function groupGoals(directives: readonly Directive[], line: ReadonlySet<UnitId>, pull: (u: UnitState) => readonly Position[])
	: (u: UnitState) => readonly Position[] {
	const groups = directives.filter(isGroup);
	if (groups.length === 0) return pull;
	return (u) => {
		const g = line.has(u.id) ? undefined : groups.find((d) => d.units.includes(u.id));
		return g === undefined ? pull(u) : [g.target];
	};
}

/** A commander's directives after the check, those it dropped, and the staff's operations for them. */
export interface Orders {
	directives: Directive[];
	dropped: Dropped[];
	operations: Operation[];
}

/**
 * The commander's directives for the player now and the staff's operations for them, from the last ones. The units a
 * new garrison takes aren't the main effort's: the commander is asked again once the staff's held units change.
 */
export function direct(w: World, view: SideView, a: Analysis, last: Orders,
	by: { player: number; commander: Commander; cache: AnalysisCache; arrived?: readonly UnitId[] }): Orders {
	const held = heldUnits(last.operations);
	const ask = (holding: ReadonlySet<UnitId>) => validateDirectives(by.commander(w, view, a,
		{ player: by.player, directives: last.directives, held: holding, cache: by.cache, arrived: by.arrived }), w, a.side);
	const plain = (o: Validated) => o.directives.filter((d) => !isGroup(d));
	let orders = ask(held), ops = holdingOperations(w, view, by.player, last.operations, plain(orders));
	const holding = heldUnits(ops);
	if (holding.size !== held.size || [...holding].some((id) => !held.has(id))) {
		orders = ask(holding);
		ops = holdingOperations(w, view, by.player, ops, plain(orders));
	}
	return { ...orders, operations: withStrikes(ops, orders.directives) };
}

/** What a side knows and makes of the map: its perception and analysis, and its commander's directives if any. */
export interface Knowledge {
	view: SideView;
	analysis: Analysis;
	directives?: readonly Directive[];
}

/** The last perception and analysis of the side by the remastered controller that plays one of its players, if any. */
export function knowledgeOf(controllers: readonly (Controller | null)[], side: number): Knowledge | null {
	for (const c of controllers) {
		const r = c !== null && "analysis" in c ? c as RemasteredController : null;
		if (r !== null && r.view !== null && r.analysis !== null && r.view.side === side) return { view: r.view, analysis: r.analysis, directives: r.directives };
	}
	return null;
}

/** The computer player of the rules the world plays by: the remastered AI, or the classic one. */
export function aiControllerFor(w: World, player: number): Controller {
	return w.rules.remasteredAI ? remasteredController(player) : aiController(player);
}
