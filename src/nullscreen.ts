/**
 * NullScreen - a screen that shows nothing (#374): the game played by a program, the headless tests,
 * later the CLI and the arena. Every request is shown at once
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 *
 * A message is clicked away at once (the turn loop's game.uiMessageClicked set, or its then called), and
 * a program's move or attack is played with nothing animated: its command finishes at once and a victory
 * it won is told to the host then, as the old UI tells it at the animation's end (#375 moves both into
 * the step). What the old UI's hooks did to the selection beside the state (the attacker selected again
 * after its attack) isn't done: nothing is selected on a screen that shows nothing.
 */

import type { Cell } from "./prototypes";
import { Commands, type FinishAttackHooks } from "./commands";
import type { Unit } from "./unit";
import type { Game } from "./game";
import type { Screen } from "./screen";

export function nullScreen(g: Game): Screen {
	const won = (how: "capture" | "elimination") => (side: number) => { g.host.ended({ kind: "victory", side, how }); };
	//An attack's end: the defender's retreat ends at once, its capture's victory told, then the victory of
	//a side whose enemy has no unit left
	const attackEnd: FinishAttackHooks = {
		onRetreat(unit, _cell, mr) { Commands.finishRetreat(unit, mr, { onVictory: won("capture") }); },
		onVictory: won("elimination"),
	};
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

		move(unit: Unit, to: Cell, cells: Cell[], shown: () => void) {
			Commands.execute(g.scenario, { type: "move", unit: unit.id, to: { row: to.row, col: to.col }, cells },
				{ finish: { onVictory: won("capture") }, surprise: attackEnd });
			shown();
		},
		attack(attacker: Unit, target: Unit, shown: () => void) {
			Commands.execute(g.scenario, { type: "attack", unit: attacker.id, target: target.id }, { finish: attackEnd });
			shown();
		},
		view(_event, shown?: () => void) {
			if (shown) shown();
		},
		aiTurnEnded: nothing,
		turnChanged: nothing,

		unitsPlaced: nothing,
		reinforced: nothing,
	};
}
