/**
 * Controller: who plays a player (the AI, the scripted tutorial, later a remote player or an LLM). Types only.
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 *
 * A controller answers in the same commands a human player sends, so the session checks and plays them all
 * the same way. What it keeps between its calls (the AI's plan of the turn, the tutorial's script) is its
 * memory, not state (docs/STATE.md D6): the state holds what it changed, its random stream's position included.
 */

import type { Command } from "./command";
import type { GameEvent } from "./events";
import type { Position, UnitId, World } from "./types";

/** What a controller asks of the screen, which changes nothing in the state; a program playing the game ignores it. */
export type ViewEvent =
	| { type: "select"; unit: UnitId | null }
	//The text is HTML; {prestige} stands for the prestige icon, which is the view's
	| { type: "message"; text: string; at: Position }
	| { type: "viewport"; at: Position }
	| { type: "mainMenu" }
	//The game stops here for good, as the original's tutorial does (#80): no more actions, no end of turn.
	//The attack it got stuck on, its unit and target (null: none)
	| { type: "stuck"; reason: string; unit?: UnitId | null; target?: UnitId | null };

export type Order = { command: Command } | { view: ViewEvent };

/** What a controller did: the world after, its commands, what they told. `handOver`: it gave its player away. */
export interface Played {
	world: World;
	commands: Command[];
	events: GameEvent[];
	view: ViewEvent[];
	handOver?: boolean;
}

/**
 * A controller of one player. The session calls `join` when the players are set up, then at each of the
 * player's turns `startTurn` (the AI's purchases and deployment, the tutorial's script), `plan` (still before
 * the reinforcements arrive, #94; a game loaded on its turn plans again, #71), then `next` until it answers
 * null, which ends the turn.
 *
 * A hand-over at `startTurn` gives the player a new controller at once (none for a person), which starts and
 * plans that turn (#81); at `join` the session keeps the controller all the same, as the original's
 * Game.setupPlayers sets the handler after the scripted one's constructor has handed it over.
 */
export interface Controller {
	readonly player: number;
	join(w: World): Played;
	startTurn(w: World): Played;
	plan(w: World): World;
	next(w: World): Order | null;
}
