/**
 * Controller - who plays a player (#121): the AI (ai.ts), the scripted tutorial (tutorial.ts), later
 * a remote player or an LLM. Types only
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 *
 * A controller answers in the core's commands, the ones a human player sends (src/commands.ts), so
 * the session checks and plays them all the same way. What it keeps between its calls (the AI's plan
 * of the turn, the tutorial's script) is its memory, not state (docs/STATE.md D6): the state holds
 * what it changed, its random stream's position included.
 */

import type { Command } from "./command";
import type { GameEvent } from "./events";
import type { Position, UnitId, World } from "./types";

//What a controller asks of the screen, which changes nothing in the state: the old UI's calls
//(select a unit, show a message pointing at a hex, look at a hex, open the main menu). A program
//playing the game ignores them
export type ViewEvent =
	| { type: "select"; unit: UnitId | null }
	//The text is HTML; {prestige} stands for the prestige icon, which is the view's
	| { type: "message"; text: string; at: Position }
	| { type: "viewport"; at: Position }
	| { type: "mainMenu" }
	//The old game stops here for good (the tutorial's #80): no more actions, no end of turn. The attack
	//it got stuck on, its unit and target (null: none)
	| { type: "stuck"; reason: string; unit?: UnitId | null; target?: UnitId | null };

//One thing to do: a command to step, or something to show
export type Order = { command: Command } | { view: ViewEvent };

//What a controller did to the world outside the orders: the world after (its commands stepped, its
//stream moved on), the commands it played, in order, and what they and it told. handOver: it gave its
//player away (the tutorial at its end), to whoever the player's type in the world now says
export interface Played {
	world: World;
	commands: Command[];
	events: GameEvent[];
	view: ViewEvent[];
	handOver?: boolean;
}

//The session calls, in the old game's order (Game and Map.endTurn): join when the players are set up
//(Game.setupPlayers), then at each of its player's turns startTurn (Map.endTurn's turn driver: the
//AI's purchases and deployment, the tutorial's script), plan (still before the reinforcements arrive,
//#94; a game loaded on its turn plans again, #71), then next until it answers null, which ends the turn.
//A hand-over at startTurn gives the player a new controller at once (none for a person), which starts and
//plans that turn (#81); at join the session keeps the controller all the same, as Game.setupPlayers set
//the handler after the scripted one's constructor had handed it over
export interface Controller {
	readonly player: number;
	join(w: World): Played;
	startTurn(w: World): Played;
	plan(w: World): World;
	next(w: World): Order | null;
}
