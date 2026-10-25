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
 * the screen calls once the player has seen it: a program's move or attack, a message pointing at a hex.
 * The timing is still the old game's: the old UI calls shown where it ended the wait before (the move's
 * or the attack's animation end, the tooltip's OK), and the turn loop still reads game.waitUIAnimation
 * and game.uiMessageClicked, which the harness sets too. #375 makes the turn loop wait on shown instead.
 */

import type { Cell } from "./prototypes";
import type { Unit } from "./unit";
import type { ScenarioOutcome } from "./scenario";
import type { ViewEvent } from "./core/controller";
import type { Position } from "./state";

export interface Screen {
	//---- The game's course (the host)

	//The scenario started or loaded is ready: the screen set up for it, its briefing shown (the first one
	//builds the screen and opens the main menu). The turn loop waits until the briefing is clicked away
	//(game.uiMessageClicked)
	showScenario(): void;
	//The scenario's files didn't load: the game can't go on
	loadFailed(file: string): void;
	//A campaign's scenario starts with the prototype the brilliant victory before awarded (its eqid)
	showPrototype(eqid: number): void;
	//A message the player clicks away; then: what its OK does instead of closing it. Without then, the OK
	//closes it and the turn loop goes on (game.uiMessageClicked: a campaign's next scenario waits for it)
	message(title: string, text: string, then?: () => void): void;
	//The campaign's end: the dossier with its outcome; then: what its close does
	campaignEnd(outcome: ScenarioOutcome, text: string, then: () => void): void;
	//The main menu, once a game has ended
	mainMenu(): void;
	//The platform's score board and achievements (OSGlue)
	reportScore(score: number): void;
	reportAchievement(campaignFile: string): void;

	//---- A program's turn (the AI, the tutorial)

	//A program's move, played and shown: until #375 the screen plays the move command with its animation
	//(the old UI's hooks finish it when the animation ends, and tell the host a victory it won), and calls
	//shown once the move and what it set off (a surprise attack, its retreat) have been shown. cells: the
	//move hexes shown, where the path may go
	move(unit: Unit, to: Cell, cells: Cell[], shown: () => void): void;
	//A program's attack, played and shown the same way
	attack(attacker: Unit, target: Unit, shown: () => void): void;
	//What a controller asks of the screen (src/core/controller.ts): a unit selected, a message pointing at a
	//hex (shown: its OK), a look at a hex, the main menu (only once the screen is built), stuck (nothing to
	//show). shown is called once the player has seen it; at once for all but the message
	view(event: ViewEvent, shown?: () => void): void;
	//The program's turn ended (the AI's status shown finished)
	aiTurnEnded(): void;
	//The next player's turn after a program's: whose turn it is (a person's combat log, the AI's turn in
	//progress), unless the game has ended by then
	turnChanged(): void;

	//---- The events of the end of a turn (src/coresession.ts)

	//Units came onto the map without a move (the AI's purchases and deployment at its turn start, the
	//reinforcements): the screen draws them
	unitsPlaced(): void;
	//A reinforcement arrived on a hex the side shown sees; own: it is the side shown's
	reinforced(at: Position, own: boolean): void;
}
