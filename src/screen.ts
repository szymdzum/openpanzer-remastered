/**
 * Screen - what the game asks of whatever shows it (#374): the one interface between the game (its host,
 * src/host.ts, and the session's glue, src/coresession.ts) and a screen. Types only
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 *
 * The game decides, the screen shows. The UI implements it (src/view/screen.tsx, #380; the old UI did until
 * #351), and a program that shows nothing too (src/nullscreen.ts: the headless tests, later the CLI and the
 * arena). What the game waits on takes a callback, shown, which the screen calls once the player has seen
 * it: a program's move or attack, played whole before it is shown (#375), a unit it picked, a message
 * pointing at a hex. A program's next action waits for it: the UI calls it at the end of the step's last
 * animation, the null screen at once. The messages the
 * player clicks away set game.uiMessageClicked and tell the host to go on (goOn).
 */

import type { ScenarioOutcome } from "./scenario";
import type { ViewEvent } from "./core/controller";
import type { Position } from "./state";
import type { Command, CommandType, Executed } from "./commands";
import type { GameEvent } from "./core/events";

//The commands a screen shows a program's step of: a move (its cells: the move hexes, where the path may go) and an attack
export type ShownCommand = Extract<Command, { type: "move" | "attack" }>;

export interface Screen {
	//---- The game's course (the host)

	//The scenario started or loaded is ready: the screen set up for it, its briefing shown (the first one
	//builds the screen and opens the main menu). A program's turn waits until the briefing is clicked away
	//(game.uiMessageClicked, then the host's goOn)
	showScenario(): void;
	//The scenario's files didn't load: the game can't go on
	loadFailed(file: string): void;
	//A campaign's scenario starts with the prototype the brilliant victory before awarded (its eqid)
	showPrototype(eqid: number): void;
	//A message the player clicks away; then: what its OK does instead of closing it. Without then, the OK
	//closes it and the game goes on (game.uiMessageClicked and the host's goOn: a campaign's next scenario
	//waits for it)
	message(title: string, text: string, then?: () => void): void;
	//The campaign's end: the dossier with its outcome; then: what its close does
	campaignEnd(outcome: ScenarioOutcome, text: string, then: () => void): void;
	//The main menu, once a game has ended
	mainMenu(): void;
	//The platform's score board and achievements (none on the web)
	reportScore(score: number): void;
	reportAchievement(campaignFile: string): void;

	//---- A program's turn (the AI, the tutorial)

	//A program's move or attack, played whole by the host (its surprise attack, the retreat, the capture): the
	//command and what it did (done: its result, with its events, or its refusal), shown, then shown called. The
	//host tells the victories it won then, once the step that won them has been shown (review A12: the host plays
	//the step, the screen only shows it)
	step(cmd: ShownCommand, done: Executed<CommandType>, shown: () => void): void;
	//What a controller asks of the screen (src/core/controller.ts): a unit selected, a message pointing at a
	//hex (shown: its OK), a look at a hex, the main menu (only once the screen is built), stuck (nothing to
	//show). shown is called once the player has seen it: a program's next action waits for its unit picked
	//and its look at a hex (the old UI showed them a moment, #8) and for its message
	view(event: ViewEvent, shown?: () => void): void;
	//A program's command other than a move or an attack, played (done: its result or its refusal): what the
	//screen shows beside the state after it (the old UI's selection, src/selection.ts: the pinned game turns'
	//stand-in of the old screen, test/gameturn.test.ts). A screen that reads the game's world has none
	played?(cmd: Command, done: Executed<CommandType>): void;
	//A step the screen is still showing, the program's or the person's: a move or an attack it animates (the
	//UI's beats, #459). The host's turn loop holds on it, the harness and the command-line player wait on it (#378); a
	//screen that shows each step at once has none
	showingStep?(): boolean;
	//The program's turn ended (the AI's status shown finished)
	aiTurnEnded(): void;
	//The next player's turn after a program's: whose turn it is (a person's combat log, the AI's turn in
	//progress), unless the game has ended by then. next: the game goes on with that turn (a program's
	//plays), once the screen is ready for it; a screen that shows nothing leaves it to its caller
	turnChanged(next: () => void): void;

	//---- The events of the end of a turn (src/coresession.ts)

	//Units came onto the map without a move (the AI's purchases and deployment at its turn start, the
	//reinforcements): the screen draws them
	unitsPlaced(): void;
	//A reinforcement arrived on a hex the side shown sees; own: it is the side shown's
	reinforced(at: Position, own: boolean): void;
	//What a turn's start did that no command's result carries: a player's turn started (the automatic resupply of
	//its idle units), the reinforcements arrived. A screen that keeps a turn report reads them (the new UI's
	//CombatLog, #348); the others have none
	turnEvents?(events: GameEvent[]): void;
}
