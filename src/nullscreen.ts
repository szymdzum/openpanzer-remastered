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

import type { Cell } from "./prototypes";
import { type AttackResult, Commands } from "./commands";
import type { Unit } from "./unit";
import type { Game } from "./game";
import type { Screen } from "./screen";

export function nullScreen(g: Game): Screen {
	const won = (side: number, how: "capture" | "elimination") => { g.host.ended({ kind: "victory", side, how }); };
	//An attack's victories, as the old UI tells them: the defender's retreat that took its side's last
	//objective, then a side whose enemy has no unit left
	const attackWon = (a: AttackResult | null) => {
		if (a === null) return;
		if (a.retreatMove !== null && a.retreatMove.isVictorySide >= 0) won(a.retreatMove.isVictorySide, "capture");
		for (const side of a.victorySides) won(side, "elimination");
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

		//The move's capture victory first, then its surprise attack's
		move(unit: Unit, to: Cell, cells: Cell[], shown: () => void) {
			const r = Commands.execute(g.scenario, { type: "move", unit: unit.id, to: { row: to.row, col: to.col }, cells });
			if (r.ok) {
				if (r.result.victorySide >= 0) won(r.result.victorySide, "capture");
				if (r.result.surprise !== null) attackWon(r.result.surprise.attack);
			}
			shown();
		},
		attack(attacker: Unit, target: Unit, shown: () => void) {
			const r = Commands.execute(g.scenario, { type: "attack", unit: attacker.id, target: target.id });
			if (r.ok) attackWon(r.result);
			shown();
		},
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
