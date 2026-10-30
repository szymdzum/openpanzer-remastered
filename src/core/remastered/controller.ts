/**
 * The remastered AI as a controller (#409): for now it plays the classic AI's commands, and beside them, at each
 * of its turns, reads what its side knows (perception.ts) and maps it (analysis.ts) for the layers to come.
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

import { aiController } from "../ai";
import type { Controller } from "../controller";
import type { UnitId, World } from "../types";
import { unitById } from "../world";
import { type Analysis, type AnalysisCache, analyse } from "./analysis";
import { perceive, type Sighting, type SideView } from "./perception";

/** The remastered controller, with what it made of its last turn (null before it planned one). */
export interface RemasteredController extends Controller {
	readonly view: SideView | null;
	readonly analysis: Analysis | null;
}

/**
 * A controller that answers every call with what the classic AI answers. The perception and the analysis draw from
 * no random stream and change nothing in the world. What it remembers (the enemies last seen, the fields that don't
 * change) is the controller's, not state (docs/STATE.md D6): a loaded game starts with none.
 */
export function remasteredController(player: number): RemasteredController {
	const classic = aiController(player), cache: AnalysisCache = new Map(), destroyed = new Set<UnitId>();
	let memory: readonly Sighting[] = [], view: SideView | null = null, analysis: Analysis | null = null;
	let target: UnitId | null = null;
	//An enemy its last attack took off the map was seen destroyed
	const watch = (w: World) => {
		if (target !== null && unitById(w, target) === null) destroyed.add(target);
		target = null;
	};
	return {
		player,
		get view() {
			return view;
		},
		get analysis() {
			return analysis;
		},
		join: (w) => classic.join(w),
		startTurn: (w) => classic.startTurn(w),
		plan(w) {
			const planned = classic.plan(w);
			watch(planned);
			view = perceive(planned, planned.state.players[player].side, memory.filter((s) => !destroyed.has(s.id)));
			memory = view.enemies;
			destroyed.clear();
			analysis = analyse(planned, view, cache);
			return planned;
		},
		next(w) {
			watch(w);
			const order = classic.next(w);
			if (order !== null && "command" in order && order.command.type === "attack") target = order.command.target;
			return order;
		},
	};
}

/** The computer player of the rules the world plays by: the remastered AI, or the classic one. */
export function aiControllerFor(w: World, player: number): Controller {
	return w.rules.remasteredAI ? remasteredController(player) : aiController(player);
}
