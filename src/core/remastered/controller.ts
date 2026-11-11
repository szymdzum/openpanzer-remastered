/**
 * The remastered AI as a controller: at each of its turns it reads what its side knows (perception.ts) and maps it
 * (analysis.ts); its staff's operations (staff.ts) order the units they hold, the classic AI's plan the rest.
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

import { aiController, planTurn } from "../ai";
import type { Command } from "../command";
import type { Controller } from "../controller";
import { check } from "../step";
import type { Position, UnitId, World } from "../types";
import { unitById } from "../world";
import { type Analysis, type AnalysisCache, analyse } from "./analysis";
import { assaultOrder, losesMore, pullTo } from "./assault";
import { assaults, attacks } from "./clock";
import { command, type Commander } from "./commander";
import { type Directive, type Dropped, validateDirectives } from "./directives";
import { perceive, type Sighting, type SideView } from "./perception";
import { resupplyOrder, rideOutOfReach, unmountOrder } from "./rear";
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

//What the controller keeps through one of its turns: the classic plan's commands left, whether that plan was made on
//the world as it is (fresh) or has to be made again (stale), the hex its last attack hit, a move after a mount
interface TurnMemory {
	queue: Command[];
	fresh: boolean;
	stale: boolean;
	attacked: Position | null;
	pending: Command | null;
	supplied: Set<UnitId>;
	scouted: Set<UnitId>;	//the recon units the assault sent forward
	mounted: Set<UnitId>;	//the units on their transports at the turn's start
	waited: Set<UnitId>;	//the reserve's units the staff looked at this turn for a move to where they wait
	orders: number;
}

//Orders in one turn past which the controller ends it: a guard against a plan that would never end, far above any
//real turn's (Zitadelle's biggest army gives about 300)
const MAX_ORDERS = 2000;

const newTurn = (): TurnMemory => ({ queue: [], fresh: false, stale: true, attacked: null, pending: null, supplied: new Set(),
	scouted: new Set(), mounted: new Set(), waited: new Set(), orders: 0 });

const NO_UNITS: ReadonlySet<UnitId> = new Set();

const one = (cmd: Command | null): Command[] | null => cmd === null ? null : [cmd];

/**
 * The remastered AI. Its commander (`commander`: the rules of commander.ts when not given) answers in directives,
 * checked before the staff reads them; the staff's operations are made from them alone and hold some units over turns
 * (a garrison on each objective to hold, a unit onto an objective its attack emptied). It resupplies units before
 * contact and ends no ride in the enemy's reach but near an objective, unless it defends and no enemy plays after it
 * in the round. The classic plan (src/core/ai.ts) orders the rest, made again on the world as it is after every
 * attack, every order of the staff's and every order the core would refuse: it gives none that `check` refuses. Its
 * purchases and deployment are the classic AI's.
 *
 * The commander and the staff draw from no random stream. The classic plan draws from the AI's: the turn's first plan
 * keeps its draws in the world, as the classic AI's does; the plans made again during the turn can't hand a world
 * back (`next` gives orders), so they draw from where the first one left the stream, the same numbers each time.
 * What it remembers (the enemies last seen, the fields that don't change, the directives, the operations) is the
 * controller's, not state (docs/STATE.md D6): a loaded game starts with none and plans the turn again.
 */
export function remasteredController(player: number, commander: Commander = command): RemasteredController {
	const classic = aiController(player), cache: AnalysisCache = new Map(), destroyed = new Set<UnitId>();
	let memory: readonly Sighting[] = [], view: SideView | null = null, analysis: Analysis | null = null;
	let operations: Operation[] = [], directives: Directive[] = [], dropped: Dropped[] = [], held = new Set<UnitId>(), turn = newTurn();
	let target: UnitId | null = null;
	//An enemy its last attack took off the map was seen destroyed
	const watch = (w: World) => {
		if (target !== null && unitById(w, target) === null) destroyed.add(target);
		target = null;
	};
	const setOperations = (ops: Operation[]) => {
		const changed = ops.length !== operations.length || ops.some((op, i) => op !== operations[i]);
		operations = ops;
		held = heldUnits(ops);
		if (changed) turn.stale = true;
	};
	const sideOfPlayer = (w: World) => w.state.players[player].side;
	function review(w: World, v: SideView, a: Analysis) {
		const orders = direct(w, v, a, { directives, dropped, operations }, { player, commander, cache });
		directives = orders.directives;
		dropped = orders.dropped;
		setOperations(orders.operations);
	}
	const assault = () => operations.find((op) => op.kind === "assault");
	const classicPlan = (w: World) => {
		const op = assault(), side = sideOfPlayer(w);
		return planTurn(w, player, w.rules.ai.config, w.state.players[player].prestige, { held,
			attacks: assaults(w, side), ridesTo: analysis === null ? undefined : rideOutOfReach(w, analysis, player),
			pullTo: pullTo(w, cache, op, view === null || attacks(w, side) ? NO_UNITS : standFast(w, view, cache, player, held, directives)) });
	};
	const replan = (w: World) => {
		turn.queue = classicPlan(w).queue;
		turn.fresh = true;
		turn.stale = false;
	};

	//The classic plan's next command for a unit no operation holds, one `check` allows
	function classicOrder(w: World): Command | null {
		if (turn.stale) replan(w);
		for (;;) {
			const cmd = turn.queue.shift();
			if (cmd === undefined) return null;
			if (("unit" in cmd && held.has(cmd.unit)) || losesMore(w, cmd)) continue;
			if (check(w, cmd) === null) return cmd;
			if (!turn.fresh) replan(w);
		}
	}

	//The orders of the counterattacks, then of the assault, in the directives' order
	function strikeOrder(w: World, a: Analysis): Command[] | null {
		for (const op of operations) {
			const order = op.kind === "assault" || op.kind === "counterattack" ? assaultOrder(w, a, cache, op, player, held, turn.scouted) : null;
			if (order !== null) return order.commands;
		}
		return null;
	}

	//The staff's orders before the classic plan's, in this order: the move or attack after a mount or a move, onto an
	//objective just emptied, off a transport in the enemy's reach, a garrison's march, the reserve's to where it waits,
	//a resupply before contact, the counterattacks' and the assault's
	const sources: ((w: World, a: Analysis, v: SideView) => Command[] | null)[] = [
		(w) => one(occupyOrder(w)),
		(w, a, v) => {
			review(w, v, a);
			return one(unmountOrder(w, a, player, held, turn.mounted));
		},
		(w, a) => garrisonMarch(w, operations, rideOutOfReach(w, a, player)),
		(w, a) => reserveMarch(w, a, operations, rideOutOfReach(w, a, player), turn.waited),
		(w, a) => one(resupplyOrder(w, a, player, held)),
		strikeOrder,
	];

	function staffFirst(w: World): Command | null {
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

	//What the garrisons do once the classic plan has nothing left: fire from their objectives, else resupply there
	const staffLast = (w: World) => garrisonFire(w, operations) || garrisonSupply(w, operations, turn.supplied);

	function given(w: World, cmd: Command, staff: boolean): Command {
		turn.fresh = false;
		turn.orders++;
		if (staff) turn.stale = true;
		if (cmd.type === "attack") {
			target = cmd.target;
			const t = unitById(w, cmd.target);
			turn.attacked = t === null ? null : { row: t.row, col: t.col };
			//What the attack did can't be foreseen: the classic plan is made again after it
			turn.stale = true;
		}
		return cmd;
	}

	function nextCommand(w: World): Command | null {
		if (turn.orders >= MAX_ORDERS) return null;
		const first = staffFirst(w);
		if (first !== null) return given(w, first, true);
		const order = classicOrder(w);
		if (order !== null) return given(w, order, false);
		const last = staffLast(w);
		return last === null ? null : given(w, last, true);
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
		join: (w) => classic.join(w),
		startTurn: (w) => classic.startTurn(w),
		plan(w) {
			watch(w);
			view = perceive(w, sideOfPlayer(w), memory.filter((s) => !destroyed.has(s.id)));
			memory = view.enemies;
			destroyed.clear();
			analysis = analyse(w, view, cache);
				turn = newTurn();
			for (const u of w.state.units) if (u.owner === player && u.isMounted) turn.mounted.add(u.id);
			review(w, view, analysis);
			const planned = classicPlan(w);
			turn.queue = planned.queue;
			turn.fresh = true;
			turn.stale = false;
			return planned.world;
		},
		next(w) {
			watch(w);
			const cmd = nextCommand(w);
			return cmd === null ? null : { command: cmd };
		},
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
	by: { player: number; commander: Commander; cache: AnalysisCache }): Orders {
	const held = heldUnits(last.operations);
	const ask = (holding: ReadonlySet<UnitId>) => validateDirectives(
		by.commander(w, view, a, { player: by.player, directives: last.directives, held: holding, cache: by.cache }), w, a.side);
	let orders = ask(held), ops = holdingOperations(w, view, by.player, last.operations, orders.directives);
	const holding = heldUnits(ops);
	if (holding.size !== held.size || [...holding].some((id) => !held.has(id))) {
		orders = ask(holding);
		ops = holdingOperations(w, view, by.player, ops, orders.directives);
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
