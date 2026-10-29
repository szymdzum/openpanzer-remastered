/**
 * NullScreen - a screen that shows nothing (#374): the game played by a program, the headless tests,
 * later the CLI and the arena. Every request is shown at once
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 *
 * A message is clicked away at once (game.uiMessageClicked set, or its then called), and a program's move
 * or attack is played whole with nothing animated: a victory it won is told to the host at once, as the old
 * UI tells it at the animation's end. What the old UI asks of the command beside the state (the attacker
 * selected again after its attack) isn't asked: nothing is selected on a screen that shows nothing. The next
 * player's turn after a program's is left to whoever plays the game (processTurn).
 */

import type { Game } from "./game";
import type { Screen } from "./screen";

export function nullScreen(g: Game): Screen {
	const nothing = () => {};
	return {
		showScenario() { g.uiMessageClicked = true; },
		loadFailed: nothing,
		showPrototype: nothing,
		message(_title: string, _text: string, then?: () => void) {
			if (then) then();
			else g.uiMessageClicked = true;
		},
		campaignEnd(_outcome, _text, then: () => void) { then(); },
		mainMenu: nothing,
		reportScore: nothing,
		reportAchievement: nothing,

		//(shown at once: the host tells its victories then)
		step(_cmd, _done, shown: () => void) { shown(); },
		view(_event, shown?: () => void) {
			if (shown) shown();
		},
		aiTurnEnded: nothing,
		//(the next turn is its caller's: a program playing headless goes on with processTurn)
		turnChanged: nothing,

		unitsPlaced: nothing,
		reinforced: nothing,
	};
}
