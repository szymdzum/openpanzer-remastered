/**
 * Commands - every player action as plain data, one entry for all of them
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 *
 * A command names its units by id and its hexes by cell, so it can be logged, saved, sent and
 * written by a program (docs/REFACTOR.md, step 4, "The layers and the commands"). Each type has a
 * handler: check says whether the command is allowed, or why not, without changing anything; run
 * plays it through the engine (GameMap, Player, Actions). Commands.execute checks, then runs.
 *
 * The handlers sit on the current engine, so they keep its order of things:
 * - check refuses only what the engine wouldn't do anyway (a move with no path, an upgrade the
 *   player can't afford) or what the game never offers. What the engine does with no rule to stop
 *   it stays allowed: an attack by a unit that has fired (the AI's attack after a surprise
 *   attack), a unit of another player, a resupply, reinforcement or mount the rules refuse (#147:
 *   the UI's context button can be older than the unit's state)
 * - the move and the attack end later in the UI, when their animation ends: run hands the finish
 *   to the caller's animate hook, without one it finishes at once. The attack's hooks fire where
 *   they fired, between the support fire shots; the UI's sprite and sound picks draw from the
 *   cosmetic stream (Rng.cosmeticRandom), so they don't move the dice
 *
 * One module for all the handlers: each is a few lines over the engine's own functions, and the
 * flat src/ keeps the load order and the harness's module list simple. They get their own files
 * in the new core, where they hold the rules themselves.
 */

import { type Cell, type extendedCell, type movementResults, type Supply, unitClass } from "./prototypes";
import { Actions, type AttackHooks, type AttackResult, type FinishAttackHooks, type FinishMoveHooks,
	type MoveResult } from "./actions";
import { GameRules } from "./gamerules";
import { Equipment } from "./equipment";
import type { Unit } from "./unit";
import type { GameMap, ReinforceResults } from "./map";
import type { Scenario } from "./scenario";

//The player's actions. unit: a unit on the map by its id; index: a core unit not on the map, by
//its place in the current player's core unit list (the deployment list); eqid and transport:
//equipment ids, a transport of -1 or 0 for none. Buying, deploying and the undeployed units are
//the current player's
export type Command =
	| { type: "move"; unit: number; to: Cell; cells?: Cell[] } //cells: where the path may go, see move
	| { type: "attack"; unit: number; target: number }
	| { type: "resupply"; unit: number }
	| { type: "reinforce"; unit: number; overstrength?: boolean }
	| { type: "mount"; unit: number }
	| { type: "unmount"; unit: number }
	| { type: "embark"; unit: number }
	| { type: "disembark"; unit: number }
	| { type: "undo"; unit: number } //the unit's last move
	| { type: "deploy"; index: number; to: Cell }
	| { type: "buy"; eqid: number; transport: number }
	| { type: "upgrade"; unit: number; eqid: number; transport: number } //eqid 0 or -1 keeps the unit, for a new transport
	| { type: "upgradeUndeployed"; index: number; eqid: number; transport: number }
	| { type: "disband"; unit: number } //a unit on the map, sold
	| { type: "sell"; index: number } //a core unit not on the map
	| { type: "endTurn" };

export type CommandType = Command["type"];
export type CommandOf<T extends CommandType> = Extract<Command, { type: T }>;

//Why a command isn't allowed, in words a player understands
export interface Refusal {
	reason: string;
}

//The move ends in the UI when its animation ends: animate gets the move and the finish to call
//then, with the air mode toggle of that moment (the hidden unit a surprise attack hits, #77).
//Without animate the move finishes at once (air mode off), with finish's hooks, then the surprise
//attack's second half with surprise's
export interface MoveCommandHooks {
	animate?(mr: movementResults, finish: (airMode: boolean | number, hooks?: FinishMoveHooks) => MoveResult): void;
	finish?: Omit<FinishMoveHooks, "attack">;
	surprise?: FinishAttackHooks;
}

//The attack ends in the UI when its animation ends: animate gets the combat and the finish to call
//then (Actions.finishAttack). Without animate it finishes at once, with finish's hooks. onStart
//comes first, before the support fire
export interface AttackCommandHooks extends AttackHooks {
	onStart?(): void;
	animate?(result: AttackResult, finish: (hooks?: FinishAttackHooks) => AttackResult): void;
	finish?: FinishAttackHooks;
}

//The defeat at the turn limit is only checked for a local side (Game's getLocalSide: -1 none,
//0, 1, 2 both), -1 by default
export interface EndTurnOptions {
	localSide?: number;
}

interface CommandHooks {
	move: MoveCommandHooks;
	attack: AttackCommandHooks;
	endTurn: EndTurnOptions;
}
export type HooksOf<T extends CommandType> = T extends keyof CommandHooks ? CommandHooks[T] : undefined;

//What run returns: the engine's own results. null where the engine returns nothing
interface CommandResults {
	move: movementResults;
	attack: AttackResult;
	resupply: Supply;
	reinforce: ReinforceResults;
	mount: null;
	unmount: null;
	embark: boolean;
	disembark: boolean;
	undo: null;
	deploy: boolean;
	buy: boolean;
	upgrade: boolean;
	upgradeUndeployed: boolean;
	disband: boolean;
	sell: boolean;
	endTurn: boolean; //the player who ended the turn lost at the turn limit
}
export type ResultOf<T extends CommandType> = CommandResults[T];

export interface Handler<C extends Command> {
	check(scenario: Scenario, cmd: C): Refusal | null; //pure: allowed, or why not
	run(scenario: Scenario, cmd: C, hooks?: HooksOf<C["type"]>): ResultOf<C["type"]>; //only after check allowed it
}

export type Executed<T extends CommandType> = { ok: true; result: ResultOf<T> } | { ok: false; refusal: Refusal };

export interface CommandsAPI {
	check(scenario: Scenario, cmd: Command): Refusal | null;
	execute<C extends Command>(scenario: Scenario, cmd: C, hooks?: HooksOf<C["type"]>): Executed<C["type"]>;
}

function refuse(reason: string): Refusal {
	return { reason: reason };
}

function unitOf(map: GameMap, id: number): Unit | null {
	return map.getUnitById(id);
}

//A unit on the map that passes rule (if given), or the refusal
function unitCheck(map: GameMap, id: number, rule?: (u: Unit) => boolean, reason?: string): Refusal | null {
	const unit = unitOf(map, id);
	if (unit === null)
		return refuse("no such unit");
	return !rule || rule(unit) ? null : refuse(reason);
}

function isOnMap(map: GameMap, cell: Cell): boolean {
	return cell.row >= 0 && cell.col >= 0 && cell.row < map.rows && cell.col < map.cols;
}

//The path GameMap.moveUnit takes: in cells when given, else in the unit's move range now
function movePath(map: GameMap, unit: Unit, cmd: CommandOf<"move">) {
	if (cmd.cells !== undefined)
		return GameRules.getShortestPath(unit.getPos(), cmd.to, cmd.cells as extendedCell[]); //(GameMap.moveUnit's cast)
	return GameRules.pathTo(map, unit, cmd.to);
}

//Unit.upgrade's own test: the same class (flak may become air defence), eqid 0 or less keeps the unit
function sameClass(unit: Unit, eqid: number): boolean {
	const newClass = Equipment.equipment[eqid > 0 ? eqid : unit.eqid].uclass;
	let oldClass = Equipment.equipment[unit.eqid].uclass;
	if (oldClass === unitClass.flak && newClass === unitClass.airDefence)
		oldClass = unitClass.airDefence;
	return oldClass === newClass;
}

function knownEquipment(eqid: number): boolean {
	return !(eqid > 0) || typeof Equipment.equipment[eqid] !== "undefined";
}

//Player.upgradeUnit's tests, for a unit of player
function upgradeCheck(unit: Unit, prestige: number, cmd: { eqid: number; transport: number }): Refusal | null {
	if (!knownEquipment(cmd.eqid) || !knownEquipment(cmd.transport))
		return refuse("no such equipment");
	if (GameRules.calculateUpgradeCosts(unit, cmd.eqid, cmd.transport) > prestige)
		return refuse("not enough prestige");
	if (!sameClass(unit, cmd.eqid))
		return refuse("not the same class");
	return null;
}

//The current player's core unit at index, if it is in the list
function coreUnit(map: GameMap, index: number): Unit | null {
	const p = map.currentPlayer;
	if (!p) return null;
	const u = p.getCoreUnitList()[index];
	return typeof u === "undefined" ? null : u;
}

//The hidden enemy a surprised unit runs into: the move's finish resolves the attack on it, the
//headless finish ends that attack too
function finishMoveAtOnce(map: GameMap, unit: Unit, mr: movementResults, h: MoveCommandHooks): void {
	const res = Actions.finishMove(map, unit, mr, false, h.finish);
	if (res.surprise !== null && res.surprise.attack !== null)
		Actions.finishAttack(map, res.surprise.attack, h.surprise);
}

const move: Handler<CommandOf<"move">> = {
	check: function(scenario, cmd) {
		const map = scenario.map;
		const unit = unitOf(map, cmd.unit);
		if (unit === null || !unit.getPos())
			return refuse("no such unit");
		if (!isOnMap(map, cmd.to) || movePath(map, unit, cmd).length === 0)
			return refuse("can't get there");
		return null;
	},
	run: function(scenario, cmd, hooks) {
		const h = hooks || {};
		const map = scenario.map;
		const unit = unitOf(map, cmd.unit);
		const mr = map.moveUnit(unit, cmd.to.row, cmd.to.col, cmd.cells);
		if (h.animate)
			h.animate(mr, function(airMode, finishHooks) { return Actions.finishMove(map, unit, mr, airMode, finishHooks); });
		else
			finishMoveAtOnce(map, unit, mr, h);
		return mr;
	}
};

//In range, as the AI checks it (the UI's attack hexes are in it too). Not whether the unit can
//still fire: the AI attacks after a surprise attack, which already fired
const attack: Handler<CommandOf<"attack">> = {
	check: function(scenario, cmd) {
		const map = scenario.map;
		const unit = unitOf(map, cmd.unit);
		const target = unitOf(map, cmd.target);
		if (unit === null)
			return refuse("no such unit");
		if (target === null)
			return refuse("no such target");
		if (!GameRules.isInAttackRange(unit, target))
			return refuse("out of range");
		return null;
	},
	run: function(scenario, cmd, hooks) {
		const h = hooks || {};
		const map = scenario.map;
		if (h.onStart) h.onStart();
		const result = Actions.resolveAttack(map, unitOf(map, cmd.unit), unitOf(map, cmd.target), h);
		if (h.animate)
			h.animate(result, function(finishHooks) { return Actions.finishAttack(map, result, finishHooks); });
		else
			Actions.finishAttack(map, result, h.finish);
		return result;
	}
};

//Not GameRules.canResupply, canReinforce, canMount, canUnmount (the buttons' rules): the engine
//plays these on any unit and changes it, the score too (#147)
const resupply: Handler<CommandOf<"resupply">> = {
	check: function(scenario, cmd) {
		return unitCheck(scenario.map, cmd.unit);
	},
	run: function(scenario, cmd) {
		return scenario.map.resupplyUnit(unitOf(scenario.map, cmd.unit));
	}
};

const reinforce: Handler<CommandOf<"reinforce">> = {
	check: function(scenario, cmd) {
		return unitCheck(scenario.map, cmd.unit);
	},
	run: function(scenario, cmd) {
		return scenario.map.reinforceUnit(unitOf(scenario.map, cmd.unit), cmd.overstrength === true);
	}
};

const mount: Handler<CommandOf<"mount">> = {
	check: function(scenario, cmd) {
		return unitCheck(scenario.map, cmd.unit);
	},
	run: function(scenario, cmd) {
		scenario.map.mountUnit(unitOf(scenario.map, cmd.unit));
		return null;
	}
};

const unmount: Handler<CommandOf<"unmount">> = {
	check: function(scenario, cmd) {
		return unitCheck(scenario.map, cmd.unit);
	},
	run: function(scenario, cmd) {
		scenario.map.unmountUnit(unitOf(scenario.map, cmd.unit));
		return null;
	}
};

//GameMap.embarkUnit: back on the carrier it was leaving, or on a transport of its port or airfield
//the player has left and its country has
const embark: Handler<CommandOf<"embark">> = {
	check: function(scenario, cmd) {
		const map = scenario.map;
		return unitCheck(map, cmd.unit, function(u) {
			if (u.carrier < 0)
				return true;
			const et = GameRules.getEmbarkType(map.map, u);
			return et > 0 && !!Equipment.getCountryEquipmentByClass(et, u.player.country + 1)[0];
		}, "can't embark");
	},
	run: function(scenario, cmd) {
		return scenario.map.embarkUnit(unitOf(scenario.map, cmd.unit));
	}
};

const disembark: Handler<CommandOf<"disembark">> = {
	check: function(scenario, cmd) {
		const map = scenario.map;
		return unitCheck(map, cmd.unit, function(u) { return GameRules.canDisembark(map.map, u); }, "can't disembark");
	},
	run: function(scenario, cmd) {
		return scenario.map.disembarkUnit(unitOf(scenario.map, cmd.unit));
	}
};

const undo: Handler<CommandOf<"undo">> = {
	check: function(scenario, cmd) {
		const map = scenario.map;
		return unitCheck(map, cmd.unit, function(u) { return map.canUndoMove(u); }, "can't undo");
	},
	run: function(scenario) {
		scenario.map.undoLastMove();
		return null;
	}
};

//On a free deployment hex of the player's side: the UI's click and GameMap.deployPlayerUnit's tests
const deploy: Handler<CommandOf<"deploy">> = {
	check: function(scenario, cmd) {
		const map = scenario.map;
		const u = coreUnit(map, cmd.index);
		if (u === null)
			return refuse("no such unit");
		if (u.isDeployed)
			return refuse("already deployed");
		if (!isOnMap(map, cmd.to))
			return refuse("off the map");
		const hex = map.map[cmd.to.row][cmd.to.col];
		const owner = hex.isDeployment > -1 ? map.getPlayer(hex.isDeployment) : null;
		if (owner === null || owner.side !== map.currentPlayer.side)
			return refuse("not a deployment hex");
		if (GameRules.isAir(u) ? hex.airunit !== null : hex.unit !== null)
			return refuse("the hex is taken");
		return null;
	},
	run: function(scenario, cmd) {
		const map = scenario.map;
		return map.deployPlayerUnit(map.currentPlayer, cmd.index, cmd.to.row, cmd.to.col);
	}
};

const buy: Handler<CommandOf<"buy">> = {
	check: function(scenario, cmd) {
		if (!(cmd.eqid > 0) || !knownEquipment(cmd.eqid) || !knownEquipment(cmd.transport))
			return refuse("no such equipment");
		if (GameRules.calculateUnitCosts(cmd.eqid, cmd.transport) > scenario.map.currentPlayer.prestige)
			return refuse("not enough prestige");
		return null;
	},
	run: function(scenario, cmd) {
		return scenario.map.currentPlayer.buyUnit(cmd.eqid, cmd.transport);
	}
};

const upgrade: Handler<CommandOf<"upgrade">> = {
	check: function(scenario, cmd) {
		const unit = unitOf(scenario.map, cmd.unit);
		if (unit === null)
			return refuse("no such unit");
		return upgradeCheck(unit, unit.player.prestige, cmd);
	},
	run: function(scenario, cmd) {
		return scenario.map.upgradeUnit(cmd.unit, cmd.eqid, cmd.transport);
	}
};

const upgradeUndeployed: Handler<CommandOf<"upgradeUndeployed">> = {
	check: function(scenario, cmd) {
		const map = scenario.map;
		const u = coreUnit(map, cmd.index);
		if (u === null)
			return refuse("no such unit");
		return upgradeCheck(u, map.currentPlayer.prestige, cmd);
	},
	run: function(scenario, cmd) {
		const p = scenario.map.currentPlayer;
		return p.upgradeUnit(coreUnit(scenario.map, cmd.index), cmd.eqid, cmd.transport);
	}
};

const disband: Handler<CommandOf<"disband">> = {
	check: function(scenario, cmd) {
		return unitCheck(scenario.map, cmd.unit);
	},
	run: function(scenario, cmd) {
		return scenario.map.disbandUnit(cmd.unit);
	}
};

const sell: Handler<CommandOf<"sell">> = {
	check: function(scenario, cmd) {
		return coreUnit(scenario.map, cmd.index) === null ? refuse("no such unit") : null;
	},
	run: function(scenario, cmd) {
		const p = scenario.map.currentPlayer;
		if (!p.sellUnit(coreUnit(scenario.map, cmd.index)))
			return false;
		p.removeUndeployedCoreUnit(cmd.index);
		return true;
	}
};

//Actions.endTurn: the next player's turn starts (an AI player plans it in Map.endTurn). Saving,
//the visible side and the reinforcements are Game's
const endTurn: Handler<CommandOf<"endTurn">> = {
	check: function() {
		return null;
	},
	run: function(scenario, _cmd, options) {
		const o = options || {};
		return Actions.endTurn(scenario, typeof o.localSide === "number" ? o.localSide : -1);
	}
};

//A handler for every type: a missing or misspelled one doesn't compile
const handlers: { [T in CommandType]: Handler<CommandOf<T>> } = {
	move: move,
	attack: attack,
	resupply: resupply,
	reinforce: reinforce,
	mount: mount,
	unmount: unmount,
	embark: embark,
	disembark: disembark,
	undo: undo,
	deploy: deploy,
	buy: buy,
	upgrade: upgrade,
	upgradeUndeployed: upgradeUndeployed,
	disband: disband,
	sell: sell,
	endTurn: endTurn,
};

//The handler of cmd's type (the registry's type can't name it for a type only known at the call)
function handlerOf<C extends Command>(cmd: C): Handler<C> {
	return handlers[cmd.type] as unknown as Handler<C>;
}

//Whether cmd is allowed now, or why not. Changes nothing
function check(scenario: Scenario, cmd: Command): Refusal | null {
	return handlerOf(cmd).check(scenario, cmd);
}

//Checks cmd, then plays it
function execute<C extends Command>(scenario: Scenario, cmd: C, hooks?: HooksOf<C["type"]>): Executed<C["type"]> {
	const handler = handlerOf(cmd);
	const refusal = handler.check(scenario, cmd);
	if (refusal !== null)
		return { ok: false, refusal: refusal };
	return { ok: true, result: handler.run(scenario, cmd, hooks) };
}

export const Commands: CommandsAPI = {
	check: check,
	execute: execute,
};
