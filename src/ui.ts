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

function UI(game)
{
	var map = game.scenario.map;
	var R = new Render(map);
	var countries = map.getCountriesBySide(game.spotSide); //array for current side countries
	var contextButtons = {}; //unit context buttons shown for the current unit, for the keyboard shortcuts

	//redraw screen and center unit on screen when images have finished loading
	uiMapCacheImages();

	var canvas = R.getCursorCanvas();

	uiSettings.hasTouch = hasTouch();
	if (uiSettings.hasTouch)
	{
		uiSettings.showGridTerrain = true;
		if (hasBrokenScroll())
		{
			touchScroll("game");
			touchScroll("hscroll-unitlist");
			touchScroll("hscroll-eqUnitList");
			touchScroll("hscroll-eqTransportList");
		}
		UIBuilder.setLayoutConstrains(true);
	}
	else
	{
		addStyleSheet("scrollbars.css");
		canvas.addEventListener("mousemove", handleMouseMove, false);
		//Stop dragging the map
		window.addEventListener("mouseup", function(e) { curDown = false; }, false);
		window.addEventListener("keyup", handleKeyboard, false);
		window.onresize = function() { R.positionLayers(); };
	}

	canvas.addEventListener("mousedown", function(e)
	{
		if (!game.gameStarted || game.gameEnded)
			return false;

		var minfo = getMouseInfo(canvas, e);
		var cell = R.screenToCell(minfo.x, minfo.y);
		var row = cell.row;
		var col = cell.col;
		var selected = false; //a unit was selected, the status bar already shows its location

		//Start dragging the map
		if (!uiSettings.hasTouch)
		{
			curDown = true;
			curXPos = minfo.x;
			curYPos = minfo.y;
		}

		//Throws instead when the row is outside the map
		var hex = map.map[row][col];
		if (typeof hex === "undefined")
			return true; //handled

		if (uiSettings.strategicZoom)
		{
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
		if (minfo.rclick)
		{
			if (clickedUnit)
			{
				toggleUnitInfoWindow(true);
				updateUnitInfoWindow(clickedUnit);
			}
			else
			{
				handleUnitDeselect();
			}
			return true;
		}

		if (clickedUnit)
		{
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
						uiUnitMove(map.currentUnit, row, col);
					else
						if (map.currentUnit === clickedUnit) //Click on the selected unit deselects it
						{
							handleUnitDeselect();
							if (uiSettings.unitInfoVisibility)
								makeHidden("unit-info");
						}
						else
							selected = handleUnitSelect(row, col);
		}
		else //No unit on clicked hex
		{
			if (uiSettings.deployMode && hex.isDeployment > -1
					&& map.getPlayer(hex.isDeployment).side == map.currentPlayer.side)
				handleUnitDeployment(row, col); //Allow deployment on deployment hexes if on same side
			else
				//move to an empty allowed hex, currentUnit is checked for null after it's used
				if (hex.isMoveSel && !map.currentUnit.hasMoved && map.currentUnit !== null)
					uiUnitMove(map.currentUnit, row, col);
				else //remove current selection
				{
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
	UIBuilder.buildUnitInfoWindow();
	UIBuilder.buildEquipmentWindow();
	UIBuilder.buildEquipmentSortOptions();
	UIBuilder.setDefaultUserSelections();
	UIBuilder.setEquipmentFlags(game.scenario.eqp);

	uiTurnInfo();
	uiShowDeploymentWindow();
	updateEquipmentWindow(); //Update after making deploy/current unit list visible or it won't update
	uiMessage(game.scenario.name, game.scenario.getDescription());

function handleMouseMove(e)
{
	var minfo = getMouseInfo(canvas, e);
	var c = R.screenToCell(minfo.x, minfo.y);

	if (map.currentUnit != null && !uiSettings.strategicZoom) { R.drawCursor(c); }
	updateStatusBarLocation(c.row, c.col);
	$("game"); //unused
	//Drag the map
	if (curDown === true)
	{
		$("game").scrollLeft = curXPos - e.pageX;
		$("game").scrollTop = curYPos - e.pageY;
	}
}

//Keyboard shortcuts
function handleKeyboard(e)
{
	switch (e.code)
	{
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
	if (e.key == "Escape" || e.key == "Esc")
	{
		if (defined(map.currentUnit))
			handleUnitDeselect();
		else
			game.ui.mainMenuButton("options");
	}
}

//handle unit deployment
function handleUnitDeployment(row, col)
{
	var deployUnit = $("eqUserSel").deployunit;
	if (map.deployPlayerUnit(map.currentPlayer, deployUnit, row, col))
	{
		R.cacheImages(function() { R.render(row, col, 1); });
		handleUnitDeselect();
		updateEquipmentWindow($("eqUserSel").eqclass);
	}
}

//Deselects a previously selected unit. Can't have row,col as params since user can click or rightclick
//everywhere on empty terrain to deselect a unit
function handleUnitDeselect()
{
	if (map.currentUnit !== null)
	{
		var p = map.currentUnit.getPos();
		var r = getRenderRange(map.currentUnit);
		map.delCurrentUnit(); //deselect from map array before render
		R.render(p.row, p.col, r);
	}
}

//handle the selection of a new unit
function handleUnitSelect(row, col)
{
	if (map.currentPlayer.type != playerType.humanLocal)
		return false;

	var hex = map.map[row][col];
	var unit = hex.getUnit(uiSettings.airMode);

	if (unit == null || unit.player.id != map.currentPlayer.id) //Can't select units from other players
	{
		unit = hex.getUnit(!uiSettings.airMode); //try the other unit on hex
		if (unit == null || unit.player.id != map.currentPlayer.id)
			return false;
	}

	//Select unit on equipment window (can't be in uiUnitSelect because will loop in updateEquipmentWindow())
	$("eqUserSel").userunit = unit.id; //save selected player unit
	updateEquipmentWindow(unit.unitData(true).uclass);
	game.ui.removeUnitToolTip(unit.id);

	return uiUnitSelect(unit);
}

function uiUnitSelect(unit)
{
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

//handle the move of a unit to row,col destination
function uiUnitMove(unit, row, col)
{
	var mm = unit.unitData().movmethod;
	if (GameRules.isTrain(unit))
		mm = movMethod.tracked; //Trains use the tracked move sound
	//Save render properties before moving
	var r = getRenderRange(unit);
	var oldpos = unit.getPos();
	var mr = map.moveUnit(unit, row, col);

	var moveAnimationCBData =
	{
		unit: unit,
		moveResults: mr,
		cbfunc: uiMoveAnimationFinished
	};

	//No animation for moves the player can't see
	if (!mr.isVisible)
	{
		uiMoveAnimationFinished(moveAnimationCBData);
		return false;
	}

	soundData[moveSoundByMoveMethod[mm]].play();
	unit.hasAnimation = true; //signal render that unit is going to be move animated
	R.moveAnimation(moveAnimationCBData);
	R.render(oldpos.row, oldpos.col, r);

	return true;
}

//Called when move animation finishes
function uiMoveAnimationFinished(moveAnimationCBData)
{
	var mr = moveAnimationCBData.moveResults;
	var unit = moveAnimationCBData.unit;
	var r = getRenderRange(unit);
	var p = unit.getPos();

	R.render(p.row, p.col, r);

	if (unit.isSurprised)
	{
		var cell = mr.surpriseCell;
		uiShowAlert(cell.row, cell.col, "Surprised");
		handleUnitAttack(moveAnimationCBData.unit, cell.row, cell.col); //TODO select which unit has surprised (air / ground)
		unit.isSurprised = false; //When combat ends unit is no longer surprised
	}
	if (mr.isCapture)
		uiShowAlert(p.row, p.col, "Captured", unit.player.side == game.spotSide || game.spotSide == 2);
	if (mr.isVictorySide >= 0)
		uiMoveVictory(mr.isVictorySide);

	game.waitUIAnimation = false;
}

//A side has won by capturing all victory hexes (or by destroying all the enemy units)
function uiMoveVictory(side)
{
	var victoryType = game.scenario.checkVictory();
	if (game.campaign !== null)
	{
		if (game.getCampaignPlayer().side == side)
			game.continueCampaign(victoryType, endGameType.moveCapture);
		else
			game.continueCampaign("lose", endGameType.moveCapture);
	}
	else
	{
		var title, text;
		if (map.currentPlayer.type != playerType.humanLocal)
		{
			title = "DEFEAT";
			text = "You have lost ! Your enemy ";
		}
		else
		{
			title = outcomeNames[victoryType];
			text = "You have won this scenario ! ";
		}
		uiMessage(title, "<br/><br/><br/><br/>" + text + map.currentPlayer.getCountryName() + " on "
			+ sideNames[side] + " side wins by capturing all victory hexes with a final score of <b>"
			+ map.currentPlayer.score + "</b>. ", function() { game.ui.mainMenuButton("options"); });

		game.gameEnded = true;
	}
}

//handle attack performed by attacking unit on row,col unit
function handleUnitAttack(attackingUnit, row, col)
{
	var hex = map.map[row][col];
	var enemyUnit = null;
	if ((enemyUnit = hex.getAttackableUnit(attackingUnit, uiSettings.airMode)) !== null) //Select which unit to attack depending on uiSettings.airMode
		return uiUnitAttack(attackingUnit, enemyUnit);
	return false;
}

//TODO most of the code here pertaining to support fire should be moved to map object
function uiUnitAttack(attackingUnit, enemyUnit)
{
	var renderRange = 7; //biggest attack range including support fire
	var cpos = attackingUnit.getPos();
	var epos = enemyUnit.getPos();
	if (!cpos || !epos)
		return false; //No attacking or defending unit, skipping attack

	var row = epos.row;
	var col = epos.col;
	var cclass = attackingUnit.unitData().uclass;
	var eclass = enemyUnit.unitData().uclass;
	var attackStopped = false;
	var animationCBData =
	{
		attacking: { unit: attackingUnit, cell: cpos, oldstr: attackingUnit.strength, newstr: 0, leaderGain: false, attackStopped: false },
		defending: { unit: enemyUnit, cell: epos, oldstr: enemyUnit.strength, newstr: 0, leaderGain: false },
		cbfunc: uiAttackAnimationFinished
	};

	UIBuilder.showAttackInfo(attackingUnit, enemyUnit); //Show info on status bar

	var cr = GameRules.calculateAttackResults(attackingUnit, enemyUnit, true);
	//Support Fire if attacking unit wasn't surprised and doesn't overrun
	if (!attackingUnit.isSurprised && !cr.isOverrun)
	{
		var supportUnits = GameRules.getSupportFireUnits(map.getUnits(), attackingUnit, enemyUnit);
		for (var u in supportUnits)
		{
			var sp = supportUnits[u].getPos();
			var sclass = supportUnits[u].unitData().uclass;
			if (attackingUnit.destroyed)
				break;
			map.attackUnit(supportUnits[u], attackingUnit, true);
			R.addAnimation(sp.row, sp.col, attackAnimationByClass[sclass], supportUnits[u].facing); //Hits by supporting units
		}
	}
	//The support fire losses can stop the attack
	attackStopped = GameRules.isLossOverRetreatThreshold(attackingUnit.strength, animationCBData.attacking.oldstr);
	if (!attackingUnit.destroyed && !attackStopped) //Can we still attack ?
	{
		cr = map.attackUnit(attackingUnit, enemyUnit, false, cr.isOverrun); //Only attack an enemy unit on that hex
		if (cr.isOverrun)
		{
			uiShowAlert(epos.row - 0.2, epos.col - 0.6, "OverRun ", true);
			renderRange = 1;
		}
		if (cr.isRugged && !cr.isOverrun)
			uiShowAlert(epos.row - 0.2, epos.col - 0.6, "Rugged Defense ", false);

		R.addAnimation(cpos.row, cpos.col, attackAnimationByClass[cclass], attackingUnit.facing);

		if (!enemyUnit.destroyed && cr.defcanfire)
			R.addAnimation(row, col, attackAnimationByClass[eclass], enemyUnit.facing); //Hits to the unit being attacked

		animationCBData.attacking.leaderGain = cr.atkLeaderGain;
		animationCBData.defending.leaderGain = cr.defLeaderGain;
	}
	if (attackStopped)
	{
		animationCBData.attacking.attackStopped = true;
		attackingUnit.hasFired = true;
	}
	//Render so new unit facings are shown correctly
	R.render(cpos.row, cpos.col, renderRange);
	//Show the AI combats on map
	if (uiSettings.markCombatUnits && map.currentPlayer.type == playerType.aiLocal)
	{
		R.drawHexByCell(cpos, hexstyle.combat);
		R.drawHexByCell(epos, hexstyle.combat);
	}
	R.runAnimation(animationCBData);
	animationCBData.attacking.newstr = attackingUnit.strength;
	animationCBData.defending.newstr = enemyUnit.strength;
	return true;
}

//Called when attack animation finishes
function uiAttackAnimationFinished(animationCBData)
{
	var aloss, dloss, tmp, rpos, mr, moveAnimationCBData;
	var refreshRender = false;

	var a = animationCBData.attacking;
	var d = animationCBData.defending;
	var renderRange = GameRules.getUnitAttackRange(a.unit);
	var aDestroyed = false;
	var dDestroyed = false;

	aloss = a.oldstr - a.newstr;
	if (aloss > 0 && aloss < a.oldstr)
		uiShowAlert(a.cell.row, a.cell.col, -aloss);

	dloss = d.oldstr - d.newstr;
	if (dloss > 0 && dloss < d.oldstr)
		uiShowAlert(d.cell.row, d.cell.col, -dloss);

	//Do explosion animation along with deleting units from map and refreshing selection
	if (aloss >= a.oldstr)
	{
		aDestroyed = true;
		R.addAnimation(a.cell.row, a.cell.col, "explosion");
		R.runAnimation(null);
	}

	if (dloss >= d.oldstr)
	{
		dDestroyed = true;
		R.addAnimation(d.cell.row, d.cell.col, "explosion");
		R.runAnimation(null);
	}

	if (aDestroyed || dDestroyed) //Cleanup dead units
	{
		map.updateUnitList();
		refreshRender = true;
	}

	//Refresh map selections
	if (map.currentUnit)
	{
		if (a.unit.destroyed && map.currentUnit.id == a.unit.id)
		{
			map.delCurrentUnit(); //remove current selection if unit was destroyed in attack
			R.drawCursor(a.cell); //refresh cursor or it gets stuck in attack cursor
		}
		else
		{
			map.selectUnit(map.currentUnit);
		}
		//refresh move range if unit has destroyed another unit, currentUnit can be null by now
		if (d.unit.destroyed && !map.currentUnit.hasMoved)
		{
			map.setMoveRange(map.currentUnit);
			tmp = getRenderRange(map.currentUnit);
			if (tmp > renderRange) renderRange = tmp;
		}
	}

	if (a.attackStopped)
		uiShowAlert(a.cell.row - 0.2, a.cell.col - 0.6, "Attack Stopped ", false);

	if (!aDestroyed && a.leaderGain && a.unit.player.side == game.spotSide)
		uiShowAlert(a.cell.row - 0.2, a.cell.col - 0.6, "New Leader", true);

	if (!dDestroyed && d.leaderGain && d.unit.player.side == game.spotSide)
		uiShowAlert(d.cell.row - 0.2, d.cell.col - 0.6, "New Leader", true);

	//Defender retreats on big losses or surrenders when it has nowhere to go
	if (!dDestroyed && GameRules.shouldDefenderRetreat(a.unit, d.unit, d.oldstr))
	{
		refreshRender = true;
		if ((rpos = GameRules.getRetreatPosition(map.map, d.unit, map.rows, map.cols)))
		{
			uiShowAlert(rpos.row - 0.2, rpos.col - 0.6, "Retreat ", false);
			mr = map.retreatUnit(d.unit, rpos);
			moveAnimationCBData = { unit: d.unit, moveResults: mr, cbfunc: uiMoveAnimationFinished };
			d.unit.hasAnimation = true;
			R.moveAnimation(moveAnimationCBData);
		}
		else
		{
			uiShowAlert(d.cell.row - 0.2, d.cell.col - 0.6, "Surrender ", false);
			d.unit.destroyed = true;
			map.updateUnitList();
			R.addAnimation(d.cell.row, d.cell.col, "explosion");
			R.runAnimation(null);
		}
	}

	//A side without units left loses
	if (!map.hasAliveUnits(playerSide.axis))
		uiMoveVictory(playerSide.allies);
	if (!map.hasAliveUnits(playerSide.allies))
		uiMoveVictory(playerSide.axis);

	if (refreshRender)
		R.render(a.cell.row, a.cell.col, renderRange);

	game.waitUIAnimation = false;
	uiTurnInfo();
}

//Bouncing text over a map hex
function uiShowAlert(row, col, text, positive)
{
	var pos = R.cellToScreen(row, col, true); //return absolute(window) values
	if (typeof positive === "undefined")
		positive = false;
	bounceText(pos.x, pos.y, text, positive);
}

//Shows or hides the unit list, with the equipment window when withEquipment
function toggleUnitsAndEquipmentWindow(withEquipment)
{
	if (map.currentPlayer.type != playerType.humanLocal)
		return;

	if (withEquipment ? isVisible("equipment") : isVisible("container-unitlist"))
	{
		makeHidden("equipment");
		makeHidden("container-unitlist");
		makeHidden("unitsBarButton");
		uiSettings.deployMode = false;
		toggleButton($("buy"), false);
		uiTurnInfo(); //Write back the turn info since we change the info when we open equipment window
	}
	else
	{
		toggleUnitInfoWindow(true);
		makeVisible("container-unitlist");
		if (withEquipment)
		{
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

function updateUnitContextWindow(u)
{
	var div;
	var nbuttons = 0;
	contextButtons = {};
	clearTag("unit-context");

	if (u && u.player && u.player.id == map.currentPlayer.id)
	{
		if (GameRules.canMount(u))
		{
			nbuttons++;
			div = addTag("unit-context", "div");
			div.className = "smallButtonSubMenu";
			div.innerHTML = UIBuilder.unitContextButtons.mount;
			div.title = "Mount/Umount this unit in/from a transport";
			div.onclick = function() { unitContextButton("mount", u); };
			contextButtons.mount = true;
		}

		if (GameRules.canEmbark(map.map, u) || GameRules.canDisembark(map.map, u))
		{
			nbuttons++;
			div = addTag("unit-context", "div");
			div.className = "smallButtonSubMenu";
			div.innerHTML = UIBuilder.unitContextButtons.embark;
			div.title = "Embark/DisEmbark this unit in/from a air/naval transport";
			div.onclick = function() { unitContextButton("embark", u); };
			contextButtons.embark = true;
		}

		if (GameRules.canResupply(map.map, u))
		{
			nbuttons++;
			div = addTag("unit-context", "div");
			div.className = "smallButtonSubMenu";
			div.innerHTML = UIBuilder.unitContextButtons.resupply;
			div.title = "Resupply Ammo and Fuel for this unit";
			div.onclick = function() { unitContextButton("resupply", u); };
			contextButtons.resupply = true;
		}

		if (map.currentPlayer.prestige >= GameRules.calculateUnitCostPerStrength(u))
		{
			if (GameRules.canReinforce(map.map, u, false))
			{
				nbuttons++;
				div = addTag("unit-context", "div");
				div.className = "smallButtonSubMenu";
				div.innerHTML = UIBuilder.unitContextButtons.reinforce;
				div.title = "Reinforce unit strength";
				div.onclick = function() { unitContextButton("reinforce", u); };
				contextButtons.reinforce = true;
			}
			if (GameRules.canReinforce(map.map, u, true))
			{
				nbuttons++;
				div = addTag("unit-context", "div");
				div.className = "smallButtonSubMenu";
				div.innerHTML = UIBuilder.unitContextButtons.overstrength;
				div.title = "Overstrength unit";
				div.onclick = function() { unitContextButton("overstrength", u); };
				contextButtons.overstrength = true;
			}
		}

		if (map.canUndoMove(u))
		{
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
	}
	else
	{
		makeHidden("unit-context");
	}
}

//Updates the unit stats info window
function updateUnitInfoWindow(u)
{
	var isEqUnit = false;
	var uinfo, ammo, fuel = "-", exp = 0, ent = 0, ordinal = "";

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
	if (typeof u.unitData === "undefined")
	{
		isEqUnit = true;
		uinfo = u;
		u.flag = u.country;
		u.strength = 10;
		ammo = u.ammo;
		if (u.fuel != 0)
			fuel = u.fuel;
		exp = ent = 0;
	}
	else
	{
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

	if (ammo < uinfo.ammo / 4) ammo = "<span style='color: #FF6347'>" + ammo + "</span>";
	if (fuel < uinfo.fuel / 4) fuel = "<span style='color: #FF6347'>" + fuel + "</span>";
	if (uinfo.gunrange == 0) uinfo.gunrange = 1; //Changes the equipment data

	$("uImage").style.backgroundImage = "url(" + uinfo.icon + ")";
	$("uSmallFlag").style.backgroundPosition = "" + (u.flag - 1) * -21 + "px 0px";
	$("uFlag").style.backgroundImage = "url('resources/ui/flags/" + Equipment.name + "/flag_big_" + u.flag + ".png')";
	$("uFlag").textContent = Equipment.getCountryName(u.flag - 1);
	$("uName").textContent = ordinal + " " + uinfo.name + " " + unitClassNames[uinfo.uclass];

	if (!isEqUnit)
	{
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
	$("uFuel").innerHTML = fuel;
	$("uAmmo").innerHTML = ammo;
	$("uGunRange").textContent = uinfo.gunrange;
	$("uMovement").textContent = uinfo.movpoints;

	$("uExp").textContent = exp;
	$("uEnt").textContent = ent;
	$("uIni").textContent = uinfo.initiative;
	$("uSpot").textContent = uinfo.spotrange;

	$("uAHard").textContent = uinfo.hardatk;
	$("uASoft").textContent = uinfo.softatk;
	$("uAAir").textContent = uinfo.airatk;
	$("uANaval").textContent = uinfo.navalatk;

	$("uDHard").textContent = uinfo.grounddef;
	$("uDAir").textContent = uinfo.airdef;
	$("uDClose").textContent = uinfo.closedef;
	$("uDRange").textContent = uinfo.rangedefmod;

	if (isEqUnit) return;

	//Button to see the carrier properties, throws for a negative (temporarily disembarked) carrier
	if (u.carrier != 0)
	{
		$("uCarrier").className = "smallButtonSubMenu";
		$("uCarrier").innerHTML = "2";
		$("uCarrier").onclick = function() { updateUnitInfoWindow(Equipment.equipment[u.carrier]); };
	}

	//Add button to see transport/unit properties depending on unit state
	if (u.transport)
	{
		var simulateMount;

		$("uTransport").className = "smallButtonSubMenu";
		if (u.isMounted)
		{
			$("uTransport").innerHTML = "9";
			simulateMount = false;
		}
		else
		{
			$("uTransport").innerHTML = "8";
			simulateMount = true;
		}

		$("uTransport").onclick = function()
		{
			var s = u.isMounted;
			u.isMounted = simulateMount;
			updateUnitInfoWindow(u);
			u.isMounted = s;
		};
	}

	//Button to toggle the leader description over the unit stats
	if (u.leader > -1)
	{
		$("uLeader").className = "smallButtonSubMenu";
		$("uLeader").textContent = "z";
		$("uLeader").onclick = function()
		{
			if ($("leaderInfo") !== null)
			{
				updateUnitInfoWindow(u);
			}
			else
			{
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
	if (u.player.side === game.spotSide)
	{
		$("uNext").className = "smallButtonSubMenu";
		$("uNext").style.fontSize = "16px";
		$("uNext").innerHTML = "y";
		$("uNext").onclick = function() { selectNeighbourUnit(u, 1, true); };
	}
}

function toggleUnitInfoWindow(visible)
{
	if (visible)
		makeVisible("unit-info");
	else
		makeHidden("unit-info");
	uiSettings.unitInfoVisibility = visible;
	toggleButton($("inspectunit"), visible);
}

//Selects the next (direction 1) or previous unit of the unit's player and brings it into view
function selectNeighbourUnit(unit, direction, onlyNotMoved)
{
	var u = map.getUnitNeighbor(unit, direction, onlyNotMoved);
	uiUnitSelect(u);
	if (u) uiSetCellOnViewPort(u.getPos());
	updateUnitInfoWindow(u);
}

function unitContextButton(action, unit)
{
	//Remember the render range and position of unit before actions
	var r = getRenderRange(unit);
	var p = unit.getPos();
	var refreshRender = false; //If a unit gets a new range after action
	var overstrength = false;
	var ret, pos, text;

	switch (action)
	{
		case "mount": //Can get a bigger range on mount
		{
			if (unit.isMounted)
				map.unmountUnit(unit);
			else
				map.mountUnit(unit);
			refreshRender = true;
			break;
		}
		case "embark":
		{
			if (unit.carrier > 0)
			{
				map.disembarkUnit(unit);
				refreshRender = true;
			}
			else
			{
				if (map.embarkUnit(unit))
					refreshRender = true;
			}
			break;
		}
		case "resupply": //same location same range
		{
			ret = map.resupplyUnit(unit);
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
		case "overstrength":
			overstrength = true;
			//falls through
		case "reinforce": //same location same range
		{
			//the result takes the render range variable, the old range is lost
			r = map.reinforceUnit(unit, overstrength);
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
		case "undo": //new location different range
		{
			map.undoLastMove();
			refreshRender = true;
			break;
		}
	}
	updateUnitContextWindow(unit);
	updateUnitInfoWindow(unit);
	R.render(p.row, p.col, r); //remove old range
	if (refreshRender)
	{
		r = getRenderRange(unit); //probably different range
		p = unit.getPos(); //undoLastMove changes location
		R.render(p.row, p.col, r); //render new range changes
	}
}

function updateEquipmentWindow(eqclass)
{
	if (!isVisible("container-unitlist"))
		return;

	//Don't show AI/others unit lists
	if (map.currentPlayer.side !== game.spotSide)
		return;

	//Remove older entries
	clearTag("unitlist");
	clearTag("eqUnitList");
	clearTag("eqTransportList");

	//The current selected coutry in the div
	var c = $("eqSelCountry").country;
	var country = +countries[c] + 1; //country id that is saved on unit data starts from 1

	$("eqSelCountry").style.backgroundPosition = "" + countries[c] * -21 + "px 0px"; //Update flag

	var scenarioYear = game.scenario.date.getFullYear();
	var unitList = [];
	var forcedScroll, eqForcedScroll;
	var u, ud, userUnitSelected, div, i;
	var eqUnitList, eqUnitSelected, eqTransportSelected, sortOrder, sortProperty, eqid, eu, t, tdiv;
	var hasTransportSelected;

	var oldDeployMode = uiSettings.deployMode;

	if (map.currentPlayer.hasUndeployedUnits())
	{
		//The units that current player hasn't deployed yet
		userUnitSelected = $("eqUserSel").deployunit;
		unitList = map.currentPlayer.getCoreUnitList();
		unitList.sort(unitListSorter(false)); //Sorts the player core unit list itself
		uiSettings.deployMode = true;
		$("statusmsg").innerHTML = "Deploy (on map grey hexes) or upgrade your core units";
	}
	else
	{
		//The actual units on the map
		userUnitSelected = $("eqUserSel").userunit;
		unitList = map.getUnits();
		unitList.sort(unitListSorter(true));
		uiSettings.deployMode = false;
		$("statusmsg").innerHTML = "Units currently deployed on map.";
	}
	UIBuilder.setDeployOrCombatLogState(uiSettings.deployMode);

	if (oldDeployMode !== uiSettings.deployMode) //Check if we should refresh canvas for new mode
		R.render(); //Full canvas render

	//All units deployed, close the deployment unit list
	if (oldDeployMode == true && uiSettings.deployMode == false)
		toggleUnitsAndEquipmentWindow(false);

	for (i = 0; i < unitList.length; i++)
	{
		u = unitList[i];

		if ((uiSettings.deployMode && u.isDeployed) || !u || u.player.id != map.currentPlayer.id)
			continue;

		ud = u.unitData(true);
		div = uiAddUnitBox("unitlist", u);

		//Make a default selection for deployment mode so we don't have to click each time we deploy.
		if (uiSettings.deployMode && (userUnitSelected == -1 || unitList[userUnitSelected].isDeployed))
			$("eqUserSel").deployunit = userUnitSelected = i;

		if (uiSettings.deployMode)
			div.unitid = i;
		else
			div.unitid = u.id;

		div.uniteqid = u.eqid;
		div.eqclass = ud.uclass;
		div.country = ud.country - 1;

		if (u.isCore && div.unitid != userUnitSelected)
			div.setAttribute("coreUnit", ud.name); //apply the [coreUnit] style when not selected

		if (div.unitid == userUnitSelected)
		{
			//Automatically set transport on transport list if user has not selected a new transport
			//Check if user selected equipment unit for upgrade can be transported
			if (u.transport !== null && $("eqUserSel").eqtransport == -1
				&& ($("eqUserSel").equnit == -1 || GameRules.isTransportable($("eqUserSel").equnit)))
				$("eqUserSel").eqtransport = u.transport.eqid;

			div.setAttribute("selectedUnit", ud.name); //apply the .eqUnitBox[selectedUnit] css style to make unit appear selected

			if (!uiSettings.deployMode) //Not on map
			{
				uiUnitSelect(u);
				if (u) uiSetCellOnViewPort(u.getPos()); //bring the unit into map view
				eqclass = ud.uclass; //Force unit class for equipment display
			}
			//This unit will be the last in div since the div is being built and we can use offsetWidth of the
			//containing div to get offset from the position 0. This value will be used to scroll the div when
			//a unit is selected from the map not from the unit list ui div
			forcedScroll = $("unitlist").offsetWidth - ($("container-unitlist").offsetWidth + div.offsetWidth) / 2;
		}

		div.onclick = function()
		{
			c = map.getCountriesBySide(game.spotSide);
			for (i = 0; i < c.length; i++)
				if (c[i] == this.country) break;

			if (uiSettings.deployMode)
			{
				$("eqUserSel").deployunit = this.unitid; //save selected player unit for deployment
				$("eqUserSel").userunit = -1; //clear any remaining selection
			}
			else
			{
				$("eqUserSel").userunit = this.unitid; //save selected player unit
				$("eqUserSel").deployunit = -1; //clear any remaining selection
			}

			$("eqSelCountry").country = i;
			$("eqUserSel").eqtransport = -1; //clear transport selection on new unit selection
			$("eqUserSel").equnit = this.uniteqid; //the unit own equipment is selected
			$("eqUserSel").unitscroll = $("hscroll-unitlist").scrollLeft; //save scroll position so at refresh we autoscroll

			var unit;
			if (uiSettings.deployMode)
				unit = map.currentPlayer.getCoreUnitList()[this.unitid];
			else
				unit = map.getUnitById(this.unitid);
			updateUnitInfoWindow(unit);
			updateEquipmentWindow(this.eqclass);
			$("hscroll-unitlist").scrollLeft = $("eqUserSel").unitscroll; //scroll to the selected unit
		};
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
	var prevClass = $("eqUserSel").eqclass || unitClass.tank;
	if (typeof UIBuilder.eqClassButtons[prevClass] !== "undefined")
		toggleButton($("eqclass-" + prevClass), false);
	if (typeof UIBuilder.eqClassButtons[eqclass] !== "undefined")
		toggleButton($("eqclass-" + eqclass), true);
	$("eqUserSel").eqclass = eqclass;

	//Info text above
	$("eqInfoText").innerHTML = scenarioYear + " " + unitClassNames[eqclass] + " upgrades for " + Equipment.getCountryName(country - 1);
	//Units in equipment
	eqUnitSelected = $("eqUserSel").equnit;
	sortOrder = $("eqUserSel").sortorder;
	sortProperty = $("eqUserSel").sortproperty || "cost";
	eqUnitList = Equipment.getCountryEquipmentByClass(eqclass, country, sortProperty, sortOrder);

	for (i = 0; i < eqUnitList.length; i++)
	{
		eqid = eqUnitList[i];
		eu = Equipment.equipment[eqid];

		if (eu.yearavailable > scenarioYear || eu.yearexpired < scenarioYear)
			continue;

		//Add the unit to the list
		div = uiAddUnitBox("eqUnitList", eu);
		div.equnitid = eqid;
		if (eqid == eqUnitSelected)
		{
			div.setAttribute("selectedUnit", eqid); //apply the .eqUnitBox[selectedUnit] css style to make unit appear selected
			eqForcedScroll = $("eqUnitList").offsetWidth - ($("hscroll-eqUnitList").offsetWidth + div.offsetWidth) / 2;
		}
		div.onclick = function()
		{
			$("eqUserSel").equnit = this.equnitid; //save the selected unit in the equipment list
			$("eqUserSel").eqtransport = -1; //clear transport selection on new unit selection
			$("eqUserSel").eqscroll = $("hscroll-eqUnitList").scrollLeft; //save scroll position so at refresh we autoscroll
			updateUnitInfoWindow(Equipment.equipment[this.equnitid]);
			updateEquipmentWindow(eqclass); //To "unselect" previous selected unit
			$("hscroll-eqUnitList").scrollLeft = $("eqUserSel").eqscroll; //scroll to the selected unit
		};
	}
	if (eqUnitSelected > 0)
		$("hscroll-eqUnitList").scrollLeft = eqForcedScroll;

	//Add the transport to the list if unit can be transported
	eqTransportSelected = $("eqUserSel").eqtransport;
	hasTransportSelected = false;
	if (GameRules.isTransportable(eqUnitSelected) || eqTransportSelected > 0)
	{
		eu = Equipment.equipment[eqUnitSelected];
		eqUnitList = Equipment.getCountryEquipmentByClass(unitClass.groundTransport, country, sortProperty, sortOrder);

		for (i = 0; i < eqUnitList.length; i++)
		{
			eqid = eqUnitList[i];
			t = Equipment.equipment[eqid];

			//Only the transports that can carry the unit weight
			if (t.yearavailable > scenarioYear || t.yearexpired < scenarioYear || !eu
				|| (eu.groundweight & t.groundweight) == 0)
				continue;

			tdiv = uiAddUnitBox("eqTransportList", t);
			tdiv.eqtransportid = eqid;
			if (eqid == eqTransportSelected)
			{
				tdiv.setAttribute("selectedUnit", t.name); //apply the .eqUnitBox[selectedUnit] css style to make unit appear selected
				hasTransportSelected = true;
			}
			tdiv.onclick = function()
			{
				//handle deselect of transport, -2 is no transport
				if ($("eqUserSel").eqtransport == this.eqtransportid)
					$("eqUserSel").eqtransport = -2;
				else
					$("eqUserSel").eqtransport = this.eqtransportid; //save the selected unit in the equipment list
				updateUnitInfoWindow(Equipment.equipment[this.eqtransportid]);
				updateEquipmentWindow(eqclass); //To "unselect" previous selected unit
			};
		}
		if (!hasTransportSelected) //the selected transport can't carry the unit
			$("eqUserSel").eqtransport = -1;
	}
	updateEquipmentCosts();
}

//Sorts units by class, name and id, with the core units first when coreFirst
function unitListSorter(coreFirst)
{
	return function(a, b)
	{
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

//Updates the costs of user selected units in equipment window
function updateEquipmentCosts()
{
	var userUnitSelected = $("eqUserSel").userunit; //unit already on map
	var deployUnitSelected = $("eqUserSel").deployunit; //unit no deployed on map
	var eqUnitSelected = $("eqUserSel").equnit;
	var eqTransportSelected = $("eqUserSel").eqtransport;
	var buyCost = 0;
	var upCost = 0;
	var sellCost = 0;
	var prestige = map.currentPlayer.prestige;
	var unit = null;
	var scenarioYear = game.scenario.date.getFullYear();
	var uclass, ucountry, eqclass, eqcountry;

	if (deployUnitSelected == -1 || typeof deployUnitSelected === "undefined")
		unit = map.getUnitById(userUnitSelected);
	else
		unit = map.currentPlayer.getCoreUnitList()[deployUnitSelected];

	if (typeof unit !== "undefined" && unit !== null)
	{
		uclass = unit.unitData(true).uclass;
		ucountry = unit.unitData(true).country - 1;
		if (uclass == unitClass.flak) uclass = unitClass.airDefence;
		//Can only upgrade to the same class and country
		if (eqUnitSelected > 0 && typeof eqUnitSelected !== "undefined")
		{
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
	if (eqUnitSelected != -1)
	{
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

	UIBuilder.showEquipmentCosts(prestige, buyCost, upCost, sellCost);
}

function updateStatusBarLocation(row, col)
{
	var unit;
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
			|| unit.player.side == map.currentPlayer.side))
	{
		unitText = " Unit: " + unit.unitData(true).name + " ";
	}

	//Shorten the hex or the unit name to fit the status bar
	if (name.length + unitText.length > 30)
	{
		if (name.length > 15)
			name = name.slice(0, 10) + "... ";
		else
			unitText = unitText.slice(0, 20) + " ";
	}

	$("locmsg").innerHTML = unitText + name + transports + text;

	return true;
}

//Simple function to list a unit (or an equipment entry with its price) in a graphical unit box returns a DOM object
function uiAddUnitBox(parentTagName, u)
{
	var div = addTag(parentTagName, "div");
	var img = addTag(div, "img");
	var txt = addTag(div, "div");
	var icons = addTag(div, "div");

	div.className = "eqUnitBox";
	if (typeof u.unitData !== "undefined")
	{
		var ud = u.unitData(true);
		//Naval units have a generic icon on the unit list
		if (ud.uclass > unitClass.submarine)
		{
			var nd = {};
			nd.name = ud.name;
			nd.icon = UIBuilder.navalReplacementIcon;
			nd.cost = ud.cost;
			ud = nd;
		}
		var status = "";
		img.src = ud.icon;
		txt.textContent = ud.name;
		if (u.isDeployed)
		{
			//Can fire, can move, low fuel or ammo icons
			icons.className = "eqUnitBoxIconsMenu";
			if (!u.hasFired) status += ">";
			if (!u.hasMoved) status += "|";
			if ((GameRules.unitUsesFuel(u) && u.fuel < 5) || u.ammo < 2)
				status += ";";
		}
		else
		{
			icons.className = "eqUnitBoxIcons";
			status = "Z"; //Not deployed icon
		}
		icons.textContent = status;
	}
	else
	{
		img.src = u.icon;
		txt.textContent = u.name;
		icons.innerHTML += "<b>" + u.cost * CURRENCY_MULTIPLIER + UIBuilder.currencyIcon + "</b>";
	}
	return div;
}

//Shows turn info on the status bar and the combat log or the AI status at a new turn
function uiEndTurnInfo()
{
	makeHidden("statusbar-extension");
	$("statusbar-extension").style.top = "25px";
	$("statusbar-extension").className = "";

	var p = map.currentPlayer;
	uiTurnInfo();
	if (p.type == playerType.humanLocal || p.type == playerType.aiScripted)
	{
		UICombatLog.toggleCombatLog(true, false);
		game.ui.removeAllSmallToolTips(true);
		game.ui.addSmallToolTips(true);
	}
	else
	{
		UIBuilder.showAIStatus(true);
	}
}

//Show turn info status bar messaage
function uiTurnInfo()
{
	clearTag($("statusmsg"));
	$("statusmsg").innerHTML = "&nbsp; " + map.currentPlayer.getCountryName() + " Turn: " + map.turn + "/" + map.maxTurns + " " + game.scenario.name;
	$("weathermsg").innerHTML = groundFontEncoding[game.scenario.ground] + weatherFontEncoding[game.scenario.atmosferic];
	$("weathermsg").title = groundConditionNames[game.scenario.ground] + " ground and "
				+ weatherConditionNames[game.scenario.atmosferic] + " weather";
}

function uiMessage(title, message, cbfunc) { UIBuilder.message(title, message, cbfunc); }

//Centers the screen on a map cell
function uiSetCellOnViewPort(cell)
{
	if (!cell || typeof cell === "undefined")
		return false;

	var pos = R.cellToScreen(cell.row, cell.col, true); //return absolute(window) values
	$("game").scrollLeft = pos.x - window.innerWidth / 2;
	$("game").scrollTop = pos.y - window.innerHeight / 2;
	return true;
}

function getMouseInfo(canvas, e)
{
	var rclick;
	var vp = $("game");
	if (e.which) rclick = (e.which == 3);
	else if (e.button) rclick = (e.button == 2);

	return new mouseInfo(e.pageX - canvas.offsetLeft - vp.clientLeft - vp.offsetLeft + vp.scrollLeft,
		e.pageY - canvas.offsetTop - vp.clientTop - vp.offsetTop + vp.scrollTop, rclick);
}

function uiMapRenderAndSelectUnit()
{
	R.render(); //Full page rendering
	//select the first available ground unit for the current side
	if (map.currentPlayer.type == playerType.humanLocal)
	{
		var unitList = map.getUnits();
		for (var i = 0; i < unitList.length; i++)
		{
			if (unitList[i].player.id == map.currentPlayer.id
				&& unitList[i].unitData().uclass != unitClass.fighter
				&& unitList[i].unitData().uclass != unitClass.levelBomber
				&& unitList[i].unitData().uclass != unitClass.tacticalBomber)
			{
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

function uiMapCacheImages()
{
	if (hasBrokenClearRect())
		R.cacheImages(function() { window.setTimeout(uiMapRenderAndSelectUnit, 4000); }); //Broken canvas clearRect workaround
	else
		R.cacheImages(uiMapRenderAndSelectUnit);
}

//Returns the biggest range around a unit that should be rendered
function getRenderRange(unit)
{
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
function uiShowDeploymentWindow()
{
	var p = map.currentPlayer;
	if (!p.hasUndeployedUnits() || p.type != playerType.humanLocal)
		return false;

	makeVisible("container-unitlist");
	findHex:
	for (var row = 0; row < map.rows; row++)
	{
		for (var col = 0; col < map.cols; col++)
		{
			var hex = map.map[row][col];
			if (hex && hex.isDeployment != -1 && hex.isDeployment == map.currentPlayer.id)
			{
				uiSetCellOnViewPort({ row: row, col: col });
				break findHex;
			}
		}
	}
	toggleButton($("buy"), true);
	return true;
}

//Strategic zoom: scales the whole map to fit the window
function uiToggleMapZoom()
{
	var vp = $("game");
	var zoom = Math.min(window.innerWidth / (canvas.width * uiSettings.zoomLevel) * 100,
		window.innerHeight / (canvas.height * uiSettings.zoomLevel) * 100) >> 0;
	var transform;

	if (uiSettings.strategicZoom)
	{
		vp.style.width = window.innerWidth + "px";
		vp.style.height = window.innerHeight + "px";
		if (NATIVE_PLATFORM == "ios")
		{
			vp.style.zoom = "100%";
		}
		else
		{
			transform = "";
			vp.style.webkitTransform = transform;
			vp.style.MozTransform = transform;
			vp.style.transform = transform;
		}
		uiSettings.strategicZoom = false;
		uiSettings.strategicZoomLevel = 1;
	}
	else
	{
		if (NATIVE_PLATFORM == "ios")
		{
			vp.style.zoom = zoom + "%";
		}
		else
		{
			transform = "scale(" + zoom / 100 + "," + zoom / 100 + ")";
			vp.style.webkitTransform = transform;
			vp.style.MozTransform = transform;
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
function uiScaleMap(level)
{
	var zoom = (level * 100) >> 0;
	var mapCanvas = $("map");
	var vp = $("game");
	var oldLevel = uiSettings.zoomLevel;
	var w = mapCanvas.width;
	var h = mapCanvas.height;
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
	$("mapscale").value = level;
	R.positionLayers();
}

	this.handleReinforcementDeployment = function()
	{
		R.cacheImages(function() { R.render(); });
	};

	this.uiUnitSelect = function(unit) { return uiUnitSelect(unit); };
	this.uiUnitMove = function(unit, row, col) { return uiUnitMove(unit, row, col); };
	this.uiUnitAttack = function(attackingUnit, enemyUnit) { return uiUnitAttack(attackingUnit, enemyUnit); };
	this.showAlert = function(row, col, text, positive) { return uiShowAlert(row, col, text, positive); };

	this.showGameToolTip = function(text, row, col)
	{
		var pos = R.cellToScreen(row, col, true);
		UIBuilder.gameToolTip(text, pos.x, pos.y);
	};

	this.showSmallToolTip = function(text, row, col, color, id, style)
	{
		var pos = R.cellToScreen(row, col, true);
		UIBuilder.gameSmallToolTip(text, pos.x, pos.y, color, id, style);
	};

	//Small tooltips over the map: hex names, objectives and transports, and low ammo/fuel on own units
	//unitsOnly skips the hex tooltips
	this.addSmallToolTips = function(unitsOnly)
	{
		var m = map.map;
		var p = map.currentPlayer;
		var side = p.side;
		for (var row = 0; row < m.length; row++)
		{
			for (var col = 0; col < m[row].length; col++)
			{
				var hex = m[row][col];
				var text = null;
				var color = tooltipColor.enemy;
				var style = tooltipStyle.text;

				if (!unitsOnly && hex.flag != -1 && hex.owner != -1)
				{
					if (hex.name !== null && hex.name != "")
						text = hex.name;
					else if (hex.victorySide !== -1)
						text = "Objective";

					if (!uiSettings.showDetailInfoToolTips && hex.victorySide == -1)
						text = null;

					if (hex.owner == side)
						color = tooltipColor.player;

					if (hex.terrain == terrainType.Airfield && p.airTransports > 0)
					{
						text = p.airTransports + "&nbsp;<span style='font-family: openpanzer-menu;'>&#xe900;</span> ";
						style = tooltipStyle.pin;
					}
					if (hex.terrain == terrainType.Port && p.navalTransports > 0)
					{
						text = p.navalTransports + "&nbsp;<span style='font-family: openpanzer-menu;'>&#xe901;</span>";
						style = tooltipStyle.pin;
					}
					if (text)
						this.showSmallToolTip(text, row, col, color, undefined, style);
				}

				var unit = hex.getUnit(uiSettings.airMode);
				if (unit && unit.player.side == side && text == null)
				{
					var id = "gsttu" + unit.id;
					if (GameRules.unitLowAmmo(unit, 1))
						this.showSmallToolTip("No Ammo", row, col, 0, id);
					if (GameRules.unitLowFuel(unit, 1))
						this.showSmallToolTip("No Fuel", row, col, 0, id);
				}
			}
		}
	};

	this.removeUnitToolTip = function(unitId)
	{
		for (var i = UIBuilder.smallToolTipList.length - 1; i >= 0; i--)
		{
			var id = UIBuilder.smallToolTipList[i];
			if (id == "gsttu" + unitId)
			{
				delTag($(id));
				break;
			}
		}
	};

	//onlyUnits removes only the unit tooltips but the whole list is cleared anyway
	this.removeAllSmallToolTips = function(onlyUnits)
	{
		for (var i = UIBuilder.smallToolTipList.length - 1; i >= 0; i--)
		{
			var id = UIBuilder.smallToolTipList[i];
			if (!onlyUnits || id.lastIndexOf("gsttu", 0) === 0)
				delTag($(id));
		}
		UIBuilder.smallToolTipList = [];
	};

	this.setNewScenario = function()
	{
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

	this.startMenuButton = function(id)
	{
		switch (id)
		{
			case "newgame":
			{
				makeVisible("smNewGame");
				break;
			}
			case "newcampaign":
			{
				makeHidden("smNewGame");
				makeHidden("smMain");
				makeVisible("smCamp");
				//Make the current campaign selected
				if (game.campaign === null) //Select first campaign in list
					setSelectOption($("smCampSel").firstChild, $("smCampSel").firstChild.options[0].text);
				else //Select saved campaign
					setSelectOption($("smCampSel").firstChild, game.campaign.name);
				$("smCampSel").firstChild.onchange();
				break;
			}
			case "newscenario":
			{
				makeHidden("smNewGame");
				makeHidden("smMain");
				makeVisible("smScen");
				//Make the current scenarion selected
				setSelectOption($("smScenSel").firstChild, game.scenario.name);
				break;
			}
			case "tutorial":
			{
				makeHidden("smMain");
				makeHidden("startmenu");
				game.campaign = null;
				uiSettings.noFOW = false;
				//Both sides are played by the tutorial script
				uiSettings.isAI[0] = 2;
				uiSettings.isAI[1] = 2;
				game.newScenario(Game.defaultScenario);
				toggleButton($("options"), false);
				break;
			}
			case "continuegame":
			{
				makeHidden("startmenu");
				toggleButton($("options"), false);
				break;
			}
			case "saveload":
			{
				makeHidden("smMain");
				makeHidden("smNewGame");
				makeVisible("smState");
				break;
			}
			case "settings":
			{
				makeHidden("startmenu");
				makeHidden("smNewGame");
				makeVisible("smSettings");
				//Remember to bring the message back when settings close
				if (isVisible("ui-message"))
				{
					makeHidden("ui-message");
					$("smSettings").messageHidden = true;
				}
			}
		}
	};

	this.mainMenuButton = function(id)
	{
		switch (id)
		{
			case "air":
			{
				//Leaving air mode deselects an air unit
				if (uiSettings.airMode && GameRules.isAir(map.currentUnit))
					handleUnitDeselect();
				uiSettings.airMode = !uiSettings.airMode;
				toggleButton($("air"), uiSettings.airMode);
				R.render(); //Full page rendering
				break;
			}
			case "hex":
			{
				uiSettings.hexGrid = !uiSettings.hexGrid;
				toggleButton($("hex"), uiSettings.hexGrid);
				this.removeAllSmallToolTips();
				this.addSmallToolTips();
				R.render(); //Full page rendering
				break;
			}
			case "zoom":
			{
				uiToggleMapZoom();
				R.render(); //Full page rendering
				break;
			}
			case "inspectunit":
			{
				if (isVisible("unit-info"))
				{
					toggleUnitInfoWindow(false);
				}
				else
				{
					toggleUnitInfoWindow(true);
					if (map.currentUnit !== null) updateUnitInfoWindow(map.currentUnit);
				}
				break;
			}
			case "buy":
			{
				toggleUnitsAndEquipmentWindow(true);
				break;
			}
			case "endturn":
			{
				//The first click asks for confirmation until the button animation ends
				var endTurnButton = $("endturn");
				if (endTurnButton.getAttribute("confirmation") == null)
				{
					endTurnButton.innerHTML = "1";
					if (!uiSettings.shownEndTurnTip)
						UIBuilder.uiToolTipAtElement(endTurnButton, "Tap again to confirm End Turn", 1);
					//Added again at every first click, never removed
					var resetConfirmation = function()
					{
						this.removeAttribute("confirmation");
						endTurnButton.innerHTML = "t";
						if (!uiSettings.shownEndTurnTip)
							UIBuilder.uiToolTipAtElement(endTurnButton, "Tap twice to confirm End Turn", 1);
					};
					endTurnButton.setAttribute("confirmation", "on");
					endTurnButton.addEventListener("animationend", resetConfirmation, false);
					endTurnButton.addEventListener("webkitAnimationEnd", resetConfirmation, false);
				}
				else
				{
					endTurnButton.innerHTML = "t";
					endTurnButton.removeAttribute("confirmation");
					if (isVisible("equipment"))
					{
						makeHidden("equipment");
						makeHidden("container-unitlist");
						uiSettings.deployMode = false;
						toggleButton($("buy"), false);
					}
					if (isVisible("unit-info"))
						toggleUnitInfoWindow(false);
					makeHidden("combatLog");
					if (!uiSettings.shownEndTurnTip)
					{
						makeHidden("uiToolTip");
						uiSettings.shownEndTurnTip = true;
						game.state.saveSettings();
					}
					if (map.currentPlayer.type == playerType.humanLocal)
					{
						game.endTurn();
						if (game.gameEnded && game.gameStarted)
						{
							uiMessage("DEFEAT", "<br><br>You didn't capture the objectives in time");
						}
						else
						{
							countries = map.getCountriesBySide(game.spotSide);
							UIBuilder.setDefaultUserSelections();
							CombatLog.reset();
							updateEquipmentWindow(unitClass.tank); //Refresh equipment window for the new player
							updateUnitContextWindow();
							uiEndTurnInfo();
							uiMapRenderAndSelectUnit();
						}
					}
				}
				break;
			}
			case "mainmenu":
			{
				if (isVisible("slidemenu"))
				{
					makeHidden("slidemenu");
					toggleButton($("mainmenu"), false);
				}
				else
				{
					makeVisible("slidemenu");
					toggleButton($("mainmenu"), true);
				}
				break;
			}
			case "options":
			{
				if (isVisible("startmenu"))
				{
					makeHidden("smMain");
					makeHidden("smScen");
					makeHidden("smSettings");
					makeHidden("smState");
					makeHidden("startmenu");
					toggleButton($("options"), false);
				}
				else
				{
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
	this.equipmentWindowButtons = function(id)
	{
		var eqUnit, eqTransport, unitId, deployId, p, u;
		switch (id)
		{
			case "changecountry":
			{
				if ($("eqSelCountry").country >= countries.length - 1) $("eqSelCountry").country = 0;
				else $("eqSelCountry").country++;
				$("eqUserSel").userunit = -1; //Clear existing unit selection when changing country
				$("eqUserSel").equnit = -1;
				game.ui.updateEquipmentWindow($("eqUserSel").eqclass || unitClass.tank); //previous class or tank class
				break;
			}
			case "buy":
			{
				eqUnit = $("eqUserSel").equnit;
				eqTransport = $("eqUserSel").eqtransport;

				if (typeof eqUnit === "undefined" || eqUnit <= 0)
					break;

				if (typeof eqTransport === "undefined" || eqTransport == "")
					eqTransport = -1;

				map.currentPlayer.buyUnit(eqUnit, eqTransport);
				updateEquipmentWindow(Equipment.equipment[eqUnit].uclass);
				break;
			}
			case "upgrade":
			{
				unitId = $("eqUserSel").userunit; //real unit id on map
				deployId = $("eqUserSel").deployunit; //id for units on deployment list
				eqUnit = $("eqUserSel").equnit; //Can be undefined as we can only upgrade transport
				eqTransport = $("eqUserSel").eqtransport;
				p = map.currentPlayer;
				u = null;

				if (typeof eqTransport === "undefined" || eqTransport == "")
					eqTransport = -1;

				if (typeof unitId === "undefined" || unitId == -1) //Upgrade an undeployed unit
				{
					u = p.getCoreUnitList()[deployId];
					if (p.upgradeUnit(u, eqUnit, eqTransport))
						updateEquipmentWindow(Equipment.equipment[u.eqid].uclass);
				}
				else //Upgrade a unit already on map
				{
					if (map.upgradeUnit(unitId, eqUnit, eqTransport))
					{
						R.cacheImages(function() { R.render(); }); //Need to cache new image
						if (eqUnit > 0) updateEquipmentWindow(Equipment.equipment[eqUnit].uclass);
					}
				}
				break;
			}
			case "sell":
			{
				p = map.currentPlayer;
				u = null;
				unitId = $("eqUserSel").userunit;
				deployId = $("eqUserSel").deployunit;
				eqUnit = $("eqUserSel").equnit;

				if (typeof unitId === "undefined" || unitId == -1) //Sell an undeployed unit
				{
					u = p.getCoreUnitList()[deployId];
					if (p.sellUnit(u))
					{
						p.removeUndeployedCoreUnit(deployId);
						updateEquipmentWindow(Equipment.equipment[u.eqid].uclass);
					}
				}
				else //Disband a unit on map
				{
					if (map.disbandUnit(unitId))
					{
						R.cacheImages(function() { R.render(); });
						$("eqUserSel").userunit = -1;
						if (eqUnit > 0) updateEquipmentWindow(Equipment.equipment[eqUnit].uclass);
					}
				}
			}
		}
	};

	this.updateEquipmentWindow = function(eqclass) { return updateEquipmentWindow(eqclass); };

	//Called from game after AI/NET turn
	this.uiEndTurnInfo = function()
	{
		R.render(); //Full page render when changing player/side
		uiEndTurnInfo();
	};

	//Centers unit on player screen
	this.uiSetUnitOnViewPort = function(unit)
	{
		if (!unit) return false;
		return uiSetCellOnViewPort(unit.getPos());
	};

	this.uiSetCellOnViewPort = function(cell) { return uiSetCellOnViewPort(cell); };

	this.scaleMap = function(level) { return uiScaleMap(level); };
} //End of UI class
