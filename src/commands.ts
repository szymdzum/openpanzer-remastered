/**
 * Commands - every player action as plain data, one entry for all of them, played on the core (#137)
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 *
 * A command names its units by id and its hexes by cell, so it can be logged, saved, sent and written
 * by a program (docs/REFACTOR.md, step 4). The core plays it (src/core/step.ts: check, then the
 * command's handler); Commands.execute plays it whole in the running game, on the world of the game's
 * objects (src/mirror.ts), the objects updated to the world after it, and what the old engine did beside
 * the state where it did it: the selection's hexes, the combat log, the image cache.
 *
 * A move and an attack are played to their end before anything is shown (#375): a move with its surprise
 * attack and its capture, an attack with its support fire, the destroyed units, the retreat or the
 * surrender and the victory. The screen then animates them from the result (the step's events, with what
 * the old animation read in between: the strengths and the facings at the shots). Within the step the
 * objects pass through the worlds of its checkpoints, where the old engine set the selection's hexes;
 * each piece starts from the objects' world, so the selection's changes to the units are in it.
 *
 * What the state doesn't hold, done on the objects as the old engine's commands did it: a move shows
 * the unit's new move and attack hexes, an attack clears the attack hexes, a resupply, a reinforcement,
 * a mount, an embark or a disembark clear the selection's hexes, a mount, an unmount, an embark and an
 * undo select the unit again, a disembark shows the hexes it can land on, a disband deselects. The
 * selection's own changes to the units (a unit leaving its carrier put back on it) are the objects' and
 * reach the next command's world.
 */

import { Cell, type combatResults, movMethod, movementResults, type Supply, unitClass } from "./prototypes";
import { CombatLog } from "./combatlog";
import { engineContext, touched } from "./context";
import type { ReinforceResults } from "./map";
import type { Scenario } from "./scenario";
import type { Unit } from "./unit";
import { applyData, checkedDifference, gameInputs, rulesWorld, stepWorld, unitObject } from "./mirror";
import { attackResult } from "./core/combat";
import type { Fighter, GameEvent } from "./core/events";
import { begin, check, resume } from "./core/step";
import type { Checkpoint, World } from "./core/types";
import { unitById } from "./core/world";

//The player's actions. unit: a unit on the map by its id; index: a core unit not on the map, by
//its place in the current player's core unit list (the deployment list); eqid and transport:
//equipment ids, a transport of -1 or 0 for none. Buying, deploying and the undeployed units are
//the current player's
export type Command =
	| { type: "move"; unit: number; to: Cell; cells?: Cell[] } //cells: where the path may go (the move hexes shown)
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

//One side of an attack: its strength before and after the attack, what the animation draws it as (its
//class before the shots: a mounted defender dismounts in them) and where it faced when they were fired (a
//defender that retreated faces its retreat's way after)
export interface AttackSide {
	unit: Unit;
	cell: Cell;
	oldstr: number;
	newstr: number;
	leaderGain: boolean;
	uclass: number;
	facing: number;
}

//An attack played whole, as the screen shows it after the step (#375)
export interface AttackResult {
	attacking: AttackSide;
	defending: AttackSide;
	cr: combatResults; //the attack's results, the estimate when the attack didn't take place
	support: Unit[]; //the units that fired in support of the defender, in order
	attackStopped: boolean; //the support fire losses stopped the attack
	destroyed: Unit[]; //removed from the map after the attack, by their losses (attacker first)
	retreat: Cell | null; //where the defender retreated to
	retreatMove: movementResults | null; //the retreat's move: its capture, the victory it won
	surrender: boolean; //the defender had nowhere to retreat to
	victorySides: number[]; //the sides that won because the other one has no units left
	events: GameEvent[]; //what the attack did, in order
}

//A move played whole: the move, the surprise (the hidden unit hit, the attack on it played whole), the
//capture, the side the capture won for (-1: none)
export interface MoveResult {
	move: movementResults;
	at: Cell; //where the unit stopped, the path's end
	facing: number; //where it faced there, before a surprise attack turned it
	surprise: { cell: Cell; target: Unit | null; attack: AttackResult | null } | null;
	capture: boolean;
	victorySide: number;
	events: GameEvent[]; //what the move did, its surprise attack's too, in order
}

//What a command takes beside itself. reselect: after an attack's cleanup the selected unit is selected
//again (cleared when the attack destroyed it), with its move hexes made again when it destroyed the
//defender, as the old UI did there (D0.5 takes the selection out of the game's objects)
export interface ExecuteOptions {
	reselect?: boolean;
}

//What execute returns: the old engine's results (a move's and an attack's, the step played whole). null where
//it returned nothing
interface CommandResults {
	move: MoveResult;
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
	endTurn: null; //(the game ends a turn through its session, src/coresession.ts: this is the step alone)
}
export type ResultOf<T extends CommandType> = CommandResults[T];

export type Executed<T extends CommandType> = { ok: true; result: ResultOf<T> } | { ok: false; refusal: Refusal };

//The world of the game's objects now, for a step to start from
function worldNow(scenario: Scenario): World {
	return stepWorld(scenario, engineContext.host(), gameInputs({ spotSide: engineContext.spotSide(), rules: engineContext.rules() }));
}

//The objects to the world: they must then mirror it (a difference is a bug in the mirror, which the
//checks look for)
function mirror(scenario: Scenario, w: World) {
	const host = engineContext.host();
	applyData(scenario, w, host);
	const difference = checkedDifference(scenario, w, host);
	if (difference !== "") throw new Error("Commands: " + difference);
}

//Whether cmd is allowed now, or why not (a query: on the world the screen's rules read)
function checkNow(scenario: Scenario, cmd: Command): Refusal | null {
	return check(rulesWorld(scenario, engineContext.host(), gameInputs({ spotSide: engineContext.spotSide(), rules: engineContext.rules() })), cmd);
}

//Checks cmd, then plays it whole on the core and mirrors it
function execute<C extends Command>(scenario: Scenario, cmd: C, options?: ExecuteOptions): Executed<C["type"]> {
	const w = worldNow(scenario);
	const refusal = check(w, cmd);
	if (refusal !== null) return { ok: false, refusal };
	return { ok: true, result: run(scenario, w, cmd, options || {}) as ResultOf<C["type"]> };
}

function run(scenario: Scenario, w: World, cmd: Command, options: ExecuteOptions): unknown {
	if (cmd.type === "move") return move(scenario, w, cmd, options);
	if (cmd.type === "attack") return attack(scenario, w, cmd, options);
	if (cmd.type === "disband") scenario.map.delCurrentUnit();
	const b = begin(cmd.type === "disband" ? worldNow(scenario) : w, cmd);
	if ("refusal" in b) throw new Error("Commands: " + b.refusal.reason);
	mirror(scenario, b.world);
	return afterCommand(scenario, cmd, b.events);
}

//What a command other than a move and an attack did beside the state, and its result as the old
//engine's command returned it
type After = (scenario: Scenario, unit: Unit | null, events: GameEvent[]) => unknown;

const has = (events: GameEvent[], type: GameEvent["type"]) => events.some((e) => e.type === type);
const emitted = (type: GameEvent["type"]): After => (_s, _u, events) => has(events, type);

const after: { [T in CommandType]?: After } = {
	resupply: (scenario, _u, events) => {
		scenario.map.delAttackSel();
		scenario.map.delMoveSel();
		const e = events.find((x) => x.type === "resupplied");
		return e !== undefined && e.type === "resupplied" ? e.supply as Supply : null;
	},
	reinforce: (scenario, _u, events) => reinforced(scenario, events),
	mount: (scenario, unit) => reselect(scenario, unit),
	unmount: (scenario, unit) => reselect(scenario, unit),
	embark: (scenario, unit, events) => has(events, "embarked") && reselect(scenario, unit) === null,
	disembark: (scenario, _u, events) => disembarked(scenario, events),
	undo: (scenario, unit) => {
		scenario.map.selectUnit(unit);
		return null;
	},
	deploy: emitted("deployed"),
	buy: emitted("bought"),
	upgrade: (scenario, unit, events) => has(events, "upgraded") && upgradeImages(scenario.map.getUnitImagesList(), unit),
	upgradeUndeployed: emitted("upgraded"),
	disband: emitted("disbanded"),
	sell: emitted("sold"),
};

function afterCommand(scenario: Scenario, cmd: Command, events: GameEvent[]): unknown {
	const f = after[cmd.type];
	return f === undefined ? null : f(scenario, "unit" in cmd ? scenario.map.getUnitById(cmd.unit) : null, events);
}

//GameMap.upgradeUnit: the image cache gets the unit's new icon under its eqid (its transport's when it
//is mounted, kept) and its transport's
function upgradeImages(images: { [eqid: number]: string }, u: Unit): true {
	images[u.eqid] = u.getIcon();
	if (u.transport !== null) images[u.transport.eqid] = u.transport.icon;
	return true;
}

//Map.reinforceUnit: the strength, ammo and fuel given, none when the player couldn't pay for any
function reinforced(scenario: Scenario, events: GameEvent[]): ReinforceResults {
	const e = events.find((x) => x.type === "reinforced");
	if (e === undefined || e.type !== "reinforced") return { strength: 0, ammo: 0, fuel: 0 };
	scenario.map.delAttackSel();
	scenario.map.delMoveSel();
	return { strength: e.strength, ammo: e.supply.ammo, fuel: e.supply.fuel };
}

//The unit selected again for its new move and attack hexes (a mount, an unmount, an embark)
function reselect(scenario: Scenario, unit: Unit): null {
	scenario.map.delMoveSel();
	scenario.map.delAttackSel();
	scenario.map.selectUnit(unit);
	return null;
}

//Map.disembarkUnit: the hexes the unit can land on are its move hexes
function disembarked(scenario: Scenario, events: GameEvent[]): boolean {
	const e = events.find((x) => x.type === "disembarked");
	if (e === undefined || e.type !== "disembarked") return false;
	const m = scenario.map;
	m.delMoveSel();
	m.delAttackSel();
	for (const c of e.cells) m.getSelection().addMoveCell(new Cell(c.row, c.col), true);
	return true;
}

//---- The move

//Map.moveUnit's result: the hexes passed (those the other side saw marked), where a hidden enemy
//stopped it, the capture and its win
function movementOf(events: GameEvent[], unit: number, cp: Checkpoint | null): movementResults {
	const mr = new movementResults();
	const moved = events.find((e) => (e.type === "moved" || e.type === "retreated") && e.unit === unit);
	if (moved !== undefined && (moved.type === "moved" || moved.type === "retreated")) {
		mr.isVisible = moved.visible;
		mr.passedCells = moved.path.map(pathCell);
	}
	mr.isCapture = events.some((e) => e.type === "captured" && e.unit === unit && (e.flag || e.objective));
	if (cp !== null && cp.next === "surprise" && cp.surprise !== null) mr.surpriseCell = new Cell(cp.surprise.row, cp.surprise.col);
	return mr;
}

//A hex of the path as the move's animation reads it: marked when the other side saw it
function pathCell(c: { row: number; col: number; visible: boolean }): Cell {
	const cell = new Cell(c.row, c.col) as Cell & { isVisible?: boolean };
	if (c.visible) cell.isVisible = true;
	return cell;
}

//The objectives taken, in the combat log (Map.captureHex)
function logCaptures(scenario: Scenario, events: GameEvent[]) {
	for (const e of events)
		if (e.type === "captured" && e.objective)
			CombatLog.addObjectiveCapture(new Cell(e.at.row, e.at.col), scenario.map.getUnitById(e.unit).player.side);
}

//The move played whole: the move, then its surprise attack (on the hidden unit that stopped it) to its
//end, or the capture's victory. The objects pass through the worlds of the step's checkpoints, here only,
//for what the old engine did beside the state there: the moved unit's move and attack hexes on the world
//of its move (the surprise attack's shots then clear the attack hexes), the combat log, the selection after
//the attack's cleanup. Nothing outside sees them: the screen shows the step after it (#375)
function move(scenario: Scenario, w: World, cmd: CommandOf<"move">, options: ExecuteOptions): MoveResult {
	const b = begin(w, cmd);
	if ("refusal" in b) throw new Error("Commands: " + b.refusal.reason);
	mirror(scenario, b.world);
	const m = scenario.map, unit = m.getUnitById(cmd.unit);
	logCaptures(scenario, b.events);
	m.setMoveRange(unit);
	m.setAttackRange(unit);
	const cp = b.checkpoint as MoveCheckpoint;
	const mr = movementOf(b.events, cmd.unit, cp);
	if (cp.win) mr.isVictorySide = unit.player.side;
	const result: MoveResult = { move: mr, at: unit.getPos(), facing: unit.facing, surprise: null, capture: mr.isCapture,
		victorySide: mr.isVictorySide, events: b.events };
	if (cp.surprise !== null) {
		result.surprise = surprise(scenario, unit, cp, options);
		if (result.surprise.attack !== null) result.events = [...b.events, ...result.surprise.attack.events];
	} else {
		mirror(scenario, resume(worldNow(scenario), cp).world);
	}
	return result;
}

//Where a move's surprise attack starts
type MoveCheckpoint = Extract<Checkpoint, { next: "surprise" }>;

//The old Actions.finishMove's surprise attack: its target the unit of the mover's kind first (the one that
//stopped it, #77) that the mover can attack, its shots and its finish as an attack's; the mover no longer
//surprised
function surprise(scenario: Scenario, unit: Unit, cp: MoveCheckpoint, options: ExecuteOptions): NonNullable<MoveResult["surprise"]> {
	const cell = new Cell(cp.surprise.row, cp.surprise.col);
	const target = scenario.map.map[cell.row][cell.col].getAttackableUnit(unit, unit.unitData().movmethod === movMethod.air);
	if (target === null) {
		mirror(scenario, resume(worldNow(scenario), cp).world);
		return { cell, target, attack: null };
	}
	const w = worldNow(scenario), sides = sidesOf(unit, target), estimate = estimateOf(w, unit, target);
	const r = resume(w, cp);
	mirror(scenario, r.world);
	if (!r.events.some((e) => e.type === "fight" && !e.support && e.defender.unit === target.id))
		throw new Error("Commands: the surprise attack's target isn't the screen's");
	return { cell, target, attack: finishAttack(scenario, shots(scenario, r.events, sides, estimate), r.checkpoint, options) };
}

//The attack's estimate (Actions.resolveAttack's first combat result, before any shot)
function estimateOf(w: World, attacker: Unit, defender: Unit): combatResults {
	return attackResult(w, unitById(w, attacker.id), unitById(w, defender.id), null) as unknown as combatResults;
}

//---- The attack

//The two sides before the attack: their units, cells and strengths
function sidesOf(attacker: Unit, defender: Unit): [AttackSide, AttackSide] {
	const side = (u: Unit): AttackSide => ({ unit: u, cell: u.getPos(), oldstr: u.strength, newstr: 0, leaderGain: false,
		uclass: u.unitData().uclass, facing: u.facing });
	return [side(attacker), side(defender)];
}

//The attack played whole: its shots, then its finish (the objects through its checkpoints as a move's)
function attack(scenario: Scenario, w: World, cmd: CommandOf<"attack">, options: ExecuteOptions): AttackResult {
	const m = scenario.map;
	const sides = sidesOf(m.getUnitById(cmd.unit), m.getUnitById(cmd.target));
	const estimate = estimateOf(w, sides[0].unit, sides[1].unit);
	const b = begin(w, cmd);
	if ("refusal" in b) throw new Error("Commands: " + b.refusal.reason);
	mirror(scenario, b.world);
	return finishAttack(scenario, shots(scenario, b.events, sides, estimate), b.checkpoint, options);
}

//A unit of a fight as the combat log reads it, before or after
function logged(scenario: Scenario, f: Fighter, done: boolean) {
	const s = done ? f.after : f.before, u = unitObject(scenario.map, f.unit);
	return { id: f.unit, eqid: f.eqid, player: { side: f.side }, strength: s.strength, experience: s.experience,
		entrenchment: s.entrenchment, ammo: s.ammo, isMounted: f.isMounted, isSurprised: f.isSurprised, isCore: u.isCore,
		getPos: () => new Cell(f.row, f.col) } as unknown as Unit;
}

//The old Actions.resolveAttack after the shots: each fire in the combat log with the leaders it gave, the
//attack hexes cleared by the attack itself, the result as the old one (the estimate's when there was no
//attack), the strengths and the facings after the shots
function shots(scenario: Scenario, events: GameEvent[], sides: [AttackSide, AttackSide], estimate: combatResults): AttackResult {
	const result: AttackResult = { attacking: sides[0], defending: sides[1], cr: estimate, support: [], attackStopped: false,
		destroyed: [], retreat: null, retreatMove: null, surrender: false, victorySides: [], events: [...events] };
	events.forEach((e, i) => {
		if (e.type === "attackStopped") result.attackStopped = true;
		if (e.type === "fight") fired(scenario, e, leadersAfter(events, i), result);
	});
	for (const side of sides) {
		side.newstr = side.unit.strength;
		side.facing = side.unit.facing;
	}
	return result;
}

//The leaders a fire gave: the events right after it
function leadersAfter(events: GameEvent[], i: number): number[] {
	const ids: number[] = [];
	for (let k = i + 1; k < events.length && events[k].type === "leader"; k++) {
		const l = events[k];
		if (l.type === "leader") ids.push(l.unit);
	}
	return ids;
}

//One unit firing on another (Map.attackUnit and what resolveAttack did after it): the combat log with
//the leaders, the attack hexes cleared by the attack itself
function fired(scenario: Scenario, e: Extract<GameEvent, { type: "fight" }>, leaders: number[], result: AttackResult) {
	const m = scenario.map;
	//The fight's own turn: the bundle read a global map's, in the page the canvas's, undefined (#28)
	const id = CombatLog.addCombatStart(logged(scenario, e.attacker, false), logged(scenario, e.defender, false), m.turn);
	if (!e.support) m.delAttackSel();
	for (const l of leaders) CombatLog.addLeader(unitObject(m, l));
	CombatLog.addCombatEnd(logged(scenario, e.attacker, true), logged(scenario, e.defender, true), id, e.support);
	if (e.support) {
		result.support.push(unitObject(m, e.attacker.unit));
		return;
	}
	result.cr = e.result as unknown as combatResults;
	result.attacking.leaderGain = e.result.atkLeaderGain;
	result.defending.leaderGain = e.result.defLeaderGain;
}

//The old Actions.finishAttack: the units destroyed (by the strengths in the result) off the map, the
//selection again (options.reselect), the retreat or the surrender, the victory
function finishAttack(scenario: Scenario, result: AttackResult, cp: Checkpoint | null, options: ExecuteOptions): AttackResult {
	for (const side of [result.attacking, result.defending])
		if (side.oldstr - side.newstr >= side.oldstr) result.destroyed.push(side.unit);
	if (cp === null) return result;
	const cleaned = resume(worldNow(scenario), cp);
	mirror(scenario, cleaned.world);
	if (options.reselect) reselectAfterAttack(scenario.map, result.attacking.unit, result.defending.unit);
	const ended = resume(worldNow(scenario), cleaned.checkpoint);
	mirror(scenario, ended.world);
	result.events.push(...cleaned.events, ...ended.events);
	for (const e of ended.events) ending(scenario, result, e, ended.events);
	return result;
}

//The old UI's selection after the attack's cleanup (its uiReselectAfterAttack): cleared when its unit was
//destroyed, else selected again, with its move hexes made again when it destroyed the defender (the old
//game read the cleared selection when both units were destroyed: it threw, #326, #29)
function reselectAfterAttack(m: Scenario["map"], attacker: Unit, defender: Unit) {
	const u = m.currentUnit;
	if (!u) return;
	if (attacker.destroyed && u.id === attacker.id) {
		m.delCurrentUnit();
		return;
	}
	m.selectUnit(u);
	if (defender.destroyed && !u.hasMoved) m.setMoveRange(u);
}

//What the attack's end did: the retreat, the surrender, the victory
function ending(scenario: Scenario, result: AttackResult, e: GameEvent, events: GameEvent[]) {
	if (e.type === "retreated") retreated(scenario, result, events);
	if (e.type === "surrendered") result.surrender = true;
	if (e.type === "victory") result.victorySides.push(e.side);
}

//Map.retreatUnit: the retreat's move shows the unit's move and attack hexes as a move does, then the
//unit selected before is selected again
function retreated(scenario: Scenario, result: AttackResult, events: GameEvent[]) {
	const m = scenario.map, u = result.defending.unit, before = m.currentUnit;
	logCaptures(scenario, events);
	showRetreatRanges(m, u);
	if (before !== null) m.selectUnit(before);
	const mr = movementOf(events, u.id, null);
	const captured = events.find((e) => e.type === "captured" && e.unit === u.id);
	if (captured !== undefined && captured.type === "captured" && captured.win) mr.isVictorySide = u.player.side;
	result.retreat = u.getPos();
	result.retreatMove = mr;
}

//The retreated unit's move and attack hexes as the old retreat's move showed them: with the move's
//points spent (Unit.move: a mounted unit's all of them; done unless a recon unit with points left),
//which the retreat gives back after
function showRetreatRanges(m: Scenario["map"], u: Unit) {
	const kept = { moveLeft: u.moveLeft, hasMoved: u.hasMoved, hasOverstrength: u.hasOverstrength };
	if (u.isMounted && u.transport !== null) u.moveLeft = 0;
	if (u.unitData().uclass !== unitClass.recon || u.moveLeft <= 0) u.hasMoved = u.hasOverstrength = true;
	touched();
	m.setMoveRange(u);
	m.setAttackRange(u);
	Object.assign(u, kept);
	touched();
}

export interface CommandsAPI {
	check(scenario: Scenario, cmd: Command): Refusal | null;
	execute<C extends Command>(scenario: Scenario, cmd: C, options?: ExecuteOptions): Executed<C["type"]>;
}

//(a module object: the harness's and the contracts' Commands)
export const Commands: CommandsAPI = {
	check: checkNow,
	execute: execute,
};
