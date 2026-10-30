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
import { perceive, type Sighting, type SideView } from "./perception";
import { garrisonFire, garrisonMarch, garrisonSupply, heldUnits, liveOperations, occupation, type Operation, type Threat,
	threatenedObjectives, withGarrisons } from "./staff";

/** The remastered controller, with what it made of its last turn (null before it planned one) and its operations. */
export interface RemasteredController extends Controller {
	readonly view: SideView | null;
	readonly analysis: Analysis | null;
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
	orders: number;
}

//Orders in one turn past which the controller ends it: a guard against a plan that would never end, far above any
//real turn's (Zitadelle's biggest army gives about 300)
const MAX_ORDERS = 2000;

const newTurn = (): TurnMemory => ({ queue: [], fresh: false, stale: true, attacked: null, pending: null, supplied: new Set(), orders: 0 });

/**
 * The remastered AI. Its staff's operations hold some units over turns (a garrison on each objective in the enemy's
 * reach, a unit onto an objective its attack emptied); the classic plan (src/core/ai.ts) orders the rest, made
 * again on the world as it is after every attack, every order of the staff's and every order the core would
 * refuse: it gives none that `check` refuses. Its purchases and deployment are the classic AI's.
 *
 * The staff draws from no random stream. The classic plan draws from the AI's: the turn's first plan keeps its
 * draws in the world, as the classic AI's does; the plans made again during the turn can't hand a world back
 * (`next` gives orders), so they draw from where the first one left the stream, the same numbers each time.
 * What it remembers (the enemies last seen, the fields that don't change, the operations) is the controller's,
 * not state (docs/STATE.md D6): a loaded game starts with none and plans the turn again.
 */
export function remasteredController(player: number): RemasteredController {
	const classic = aiController(player), cache: AnalysisCache = new Map(), destroyed = new Set<UnitId>();
	let memory: readonly Sighting[] = [], view: SideView | null = null, analysis: Analysis | null = null;
	let operations: Operation[] = [], threats: Threat[] = [], held = new Set<UnitId>(), turn = newTurn();
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
	//The operations that go on and the garrisons the threatened objectives still lack
	const review = (w: World) => setOperations(withGarrisons(w, player, liveOperations(w, sideOfPlayer(w), operations, threats), threats));
	const replan = (w: World) => {
		turn.queue = planTurn(w, player, w.rules.ai.config, w.state.players[player].prestige, held).queue;
		turn.fresh = true;
		turn.stale = false;
	};

	//The classic plan's next command for a unit no operation holds, one `check` allows
	function classicOrder(w: World): Command | null {
		if (turn.stale) replan(w);
		for (;;) {
			const cmd = turn.queue.shift();
			if (cmd === undefined) return null;
			if ("unit" in cmd && held.has(cmd.unit)) continue;
			if (check(w, cmd) === null) return cmd;
			if (!turn.fresh) replan(w);
		}
	}

	//The staff's orders before the classic plan's: the move after a mount, onto an objective just emptied, a march
	function staffFirst(w: World): Command | null {
		const pending = turn.pending;
		turn.pending = null;
		if (pending !== null && check(w, pending) === null) return pending;
		const occupy = occupyOrder(w);
		if (occupy !== null) return occupy;
		review(w);
		const march = garrisonMarch(w, operations);
		if (march === null) return null;
		turn.pending = march.length > 1 ? march[1] : null;
		return march[0];
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
			threats = threatenedObjectives(w, view, analysis.objectives.hold);
			turn = newTurn();
			review(w);
			const planned = planTurn(w, player, w.rules.ai.config, w.state.players[player].prestige, held);
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

/** What a side knows and makes of the map: its perception and analysis. */
export interface Knowledge {
	view: SideView;
	analysis: Analysis;
}

/** The last perception and analysis of the side by the remastered controller that plays one of its players, if any. */
export function knowledgeOf(controllers: readonly (Controller | null)[], side: number): Knowledge | null {
	for (const c of controllers) {
		const r = c !== null && "analysis" in c ? c as RemasteredController : null;
		if (r !== null && r.view !== null && r.analysis !== null && r.view.side === side) return { view: r.view, analysis: r.analysis };
	}
	return null;
}

/** The computer player of the rules the world plays by: the remastered AI, or the classic one. */
export function aiControllerFor(w: World, player: number): Controller {
	return w.rules.remasteredAI ? remasteredController(player) : aiController(player);
}
