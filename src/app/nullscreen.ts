/**
 * NullScreen - a screen that shows nothing: the game played by a program, the headless tests.
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

import type { Game } from "./game";
import type { Screen } from "./screen";

//A message is clicked away at once and every step is shown at once, so nothing waits. Nothing is selected
//and the next player's turn after a program's is left to whoever plays the game (processTurn).
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

		step(_cmd, _done, shown: () => void) { shown(); },
		view(_event, shown?: () => void) {
			if (shown) shown();
		},
		aiTurnEnded: nothing,
		turnChanged: nothing,

		unitsPlaced: nothing,
		reinforced: nothing,
	};
}
