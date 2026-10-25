/**
 * Screen - what the game asks of whatever shows it (#374): the one interface between the game (its host,
 * src/host.ts, and the session's glue, src/coresession.ts) and a screen. Types only
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 *
 * The game decides, the screen shows. The old UI implements it (src/oldscreen.ts), the new UI will be a
 * second implementation (src/view/, #380), and a program that shows nothing a third (src/nullscreen.ts:
 * the headless tests, later the CLI and the arena). What the game waits on takes a callback, shown, which
 * the screen calls once the player has seen it: a program's move or attack, played whole before it is
 * shown (#375), a unit it picked, a message pointing at a hex. A program's next action waits for it: the
 * old UI calls it at the end of the step's last animation, the null screen at once. The messages the
 * player clicks away set game.uiMessageClicked and tell the host to go on (goOn).
 */

import type { Cell } from "./prototypes";
import type { Unit } from "./unit";
import type { ScenarioOutcome } from "./scenario";
import type { ViewEvent } from "./core/controller";
import type { Position } from "./state";
import type { Command, CommandType, Executed } from "./commands";

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
	//The platform's score board and achievements (OSGlue)
	reportScore(score: number): void;
	reportAchievement(campaignFile: string): void;

	//---- A program's turn (the AI, the tutorial)

	//A program's move, played and shown: the screen plays the move command (whole: its surprise attack, the
	//retreat, the capture), shows it, tells the host a victory it won when it has shown the step that won it,
	//and calls shown once it has shown it all. cells: the move hexes shown, where the path may go
	move(unit: Unit, to: Cell, cells: Cell[], shown: () => void): void;
	//A program's attack, played and shown the same way
	attack(attacker: Unit, target: Unit, shown: () => void): void;
	//What a controller asks of the screen (src/core/controller.ts): a unit selected, a message pointing at a
	//hex (shown: its OK), a look at a hex, the main menu (only once the screen is built), stuck (nothing to
	//show). shown is called once the player has seen it: a program's next action waits for its unit picked
	//and its look at a hex (the old UI shows them a moment, #8) and for its message
	view(event: ViewEvent, shown?: () => void): void;
	//A program's command other than a move or an attack, played (done: its result or its refusal): what the
	//screen shows beside the state after it (the old UI's selection, src/selection.ts). A screen that reads
	//the game's world has none
	played?(cmd: Command, done: Executed<CommandType>): void;
	//A step the screen is still showing, the program's or the person's: a move or an attack it animates (the
	//old UI). The host's turn loop holds on it, the harness and the command-line player wait on it (#378); a
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
}
