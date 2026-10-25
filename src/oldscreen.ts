/**
 * OldScreen - the old UI as the game's screen (src/screen.ts, #374): each call routed to the old UI's
 * functions as the game called them before, nothing of them rewritten
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 *
 * The UI's members are looked up on game.ui when the game calls (the tests and the harness put their own
 * in), the UIBuilder's on its module object. A program's move and attack are still played by the old UI,
 * whose animation's hooks finish them (src/ui.ts uiUnitMove, uiUnitAttack): shown is called where the UI
 * ends the wait on them, at the animation's end, or here when it animates nothing.
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

//UI is a constructor function, not a class: this gives `new` on it a type
export interface UIConstructor { new (game: Game): UI; }

//shown, called once: by the UI at the animation's end, or here when there is none (the UI's own wait may
//end then too)
function once(shown: () => void): () => void {
	let called = false;
	return () => {
		if (called) return;
		called = true;
		shown();
	};
}

export function oldScreen(g: Game): Screen {
	//The move or the attack played by the old UI: true when it animates it, which ends with shown. When
	//it doesn't, the game goes on now
	const played = (shown: () => void, play: () => boolean, unit: Unit) => {
		const done = once(shown);
		g.ui.whenShown(done);
		if (play()) {
			g.ui.uiSetUnitOnViewPort(unit);
		} else {
			g.ui.whenShown(null);
			done();
		}
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
			if (shown) shown();
		},
		aiTurnEnded() { UIBuilder.showAIStatus(false); },
		//(a while after the "finished" status, which the next turn's info replaces)
		turnChanged() {
			setTimeout(function() {
				if (!g.gameEnded)
					g.ui.uiEndTurnInfo();
			}, 2500);
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
