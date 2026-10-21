/**
 * UICombatLog - Shows the turn summary window built from the CombatLog entries:
 * combats, objectives, resupplies, reinforcements, leaders and the turn info
 *
 * http://www.linuxconsulting.ro
 * http://openpanzer.net
 *
 * Copyright (c) 2012 Nicu Pavel
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 *
 * Reconstructed from the Panzer Marshal 3.2.14 bundle. There is no 2.9 counterpart,
 * names come from the property names and the callers (UIBuilder, the UI end turn handlers).
 */

import {
	type Cell, groundConditionNames, groundFontEncoding, outcomeNames, playerType, prestigeGains,
	terrainNames, terrainType, uiSettings, unitClass, weatherConditionNames, weatherFontEncoding
} from "./prototypes";
import { CombatLog, type UnitEndTurnInfo } from "./combatlog";
import { Equipment } from "./equipment";
import {
	$, addTag, clearTag, getPosition, insertTag, isVisible, makeHidden, makeVisible, toggleButton
} from "./dom";
import type { Hex } from "./map";
import { UIBuilder } from "./uibuilder";
import { game } from "./game";
import { Leaders } from "./leaders";

export interface UICombatLogModule
{
	showCombatLog(isExtended: boolean): void;
	buildExtendButton(div: HTMLElement): void;
	buildTurnInfo(div: HTMLElement): void;
	buildCombatSummary(div: HTMLElement, map: Hex[][]): number;
	buildResupplySummary(div: HTMLElement, map: Hex[][]): number;
	buildReinforceSummary(div: HTMLElement, map: Hex[][]): number;
	buildLeadersSummary(div: HTMLElement, map: Hex[][]): number;
	buildObjectiveSummary(div: HTMLElement, map: Hex[][]): number;
	toggleCombatLog(forceShow?: boolean, isExtended?: boolean): void;
}

//A log line that centers the map on its position when clicked
export interface UICombatLogLine extends HTMLDivElement { row: number; col: number }

//var UICombatLog = UICombatLog || {}; //Namespace emulation
export var UICombatLog: UICombatLogModule = (function(UICombatLog: UICombatLogModule) { //Module start

//Highlights a number in the log text
function logNumber(value: number | string): string
{
	return "<span class='combatLogNum'>" + value + "</span>";
}

//Builds and shows the combat log window. When not extended (shown at the start of the turn)
//the window is at most 175px high and gets a button to show the full turn summary
UICombatLog.showCombatLog = function(isExtended: boolean)
{
	var div = $("combatLog");
	var map = game.scenario.map.map;

	clearTag(div);
	UICombatLog.buildCombatSummary(div, map);
	UICombatLog.buildObjectiveSummary(div, map);
	UICombatLog.buildResupplySummary(div, map);
	UICombatLog.buildReinforceSummary(div, map);
	UICombatLog.buildLeadersSummary(div, map);
	if (!isExtended)
		UICombatLog.buildExtendButton(div);
	UICombatLog.buildTurnInfo(div);
	makeVisible("combatLog");

	//Fit the window above the unit info box, or to its content if that is smaller
	var pos = getPosition("unit-info") as DOMRect;
	var height = Math.round((pos.top - 30) / uiSettings.uiScale);
	var lastNode = div.childNodes[div.childNodes.length - 1] as HTMLElement;
	var contentHeight = lastNode.offsetTop + lastNode.offsetHeight;
	if (height > contentHeight)
		height = contentHeight;

	if (isExtended)
	{
		div.style.height = height + "px";
	}
	else
	{
		if (height > 175)
			height = 175;
		div.style.height = height + "px";
		div.scrollTop = 0;
	}
}

//The "Show Turn Summary" button at the top of the short log, shows the full log
UICombatLog.buildExtendButton = function(div: HTMLElement)
{
	var button = insertTag(div, "div", div.firstChild);
	button.className = "combatLogHeader";
	button.style.paddingTop = "5px";
	button.innerHTML = "Show Turn Summary";
	button.innerHTML += "<span style='font-family: openpanzer-menu; font-size: 22px;font-weight: normal;color: #f8e064;line-height: 0px;display: block;'>l</span><br/>";
	button.onclick = function() { UICombatLog.showCombatLog(true); };
}

//The header with the current player turn, scenario, objectives, score, prestige and weather
UICombatLog.buildTurnInfo = function(div: HTMLElement)
{
	var mapObj = game.scenario.map;
	var player = mapObj.currentPlayer;
	var turnsLeft = 0;

	var header = insertTag(div, "div", div.firstChild);
	header.className = "combatLogHeader";
	header.style.paddingTop = "15px";

	var html = "<span style='font-weight: bold; text-align: center; color: #33ccff;'>" + player.getCountryName()
		+ " Turn " + mapObj.turn + " of " + mapObj.maxTurns + "</span>";
	if (game.campaign !== null)
		html += "<span class='smallButtonMenu combatLogInfoButton' style='left: 15px' onclick=\"(function() { makeHidden('combatLog'); UIBuilder.showDossier(true, false); })();\">@</span><br>";
	html += "<span class='smallButtonMenu combatLogInfoButton' style='right: 15px; font-size: 16px'onclick=\"(function(){ UICombatLog.toggleCombatLog(); UIBuilder.message(game.scenario.name, game.scenario.getDescription());})();\">g</span><hr/><span style='color: #f8e064;text-align: center;font-family: Arial;font-size: 14px;font-weight: normal;'>";
	html += "<i>" + game.scenario.name + "</i>, " + game.scenario.date.toDateString() + "<br/> ";
	//The stray </b> is in the bundle, kept
	html += logNumber(mapObj.sidesVictoryHexes[player.side].length) + "</b> objectives left to conquer, in ";
	if ((turnsLeft = mapObj.victoryTurns[0] - (mapObj.turn - 1)) > 0)
		html += logNumber(turnsLeft) + " turns for <i>" + outcomeNames.briliant + "</i>, ";
	if ((turnsLeft = mapObj.victoryTurns[1] - (mapObj.turn - 1)) > 0)
		html += logNumber(turnsLeft) + " turns for <i>" + outcomeNames.victory + "</i> and ";
	if ((turnsLeft = mapObj.victoryTurns[2] - (mapObj.turn - 1)) > 0)
		html += logNumber(turnsLeft) + " turns for <i>" + outcomeNames.tactical + "</i>";
	html += "<br/>Current score is " + logNumber(player.score) + " and ";
	html += "prestige is " + logNumber(player.prestige) + "&nbsp;" + UIBuilder.currencyIcon;
	html += " gaining " + logNumber(player.prestigePerTurn[mapObj.turn + 1]) + "&nbsp;" + UIBuilder.currencyIcon + " next turn<br/>";
	html += "<span style='font-family: openpanzer;color: #33ccff; font-size:22px;'>" + weatherFontEncoding[game.scenario.atmosferic]
		+ "</span> " + weatherConditionNames[game.scenario.atmosferic] + " weather ";
	html += " and <span style='font-family: openpanzer; color: #33ccff; font-size: 22px;'>" + groundFontEncoding[game.scenario.ground]
		+ "</span> " + groundConditionNames[game.scenario.ground] + " ground.";
	html += "</span>";
	header.innerHTML = html;
}

//One line per unit of the spotting side that fought this turn, core units first.
//Returns the number of lines
UICombatLog.buildCombatSummary = function(div: HTMLElement, map: Hex[][])
{
	var count = 0;
	var line: UICombatLogLine;

	for (var id in CombatLog.log.combat)
	{
		var info = CombatLog.log.combat[id as unknown as number]; //the unit id key string
		if (info.side != game.spotSide)
			continue;

		var text = "";
		var action = "";
		var assaultsText = "";
		var defendsText = "";
		var place = "";
		var infoBox: HTMLElement, unitBox: HTMLElement;
		var eq = Equipment.equipment[info.eqid];

		count++;
		if (info.isCore)
			line = insertTag(div, "div", div.firstChild) as UICombatLogLine;
		else
			line = addTag(div, "div") as UICombatLogLine;
		unitBox = addTag(line, "div");
		infoBox = addTag(line, "div");
		line.className = "combatLogLine";
		unitBox.className = "combatLogUnitBox";
		infoBox.className = "combatLogInfoBox";
		if (eq.uclass > unitClass.airTransport)
			addTag(unitBox, "img").src = UIBuilder.navalReplacementIcon;
		else
			addTag(unitBox, "img").src = eq.icon;

		if (info.assaults >= info.defends || info.supports >= info.defends)
		{
			if (info.supports >= info.assaults)
				action = " provided fire support from ";
			else
				action = " while assaulting from ";
		}
		else
		{
			action = " while defending ";
		}

		if (map[info.pos.row][info.pos.col].name != "")
			place = map[info.pos.row][info.pos.col].name + " ";
		if (map[info.pos.row][info.pos.col].terrain !== terrainType.Clear)
			place += terrainNames[map[info.pos.row][info.pos.col].terrain] + " ";

		if (info.isCore)
			text += logNumber("Core ");
		else
			text += "Auxiliary ";
		text += "Unit <b>" + UIBuilder.unitIDToOrdinal(info.id) + " " + eq.name + "</b>" + action + place
			+ " <b>(" + info.pos.row + "," + info.pos.col + ")</b> ";

		if (info.assaults > 0)
		{
			assaultsText = " in " + info.assaults + " assaults";
			defendsText = " and";
		}
		if (info.defends > 0)
			defendsText += " defending from " + info.defends + " attacks ";
		else
			defendsText = "";

		if (info.kills > 0)
			text += " inflicted " + logNumber(info.kills) + " casualties ";
		if (info.losses != 0)
		{
			if (info.kills > 0)
				text += "and ";
			text += "lost " + logNumber("-" + info.losses) + " strength";
			if (info.str > 0)
			{
				text += " with " + logNumber(info.str) + " surviving ";
			}
			else
			{
				text += " being completely destroyed ";
				infoBox.className = "combatLogInfoBoxRed";
			}
		}
		text += assaultsText;
		text += defendsText;
		if (info.xp != 0 && info.str > 0)
			text += " and gained +" + logNumber(info.xp) + " experience. ";
		if (info.ammo < eq.ammo / 4)
			text += " Unit is low on ammo " + logNumber(info.ammo + "/" + eq.ammo) + " remaining. ";
		if (info.entrenchLost > 0)
			text += logNumber(info.entrenchLost) + " entrenchments had been destroyed during combat with "
				+ logNumber(info.entrench) + " remaining.";
		else if (info.entrench > 0)
			text += " Unit has " + logNumber(info.entrench) + " remaining entrenchments";
		infoBox.innerHTML = text;

		//Clicking a line centers the map on the unit
		line.row = info.pos.row;
		line.col = info.pos.col;
		line.onclick = function(this: UICombatLogLine) { return game.ui.uiSetCellOnViewPort({ row: this.row, col: this.col } as Cell); };

		if (info.isCore)
			insertTag(div, "hr", line.nextSibling);
		else
			addTag(div, "hr");
	}

	var header = insertTag(div, "div", div.firstChild);
	header.className = "combatLogHeader";
	header.innerHTML = "Unit Combat Report";
	insertTag(div, "hr", header.nextSibling);
	if (count == 0)
	{
		line = addTag(div, "div") as UICombatLogLine;
		line.innerHTML = "All quiet on this front";
	}
	return count;
}

//One line per unit of the spotting side resupplied at the end of the turn
UICombatLog.buildResupplySummary = function(div: HTMLElement, map: Hex[][])
{
	var count = 0;
	var line: HTMLElement;

	var header = addTag(div, "div");
	header.className = "combatLogHeader";
	header.innerHTML = "Resupply Report";
	insertTag(div, "hr", header.nextSibling);

	for (var id in CombatLog.log.resupply)
	{
		var info = CombatLog.log.resupply[id as unknown as number]; //the unit id key string
		//unitEndTurnInfo has no entrench, undefined < 0 is false: never skipped for that, kept
		if (info.side != game.spotSide || (info.ammo < 0 && info.fuel < 0 && (info as UnitEndTurnInfo & { entrench?: number }).entrench < 0))
			continue;

		var text = "";
		var unitBox, infoBox;
		var eq = Equipment.equipment[info.eqid];

		count++;
		line = addTag(div, "div");
		unitBox = addTag(line, "div");
		infoBox = addTag(line, "div");
		line.className = "combatLogLine";
		unitBox.className = "combatLogUnitBox";
		infoBox.className = "combatLogInfoBox";
		if (eq.uclass > unitClass.airTransport)
			addTag(unitBox, "img").src = UIBuilder.navalReplacementIcon;
		else
			addTag(unitBox, "img").src = eq.icon;

		if (info.isCore)
			text += logNumber("Core ");
		else
			text += "Auxiliary ";
		text += "Unit <b>" + UIBuilder.unitIDToOrdinal(id as unknown as number) + " " + eq.name + "</b>"; //the key string, converted there
		if (info.ammo > 0)
			text += " resupplied automatically with " + logNumber(info.ammo + "/" + eq.ammo) + " ammunition ";
		if (info.fuel > 0 && eq.fuel > 0)
		{
			if (info.ammo > 0)
				text += "and ";
			text += logNumber(info.fuel + "/" + eq.fuel) + " fuel.";
		}
		infoBox.innerHTML = text;
		addTag(div, "hr");
	}
	if (count == 0)
	{
		line = addTag(div, "div");
		line.innerHTML = "No units had been provided with automatic resupply.";
	}
	return count;
}

//One line per reinforcement of the spotting side that arrived this turn
UICombatLog.buildReinforceSummary = function(div: HTMLElement, map: Hex[][]) //map unused
{
	var count = 0;
	var line: UICombatLogLine;

	var header = addTag(div, "div");
	header.className = "combatLogHeader";
	header.innerHTML = "Reinforcements Report";
	insertTag(div, "hr", header.nextSibling);

	for (var i = 0; i < CombatLog.log.reinforce.length; i++)
	{
		var info = CombatLog.log.reinforce[i];
		if (info.side != game.spotSide)
			continue;

		var text = "";
		var unitBox, infoBox;
		var eq = Equipment.equipment[info.eqid];

		count++;
		line = addTag(div, "div") as UICombatLogLine;
		unitBox = addTag(line, "div");
		infoBox = addTag(line, "div");
		line.className = "combatLogLine";
		unitBox.className = "combatLogUnitBox";
		infoBox.className = "combatLogInfoBox";
		if (eq.uclass > unitClass.airTransport)
			addTag(unitBox, "img").src = UIBuilder.navalReplacementIcon;
		else
			addTag(unitBox, "img").src = eq.icon;

		text += "Unit <b>" + eq.name + "</b>";
		text += " received as reinforcement at <b>(" + info.pos.row + "," + info.pos.col + ")</b> ";
		infoBox.innerHTML = text;

		line.row = info.pos.row;
		line.col = info.pos.col;
		line.onclick = function(this: UICombatLogLine) { return game.ui.uiSetCellOnViewPort({ row: this.row, col: this.col } as Cell); };
		addTag(div, "hr");
	}
	if (count == 0)
	{
		line = addTag(div, "div") as UICombatLogLine;
		line.innerHTML = "No reinforcements arrived.";
	}
	return count;
}

//One line per unit of the spotting side that received a leader this turn
UICombatLog.buildLeadersSummary = function(div: HTMLElement, map: Hex[][]) //map unused
{
	var count = 0;
	var line: UICombatLogLine;

	var header = addTag(div, "div");
	header.className = "combatLogHeader";
	header.innerHTML = "Unit Leaders Report";
	insertTag(div, "hr", header.nextSibling);

	for (var i = 0; i < CombatLog.log.leaders.length; i++)
	{
		var info = CombatLog.log.leaders[i];
		if (info.side != game.spotSide)
			continue;

		var text = "";
		var unitBox, infoBox;
		var eq = Equipment.equipment[info.eqid];

		count++;
		line = addTag(div, "div") as UICombatLogLine;
		unitBox = addTag(line, "div");
		infoBox = addTag(line, "div");
		line.className = "combatLogLine";
		unitBox.className = "combatLogUnitBox";
		infoBox.className = "combatLogInfoBox";
		addTag(unitBox, "img").src = eq.icon; //no naval icon replacement here

		if (info.isCore)
			text += logNumber("Core ");
		else
			text += "Auxiliary ";
		text += "Unit <b>" + UIBuilder.unitIDToOrdinal(info.id) + " " + eq.name + "</b>";
		text += " received a new Leader with " + logNumber(Leaders.description[info.classLeader][0]);
		text += " and " + logNumber(Leaders.description[info.leader][0]) + " abilities";

		line.row = info.pos.row;
		line.col = info.pos.col;
		infoBox.innerHTML = text;
		line.onclick = function(this: UICombatLogLine) { return game.ui.uiSetCellOnViewPort({ row: this.row, col: this.col } as Cell); };
		addTag(div, "hr");
	}
	if (count == 0)
	{
		line = addTag(div, "div") as UICombatLogLine;
		line.innerHTML = "No units received leaders";
	}
	return count;
}

//One line per objective captured or lost this turn, from the spotting side point of view
UICombatLog.buildObjectiveSummary = function(div: HTMLElement, map: Hex[][])
{
	var count = 0;
	var line: UICombatLogLine;

	var header = addTag(div, "div");
	header.className = "combatLogHeader";
	header.innerHTML = "Objectives Report";
	insertTag(div, "hr", header.nextSibling);

	for (var i = 0; i < CombatLog.log.objectives.length; i++)
	{
		var info = CombatLog.log.objectives[i];
		var text = "";
		var hex = map[info.pos.row][info.pos.col];

		if (!hex || typeof hex === "undefined")
			continue;

		count++;
		line = addTag(div, "div") as UICombatLogLine;
		if (info.side == game.spotSide)
			text += "Captured objective  " + hex.name + " at <b>(" + info.pos.row + "," + info.pos.col
				+ ")</b>, prestige increased by " + logNumber(prestigeGains.objectiveCapture) + "&nbsp;" + UIBuilder.currencyIcon;
		else
			text += "Lost objective  " + hex.name + " at <b>(" + info.pos.row + "," + info.pos.col + ")</b>";
		line.innerHTML = text;
		line.row = info.pos.row;
		line.col = info.pos.col;
		line.onclick = function(this: UICombatLogLine) { return game.ui.uiSetCellOnViewPort({ row: this.row, col: this.col } as Cell); };
		addTag(div, "hr");
	}
	if (count == 0)
	{
		line = addTag(div, "div") as UICombatLogLine;
		line.innerHTML = "No objectives has been captured or lost";
	}
	return count;
}

//Shows or hides the combat log, only for a human or scripted current player.
//forceShow shows it even if already visible (rebuilds it), isExtended as in showCombatLog
UICombatLog.toggleCombatLog = function(forceShow?: boolean, isExtended?: boolean)
{
	var player = game.scenario.map.currentPlayer;
	if (player.type == playerType.humanLocal || player.type == playerType.aiScripted)
	{
		if (forceShow || !isVisible("combatLog"))
		{
			UICombatLog.showCombatLog(isExtended);
			toggleButton($("combatLogButton"), true);
		}
		else
		{
			makeHidden("combatLog");
			toggleButton($("combatLogButton"), false);
		}
		UIBuilder.closeDossier();
	}
}

//------------------------ MODULE END ----------------------
return UICombatLog; }(UICombatLog || {} as UICombatLogModule)); //Module end giberish
