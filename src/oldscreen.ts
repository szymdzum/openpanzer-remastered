/**
 * OldScreen - the old UI as the game's screen (src/screen.ts, #374): each call routed to the old UI's
 * functions as the game called them before, nothing of them rewritten
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 *
 * The UI's members are looked up on game.ui when the game calls (the tests and the harness put their own
 * in), the UIBuilder's on its module object. A program's move and attack are played by the old UI, which
 * plays the step whole and then animates it (src/ui.ts uiUnitMove, uiUnitAttack): shown is called when
 * its last animation ends.
 */

import type { Cell } from "./prototypes";
import { UI } from "./ui";
import { UIBuilder } from "./uibuilder";
import { OSGlue } from "./osglue";
import { unitObject } from "./mirror";
import type { Unit } from "./unit";
import type { ScenarioOutcome } from "./scenario";
import type { ViewEvent } from "./core/controller";
import type { Position } from "./state";
import type { Game } from "./game";
import type { Screen } from "./screen";

//How long a program's unit picked or look at a hex stays before its next action, and its turn's end before
//the next player's: the turn loop's tick until #375 (#8: it was a second, an AI turn took a minute)
const PICKED_MS = 250;

//UI is a constructor function, not a class: this gives `new` on it a type
export interface UIConstructor { new (game: Game): UI; }

export function oldScreen(g: Game): Screen {
	//The move or the attack played by the old UI, which calls shown once it has shown all of it: at its last
	//animation's end, at once when it animates nothing. A move it doesn't animate (the side shown doesn't
	//see it) can still run into a surprise attack it animates: the AI waits for that too (#396). The unit
	//centered when the UI animates its move or attack
	const played = (shown: () => void, play: () => boolean, unit: Unit) => {
		g.ui.whenShown(shown);
		if (play())
			g.ui.uiSetUnitOnViewPort(unit);
	};
	return {
		showScenario() {
			if (g.ui) {
				g.ui.setNewScenario();
			} else { //First scenario after startup
				g.ui = new (UI as unknown as UIConstructor)(g);
				g.ui.mainMenuButton("options"); //Bring up the "Main Menu"
			}
		},
		loadFailed(file: string) { UIBuilder.messageDynamic("Error", "Error Loading scenario " + file); },
		showPrototype(eqid: number) { UIBuilder.showPrototypeAwardMessage(eqid); },
		message(title: string, text: string, then?: () => void) { UIBuilder.message(title, text, then); },
		campaignEnd(outcome: ScenarioOutcome, text: string, then: () => void) { UIBuilder.showCampaignEnd(outcome, text, then); },
		mainMenu() { g.ui.mainMenuButton("options"); },
		reportScore(score: number) { OSGlue.reportScore(score); },
		reportAchievement(campaignFile: string) { OSGlue.reportAchievement(campaignFile); },

		move(unit: Unit, to: Cell, cells: Cell[], shown: () => void) {
			played(shown, () => g.ui.uiUnitMove(unit, to.row, to.col, cells), unit);
		},
		attack(attacker: Unit, target: Unit, shown: () => void) {
			played(shown, () => g.ui.uiUnitAttack(attacker, target), attacker);
		},
		view(event: ViewEvent, shown?: () => void) {
			if (event.type === "message") {
				g.ui.showGameToolTip(event.text, event.at.row, event.at.col, shown || (() => {}));
				g.ui.uiSetCellOnViewPort(cellOf(event.at));
				return;
			}
			showView(g, event);
			if (shown) setTimeout(shown, PICKED_MS);
		},
		aiTurnEnded() { UIBuilder.showAIStatus(false); },
		//(the info a while after the "finished" status, which it replaces)
		turnChanged(next: () => void) {
			setTimeout(function() {
				if (!g.gameEnded)
					g.ui.uiEndTurnInfo();
			}, 2500);
			setTimeout(next, PICKED_MS);
		},

		unitsPlaced() { g.ui.handleReinforcementDeployment(); },
		reinforced(at: Position, own: boolean) { g.ui.showAlert(at.row, at.col, "Reinforced!", own); },
	};
}

//(the position as the old actions held it)
const cellOf = (at: Position) => at as Cell;

//A controller's view event other than a message: the unit selected and looked at (its object, gone from
//the map or not), a look at a hex, the slide menu once the UI is built
function showView(g: Game, event: Exclude<ViewEvent, { type: "message" }>) {
	switch (event.type) {
		case "select": {
			const u = event.unit === null ? null : unitObject(g.scenario.map, event.unit);
			g.ui.uiSetUnitOnViewPort(u);
			g.ui.uiUnitSelect(u);
			break;
		}
		case "viewport": {
			g.ui.uiSetCellOnViewPort(cellOf(event.at));
			break;
		}
		case "mainMenu": {
			if (g.ui) g.ui.mainMenuButton("mainmenu");
			break;
		}
		default: //(stuck: the old game showed nothing)
	}
}
