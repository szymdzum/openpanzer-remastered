/**
 * UI - handles ui actions
 *
 * http://www.linuxconsulting.ro
 * http://openpanzer.net
 *
 * Copyright (c) 2012 Nicu Pavel
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 *
 * Reconstructed from the Panzer Marshal 3.2.14 bundle, names and comments
 * carried over from the openpanzer 2.9 source where the code matches.
 */

import {
	type Cell, CURRENCY_MULTIPLIER, DEFAULT_SCENARIO, endGameType, groundConditionNames, groundFontEncoding, mouseInfo,
	movementResults, movMethod, movMethodNames, NATIVE_PLATFORM, outcomeNames,
	playerType, roadType, sideNames, Supply, terrainNames, terrainType, uiSettings,
	unitClass, unitClassNames, unitTypeNames, weatherConditionNames, weatherFontEncoding
} from "./prototypes";
import { CombatLog } from "./combatlog";
import { Equipment } from "./equipment";
import {
	$, addStyleSheet, addTag, bounceText, clearTag, defined, delTag, hasBrokenClearRect, hasBrokenScroll,
	hasTouch, isVisible, makeHidden, makeVisible, setHandler, setSelectOption, toggleButton, toggleRightClick,
	touchScroll
} from "./dom";
import { hexstyle, tooltipColor, tooltipStyle } from "./style";
import { moveSoundByMoveMethod, soundData } from "./sound";
import { attackAnimationByClass } from "./animation";
import { GameRules } from "./gamerules";
import type { Unit } from "./unit";
import type { Player, ReinforceResults } from "./map";
import { deploysOn, type MoveAnimationCBData, remasterDeployHexes, Render } from "./render";
import { UIBuilder } from "./uibuilder";
import { UICombatLog } from "./uicombatlog";
import type { Game } from "./game";
import { Leaders } from "./leaders";
import { attackerSide, turnLimitOutcome } from "./core/turn";
import { type AttackCommandHooks, type AttackResult, type AttackSide, type CommandType, Commands, type Executed, type FinishAttackHooks,
	type FinishMoveHooks, type MoveResult, type ResultOf } from "./commands";

//The UI's public methods, assigned in the constructor. UI is a constructor function, as in the
//bundle: game.ts types `new UI(game)` through its UIConstructor
export interface UI {
	handleReinforcementDeployment(): void;
	uiUnitSelect(unit: Unit | null): boolean;
	uiUnitMove(unit: Unit, row: number, col: number, cells?: Cell[]): boolean;
	uiUnitAttack(attackingUnit: Unit, enemyUnit: Unit): boolean;
	showAlert(row: number, col: number, text: string | number, positive?: boolean): void;
	showGameToolTip(text: string, row: number, col: number): void;
	showSmallToolTip(text: string, row: number, col: number, color: number, id?: string, style?: number): void;
	addSmallToolTips(unitsOnly?: boolean): void;
	removeUnitToolTip(unitId: number): void;
	removeAllSmallToolTips(onlyUnits?: boolean): void;
	setNewScenario(): void;
	startMenuButton(id: string): void;
	mainMenuButton(id: string): void;
	toggleUnitsAndEquipmentWindow(withEquipment: boolean): void;
	equipmentWindowButtons(id: string): void;
	updateEquipmentWindow(eqclass?: number): void;
	uiEndTurnInfo(): void;
	uiTurnLimitMessage(): void;
	uiSetUnitOnViewPort(unit: Unit | null): boolean;
	uiSetCellOnViewPort(cell: Cell | null): boolean;
	scaleMap(level: number): void; //the map scale slider passes its value string, coerced in the arithmetic
}

//The callback data of the attack animation, Render calls cbfunc with it when done (the move
//animation's is render.ts's MoveAnimationCBData)
export interface UIAttackAnimationData {
	result: AttackResult;
	cbfunc: (animationCBData: UIAttackAnimationData) => void;
}

//The unit context buttons shown, by action
export interface UIContextButtons {
	mount?: boolean;
	embark?: boolean;
	resupply?: boolean;
	reinforce?: boolean;
	overstrength?: boolean;
	undo?: boolean;
}

//The equipment window keeps the user selections as expando properties on its DOM elements
//(set by UIBuilder.setDefaultUserSelections): eqid, unit id or unit list index, -1 for none
export interface EqUserSelElement extends HTMLElement {
	userunit: number;     //unit id on map
	deployunit: number;   //index in the core unit list of the undeployed units
	equnit: number;       //eqid
	eqtransport: number;  //eqid, -2 when the transport was deselected
	eqclass: number;      //unitClass
	sortorder: boolean;   //0 at start, the reverse flag of getCountryEquipmentByClass
	sortproperty: keyof EquipmentEntry;
	unitscroll: number;
	eqscroll: number;
}
export interface EqSelCountryElement extends HTMLElement { country: number; } //index in the side's countries
export interface SettingsMenuElement extends HTMLElement { messageHidden: boolean; }

//The unit boxes of the unit and equipment lists carry what their onclick needs
export interface UIUnitBoxElement extends HTMLDivElement {
	unitid: number;       //unit id, or core unit list index in deploy mode
	uniteqid: number;
	eqclass: number;
	country: number;
	equnitid: number;
	eqtransportid: number;
}

//updateUnitInfoWindow and uiAddUnitBox show a Unit, or an equipment entry from the equipment
//window, told apart by unitData: a Unit with the entry fields they read. On the entry
//updateUnitInfoWindow sets flag and strength. The entries are passed as one (as unknown as)
export type UIUnitOrEntry = Unit & { country?: number; name?: string; icon?: string; cost?: number };

//The Firefox prefixed transform the strategic zoom also sets
export interface UIPrefixedStyle extends CSSStyleDeclaration { MozTransform: string; }

//Mouse drag state (declared in uibuilder.js in the bundle, only the UI uses it)
export var curDown = false, curYPos = 0, curXPos = 0;

export function UI(this: UI, game: Game) {
	var map = game.scenario.map;
	var R = new Render(map);
	var countries = map.getCountriesBySide(game.spotSide); //array for current side countries
	var contextButtons: UIContextButtons = {}; //unit context buttons shown for the current unit, for the keyboard shortcuts

	//redraw screen and center unit on screen when images have finished loading
	uiMapCacheImages();

	var canvas = R.getCursorCanvas();

	uiSettings.hasTouch = hasTouch();
	if (uiSettings.hasTouch) {
		uiSettings.showGridTerrain = true;
		if (hasBrokenScroll()) {
			touchScroll("game");
			touchScroll("hscroll-unitlist");
			touchScroll("hscroll-eqUnitList");
			touchScroll("hscroll-eqTransportList");
		}
		UIBuilder.setLayoutConstrains(true);
	} else {
		addStyleSheet("scrollbars.css");
		canvas.addEventListener("mousemove", handleMouseMove, false);
		//Stop dragging the map
		window.addEventListener("mouseup", function() { curDown = false; }, false);
		window.addEventListener("keyup", handleKeyboard, false);
		window.onresize = function() { R.positionLayers(); };
	}

	canvas.addEventListener("mousedown", function(e: MouseEvent) {
		if (!game.gameStarted || game.gameEnded)
			return false;

		var minfo = getMouseInfo(canvas, e);
		var cell = R.screenToCell(minfo.x, minfo.y);
		var row = cell.row;
		var col = cell.col;
		var selected = false; //a unit was selected, the status bar already shows its location

		//Start dragging the map
		if (!uiSettings.hasTouch) {
			curDown = true;
			curXPos = minfo.x;
			curYPos = minfo.y;
		}

		//Throws instead when the row is outside the map
		var hex = map.map[row][col];
		if (typeof hex === "undefined")
			return true; //handled

		if (uiSettings.strategicZoom) {
			uiToggleMapZoom();
			uiSetCellOnViewPort(cell);
			return true;
		}

		//Hidden enemy units can't be clicked
		var clickedUnit = hex.getUnit(uiSettings.airMode);
		if (clickedUnit && !(hex.isSpotted(map.currentPlayer.side) || clickedUnit.tempSpotted
			|| clickedUnit.player.side == map.currentPlayer.side))
			clickedUnit = null;

		//Right click to show unit info or clear current selection
		if (minfo.rclick) {
			if (clickedUnit) {
				toggleUnitInfoWindow(true);
				updateUnitInfoWindow(clickedUnit);
			} else {
				handleUnitDeselect();
			}
			return true;
		}

		if (clickedUnit) {
			if (uiSettings.unitInfoVisibility)
				makeVisible("unit-info");
			updateUnitInfoWindow(clickedUnit); //Also update for clicks on enemy units

			if (map.currentUnit === null || uiSettings.deployMode) //No current unit select new one
				selected = handleUnitSelect(row, col);
			else
				//attack an allowed hex unit
				if (hex.isAttackSel && !map.currentUnit.hasFired)
					handleUnitAttack(map.currentUnit, row, col);
				else
					if (hex.isMoveSel) //Move unit over/under clickedUnit
						uiUnitMove(map.currentUnit, row, col, map.getCurrentMoveRange());
					else
						if (map.currentUnit === clickedUnit) { //Click on the selected unit deselects it
							handleUnitDeselect();
							if (uiSettings.unitInfoVisibility)
								makeHidden("unit-info");
						} else
							selected = handleUnitSelect(row, col);
		} else { //No unit on clicked hex
			if (uiSettings.deployMode && deploysOn(map, row, col, remasterDeployHexes()))
				handleUnitDeployment(row, col); //Allow deployment on deployment hexes if on same side
			else
				//move to an empty allowed hex, currentUnit is checked for null after it's used
				if (hex.isMoveSel && !map.currentUnit.hasMoved && map.currentUnit !== null)
					uiUnitMove(map.currentUnit, row, col, map.getCurrentMoveRange());
				else { //remove current selection
					handleUnitDeselect();
					if (uiSettings.unitInfoVisibility)
						makeHidden("unit-info");
				}
		}

		//No mouse move on touch, show the clicked location
		if (!selected && uiSettings.hasTouch)
			updateStatusBarLocation(row, col);

		//Set the airMode depending on current unit automatically
		uiSettings.airMode = GameRules.isAir(map.currentUnit);
		toggleButton($("air"), uiSettings.airMode);
		updateUnitContextWindow(map.currentUnit); //Update after an action not only on select/deselect
		return false;
	}, false);

	toggleRightClick(false);

	UIBuilder.buildStartMenu();
	UIBuilder.buildMainMenu();
	//Set here, not in UIBuilder, which uicombatlog imports
	$("statusbar").onclick = $("combatLogButton").onclick = function() { UICombatLog.toggleCombatLog(false, true); };
	UIBuilder.buildUnitInfoWindow();
	UIBuilder.buildEquipmentWindow();
	UIBuilder.buildEquipmentSortOptions();
	UIBuilder.setDefaultUserSelections();
	UIBuilder.setEquipmentFlags(game.scenario.eqp);

	uiTurnInfo();
	uiShowDeploymentWindow();
	updateEquipmentWindow(); //Update after making deploy/current unit list visible or it won't update
	uiMessage(game.scenario.name, game.scenario.getDescription());

function handleMouseMove(e: MouseEvent) {
	var minfo = getMouseInfo(canvas, e);
	var c = R.screenToCell(minfo.x, minfo.y);

	if (map.currentUnit != null && !uiSettings.strategicZoom) { R.drawCursor(c); }
	updateStatusBarLocation(c.row, c.col);
	$("game"); //unused
	//Drag the map
	if (curDown === true) {
		$("game").scrollLeft = curXPos - e.pageX;
		$("game").scrollTop = curYPos - e.pageY;
	}
}

//Keyboard shortcuts
function handleKeyboard(e: KeyboardEvent) {
	switch (e.code) {
		//Unit context buttons, only when the button is shown for the current unit
		case "KeyM":
			if (contextButtons.hasOwnProperty("mount"))
				unitContextButton("mount", map.currentUnit);
			break;
		case "KeyE":
			if (contextButtons.hasOwnProperty("embark"))
				unitContextButton("embark", map.currentUnit);
			break;
		case "KeyS":
			if (contextButtons.hasOwnProperty("resupply"))
				unitContextButton("resupply", map.currentUnit);
			break;
		case "KeyR":
			if (contextButtons.hasOwnProperty("reinforce"))
				unitContextButton("reinforce", map.currentUnit);
			break;
		case "KeyO":
			if (contextButtons.hasOwnProperty("overstrength"))
				unitContextButton("overstrength", map.currentUnit);
			break;
		case "KeyU":
			if (contextButtons.hasOwnProperty("undo"))
				unitContextButton("undo", map.currentUnit);
			break;
		//Next and previous unit that hasn't moved
		case "KeyN":
			if (defined(map.currentUnit))
				selectNeighbourUnit(map.currentUnit, 1, true);
			break;
		case "KeyP":
			if (defined(map.currentUnit))
				selectNeighbourUnit(map.currentUnit, 0, true);
			break;
		case "KeyA":
			game.ui.mainMenuButton("air");
			break;
		case "KeyH":
			game.ui.mainMenuButton("hex");
			break;
		case "KeyB":
			game.ui.mainMenuButton("buy");
			break;
		case "KeyI":
			game.ui.mainMenuButton("inspectunit");
			break;
		case "KeyZ":
			game.ui.mainMenuButton("zoom");
			break;
		case "KeyL":
			game.ui.removeAllSmallToolTips();
			break;
	}
	//Escape deselects the unit or toggles the main menu
	if (e.key == "Escape" || e.key == "Esc") {
		if (defined(map.currentUnit))
			handleUnitDeselect();
		else
			game.ui.mainMenuButton("options");
	}
}

//handle unit deployment
function handleUnitDeployment(row: number, col: number) {
	var deployUnit = $<EqUserSelElement>("eqUserSel").deployunit;
	if (resultOf(Commands.execute(game.scenario, { type: "deploy", index: deployUnit, to: { row: row, col: col } }), false)) {
		R.cacheImages(function() { R.render(row, col, 1); });
		handleUnitDeselect();
		updateEquipmentWindow($<EqUserSelElement>("eqUserSel").eqclass);
	}
}

//A command's result, or refused when the command was refused: what the engine call it replaced
//returned when it did nothing
function resultOf<T extends CommandType>(done: Executed<T>, refused: ResultOf<T>): ResultOf<T> {
	return done.ok ? done.result : refused;
}

//Deselects a previously selected unit. Can't have row,col as params since user can click or rightclick
//everywhere on empty terrain to deselect a unit
function handleUnitDeselect() {
	if (map.currentUnit !== null) {
		var p = map.currentUnit.getPos();
		var r = getRenderRange(map.currentUnit);
		map.delCurrentUnit(); //deselect from map array before render
		R.render(p.row, p.col, r);
	}
}

//handle the selection of a new unit
function handleUnitSelect(row: number, col: number) {
	if (map.currentPlayer.type != playerType.humanLocal)
		return false;

	var hex = map.map[row][col];
	var unit = hex.getUnit(uiSettings.airMode);

	if (unit == null || unit.player.id != map.currentPlayer.id) { //Can't select units from other players
		unit = hex.getUnit(!uiSettings.airMode); //try the other unit on hex
		if (unit == null || unit.player.id != map.currentPlayer.id)
			return false;
	}

	//Select unit on equipment window (can't be in uiUnitSelect because will loop in updateEquipmentWindow())
	$<EqUserSelElement>("eqUserSel").userunit = unit.id; //save selected player unit
	updateEquipmentWindow(unit.unitData(true).uclass);
	game.ui.removeUnitToolTip(unit.id);

	return uiUnitSelect(unit);
}

function uiUnitSelect(unit: Unit | null) {
	if (unit === null)
		return false;

	var p = unit.getPos();
	handleUnitDeselect();
	map.selectUnit(unit);

	updateUnitContextWindow(unit); //Update unit contextual window
	updateStatusBarLocation(p.row, p.col); //Display selected unit on status bar
	var r = getRenderRange(unit);
	R.render(p.row, p.col, r);

	return true;
}

//handle the move of a unit to row,col destination: the move command, animated, finished when the
//animation ends. True when the player sees it move
//cells: the shown move range the player clicked in (it can be the disembark hexes or older than the state),
//without it the move finds its path in the unit's move range
function uiUnitMove(unit: Unit, row: number, col: number, cells?: Cell[]) {
	//Waited for until the move's finish (uiMoveAnimationFinished): the AI's next action, the player's end of
	//turn (#58)
	game.waitUIAnimation = true;
	var mm = unit.unitData().movmethod;
	if (GameRules.isTrain(unit))
		mm = movMethod.tracked; //Trains use the tracked move sound
	//Save render properties before moving
	var r = getRenderRange(unit);
	var oldpos = unit.getPos();
	var animated = false;

	var moved = Commands.execute(game.scenario, { type: "move", unit: unit.id, to: { row: row, col: col }, cells: cells }, {
		animate: function(mr: movementResults, finish: (hooks?: FinishMoveHooks) => MoveResult) {
			var moveAnimationCBData: MoveAnimationCBData = {
				unit: unit,
				moveResults: mr,
				cbfunc: function(data: MoveAnimationCBData) { uiMoveAnimationFinished(data, finish); }
			};

			//No animation for moves the player can't see
			if (!mr.isVisible) {
				uiMoveAnimationFinished(moveAnimationCBData, finish);
				return;
			}

			soundData[moveSoundByMoveMethod[mm]].play();
			unit.hasAnimation = true; //signal render that unit is going to be move animated
			R.moveAnimation(moveAnimationCBData);
			R.render(oldpos.row, oldpos.col, r);
			animated = true;
		}
	});

	//No path there: the unit stays, finished as the engine's empty move
	if (!moved.ok)
		uiMoveAnimationFinished({ unit: unit, moveResults: new movementResults(), cbfunc: uiMoveAnimationFinished });

	return animated;
}

//Called when move animation finishes. finish: the move command's, the retreat's end for a retreat
function uiMoveAnimationFinished(moveAnimationCBData: MoveAnimationCBData,
	finish?: (hooks?: FinishMoveHooks) => MoveResult | void) {
	var mr = moveAnimationCBData.moveResults;
	var unit = moveAnimationCBData.unit;
	var r = getRenderRange(unit);
	var p = unit.getPos();

	R.render(p.row, p.col, r);

	if (!finish)
		finish = function(hooks?: FinishMoveHooks) { Commands.finishRetreat(unit, mr, hooks); };
	//The surprise attack is animated as an attack, its finish runs when its animation ends: the AI waits
	//for it (its next action could come first, hidden while the turn loop ticked once a second, #248)
	let surprise = false;
	finish({
		onSurprised: function(cell: Cell) { uiShowAlert(cell.row, cell.col, "Surprised"); },
		attackHooks: function(attacker: Unit, target: Unit) {
			const hooks = uiAttackHooks(attacker, target);
			return { ...hooks, animate: function(result: AttackResult, end: (h?: FinishAttackHooks) => AttackResult) {
				surprise = true;
				hooks.animate(result, function(h?: FinishAttackHooks) { surprise = false; return end(h); });
			} };
		},
		onCapture: function(u: Unit) { uiShowAlert(p.row, p.col, "Captured", u.player.side == game.spotSide || game.spotSide == 2); },
		onVictory: uiMoveVictory
	});

	game.waitUIAnimation = surprise;
}

//A side has won by capturing all its victory hexes
function uiMoveVictory(side: number) {
	uiVictory(side, endGameType.moveCapture);
}

//A side has won because the other has no unit left
function uiEliminationVictory(side: number) {
	uiVictory(side, endGameType.noEnemyLeft);
}

//The scenario won by side, how (an endGameType value): told as a defeat to a person who played the
//other side only, with the winner's country and score (#76: the old game asked whose turn it was, so a
//person whose last unit fell attacking was told they won, and it always said the hexes were captured)
function uiVictory(side: number, how: string) {
	var victoryType = game.scenario.checkVictory();
	if (game.campaign !== null) {
		if (game.getCampaignPlayer().side == side)
			game.continueCampaign(victoryType, how);
		else
			game.continueCampaign("lose", how);
	} else {
		var title, text;
		var winner = map.getPlayers().find(function(p) { return p.side == side; }) || map.currentPlayer;
		if (game.session.localSide == (~side & 1)) {
			title = "DEFEAT";
			text = "You have lost ! Your enemy ";
		} else {
			title = outcomeNames[victoryType];
			text = "You have won this scenario ! ";
		}
		var reason = how == endGameType.noEnemyLeft ? "destroying all the enemy units" : "capturing all victory hexes";
		uiMessage(title, "<br/><br/><br/><br/>" + text + winner.getCountryName() + " on "
			+ sideNames[side] + " side wins by " + reason + " with a final score of <b>"
			+ winner.score + "</b>. ", function() { game.ui.mainMenuButton("options"); });

		game.gameEnded = true;
	}
}

//handle attack performed by attacking unit on row,col unit
function handleUnitAttack(attackingUnit: Unit, row: number, col: number) {
	var hex = map.map[row][col];
	var enemyUnit: Unit = null;
	if ((enemyUnit = hex.getAttackableUnit(attackingUnit, uiSettings.airMode)) !== null) //Select which unit to attack depending on uiSettings.airMode
		return uiUnitAttack(attackingUnit, enemyUnit) !== null;
	return false;
}

//handle attack performed by attacking unit on the unit it attacks: the attack command, the combat itself is
//the command's. Null when it can't attack it (a unit isn't on the map)
//The attack is waited for until its finish (uiAttackAnimationFinished), as a move is
function uiUnitAttack(attackingUnit: Unit, enemyUnit: Unit) {
	game.waitUIAnimation = true;
	const result = resultOf(Commands.execute(game.scenario, { type: "attack", unit: attackingUnit.id, target: enemyUnit.id },
		uiAttackHooks(attackingUnit, enemyUnit)), null);
	if (result === null) game.waitUIAnimation = false;
	return result;
}

//The attack command's hooks: the info on the status bar, the hits animated as the combat goes (their
//sprite picks draw from the cosmetic stream, not the dice's), then the render and the animation, which
//finishes the attack when it ends
function uiAttackHooks(attackingUnit: Unit, enemyUnit: Unit): AttackCommandHooks {
	var renderRange = 7; //biggest attack range including support fire
	var cpos = attackingUnit.getPos();
	var epos = enemyUnit.getPos();
	var cclass = attackingUnit.unitData().uclass;
	var eclass = enemyUnit.unitData().uclass;

	return {
		onStart: function() {
			UIBuilder.showAttackInfo(attackingUnit, enemyUnit); //Show info on status bar
		},
		onSupportShot: function(unit: Unit, sp: Cell) {
			R.addAnimation(sp.row, sp.col, attackAnimationByClass[unit.unitData().uclass], unit.facing); //Hits by supporting units
		},
		onAttack: function(r: AttackResult) {
			var cr = r.cr;
			if (cr.isOverrun) {
				uiShowAlert(epos.row - 0.2, epos.col - 0.6, "OverRun ", true);
				renderRange = 1;
			}
			if (cr.isRugged && !cr.isOverrun)
				uiShowAlert(epos.row - 0.2, epos.col - 0.6, "Rugged Defense ", false);

			R.addAnimation(cpos.row, cpos.col, attackAnimationByClass[cclass], attackingUnit.facing);

			if (!enemyUnit.destroyed && cr.defcanfire)
				R.addAnimation(epos.row, epos.col, attackAnimationByClass[eclass], enemyUnit.facing); //Hits to the unit being attacked
		},
		animate: function(result: AttackResult, finish: (hooks?: FinishAttackHooks) => AttackResult) {
			//Render so new unit facings are shown correctly
			R.render(cpos.row, cpos.col, renderRange);
			//Show the AI combats on map
			if (uiSettings.markCombatUnits && map.currentPlayer.type == playerType.aiLocal) {
				R.drawHexByCell(cpos, hexstyle.combat);
				R.drawHexByCell(epos, hexstyle.combat);
			}
			var animationCBData: UIAttackAnimationData = { result: result,
				cbfunc: function(data: UIAttackAnimationData) { uiAttackAnimationFinished(data, finish); } };
			//An empty animation chain (a carrier or naval transport attack without support fire) calls back
			//at once: the finish reads the new strengths, already set (the bundle set them after, #111)
			R.runAnimation(animationCBData);
		}
	};
}

//Refresh map selections after an attack: the selection cleared when its unit was destroyed, else
//selected again, with its move hexes made again when it destroyed the defender. The render range
//they need, 0 for none. When both units were destroyed the old game read the cleared selection
//there: it threw, and the game waited for the attack for good (#326, #29)
function uiReselectAfterAttack(a: AttackSide, d: AttackSide): number {
	const u = map.currentUnit;
	if (!u)
		return 0;
	if (a.unit.destroyed && u.id == a.unit.id) {
		map.delCurrentUnit(); //remove current selection if unit was destroyed in attack
		R.drawCursor(a.cell); //refresh cursor or it gets stuck in attack cursor
		return 0;
	}
	map.selectUnit(u);
	if (!d.unit.destroyed || u.hasMoved)
		return 0;
	map.setMoveRange(u); //refresh move range if unit has destroyed another unit
	return getRenderRange(u);
}

//Called when attack animation finishes: the rest of the combat is the attack command's finish
function uiAttackAnimationFinished(animationCBData: UIAttackAnimationData, finish: (hooks?: FinishAttackHooks) => AttackResult) {
	var moveAnimationCBData: MoveAnimationCBData;

	var result = animationCBData.result;
	var a = result.attacking;
	var d = result.defending;
	var renderRange = GameRules.getUnitAttackRange(a.unit);
	let retreating = false; //the AI waits for the retreat's move too (#248)

	finish({
		onLosses: function() {
			var aloss = a.oldstr - a.newstr;
			if (aloss > 0 && aloss < a.oldstr)
				uiShowAlert(a.cell.row, a.cell.col, -aloss);

			var dloss = d.oldstr - d.newstr;
			if (dloss > 0 && dloss < d.oldstr)
				uiShowAlert(d.cell.row, d.cell.col, -dloss);
		},
		//Explosion animation along with deleting units from map and refreshing selection
		onDestroyed: function(cell: Cell) {
			R.addAnimation(cell.row, cell.col, "explosion");
			R.runAnimation(null);
		},
		afterCleanup: function() {
			renderRange = Math.max(renderRange, uiReselectAfterAttack(a, d));

			if (result.attackStopped)
				uiShowAlert(a.cell.row - 0.2, a.cell.col - 0.6, "Attack Stopped ", false);

			if (result.destroyed.indexOf(a.unit) < 0 && a.leaderGain && a.unit.player.side == game.spotSide)
				uiShowAlert(a.cell.row - 0.2, a.cell.col - 0.6, "New Leader", true);

			if (result.destroyed.indexOf(d.unit) < 0 && d.leaderGain && d.unit.player.side == game.spotSide)
				uiShowAlert(d.cell.row - 0.2, d.cell.col - 0.6, "New Leader", true);
		},
		//Defender retreats on big losses or surrenders when it has nowhere to go
		onRetreat: function(unit: Unit, rpos: Cell, mr: movementResults) {
			uiShowAlert(rpos.row - 0.2, rpos.col - 0.6, "Retreat ", false);
			retreating = true;
			moveAnimationCBData = { unit: unit, moveResults: mr,
				cbfunc: function(data: MoveAnimationCBData) { retreating = false; uiMoveAnimationFinished(data); } };
			unit.hasAnimation = true;
			R.moveAnimation(moveAnimationCBData);
		},
		onSurrender: function(cell: Cell) {
			uiShowAlert(cell.row - 0.2, cell.col - 0.6, "Surrender ", false);
			R.addAnimation(cell.row, cell.col, "explosion");
			R.runAnimation(null);
			//The surrendered unit is off the map only now, after the refresh above: the selected unit's move
			//hexes, which its next move goes along, made again without it and its zone of control (#89)
			if (map.currentUnit !== null && !map.currentUnit.hasMoved) {
				map.setMoveRange(map.currentUnit);
				renderRange = Math.max(renderRange, getRenderRange(map.currentUnit));
			}
		},
		//A side without units left loses
		onVictory: uiEliminationVictory
	});

	if (result.destroyed.length > 0 || result.retreat !== null || result.surrender)
		R.render(a.cell.row, a.cell.col, renderRange);

	game.waitUIAnimation = retreating;
	uiTurnInfo();
}

//The end turn button's first click: it asks to be clicked again, until its animation ends
function askEndTurnConfirmation(endTurnButton: HTMLElement) {
	endTurnButton.innerHTML = "1";
	if (!uiSettings.shownEndTurnTip)
		UIBuilder.uiToolTipAtElement(endTurnButton, "Tap again to confirm End Turn", 1);
	//Added again at every first click, never removed
	var resetConfirmation = function(this: HTMLElement) {
		this.removeAttribute("confirmation");
		endTurnButton.innerHTML = "t";
		if (!uiSettings.shownEndTurnTip)
			UIBuilder.uiToolTipAtElement(endTurnButton, "Tap twice to confirm End Turn", 1);
	};
	endTurnButton.setAttribute("confirmation", "on");
	endTurnButton.addEventListener("animationend", resetConfirmation, false);
	endTurnButton.addEventListener("webkitAnimationEnd", resetConfirmation, false);
}

//Bouncing text over a map hex
function uiShowAlert(row: number, col: number, text: string | number, positive?: boolean) {
	var pos = R.cellToScreen(row, col, true); //return absolute(window) values
	if (typeof positive === "undefined")
		positive = false;
	bounceText(pos.x, pos.y, text as string, positive); //the losses are numbers
}

//Shows or hides the unit list, with the equipment window when withEquipment
//A unit's small map tooltip: "gsttu" (removeAllSmallToolTips finds the units' by it), the unit, what it is out of
function unitToolTipId(unitId: number, outOf: "ammo" | "fuel") {
	return "gsttu" + unitId + "-" + outOf;
}

function toggleUnitsAndEquipmentWindow(withEquipment: boolean) {
	if (map.currentPlayer.type != playerType.humanLocal)
		return;

	if (withEquipment ? isVisible("equipment") : isVisible("container-unitlist")) {
		makeHidden("equipment");
		makeHidden("container-unitlist");
		makeHidden("unitsBarButton");
		uiSettings.deployMode = false;
		toggleButton($("buy"), false);
		uiTurnInfo(); //Write back the turn info since we change the info when we open equipment window
	} else {
		toggleUnitInfoWindow(true);
		makeVisible("container-unitlist");
		if (withEquipment) {
			makeVisible("equipment");
			//By default show buy buttons not sort options
			makeHidden("eqSortOptions");
			makeVisible("eqButtonsContainer");
		}
		updateEquipmentWindow(unitClass.tank);
		toggleButton($("buy"), true);
		if (isVisible("equipment"))
			makeHidden("unitsBarButton");
		else
			makeVisible("unitsBarButton");
		makeHidden("combatLog");
	}
	R.render(); //Full page render is needed for showing/hiding deployment hexes over all map
}

function updateUnitContextWindow(u?: Unit) {
	var div: HTMLElement;
	var nbuttons = 0;
	contextButtons = {};
	clearTag("unit-context");

	if (u && u.player && u.player.id == map.currentPlayer.id) {
		if (GameRules.canMount(u)) {
			nbuttons++;
			div = addTag("unit-context", "div");
			div.className = "smallButtonSubMenu";
			div.innerHTML = UIBuilder.unitContextButtons.mount;
			div.title = "Mount/Umount this unit in/from a transport";
			div.onclick = function() { unitContextButton("mount", u); };
			contextButtons.mount = true;
		}

		if (GameRules.canEmbark(map.map, u) || GameRules.canDisembark(map.map, u)) {
			nbuttons++;
			div = addTag("unit-context", "div");
			div.className = "smallButtonSubMenu";
			div.innerHTML = UIBuilder.unitContextButtons.embark;
			div.title = "Embark/DisEmbark this unit in/from a air/naval transport";
			div.onclick = function() { unitContextButton("embark", u); };
			contextButtons.embark = true;
		}

		if (GameRules.canResupply(map.map, u)) {
			nbuttons++;
			div = addTag("unit-context", "div");
			div.className = "smallButtonSubMenu";
			div.innerHTML = UIBuilder.unitContextButtons.resupply;
			div.title = "Resupply Ammo and Fuel for this unit";
			div.onclick = function() { unitContextButton("resupply", u); };
			contextButtons.resupply = true;
		}

		if (map.currentPlayer.prestige >= GameRules.calculateUnitCostPerStrength(u)) {
			if (GameRules.canReinforce(map.map, u, false)) {
				nbuttons++;
				div = addTag("unit-context", "div");
				div.className = "smallButtonSubMenu";
				div.innerHTML = UIBuilder.unitContextButtons.reinforce;
				div.title = "Reinforce unit strength";
				div.onclick = function() { unitContextButton("reinforce", u); };
				contextButtons.reinforce = true;
			}
			if (GameRules.canReinforce(map.map, u, true)) {
				nbuttons++;
				div = addTag("unit-context", "div");
				div.className = "smallButtonSubMenu";
				div.innerHTML = UIBuilder.unitContextButtons.overstrength;
				div.title = "Overstrength unit";
				div.onclick = function() { unitContextButton("overstrength", u); };
				contextButtons.overstrength = true;
			}
		}

		if (map.canUndoMove(u)) {
			nbuttons++;
			div = addTag("unit-context", "div");
			div.className = "smallButtonSubMenu";
			div.innerHTML = UIBuilder.unitContextButtons.undo;
			div.title = "Undo last move";
			div.onclick = function() { unitContextButton("undo", u); };
			contextButtons.undo = true;
		}

		if (nbuttons > 0)
			makeVisible("unit-context");
		else
			makeHidden("unit-context");
	} else {
		makeHidden("unit-context");
	}
}

//Updates the unit stats info window
function updateUnitInfoWindow(u: UIUnitOrEntry) {
	var isEqUnit = false;
	//ammo and fuel become html when low, the numbers go to textContent as they are
	var uinfo: EquipmentEntry, ammo: number | string, fuel: number | string = "-", exp = 0, ent = 0, ordinal = "";

	if (!isVisible("unit-info") || !uiSettings.unitInfoVisibility)
		return;

	toggleUnitInfoWindow(true);
	clearTag($("uLeader"));
	clearTag($("uTransport"));
	clearTag($("uCarrier"));
	delTag($("leaderInfo"));
	makeVisible("statsRow");
	$("uLeader").className = "";
	$("uTransport").className = "";
	$("uCarrier").className = "";

	//Call from equipment window fill with default values (instead of creating a new unit object)
	if (typeof u.unitData === "undefined") {
		isEqUnit = true;
		uinfo = u as unknown as EquipmentEntry;
		u.flag = u.country;
		u.strength = 10;
		ammo = u.ammo;
		if (u.fuel != 0)
			fuel = u.fuel;
		exp = ent = 0;
	} else {
		//carrier is never 0 for a temporarily disembarked unit, for all the others this shows the
		//transport or the unit itself depending on mount
		if (u.carrier != 0)
			uinfo = u.isMounted ? u.transport.unitData() : u.unitData(true);
		else
			uinfo = u.unitData();
		ammo = u.getAmmo();
		if (GameRules.unitUsesFuel(u))
			fuel = u.getFuel();
		exp = u.experience;
		ent = u.entrenchment;
		if (uinfo.uclass !== unitClass.fortification)
			ordinal = UIBuilder.unitIDToOrdinal(u.id);
	}

	if ((ammo as number) < uinfo.ammo / 4) ammo = "<span style='color: #FF6347'>" + ammo + "</span>";
	if ((fuel as number) < uinfo.fuel / 4) fuel = "<span style='color: #FF6347'>" + fuel + "</span>";

	$("uImage").style.backgroundImage = "url(" + uinfo.icon + ")";
	$("uSmallFlag").style.backgroundPosition = "" + (u.flag - 1) * -21 + "px 0px";
	$("uFlag").style.backgroundImage = "url('resources/ui/flags/" + Equipment.name + "/flag_big_" + u.flag + ".png')";
	$("uFlag").textContent = Equipment.getCountryName(u.flag - 1);
	$("uName").textContent = ordinal + " " + uinfo.name + " " + unitClassNames[uinfo.uclass];

	if (!isEqUnit) {
		if (u.isCore)
			$("uName").innerHTML += " (Core Unit)";
		if (u.leader != -1)
			$("uName").innerHTML += " (Leader)";
	}

	$("uTarget").textContent = unitTypeNames[uinfo.target];
	if (uinfo.uclass <= unitClass.airDefence && uinfo.movmethod == movMethod.deepnaval)
		$("uMoveType").textContent = "Rail Road"; //Trains are ground units with naval movement
	else
		$("uMoveType").textContent = movMethodNames[uinfo.movmethod];

	$("uStr").textContent = u.strength + "/10";
	$("uFuel").innerHTML = fuel as string;
	$("uAmmo").innerHTML = ammo as string;
	//A range of 0 shows as 1; uinfo is the equipment's entry, the rules read it (#26)
	$("uGunRange").textContent = String(uinfo.gunrange == 0 ? 1 : uinfo.gunrange);
	$("uMovement").textContent = uinfo.movpoints as unknown as string;

	$("uExp").textContent = exp as unknown as string;
	$("uEnt").textContent = ent as unknown as string;
	$("uIni").textContent = uinfo.initiative as unknown as string;
	$("uSpot").textContent = uinfo.spotrange as unknown as string;

	$("uAHard").textContent = uinfo.hardatk as unknown as string;
	$("uASoft").textContent = uinfo.softatk as unknown as string;
	$("uAAir").textContent = uinfo.airatk as unknown as string;
	$("uANaval").textContent = uinfo.navalatk as unknown as string;

	$("uDHard").textContent = uinfo.grounddef as unknown as string;
	$("uDAir").textContent = uinfo.airdef as unknown as string;
	$("uDClose").textContent = uinfo.closedef as unknown as string;
	$("uDRange").textContent = uinfo.rangedefmod as unknown as string;

	if (isEqUnit) return;

	//Button to see the carrier properties, throws for a negative (temporarily disembarked) carrier
	if (u.carrier != 0) {
		$("uCarrier").className = "smallButtonSubMenu";
		$("uCarrier").innerHTML = "2";
		$("uCarrier").onclick = function() { updateUnitInfoWindow(Equipment.equipment[u.carrier] as unknown as UIUnitOrEntry); };
	}

	//Add button to see transport/unit properties depending on unit state
	if (u.transport) {
		var simulateMount: boolean;

		$("uTransport").className = "smallButtonSubMenu";
		if (u.isMounted) {
			$("uTransport").innerHTML = "9";
			simulateMount = false;
		} else {
			$("uTransport").innerHTML = "8";
			simulateMount = true;
		}

		$("uTransport").onclick = function() {
			var s = u.isMounted;
			u.isMounted = simulateMount;
			updateUnitInfoWindow(u);
			u.isMounted = s;
		};
	}

	//Button to toggle the leader description over the unit stats
	if (u.leader > -1) {
		$("uLeader").className = "smallButtonSubMenu";
		$("uLeader").textContent = "z";
		$("uLeader").onclick = function() {
			if ($("leaderInfo") !== null) {
				updateUnitInfoWindow(u);
			} else {
				makeHidden("statsRow");
				var ld = Leaders.getUnitLeaderDescriptions(u);
				var div = addTag("statsRowContainer", "div");
				div.id = "leaderInfo";
				div.style.paddingLeft = "20px";
				div.style.paddingTop = "10px";
				var html = "<b>" + ld[0][0] + "</b>: ";
				html += ld[0][1] + "<br/>";
				html += "<b>" + ld[1][0] + "</b>: ";
				html += ld[1][1];
				div.innerHTML = html;
			}
		};
	}

	//Button to go to the next unit of the visible side
	if (u.player.side === game.spotSide) {
		$("uNext").className = "smallButtonSubMenu";
		$("uNext").style.fontSize = "16px";
		$("uNext").innerHTML = "y";
		$("uNext").onclick = function() { selectNeighbourUnit(u, 1, true); };
	}
}

function toggleUnitInfoWindow(visible: boolean) {
	if (visible)
		makeVisible("unit-info");
	else
		makeHidden("unit-info");
	uiSettings.unitInfoVisibility = visible;
	toggleButton($("inspectunit"), visible);
}

//Selects the next (direction 1) or previous unit of the unit's player and brings it into view
function selectNeighbourUnit(unit: Unit, direction: number, onlyNotMoved: boolean) {
	var u = map.getUnitNeighbor(unit, direction, onlyNotMoved);
	uiUnitSelect(u);
	if (u) uiSetCellOnViewPort(u.getPos());
	updateUnitInfoWindow(u);
}

function unitContextButton(action: string, unit: Unit) {
	//Remember the render range and position of unit before actions
	var r: number | ReinforceResults = getRenderRange(unit); //the reinforce results take it, see below
	var p = unit.getPos();
	var refreshRender = false; //If a unit gets a new range after action
	var overstrength = false;
	var ret: Supply, pos: Cell, text: string;

	switch (action) {
		case "mount": { //Can get a bigger range on mount
			Commands.execute(game.scenario, { type: unit.isMounted ? "unmount" : "mount", unit: unit.id });
			refreshRender = true;
			break;
		}
		case "embark": {
			if (unit.carrier > 0) {
				Commands.execute(game.scenario, { type: "disembark", unit: unit.id });
				refreshRender = true;
			} else {
				if (resultOf(Commands.execute(game.scenario, { type: "embark", unit: unit.id }), false))
					refreshRender = true;
			}
			break;
		}
		case "resupply": { //same location same range
			ret = resultOf(Commands.execute(game.scenario, { type: "resupply", unit: unit.id }), new Supply(0, 0));
			pos = unit.getPos();
			text = "";
			if (ret.ammo > 0) text += "+" + ret.ammo + " ammo ";
			if (ret.fuel > 0) text += "+" + ret.fuel + " fuel";
			if (text == "")
				uiShowAlert(pos.row, pos.col, "Can't resupply", false);
			else
				uiShowAlert(pos.row, pos.col, text, true);
			break;
		}
		case "overstrength": //reinforce above the unit's normal strength
		case "reinforce": { //same location same range
			overstrength = (action == "overstrength");
			//the result takes the render range variable, the old range is lost
			r = resultOf(Commands.execute(game.scenario, { type: "reinforce", unit: unit.id, overstrength: overstrength }),
				{ strength: 0, ammo: 0, fuel: 0 });
			pos = unit.getPos();
			text = "";
			if (r.strength > 0) text = "+" + r.strength + " units ";
			if (r.ammo > 0) text += "+" + r.ammo + " ammo ";
			if (r.fuel > 0) text += "+" + r.fuel + " fuel";
			if (text == "")
				uiShowAlert(pos.row, pos.col, overstrength ? "No overstrength" : "Can't reinforce", false);
			else
				uiShowAlert(pos.row, pos.col, text, true);
			break;
		}
		case "undo": { //new location different range
			Commands.execute(game.scenario, { type: "undo", unit: unit.id });
			refreshRender = true;
			break;
		}
	}
	updateUnitContextWindow(unit);
	updateUnitInfoWindow(unit);
	R.render(p.row, p.col, r as number); //remove old range
	if (refreshRender) {
		r = getRenderRange(unit); //probably different range
		p = unit.getPos(); //undoLastMove changes location
		R.render(p.row, p.col, r); //render new range changes
	}
}

function updateEquipmentWindow(eqclass?: number) {
	if (!isVisible("container-unitlist"))
		return;

	//Don't show AI/others unit lists
	if (map.currentPlayer.side !== game.spotSide)
		return;

	//Remove older entries
	clearTag("unitlist");
	clearTag("eqUnitList");
	clearTag("eqTransportList");

	//The current selected country in the div
	var c: number | number[] = $<EqSelCountryElement>("eqSelCountry").country; //the onclick below reuses it for the countries
	var country = +countries[c as number] + 1; //country id that is saved on unit data starts from 1

	$("eqSelCountry").style.backgroundPosition = "" + countries[c as number] * -21 + "px 0px"; //Update flag

	var scenarioYear = game.scenario.date.getFullYear();
	var unitList: Unit[] = [];
	var forcedScroll: number, eqForcedScroll: number;
	var u: Unit, ud: EquipmentEntry, userUnitSelected: number, div: UIUnitBoxElement, i: number;
	var eqUnitList: number[], eqUnitSelected: number, eqTransportSelected: number, sortOrder: boolean,
		sortProperty: keyof EquipmentEntry, eqid: number, eu: EquipmentEntry, t: EquipmentEntry, tdiv: UIUnitBoxElement;
	var hasTransportSelected: boolean;

	var oldDeployMode = uiSettings.deployMode;

	//The lists are sorted for display on copies: their order is the game's (the AI walks the units in it,
	//the deploy, sell and upgrade commands name a core unit by its index in it, #186)
	var coreList = map.currentPlayer.getCoreUnitList();
	if (map.currentPlayer.hasUndeployedUnits()) {
		//The units that current player hasn't deployed yet
		userUnitSelected = $<EqUserSelElement>("eqUserSel").deployunit;
		unitList = coreList.slice().sort(unitListSorter(false));
		uiSettings.deployMode = true;
		$("statusmsg").innerHTML = "Deploy (on map grey hexes) or upgrade your core units";
	} else {
		//The actual units on the map
		userUnitSelected = $<EqUserSelElement>("eqUserSel").userunit;
		unitList = map.getUnits().slice().sort(unitListSorter(true));
		uiSettings.deployMode = false;
		$("statusmsg").innerHTML = "Units currently deployed on map.";
	}
	UIBuilder.setDeployOrCombatLogState(uiSettings.deployMode);

	if (oldDeployMode !== uiSettings.deployMode) //Check if we should refresh canvas for new mode
		R.render(); //Full canvas render

	//All units deployed, close the deployment unit list
	if (oldDeployMode == true && uiSettings.deployMode == false)
		toggleUnitsAndEquipmentWindow(false);

	for (i = 0; i < unitList.length; i++) {
		u = unitList[i];

		if ((uiSettings.deployMode && u.isDeployed) || !u || u.player.id != map.currentPlayer.id)
			continue;

		ud = u.unitData(true);
		div = uiAddUnitBox("unitlist", u);

		//Make a default selection for deployment mode so we don't have to click each time we deploy.
		//A row in deployment mode is the unit's index in the core list
		if (uiSettings.deployMode && (userUnitSelected == -1 || coreList[userUnitSelected].isDeployed))
			$<EqUserSelElement>("eqUserSel").deployunit = userUnitSelected = coreList.indexOf(u);

		if (uiSettings.deployMode)
			div.unitid = coreList.indexOf(u);
		else
			div.unitid = u.id;

		div.uniteqid = u.eqid;
		div.eqclass = ud.uclass;
		div.country = ud.country - 1;

		if (u.isCore && div.unitid != userUnitSelected)
			div.setAttribute("coreUnit", ud.name); //apply the [coreUnit] style when not selected

		if (div.unitid == userUnitSelected) {
			//Automatically set transport on transport list if user has not selected a new transport
			//Check if user selected equipment unit for upgrade can be transported
			if (u.transport !== null && $<EqUserSelElement>("eqUserSel").eqtransport == -1
				&& ($<EqUserSelElement>("eqUserSel").equnit == -1 || GameRules.isTransportable($<EqUserSelElement>("eqUserSel").equnit)))
				$<EqUserSelElement>("eqUserSel").eqtransport = u.transport.eqid;

			div.setAttribute("selectedUnit", ud.name); //apply the .eqUnitBox[selectedUnit] css style to make unit appear selected

			if (!uiSettings.deployMode) { //Not on map
				uiUnitSelect(u);
				if (u) uiSetCellOnViewPort(u.getPos()); //bring the unit into map view
				eqclass = ud.uclass; //Force unit class for equipment display
			}
			//This unit will be the last in div since the div is being built and we can use offsetWidth of the
			//containing div to get offset from the position 0. This value will be used to scroll the div when
			//a unit is selected from the map not from the unit list ui div
			forcedScroll = $("unitlist").offsetWidth - ($("container-unitlist").offsetWidth + div.offsetWidth) / 2;
		}

		setHandler(div, "onclick", function(el: UIUnitBoxElement) {
			c = map.getCountriesBySide(game.spotSide);
			for (i = 0; i < c.length; i++)
				if (c[i] == el.country) break;

			if (uiSettings.deployMode) {
				$<EqUserSelElement>("eqUserSel").deployunit = el.unitid; //save selected player unit for deployment
				$<EqUserSelElement>("eqUserSel").userunit = -1; //clear any remaining selection
			} else {
				$<EqUserSelElement>("eqUserSel").userunit = el.unitid; //save selected player unit
				$<EqUserSelElement>("eqUserSel").deployunit = -1; //clear any remaining selection
			}

			$<EqSelCountryElement>("eqSelCountry").country = i;
			$<EqUserSelElement>("eqUserSel").eqtransport = -1; //clear transport selection on new unit selection
			$<EqUserSelElement>("eqUserSel").equnit = el.uniteqid; //the unit own equipment is selected
			$<EqUserSelElement>("eqUserSel").unitscroll = $("hscroll-unitlist").scrollLeft; //save scroll position so at refresh we autoscroll

			var unit: Unit;
			if (uiSettings.deployMode)
				unit = map.currentPlayer.getCoreUnitList()[el.unitid];
			else
				unit = map.getUnitById(el.unitid);
			updateUnitInfoWindow(unit);
			updateEquipmentWindow(el.eqclass);
			$("hscroll-unitlist").scrollLeft = $<EqUserSelElement>("eqUserSel").unitscroll; //scroll to the selected unit
		});
	}
	//Force scrolling when units are selected from the map to bring them into unit list view
	if (!uiSettings.deployMode)
		$("hscroll-unitlist").scrollLeft = forcedScroll;

	//Flak are shown as air defence, classes that can't be bought show tanks
	if (eqclass == unitClass.flak)
		eqclass = unitClass.airDefence;
	if (typeof UIBuilder.eqClassButtons[eqclass] === "undefined")
		eqclass = unitClass.tank;

	//Toggle equipment class button on/off
	var prevClass = $<EqUserSelElement>("eqUserSel").eqclass || unitClass.tank;
	if (typeof UIBuilder.eqClassButtons[prevClass] !== "undefined")
		toggleButton($("eqclass-" + prevClass), false);
	if (typeof UIBuilder.eqClassButtons[eqclass] !== "undefined")
		toggleButton($("eqclass-" + eqclass), true);
	$<EqUserSelElement>("eqUserSel").eqclass = eqclass;

	//Info text above
	$("eqInfoText").innerHTML = scenarioYear + " " + unitClassNames[eqclass] + " upgrades for " + Equipment.getCountryName(country - 1);
	//Units in equipment
	eqUnitSelected = $<EqUserSelElement>("eqUserSel").equnit;
	sortOrder = $<EqUserSelElement>("eqUserSel").sortorder;
	sortProperty = $<EqUserSelElement>("eqUserSel").sortproperty || "cost";
	eqUnitList = Equipment.getCountryEquipmentByClass(eqclass, country, sortProperty, sortOrder);

	for (i = 0; i < eqUnitList.length; i++) {
		eqid = eqUnitList[i];
		eu = Equipment.equipment[eqid];

		if (eu.yearavailable > scenarioYear || eu.yearexpired < scenarioYear)
			continue;

		//Add the unit to the list
		div = uiAddUnitBox("eqUnitList", eu as unknown as UIUnitOrEntry);
		div.equnitid = eqid;
		if (eqid == eqUnitSelected) {
			div.setAttribute("selectedUnit", eqid as unknown as string); //apply the .eqUnitBox[selectedUnit] css style to make unit appear selected
			eqForcedScroll = $("eqUnitList").offsetWidth - ($("hscroll-eqUnitList").offsetWidth + div.offsetWidth) / 2;
		}
		setHandler(div, "onclick", function(el: UIUnitBoxElement) {
			$<EqUserSelElement>("eqUserSel").equnit = el.equnitid; //save the selected unit in the equipment list
			$<EqUserSelElement>("eqUserSel").eqtransport = -1; //clear transport selection on new unit selection
			$<EqUserSelElement>("eqUserSel").eqscroll = $("hscroll-eqUnitList").scrollLeft; //save scroll position so at refresh we autoscroll
			updateUnitInfoWindow(Equipment.equipment[el.equnitid] as unknown as UIUnitOrEntry);
			updateEquipmentWindow(eqclass); //To "unselect" previous selected unit
			$("hscroll-eqUnitList").scrollLeft = $<EqUserSelElement>("eqUserSel").eqscroll; //scroll to the selected unit
		});
	}
	if (eqUnitSelected > 0)
		$("hscroll-eqUnitList").scrollLeft = eqForcedScroll;

	//Add the transport to the list if unit can be transported
	eqTransportSelected = $<EqUserSelElement>("eqUserSel").eqtransport;
	hasTransportSelected = false;
	if (GameRules.isTransportable(eqUnitSelected) || eqTransportSelected > 0) {
		eu = Equipment.equipment[eqUnitSelected];
		eqUnitList = Equipment.getCountryEquipmentByClass(unitClass.groundTransport, country, sortProperty, sortOrder);

		for (i = 0; i < eqUnitList.length; i++) {
			eqid = eqUnitList[i];
			t = Equipment.equipment[eqid];

			//Only the transports that can carry the unit weight
			if (t.yearavailable > scenarioYear || t.yearexpired < scenarioYear || !eu
				|| (eu.groundweight & t.groundweight) == 0)
				continue;

			tdiv = uiAddUnitBox("eqTransportList", t as unknown as UIUnitOrEntry);
			tdiv.eqtransportid = eqid;
			if (eqid == eqTransportSelected) {
				tdiv.setAttribute("selectedUnit", t.name); //apply the .eqUnitBox[selectedUnit] css style to make unit appear selected
				hasTransportSelected = true;
			}
			setHandler(tdiv, "onclick", function(el: UIUnitBoxElement) {
				//handle deselect of transport, -2 is no transport
				if ($<EqUserSelElement>("eqUserSel").eqtransport == el.eqtransportid)
					$<EqUserSelElement>("eqUserSel").eqtransport = -2;
				else
					$<EqUserSelElement>("eqUserSel").eqtransport = el.eqtransportid; //save the selected unit in the equipment list
				updateUnitInfoWindow(Equipment.equipment[el.eqtransportid] as unknown as UIUnitOrEntry);
				updateEquipmentWindow(eqclass); //To "unselect" previous selected unit
			});
		}
		if (!hasTransportSelected) //the selected transport can't carry the unit
			$<EqUserSelElement>("eqUserSel").eqtransport = -1;
	}
	updateEquipmentCosts();
}

//Sorts units by class, name and id, with the core units first when coreFirst
function unitListSorter(coreFirst: boolean) {
	return function(a: Unit, b: Unit) {
		var ua = a.unitData(true);
		var ub = b.unitData(true);
		var r = ua.uclass - ub.uclass;
		if (r == 0) r = ua.name < ub.name ? -1 : +(ua.name > ub.name);
		if (r == 0) r = a.id - b.id;
		if (!coreFirst) return r;
		if (a.isCore)
			return b.isCore ? r : -1;
		return b.isCore ? 1 : r;
	};
}

//Why the core refuses to buy a unit that can be bought (cost over 0) and is affordable, "" when it
//doesn't: the side may have no free deployment hex to put it on (#60)
function buyRefusal(cost: number, prestige: number, eqid: number, transport: number): string {
	if (!(cost > 0) || cost > prestige) return "";
	const refused = Commands.check(game.scenario, { type: "buy", eqid,
		transport: typeof transport === "undefined" || (transport as number | string) === "" ? -1 : transport });
	return refused === null ? "" : refused.reason;
}

//Updates the costs of user selected units in equipment window
function updateEquipmentCosts() {
	var userUnitSelected = $<EqUserSelElement>("eqUserSel").userunit; //unit already on map
	var deployUnitSelected = $<EqUserSelElement>("eqUserSel").deployunit; //unit no deployed on map
	var eqUnitSelected = $<EqUserSelElement>("eqUserSel").equnit;
	var eqTransportSelected = $<EqUserSelElement>("eqUserSel").eqtransport;
	var buyCost = 0;
	var upCost = 0;
	var sellCost = 0;
	var prestige = map.currentPlayer.prestige;
	var unit: Unit = null;
	var scenarioYear = game.scenario.date.getFullYear();
	var uclass: number, ucountry: number, eqclass: number, eqcountry: number;

	if (deployUnitSelected == -1 || typeof deployUnitSelected === "undefined")
		unit = map.getUnitById(userUnitSelected);
	else
		unit = map.currentPlayer.getCoreUnitList()[deployUnitSelected];

	if (typeof unit !== "undefined" && unit !== null) {
		uclass = unit.unitData(true).uclass;
		ucountry = unit.unitData(true).country - 1;
		if (uclass == unitClass.flak) uclass = unitClass.airDefence;
		//Can only upgrade to the same class and country
		if (eqUnitSelected > 0 && typeof eqUnitSelected !== "undefined") {
			eqclass = Equipment.equipment[eqUnitSelected].uclass;
			eqcountry = Equipment.equipment[eqUnitSelected].country - 1;
			if (eqclass == unitClass.flak) eqclass = unitClass.airDefence;
			if (uclass == eqclass && ucountry == eqcountry)
				upCost = GameRules.calculateUpgradeCosts(unit, eqUnitSelected, eqTransportSelected);
		}
		//In campaigns only core units can be sold
		if (game.campaign == null || unit.isCore)
			sellCost = GameRules.calculateUnitSellCost(unit);
	}

	//-1 cost: can't be bought
	if (eqUnitSelected != -1) {
		eqcountry = Equipment.equipment[eqUnitSelected].country - 1;
		if (defined(unit) && typeof UIBuilder.eqClassButtons[uclass] === "undefined")
			buyCost = -1;
		else if (Equipment.equipment[eqUnitSelected].yearavailable > scenarioYear
			|| Equipment.equipment[eqUnitSelected].yearexpired < scenarioYear)
			buyCost = -1;
		else if (game.campaign !== null && game.campaign.country !== eqcountry)
			buyCost = -1;
		else
			buyCost = GameRules.calculateUnitCosts(eqUnitSelected, eqTransportSelected);
	}

	UIBuilder.showEquipmentCosts(prestige, buyCost, upCost, sellCost, buyRefusal(buyCost, prestige, eqUnitSelected,
		eqTransportSelected));
}

function updateStatusBarLocation(row: number, col: number) {
	var unit: Unit;
	var hex = map.map[row][col];

	if (!hex || typeof hex === "undefined")
		return false;

	var text = terrainNames[hex.terrain];
	if (hex.road > roadType.none)
		text += "/Road";
	text = text + " (" + row + "," + col + ")";

	var name = "";
	if (hex.name !== null)
		name = hex.name + " ";

	var transports = "";
	if (hex.terrain == terrainType.Airfield && map.currentPlayer.airTransports > 0)
		transports = " Air Transports: " + map.currentPlayer.airTransports + " ";

	if (hex.terrain == terrainType.Port && map.currentPlayer.navalTransports > 0)
		transports += "Naval Transports: " + map.currentPlayer.navalTransports + " ";

	var unitText = "";
	if ((unit = hex.getUnit(uiSettings.airMode)) !== null
		&& (hex.isSpotted(map.currentPlayer.side) || unit.tempSpotted
			|| unit.player.side == map.currentPlayer.side)) {
		unitText = " Unit: " + unit.unitData(true).name + " ";
	}

	//Shorten the hex or the unit name to fit the status bar
	if (name.length + unitText.length > 30) {
		if (name.length > 15)
			name = name.slice(0, 10) + "... ";
		else
			unitText = unitText.slice(0, 20) + " ";
	}

	$("locmsg").innerHTML = unitText + name + transports + text;

	return true;
}

//Simple function to list a unit (or an equipment entry with its price) in a graphical unit box returns a DOM object
function uiAddUnitBox(parentTagName: string, u: UIUnitOrEntry) {
	var div = addTag(parentTagName, "div") as UIUnitBoxElement;
	var img = addTag(div, "img") as HTMLImageElement;
	var txt = addTag(div, "div");
	var icons = addTag(div, "div");

	div.className = "eqUnitBox";
	if (typeof u.unitData !== "undefined") {
		var ud = u.unitData(true);
		//Naval units have a generic icon on the unit list
		if (ud.uclass > unitClass.submarine) {
			var nd = {} as EquipmentEntry; //only name, icon and cost
			nd.name = ud.name;
			nd.icon = UIBuilder.navalReplacementIcon;
			nd.cost = ud.cost;
			ud = nd;
		}
		var status = "";
		img.src = ud.icon;
		txt.textContent = ud.name;
		if (u.isDeployed) {
			//Can fire, can move, low fuel or ammo icons
			icons.className = "eqUnitBoxIconsMenu";
			if (!u.hasFired) status += ">";
			if (!u.hasMoved) status += "|";
			if ((GameRules.unitUsesFuel(u) && u.fuel < 5) || u.ammo < 2)
				status += ";";
		} else {
			icons.className = "eqUnitBoxIcons";
			status = "Z"; //Not deployed icon
		}
		icons.textContent = status;
	} else {
		img.src = u.icon;
		txt.textContent = u.name;
		icons.innerHTML += "<b>" + u.cost * CURRENCY_MULTIPLIER + UIBuilder.currencyIcon + "</b>";
	}
	return div;
}

//Shows turn info on the status bar and the combat log or the AI status at a new turn
function uiEndTurnInfo() {
	makeHidden("statusbar-extension");
	$("statusbar-extension").style.top = "25px";
	$("statusbar-extension").className = "";

	var p = map.currentPlayer;
	uiTurnInfo();
	if (p.type == playerType.humanLocal || p.type == playerType.aiScripted) {
		UICombatLog.toggleCombatLog(true, false);
		game.ui.removeAllSmallToolTips(true);
		game.ui.addSmallToolTips(true);
	} else {
		UIBuilder.showAIStatus(true);
	}
}

//Show turn info status bar message
function uiTurnInfo() {
	clearTag($("statusmsg"));
	$("statusmsg").innerHTML = "&nbsp; " + map.currentPlayer.getCountryName() + " Turn: " + map.turn + "/" + map.maxTurns + " " + game.scenario.name;
	$("weathermsg").innerHTML = groundFontEncoding[game.scenario.ground] + weatherFontEncoding[game.scenario.atmosferic];
	$("weathermsg").title = groundConditionNames[game.scenario.ground] + " ground and "
				+ weatherConditionNames[game.scenario.atmosferic] + " weather";
}

function uiMessage(title: string, message: string, cbfunc?: () => void) { UIBuilder.message(title, message, cbfunc); }

//The game ended at the turn limit, told to the side that plays here (src/core/turn.ts turnLimitOutcome). In
//the classic rules the side that ended its last turn lost, as the original said. In the remaster's the
//defender that held out wins and the attacker that didn't take all its objectives loses (#256); with no
//attacker the side holding more objectives wins (#231)
function uiTurnLimitMessage() {
	const s = game.session, end = s.ended, w = s.world;
	const o = turnLimitOutcome(w, end !== null && end.kind === "turnLimit" ? end.side : -1);
	if (o.winner === -1) {
		if (w.rules.defenderHoldsOut) uiMessage("DRAW", "<br><br>Neither side holds more objectives");
		else uiMessage("DEFEAT", "<br><br>You didn't capture the objectives in time");
		return;
	}
	const heldOut = attackerSide(w) === o.loser;
	const held = heldOut ? " held the objectives to the end" : " held more objectives to the end";
	if (s.localSide === 2) uiMessage(outcomeNames[o.rating], "<br><br>The " + sideNames[o.winner] + " side" + held);
	else if (s.localSide === o.winner) uiMessage(outcomeNames[o.rating], "<br><br>You" + held);
	else uiMessage("DEFEAT", "<br><br>" + (heldOut ? "You didn't capture all the objectives in time" : "The enemy held more objectives to the end"));
}

//Centers the screen on a map cell
function uiSetCellOnViewPort(cell: Cell | null) {
	if (!cell || typeof cell === "undefined")
		return false;

	var pos = R.cellToScreen(cell.row, cell.col, true); //return absolute(window) values
	$("game").scrollLeft = pos.x - window.innerWidth / 2;
	$("game").scrollTop = pos.y - window.innerHeight / 2;
	return true;
}

function getMouseInfo(canvas: HTMLCanvasElement, e: MouseEvent) {
	var rclick: boolean;
	var vp = $("game");
	if (e.which) rclick = (e.which == 3);
	else if (e.button) rclick = (e.button == 2);

	return new mouseInfo(e.pageX - canvas.offsetLeft - vp.clientLeft - vp.offsetLeft + vp.scrollLeft,
		e.pageY - canvas.offsetTop - vp.clientTop - vp.offsetTop + vp.scrollTop, rclick);
}

function uiMapRenderAndSelectUnit() {
	R.render(); //Full page rendering
	//select the first available ground unit for the current side
	if (map.currentPlayer.type == playerType.humanLocal) {
		var unitList = map.getUnits();
		for (var i = 0; i < unitList.length; i++) {
			if (unitList[i].player.id == map.currentPlayer.id
				&& unitList[i].unitData().uclass != unitClass.fighter
				&& unitList[i].unitData().uclass != unitClass.levelBomber
				&& unitList[i].unitData().uclass != unitClass.tacticalBomber) {
				var pos = unitList[i].getPos();
				handleUnitSelect(pos.row, pos.col);
				updateUnitInfoWindow(unitList[i]);
				break;
			}
		}
	}
	//The deployment window centers on the deployment hexes instead
	if (!uiShowDeploymentWindow() && map.currentUnit)
		uiSetCellOnViewPort(map.currentUnit.getPos());
	uiScaleMap(uiSettings.zoomLevel);
}

function uiMapCacheImages() {
	if (hasBrokenClearRect())
		R.cacheImages(function() { window.setTimeout(uiMapRenderAndSelectUnit, 4000); }); //Broken canvas clearRect workaround
	else
		R.cacheImages(uiMapRenderAndSelectUnit);
}

//Returns the biggest range around a unit that should be rendered
function getRenderRange(unit: Unit | null) {
	if (unit === null)
		return 0;

	var range = GameRules.getUnitMoveRange(unit);
	var r = GameRules.getUnitAttackRange(unit);
	if (r > range) range = r;
	r = unit.unitData().spotrange;
	if (r > range) range = r;

	return range;
}

//Shows deployment window if a human player has undeployed units at new scenario or new turn
//and centers the map on the first deployment hex of the player
function uiShowDeploymentWindow() {
	var p = map.currentPlayer;
	if (!p.hasUndeployedUnits() || p.type != playerType.humanLocal)
		return false;

	makeVisible("container-unitlist");
	findHex:
	for (var row = 0; row < map.rows; row++) {
		for (var col = 0; col < map.cols; col++) {
			var hex = map.map[row][col];
			if (hex && hex.isDeployment != -1 && hex.isDeployment == map.currentPlayer.id) {
				uiSetCellOnViewPort({ row: row, col: col });
				break findHex;
			}
		}
	}
	toggleButton($("buy"), true);
	return true;
}

//Strategic zoom: scales the whole map to fit the window
function uiToggleMapZoom() {
	var vp = $("game");
	var size = R.getMapSize(); //css pixels, the canvases have more pixels on high density screens
	var zoom = Math.min(window.innerWidth / (size.width * uiSettings.zoomLevel) * 100,
		window.innerHeight / (size.height * uiSettings.zoomLevel) * 100) >> 0;
	var transform: string;

	if (uiSettings.strategicZoom) {
		vp.style.width = window.innerWidth + "px";
		vp.style.height = window.innerHeight + "px";
		if (NATIVE_PLATFORM == "ios") {
			vp.style.zoom = "100%";
		} else {
			transform = "";
			vp.style.webkitTransform = transform;
			(vp.style as UIPrefixedStyle).MozTransform = transform;
			vp.style.transform = transform;
		}
		uiSettings.strategicZoom = false;
		uiSettings.strategicZoomLevel = 1;
	} else {
		if (NATIVE_PLATFORM == "ios") {
			vp.style.zoom = zoom + "%";
		} else {
			transform = "scale(" + zoom / 100 + "," + zoom / 100 + ")";
			vp.style.webkitTransform = transform;
			(vp.style as UIPrefixedStyle).MozTransform = transform;
			vp.style.transform = transform;
		}
		vp.style.width = ((window.innerWidth * 100 / zoom) >> 0) + "px";
		vp.style.height = ((window.innerHeight * 100 / zoom) >> 0) + "px";
		uiSettings.strategicZoom = true;
		uiSettings.strategicZoomLevel = 100 / zoom;
	}
	toggleButton($("zoom"), uiSettings.strategicZoom);
	R.render(); //Full page render
}

//Map zoom level from the map scale slider, keeps the view centered
function uiScaleMap(level: number) {
	var zoom = (level * 100) >> 0;
	var vp = $("game");
	var oldLevel = uiSettings.zoomLevel;
	var size = R.getMapSize(); //css pixels, the canvases have more pixels on high density screens
	var w = size.width;
	var h = size.height;
	var scrollLeft = vp.scrollLeft;
	var scrollTop = vp.scrollTop;

	$("map").style.zoom = zoom + "%";
	$("hexes").style.zoom = zoom + "%";
	$("cursor").style.zoom = zoom + "%";
	$("unitbackbuffer").style.zoom = zoom + "%";
	vp.scrollLeft = scrollLeft + w * (level - oldLevel) / 2;
	vp.scrollTop = scrollTop + h * (level - oldLevel) / 2;
	uiSettings.mapZoom = (level != 1);
	uiSettings.zoomLevel = level;
	$<HTMLInputElement>("mapscale").value = level as unknown as string;
	R.positionLayers();
}

	this.handleReinforcementDeployment = function() {
		R.cacheImages(function() { R.render(); });
	};

	this.uiUnitSelect = function(unit: Unit | null) { return uiUnitSelect(unit); };
	this.uiUnitMove = function(unit: Unit, row: number, col: number) { return uiUnitMove(unit, row, col); };
	this.uiUnitAttack = function(attackingUnit: Unit, enemyUnit: Unit) { return uiUnitAttack(attackingUnit, enemyUnit) !== null; };
	this.showAlert = function(row: number, col: number, text: string | number, positive?: boolean) { return uiShowAlert(row, col, text, positive); };

	this.showGameToolTip = function(text: string, row: number, col: number) {
		var pos = R.cellToScreen(row, col, true);
		UIBuilder.gameToolTip(text, pos.x, pos.y);
	};

	this.showSmallToolTip = function(text: string, row: number, col: number, color: number, id?: string, style?: number) {
		var pos = R.cellToScreen(row, col, true);
		UIBuilder.gameSmallToolTip(text, pos.x, pos.y, color, id, style);
	};

	//Small tooltips over the map: hex names, objectives and transports, and low ammo/fuel on own units
	//unitsOnly skips the hex tooltips
	this.addSmallToolTips = function(this: UI, unitsOnly?: boolean) {
		var m = map.map;
		var p = map.currentPlayer;
		var side = p.side;
		for (var row = 0; row < m.length; row++) {
			for (var col = 0; col < m[row].length; col++) {
				var hex = m[row][col];
				var text: string = null;
				var color = tooltipColor.enemy;
				var style = tooltipStyle.text;

				if (!unitsOnly && hex.flag != -1 && hex.owner != -1) {
					if (hex.name !== null && hex.name != "")
						text = hex.name;
					else if (hex.victorySide !== -1)
						text = "Objective";

					if (!uiSettings.showDetailInfoToolTips && hex.victorySide == -1)
						text = null;

					if (hex.owner == side)
						color = tooltipColor.player;

					if (hex.terrain == terrainType.Airfield && p.airTransports > 0) {
						text = p.airTransports + "&nbsp;<span style='font-family: openpanzer-menu;'>&#xe900;</span> ";
						style = tooltipStyle.pin;
					}
					if (hex.terrain == terrainType.Port && p.navalTransports > 0) {
						text = p.navalTransports + "&nbsp;<span style='font-family: openpanzer-menu;'>&#xe901;</span>";
						style = tooltipStyle.pin;
					}
					if (text)
						this.showSmallToolTip(text, row, col, color, undefined, style);
				}

				var unit = hex.getUnit(uiSettings.airMode);
				if (unit && unit.player.side == side && text == null) {
					if (GameRules.unitLowAmmo(unit, 1))
						this.showSmallToolTip("No Ammo", row, col, 0, unitToolTipId(unit.id, "ammo"));
					if (GameRules.unitLowFuel(unit, 1))
						this.showSmallToolTip("No Fuel", row, col, 0, unitToolTipId(unit.id, "fuel"));
				}
			}
		}
	};

	//Both of the unit's tooltips, out of ammo and out of fuel (#25: they shared one id, one stayed)
	this.removeUnitToolTip = function(unitId: number) {
		const ids = [unitToolTipId(unitId, "ammo"), unitToolTipId(unitId, "fuel")];
		for (var i = UIBuilder.smallToolTipList.length - 1; i >= 0; i--) {
			var id = UIBuilder.smallToolTipList[i];
			if (ids.indexOf(id) >= 0)
				delTag($(id));
		}
	};

	//onlyUnits removes only the unit tooltips but the whole list is cleared anyway
	this.removeAllSmallToolTips = function(onlyUnits?: boolean) {
		for (var i = UIBuilder.smallToolTipList.length - 1; i >= 0; i--) {
			var id = UIBuilder.smallToolTipList[i];
			if (!onlyUnits || id.lastIndexOf("gsttu", 0) === 0)
				delTag($(id));
		}
		UIBuilder.smallToolTipList = [];
	};

	this.setNewScenario = function() {
		map = game.scenario.map;
		R.setNewMap(map);
		uiMapCacheImages();
		countries = map.getCountriesBySide(game.spotSide);
		UIBuilder.setEquipmentFlags(game.scenario.eqp);
		UIBuilder.setDefaultUserSelections(); //Remove previous user selections
		CombatLog.reset();
		makeHidden("combatLog");
		makeHidden("statusbar-extension");
		UIBuilder.closeDossier();
		game.ui.removeAllSmallToolTips();
		game.ui.addSmallToolTips();
		updateEquipmentWindow(unitClass.tank); //Refresh equipment window
		uiTurnInfo();
		uiShowDeploymentWindow();
		uiMessage(game.scenario.name, game.scenario.getDescription());
	};

	this.startMenuButton = function(id: string) {
		switch (id) {
			case "newgame": {
				makeVisible("smNewGame");
				break;
			}
			case "newcampaign": {
				makeHidden("smNewGame");
				makeHidden("smMain");
				makeVisible("smCamp");
				//Make the current campaign selected
				if (game.campaign === null) //Select first campaign in list
					setSelectOption($("smCampSel").firstChild as HTMLSelectElement, ($("smCampSel").firstChild as HTMLSelectElement).options[0].text);
				else //Select saved campaign
					setSelectOption($("smCampSel").firstChild as HTMLSelectElement, game.campaign.name);
				(($("smCampSel").firstChild as HTMLSelectElement).onchange as () => void)();
				break;
			}
			case "newscenario": {
				makeHidden("smNewGame");
				makeHidden("smMain");
				makeVisible("smScen");
				//Make the current scenario selected
				setSelectOption($("smScenSel").firstChild as HTMLSelectElement, game.scenario.name);
				break;
			}
			case "tutorial": {
				makeHidden("smMain");
				makeHidden("startmenu");
				game.campaign = null;
				uiSettings.noFOW = false;
				//Both sides are played by the tutorial script
				uiSettings.isAI[0] = 2;
				uiSettings.isAI[1] = 2;
				//The tutorial's script was planned and checked on the classic rules (#188)
				game.rules = "classic";
				game.newScenario(DEFAULT_SCENARIO);
				toggleButton($("options"), false);
				break;
			}
			case "continuegame": {
				makeHidden("startmenu");
				toggleButton($("options"), false);
				break;
			}
			case "saveload": {
				makeHidden("smMain");
				makeHidden("smNewGame");
				makeVisible("smState");
				break;
			}
			case "settings": {
				makeHidden("startmenu");
				makeHidden("smNewGame");
				makeVisible("smSettings");
				//Remember to bring the message back when settings close
				if (isVisible("ui-message")) {
					makeHidden("ui-message");
					$<SettingsMenuElement>("smSettings").messageHidden = true;
				}
			}
		}
	};

	this.mainMenuButton = function(this: UI, id: string) {
		switch (id) {
			case "air": {
				//Leaving air mode deselects an air unit
				if (uiSettings.airMode && GameRules.isAir(map.currentUnit))
					handleUnitDeselect();
				uiSettings.airMode = !uiSettings.airMode;
				toggleButton($("air"), uiSettings.airMode);
				R.render(); //Full page rendering
				break;
			}
			case "hex": {
				uiSettings.hexGrid = !uiSettings.hexGrid;
				toggleButton($("hex"), uiSettings.hexGrid);
				this.removeAllSmallToolTips();
				this.addSmallToolTips();
				R.render(); //Full page rendering
				break;
			}
			case "zoom": {
				uiToggleMapZoom();
				R.render(); //Full page rendering
				break;
			}
			case "inspectunit": {
				if (isVisible("unit-info")) {
					toggleUnitInfoWindow(false);
				} else {
					toggleUnitInfoWindow(true);
					if (map.currentUnit !== null) updateUnitInfoWindow(map.currentUnit);
				}
				break;
			}
			case "buy": {
				toggleUnitsAndEquipmentWindow(true);
				break;
			}
			case "endturn": {
				//Not while the player's move or attack plays: its finish takes the units it destroyed off the
				//map, and the turn's end would save them and hand the next player a map they still stand on (#58)
				if (game.waitUIAnimation)
					break;
				//The first click asks for confirmation until the button animation ends
				var endTurnButton = $("endturn");
				if (endTurnButton.getAttribute("confirmation") == null) {
					askEndTurnConfirmation(endTurnButton);
				} else {
					endTurnButton.innerHTML = "t";
					endTurnButton.removeAttribute("confirmation");
					if (isVisible("equipment")) {
						makeHidden("equipment");
						makeHidden("container-unitlist");
						uiSettings.deployMode = false;
						toggleButton($("buy"), false);
					}
					if (isVisible("unit-info"))
						toggleUnitInfoWindow(false);
					makeHidden("combatLog");
					if (!uiSettings.shownEndTurnTip) {
						makeHidden("uiToolTip");
						uiSettings.shownEndTurnTip = true;
						game.state.saveSettings();
					}
					if (map.currentPlayer.type == playerType.humanLocal) {
						//The log starts again before the next turn's start logs its resupplies and reinforcements (#86)
						CombatLog.reset();
						game.endTurn();
						if (game.gameEnded && game.gameStarted) {
							uiTurnLimitMessage();
						} else {
							countries = map.getCountriesBySide(game.spotSide);
							UIBuilder.setDefaultUserSelections();
							updateEquipmentWindow(unitClass.tank); //Refresh equipment window for the new player
							updateUnitContextWindow();
							uiEndTurnInfo();
							uiMapRenderAndSelectUnit();
						}
					}
				}
				break;
			}
			case "mainmenu": {
				if (isVisible("slidemenu")) {
					makeHidden("slidemenu");
					toggleButton($("mainmenu"), false);
				} else {
					makeVisible("slidemenu");
					toggleButton($("mainmenu"), true);
				}
				break;
			}
			case "options": {
				if (isVisible("startmenu")) {
					makeHidden("smMain");
					makeHidden("smScen");
					makeHidden("smSettings");
					makeHidden("smState");
					makeHidden("startmenu");
					toggleButton($("options"), false);
				} else {
					makeVisible("startmenu");
					makeVisible("smMain");
					toggleButton($("options"), true);
				}
				break;
			}
		}
	};

	this.toggleUnitsAndEquipmentWindow = toggleUnitsAndEquipmentWindow;

	//Equipment window buttons that can't be directly handled in UIBuilder
	this.equipmentWindowButtons = function(id: string) {
		var eqUnit: number, eqTransport: number, unitId: number, deployId: number, p: Player, u: Unit;
		switch (id) {
			case "changecountry": {
				if ($<EqSelCountryElement>("eqSelCountry").country >= countries.length - 1) $<EqSelCountryElement>("eqSelCountry").country = 0;
				else $<EqSelCountryElement>("eqSelCountry").country++;
				$<EqUserSelElement>("eqUserSel").userunit = -1; //Clear existing unit selection when changing country
				$<EqUserSelElement>("eqUserSel").equnit = -1;
				game.ui.updateEquipmentWindow($<EqUserSelElement>("eqUserSel").eqclass || unitClass.tank); //previous class or tank class
				break;
			}
			case "buy": {
				eqUnit = $<EqUserSelElement>("eqUserSel").equnit;
				eqTransport = $<EqUserSelElement>("eqUserSel").eqtransport;

				if (typeof eqUnit === "undefined" || eqUnit <= 0)
					break;

				if (typeof eqTransport === "undefined" || (eqTransport as number | string) == "")
					eqTransport = -1;

				Commands.execute(game.scenario, { type: "buy", eqid: eqUnit, transport: eqTransport });
				updateEquipmentWindow(Equipment.equipment[eqUnit].uclass);
				break;
			}
			case "upgrade": {
				unitId = $<EqUserSelElement>("eqUserSel").userunit; //real unit id on map
				deployId = $<EqUserSelElement>("eqUserSel").deployunit; //id for units on deployment list
				eqUnit = $<EqUserSelElement>("eqUserSel").equnit; //Can be undefined as we can only upgrade transport
				eqTransport = $<EqUserSelElement>("eqUserSel").eqtransport;
				p = map.currentPlayer;
				u = null;

				if (typeof eqTransport === "undefined" || (eqTransport as number | string) == "")
					eqTransport = -1;

				if (typeof unitId === "undefined" || unitId == -1) { //Upgrade an undeployed unit
					u = p.getCoreUnitList()[deployId];
					if (resultOf(Commands.execute(game.scenario, { type: "upgradeUndeployed", index: deployId, eqid: eqUnit,
						transport: eqTransport }), false))
						updateEquipmentWindow(Equipment.equipment[u.eqid].uclass);
				} else { //Upgrade a unit already on map
					if (resultOf(Commands.execute(game.scenario, { type: "upgrade", unit: unitId, eqid: eqUnit, transport: eqTransport }), false)) {
						R.cacheImages(function() { R.render(); }); //Need to cache new image
						if (eqUnit > 0) updateEquipmentWindow(Equipment.equipment[eqUnit].uclass);
					}
				}
				break;
			}
			case "sell": {
				p = map.currentPlayer;
				u = null;
				unitId = $<EqUserSelElement>("eqUserSel").userunit;
				deployId = $<EqUserSelElement>("eqUserSel").deployunit;
				eqUnit = $<EqUserSelElement>("eqUserSel").equnit;

				if (typeof unitId === "undefined" || unitId == -1) { //Sell an undeployed unit
					u = p.getCoreUnitList()[deployId];
					if (resultOf(Commands.execute(game.scenario, { type: "sell", index: deployId }), false)) {
						//The units after it in the core list moved up: the index named the sold one, now another or none (#208)
						$<EqUserSelElement>("eqUserSel").deployunit = -1;
						updateEquipmentWindow(Equipment.equipment[u.eqid].uclass);
					}
				} else { //Disband a unit on map
					if (resultOf(Commands.execute(game.scenario, { type: "disband", unit: unitId }), false)) {
						R.cacheImages(function() { R.render(); });
						$<EqUserSelElement>("eqUserSel").userunit = -1;
						if (eqUnit > 0) updateEquipmentWindow(Equipment.equipment[eqUnit].uclass);
					}
				}
			}
		}
	};

	this.updateEquipmentWindow = function(eqclass?: number) { return updateEquipmentWindow(eqclass); };

	//Called from game after AI/NET turn
	this.uiEndTurnInfo = function() {
		R.render(); //Full page render when changing player/side
		uiEndTurnInfo();
	};

	//Called from game when the AI's last turn ended the game (#256)
	this.uiTurnLimitMessage = uiTurnLimitMessage;

	//Centers unit on player screen
	this.uiSetUnitOnViewPort = function(unit: Unit | null) {
		if (!unit) return false;
		return uiSetCellOnViewPort(unit.getPos());
	};

	this.uiSetCellOnViewPort = function(cell: Cell | null) { return uiSetCellOnViewPort(cell); };

	this.scaleMap = function(level: number) { return uiScaleMap(level); };
} //End of UI class
