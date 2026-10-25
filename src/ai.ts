/**
 * AI - a player's handler when the AI plays it: the old AI's place in the game and the harness, played
 * by the core's AI (src/core/ai.ts) in the game's session (#137)
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 *
 * The AI itself is the core's controller now: it plans its turn at the turn's start, in the session.
 * A handler only hands out the session's orders, as the old AI's actions (harness/replay.js wraps
 * getAction and hashes the state there), and the host's processAction plays them (src/host.ts). A
 * handler made while the game runs (the replay's `new AI(player, map)`) joins its player to the session.
 */

import type { GameMap, Player } from "./map";

//One action, param depends on type (actionType): [unit] for resupply, reinforce, mount and select,
//[unit, cell] for move, [unit, target] for attack, and for the tutorial's messages [text, cell it
//points at]. type is a plain number, so it can't narrow a union: the elements stay any for Game,
//which reads them as the type says
export interface AIAction { type: number; param: any[]; }

//Who plays the programs: the game's session (src/coresession.ts, set by game.ts). getAction: the
//current player's next order as an action, null when it has none; join: a handler made while the
//game runs joins its player
export interface AIDriver {
	getAction(): AIAction | null;
	join(player: Player): void;
}

export class AI {
	declare getAction: () => AIAction | null;
	declare buildActions: () => void; //(the session starts and plans the turn)

	declare static driver: AIDriver | null; //assigned below, set by game.ts

	constructor(player: Player, _map: GameMap) {
		const driver = AI.driver;
		this.getAction = function() { return driver.getAction(); };
		this.buildActions = function() {};
		driver.join(player);
	}
}

AI.driver = null as AIDriver | null;
