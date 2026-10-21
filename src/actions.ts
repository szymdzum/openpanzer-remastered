/**
 * Actions - the game's combat and move sequence, without the UI
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 *
 * The sequence the UI ran in its animation callbacks (ui.ts uiUnitAttack, uiAttackAnimationFinished,
 * uiMoveAnimationFinished) and Game ran around the end of a turn, in the same order. An attack is
 * two calls: resolveAttack (support fire, the attack or attack stopped), then finishAttack (the
 * destroyed units removed, retreat or surrender, the elimination victory). The UI calls the second
 * from the attack animation's callback, a headless caller right after the first.
 *
 * The hooks are called synchronously where the UI animated or alerted. Their order matters: the
 * animations' sprite and sound picks draw from the same Math.random as the dice, between the
 * support fire shots.
 *
 * checkOutcome says whether the game is over, who won and why, for any side. The game itself still
 * decides it where it did (the victory hooks, Game.endTurn's local-side defeat); the contract and
 * a headless caller ask checkOutcome after each action.
 *
 * No module-level `map` here: Map.attackUnit reads a global one (#28).
 */

import { type Cell, type combatResults, type movementResults, playerSide } from "./prototypes";
import { CombatLog } from "./combatlog";
import { GameRules } from "./gamerules";
import type { Unit } from "./unit";
import type { GameMap } from "./map";
import type { Scenario, ScenarioOutcome } from "./scenario";

//One side of an attack, its strength before and after the attack (newstr is set by resolveAttack)
export interface AttackSide
{
	unit: Unit;
	cell: Cell;
	oldstr: number;
	newstr: number;
	leaderGain: boolean;
}

export interface AttackResult
{
	attacking: AttackSide;
	defending: AttackSide;
	cr: combatResults; //the attack's results, the estimate when the attack didn't take place
	support: Unit[]; //the units that fired in support of the defender, in order
	attackStopped: boolean; //the support fire losses stopped the attack
	//Set by finishAttack
	destroyed: Unit[]; //removed from the map after the attack, by their losses (attacker first)
	retreat: Cell | null; //where the defender retreated to
	retreatMove: movementResults | null; //the retreat's move, its finishMove is the caller's
	surrender: boolean; //the defender had nowhere to retreat to
	victorySides: number[]; //the sides that won because the other one has no units left
}

export interface AttackHooks
{
	onSupportShot?(unit: Unit, cell: Cell): void; //after each support fire shot, the unit and its cell before it
	onAttack?(result: AttackResult): void; //after the attack (not when it was stopped)
}

export interface FinishAttackHooks
{
	onLosses?(result: AttackResult): void; //first, before anything is removed
	onDestroyed?(unit: Unit, cell: Cell): void; //a unit destroyed by its losses (attacker first), before the cleanup
	afterCleanup?(result: AttackResult): void; //the destroyed units are removed, before retreat or surrender
	onRetreat?(unit: Unit, cell: Cell, mr: movementResults): void; //after the retreat's move
	onSurrender?(unit: Unit, cell: Cell): void; //after the surrendered unit was removed
	onVictory?(side: number): void; //a side won, the other has no units left
}

export interface MoveResult
{
	move: movementResults;
	//The unit ran into a hidden enemy: the attack on it is resolved, its finishAttack is the caller's
	surprise: { cell: Cell; target: Unit | null; attack: AttackResult | null } | null;
	capture: boolean;
	victorySide: number; //-1, or the side that captured all its objectives
}

export interface FinishMoveHooks extends AttackHooks
{
	onSurprised?(unit: Unit, cell: Cell): void; //before the surprise attack
	attack?(attackingUnit: Unit, enemyUnit: Unit): AttackResult | null; //resolves the surprise attack, resolveAttack by default
	onCapture?(unit: Unit): void;
	onVictory?(side: number): void; //the side captured all its objectives
}

export interface DeployedReinforcement
{
	unit: Unit;
	cell: Cell;
}

//How a game ended: a side took all its objectives (capture), a side has no units left
//(elimination), a side played its last turn (turnLimit)
export type OutcomeKind = "capture" | "elimination" | "turnLimit";

export interface Outcome
{
	kind: OutcomeKind;
	winner: number; //the side that won, -1 at the turn limit (nobody wins it)
	loser: number; //the side that lost
	rating: ScenarioOutcome; //the winner's Scenario.checkVictory() by the turn, "lose" at the turn limit
}

//What just happened, for the outcomes the state alone doesn't show
export interface OutcomeContext
{
	move?: MoveResult | null; //a move (or a retreat) just finished: its capture can win
	endedSide?: number; //this side just ended its turn: the turn limit
}

export interface ActionsAPI
{
	resolveAttack(map: GameMap, attackingUnit: Unit, enemyUnit: Unit, hooks?: AttackHooks): AttackResult | null;
	finishAttack(map: GameMap, result: AttackResult, hooks?: FinishAttackHooks): AttackResult;
	finishMove(map: GameMap, unit: Unit, mr: movementResults, airMode: boolean | number, hooks?: FinishMoveHooks): MoveResult;
	deployReinforcements(scenario: Scenario, turn: number, playerId: number,
		onDeployed?: (unit: Unit, cell: Cell) => void): DeployedReinforcement[] | null;
	endTurn(scenario: Scenario, localSide: number): boolean;
	checkOutcome(scenario: Scenario, last?: OutcomeContext): Outcome | null;
}

export var Actions: ActionsAPI = {
	resolveAttack: resolveAttack,
	finishAttack: finishAttack,
	finishMove: finishMove,
	deployReinforcements: deployReinforcements,
	endTurn: endTurn,
	checkOutcome: checkOutcome,
};

//Support fire if the attacker wasn't surprised and doesn't overrun, then the attack unless the
//support fire destroyed the attacker or stopped the attack. Null when a unit isn't on the map
function resolveAttack(map: GameMap, attackingUnit: Unit, enemyUnit: Unit, hooks?: AttackHooks): AttackResult | null
{
	var h = hooks || {};
	var cpos = attackingUnit.getPos();
	var epos = enemyUnit.getPos();
	if (!cpos || !epos)
		return null;

	var result: AttackResult =
	{
		attacking: { unit: attackingUnit, cell: cpos, oldstr: attackingUnit.strength, newstr: 0, leaderGain: false },
		defending: { unit: enemyUnit, cell: epos, oldstr: enemyUnit.strength, newstr: 0, leaderGain: false },
		cr: null,
		support: [],
		attackStopped: false,
		destroyed: [],
		retreat: null,
		retreatMove: null,
		surrender: false,
		victorySides: []
	};

	var cr = GameRules.calculateAttackResults(attackingUnit, enemyUnit, true);
	if (!attackingUnit.isSurprised && !cr.isOverrun)
	{
		var supportUnits = GameRules.getSupportFireUnits(map.getUnits(), attackingUnit, enemyUnit);
		for (var u in supportUnits)
		{
			var sp = supportUnits[u].getPos();
			if (attackingUnit.destroyed)
				break;
			map.attackUnit(supportUnits[u], attackingUnit, true);
			result.support.push(supportUnits[u]);
			if (h.onSupportShot) h.onSupportShot(supportUnits[u], sp);
		}
	}
	//The support fire losses can stop the attack
	result.attackStopped = GameRules.isLossOverRetreatThreshold(attackingUnit.strength, result.attacking.oldstr);
	if (!attackingUnit.destroyed && !result.attackStopped)
	{
		cr = map.attackUnit(attackingUnit, enemyUnit, false, cr.isOverrun);
		result.cr = cr;
		result.attacking.leaderGain = cr.atkLeaderGain;
		result.defending.leaderGain = cr.defLeaderGain;
		if (h.onAttack) h.onAttack(result);
	}
	result.cr = cr;
	if (result.attackStopped)
		attackingUnit.hasFired = true;

	result.attacking.newstr = attackingUnit.strength;
	result.defending.newstr = enemyUnit.strength;
	return result;
}

//After the attack: the units destroyed by their losses are removed, the defender retreats on big
//losses or surrenders when it has nowhere to go, a side without units left loses. Whether a unit
//was destroyed is read from the strengths in result (the UI's callback can see them at 0)
function finishAttack(map: GameMap, result: AttackResult, hooks?: FinishAttackHooks): AttackResult
{
	var h = hooks || {};
	var a = result.attacking;
	var d = result.defending;
	var rpos: Cell;

	if (h.onLosses) h.onLosses(result);

	var aDestroyed = a.oldstr - a.newstr >= a.oldstr;
	var dDestroyed = d.oldstr - d.newstr >= d.oldstr;
	if (aDestroyed)
	{
		result.destroyed.push(a.unit);
		if (h.onDestroyed) h.onDestroyed(a.unit, a.cell);
	}
	if (dDestroyed)
	{
		result.destroyed.push(d.unit);
		if (h.onDestroyed) h.onDestroyed(d.unit, d.cell);
	}
	if (aDestroyed || dDestroyed) //Cleanup dead units
		map.updateUnitList();

	if (h.afterCleanup) h.afterCleanup(result);

	if (!dDestroyed && GameRules.shouldDefenderRetreat(a.unit, d.unit, d.oldstr))
	{
		if ((rpos = GameRules.getRetreatPosition(map.map, d.unit, map.rows, map.cols)))
		{
			result.retreat = rpos;
			result.retreatMove = map.retreatUnit(d.unit, rpos);
			if (h.onRetreat) h.onRetreat(d.unit, rpos, result.retreatMove);
		}
		else
		{
			result.surrender = true;
			d.unit.destroyed = true;
			map.updateUnitList();
			if (h.onSurrender) h.onSurrender(d.unit, d.cell);
		}
	}

	if (!map.hasAliveUnits(playerSide.axis))
	{
		result.victorySides.push(playerSide.allies);
		if (h.onVictory) h.onVictory(playerSide.allies);
	}
	if (!map.hasAliveUnits(playerSide.allies))
	{
		result.victorySides.push(playerSide.axis);
		if (h.onVictory) h.onVictory(playerSide.axis);
	}

	return result;
}

//After a move: the surprise attack (the hidden enemy picked with airMode, as the UI's air mode
//toggle picks it), the capture and the capture victory
function finishMove(map: GameMap, unit: Unit, mr: movementResults, airMode: boolean | number, hooks?: FinishMoveHooks): MoveResult
{
	var h = hooks || {};
	var result: MoveResult = { move: mr, surprise: null, capture: mr.isCapture, victorySide: mr.isVictorySide };

	if (unit.isSurprised)
	{
		var cell = mr.surpriseCell;
		if (h.onSurprised) h.onSurprised(unit, cell);
		var target = map.map[cell.row][cell.col].getAttackableUnit(unit, airMode);
		result.surprise = { cell: cell, target: target, attack: null };
		if (target !== null)
			result.surprise.attack = h.attack ? h.attack(unit, target) : resolveAttack(map, unit, target, h);
		unit.isSurprised = false; //When combat ends unit is no longer surprised
	}
	if (mr.isCapture && h.onCapture)
		h.onCapture(unit);
	if (mr.isVictorySide >= 0 && h.onVictory)
		h.onVictory(mr.isVictorySide);

	return result;
}

//Deploys the reinforcements of player playerId for this turn. Null when there are none, else the
//deployed ones (the others stay for later)
function deployReinforcements(scenario: Scenario, turn: number, playerId: number,
	onDeployed?: (unit: Unit, cell: Cell) => void): DeployedReinforcement[] | null
{
	var deployed: DeployedReinforcement[] = [];
	var reinforcements = scenario.getReinforcements(turn, playerId);

	if (reinforcements.length <= 0)
		return null;

	for (var i = 0; i < reinforcements.length; i++)
	{
		var cell: Cell = null;
		if ((cell = scenario.map.deployReinforcement(reinforcements[i].unit,
			reinforcements[i].row, reinforcements[i].col)) !== null)
		{
			deployed.push({ unit: reinforcements[i].unit, cell: cell });
			CombatLog.addReinforcement(reinforcements[i].unit);
			scenario.removeReinforcement(reinforcements[i].turn, reinforcements[i].id);
			if (onDeployed) onDeployed(reinforcements[i].unit, cell);
		}
	}
	return deployed;
}

//Ends the current player's turn (the next AI player plans its turn in Map.endTurn). True when the
//player who ended it lost at the turn limit, which is only checked for a local side (localSide
//as Game's getLocalSide: -1 none, 0, 1, 2 both)
function endTurn(scenario: Scenario, localSide: number): boolean
{
	var lastSide = scenario.map.currentPlayer.side;
	scenario.endTurn();
	return scenario.checkDefeat(lastSide, localSide);
}


//Whether the game is over, who won and why, whichever side plays locally. Checked in this order:
//- capture: the move in last took its side's last objective (Map.captureHex). Only the move can
//  tell: a side that never had objectives has an empty list from the start, and a side that took
//  back the ones it lost has the same list as before
//- elimination: a side has no units left, axis first as finishAttack reports it (when both have
//  none the allies win)
//- turnLimit: last.endedSide played its last turn (Scenario.checkDefeat for any side; Game checks
//  it only for a local side)
//Null when the game goes on
function checkOutcome(scenario: Scenario, last?: OutcomeContext): Outcome | null
{
	var l = last || {};
	var m = scenario.map;
	var winner = -1;

	if (l.move && l.move.victorySide >= 0)
		return { kind: "capture", winner: l.move.victorySide, loser: ~l.move.victorySide & 1, rating: scenario.checkVictory() };

	if (!m.hasAliveUnits(playerSide.axis))
		winner = playerSide.allies;
	else if (!m.hasAliveUnits(playerSide.allies))
		winner = playerSide.axis;
	if (winner >= 0)
		return { kind: "elimination", winner: winner, loser: ~winner & 1, rating: scenario.checkVictory() };

	if (typeof l.endedSide === "number" && l.endedSide >= 0 && scenario.checkDefeat(l.endedSide, 2))
		return { kind: "turnLimit", winner: -1, loser: l.endedSide, rating: "lose" };

	return null;
}
