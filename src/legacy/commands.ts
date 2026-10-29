/**
 * Commands - every player action as plain data, one entry for all of them, played on the core (#137)
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 *
 * A command names its units by id and its hexes by cell, so it can be logged, saved, sent and written
 * by a program (docs/REFACTOR.md, step 4). The core plays it (src/core/step.ts: check, then the
 * command's handler); Commands.execute plays it whole in the running game, on the game's world (src/legacy/mirror.ts),
 * the objects updated to the world after it, and what the old engine did beside the state: the combat log,
 * the image cache.
 *
 * A move and an attack are played to their end before anything is shown (#375): a move with its surprise
 * attack and its capture, an attack with its support fire, the destroyed units, the retreat or the
 * surrender and the victory. The screen then animates them from the result (the step's events, with what
 * the animation reads in between: the strengths and the facings at the shots, read off the worlds of
 * the step's checkpoints). The objects are updated once, to the world at the step's end (a unit the step took
 * off the map to its last state in the step).
 *
 * The selection is not the game's (#377): a command doesn't touch it. MapSelection.after sets what the
 * command left selected (src/legacy/selection.ts).
 */

import { Cell, type combatResults, movementResults, type Supply } from "./prototypes";
import { CombatLog } from "./combatlog";
import { engineContext } from "./context";
import type { GameMap, ReinforceResults } from "./map";
import type { Scenario } from "./scenario";
import type { Unit } from "./unit";
import { applyData, applyGone, checkedDifference, gameInputs, rulesWorld, stepWorld, unitObject } from "./mirror";
import { attackResult } from "../core/combat";
import type { Fighter, GameEvent } from "../core/events";
import { begin, check, resume } from "../core/step";
import type { Checkpoint, UnitState, World } from "../core/types";
import { sideOf, unitById, unitData } from "../core/world";
import type { Command, CommandOf, CommandType, Refusal } from "../core/command";

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
	//The world once the destroyed units left the map, before the retreat or the surrender: the
	//selection after the attack is made on it (src/legacy/selection.ts)
	cleanedUp: World;
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
	moved: World; //the world once the unit moved, before its surprise attack: the selection shows its hexes on it
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
	endTurn: null; //(the game ends a turn through its session, src/app/driver.ts: this is the step alone)
}
export type ResultOf<T extends CommandType> = CommandResults[T];

export type Executed<T extends CommandType> = { ok: true; result: ResultOf<T> } | { ok: false; refusal: Refusal };

//The game's world now, for a step to start from
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

//The objects to the last of a step's worlds, once. A unit the step took off the map keeps what it was in the
//last world it was in, as the objects going through the step's worlds left it: a destroyed
//unit's object is read after the step (its strength, whether it fired)
function mirrorEnd(scenario: Scenario, worlds: World[]) {
	const end = worlds[worlds.length - 1], gone = new Set<number>();
	for (let i = worlds.length - 2; i >= 0; i--)
		for (const u of worlds[i].state.units)
			if (!gone.has(u.id) && unitById(end, u.id) === null) {
				gone.add(u.id);
				applyGone(scenario.map, u);
			}
	mirror(scenario, end);
}

//Whether cmd is allowed now, or why not (a query: on the world the screen's rules read)
function checkNow(scenario: Scenario, cmd: Command): Refusal | null {
	return check(rulesWorld(scenario, engineContext.host(), gameInputs({ spotSide: engineContext.spotSide(), rules: engineContext.rules() })), cmd);
}

//Checks cmd, then plays it whole on the core and mirrors it
function execute<C extends Command>(scenario: Scenario, cmd: C): Executed<C["type"]> {
	const w = worldNow(scenario);
	const refusal = check(w, cmd);
	if (refusal !== null) return { ok: false, refusal };
	return { ok: true, result: run(scenario, w, cmd) as ResultOf<C["type"]> };
}

function run(scenario: Scenario, w: World, cmd: Command): unknown {
	if (cmd.type === "move") return move(scenario, w, cmd);
	if (cmd.type === "attack") return attack(scenario, w, cmd);
	const b = begin(w, cmd);
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
	resupply: (_s, _u, events) => (events.find((x) => x.type === "resupplied") as Extract<GameEvent, { type: "resupplied" }>).supply as Supply,
	reinforce: (_s, _u, events) => reinforced(events),
	embark: emitted("embarked"),
	disembark: emitted("disembarked"),
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
function reinforced(events: GameEvent[]): ReinforceResults {
	const e = events.find((x) => x.type === "reinforced");
	if (e === undefined || e.type !== "reinforced") return { strength: 0, ammo: 0, fuel: 0 };
	return { strength: e.strength, ammo: e.supply.ammo, fuel: e.supply.fuel };
}

//A unit in a world of the step: it is there (a destroyed one until the attack's clean up)
function unitIn(w: World, id: number): UnitState {
	const u = unitById(w, id);
	if (u === null) throw new Error("Commands: no unit " + id);
	return u;
}

const cellOf = (u: UnitState) => new Cell(u.row, u.col);

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

//The objectives taken, in the combat log (Map.captureHex): w, the world after them
function logCaptures(w: World, events: GameEvent[]) {
	for (const e of events)
		if (e.type === "captured" && e.objective)
			CombatLog.addObjectiveCapture(new Cell(e.at.row, e.at.col), sideOf(w, unitIn(w, e.unit)));
}

//The move played whole: the move, then its surprise attack (on the hidden unit that stopped it) to its
//end, or the capture's victory. What the result tells of the move (where the unit stopped, its facing)
//is read off the world of the move, before the surprise attack turned it; the objects are updated once,
//at the end. Nothing outside sees the worlds in between: the screen shows the step after it (#375)
function move(scenario: Scenario, w: World, cmd: CommandOf<"move">): MoveResult {
	const b = begin(w, cmd);
	if ("refusal" in b) throw new Error("Commands: " + b.refusal.reason);
	const moved = b.world, unit = unitIn(moved, cmd.unit);
	logCaptures(moved, b.events);
	const cp = b.checkpoint as MoveCheckpoint;
	const mr = movementOf(b.events, cmd.unit, cp);
	if (cp.win) mr.isVictorySide = sideOf(moved, unit);
	const result: MoveResult = { move: mr, at: cellOf(unit), facing: unit.facing, surprise: null, capture: mr.isCapture,
		victorySide: mr.isVictorySide, events: b.events, moved };
	let rest: World[];
	if (cp.surprise !== null) {
		const s = surprise(scenario, moved, cp);
		result.surprise = s.surprise;
		if (s.surprise.attack !== null) result.events = [...b.events, ...s.surprise.attack.events];
		rest = s.worlds;
	} else {
		rest = [resume(moved, cp).world];
	}
	mirrorEnd(scenario, [moved, ...rest]);
	return result;
}

//Where a move's surprise attack starts
type MoveCheckpoint = Extract<Checkpoint, { next: "surprise" }>;

//The old Actions.finishMove's surprise attack: its target the unit of the mover's kind first (the one that
//stopped it, #77) that the mover can attack, its shots and its finish as an attack's; the mover no longer
//surprised. Without a target, nothing but the capture's victory. The worlds it went through
function surprise(scenario: Scenario, moved: World, cp: MoveCheckpoint): { surprise: NonNullable<MoveResult["surprise"]>; worlds: World[] } {
	const cell = new Cell(cp.surprise.row, cp.surprise.col);
	const r = resume(moved, cp);
	if (r.checkpoint === null || r.checkpoint.next !== "cleanUp")
		return { surprise: { cell, target: null, attack: null }, worlds: [r.world] };
	const start = r.checkpoint.attack, m = scenario.map;
	const sides = sidesOf(m, moved, start.attacker, start.defender), estimate = estimateOf(moved, start.attacker, start.defender);
	const done = finishAttack(m, shots(m, r.events, sides, estimate, r.world), r.checkpoint, r.world);
	return { surprise: { cell, target: sides[1].unit, attack: done.result }, worlds: [r.world, ...done.worlds] };
}

//The attack's estimate (Actions.resolveAttack's first combat result, before any shot)
function estimateOf(w: World, attacker: number, defender: number): combatResults {
	return attackResult(w, unitIn(w, attacker), unitIn(w, defender), null) as unknown as combatResults;
}

//---- The attack

//The two sides before the attack, in w: their units, cells, strengths, classes and facings
function sidesOf(m: GameMap, w: World, attacker: number, defender: number): [AttackSide, AttackSide] {
	const side = (id: number): AttackSide => {
		const u = unitIn(w, id);
		return { unit: unitObject(m, id), cell: cellOf(u), oldstr: u.strength, newstr: 0, leaderGain: false,
			uclass: unitData(w, u).uclass, facing: u.facing };
	};
	return [side(attacker), side(defender)];
}

//The attack played whole: its shots, then its finish
function attack(scenario: Scenario, w: World, cmd: CommandOf<"attack">): AttackResult {
	const m = scenario.map;
	const sides = sidesOf(m, w, cmd.unit, cmd.target);
	const estimate = estimateOf(w, cmd.unit, cmd.target);
	const b = begin(w, cmd);
	if ("refusal" in b) throw new Error("Commands: " + b.refusal.reason);
	const done = finishAttack(m, shots(m, b.events, sides, estimate, b.world), b.checkpoint as Checkpoint, b.world);
	mirrorEnd(scenario, [b.world, ...done.worlds]);
	return done.result;
}

//A unit of a fight as the combat log reads it, before or after
function logged(m: GameMap, f: Fighter, done: boolean) {
	const s = done ? f.after : f.before, u = unitObject(m, f.unit);
	return { id: f.unit, eqid: f.eqid, player: { side: f.side }, strength: s.strength, experience: s.experience,
		entrenchment: s.entrenchment, ammo: s.ammo, isMounted: f.isMounted, isSurprised: f.isSurprised, isCore: u.isCore,
		getPos: () => new Cell(f.row, f.col) } as unknown as Unit;
}

//A unit that gained a leader as the combat log reads it, in the world of the shots (a defender that
//retreats is still where it was hit)
function leaderUnit(m: GameMap, w: World, id: number) {
	const u = unitIn(w, id);
	return { id, eqid: u.eqid, isCore: unitObject(m, id).isCore, leader: u.leader, player: { side: sideOf(w, u) },
		getPos: () => cellOf(u), unitData: () => unitData(w, u) } as unknown as Unit;
}

//The old Actions.resolveAttack after the shots: each fire in the combat log with the leaders it gave, the
//result as the old one (the estimate's when there was no attack), the strengths and the facings after
//the shots (w, the world then)
function shots(m: GameMap, events: GameEvent[], sides: [AttackSide, AttackSide], estimate: combatResults, w: World): AttackResult {
	const result: AttackResult = { attacking: sides[0], defending: sides[1], cr: estimate, support: [], attackStopped: false,
		destroyed: [], retreat: null, retreatMove: null, surrender: false, victorySides: [], events: [...events], cleanedUp: w }; //(the cleanup's world: finishAttack)
	events.forEach((e, i) => {
		if (e.type === "attackStopped") result.attackStopped = true;
		if (e.type === "fight") fired(m, w, e, leadersAfter(events, i), result);
	});
	for (const side of sides) {
		const u = unitIn(w, side.unit.id);
		side.newstr = u.strength;
		side.facing = u.facing;
	}
	return result;
}

//The leaders a fire gave: the events right after it
function leadersAfter(events: GameEvent[], i: number): number[] {
	const ids: number[] = [];
	for (let k = i + 1; k < events.length && events[k].type === "leader"; k++)
		ids.push((events[k] as Extract<GameEvent, { type: "leader" }>).unit);
	return ids;
}

//One unit firing on another (Map.attackUnit and what resolveAttack did after it): the combat log with
//the leaders
function fired(m: GameMap, w: World, e: Extract<GameEvent, { type: "fight" }>, leaders: number[], result: AttackResult) {
	//The fight's own turn: the bundle read a global map's, in the page the canvas's, undefined (#28)
	const id = CombatLog.addCombatStart(logged(m, e.attacker, false), logged(m, e.defender, false), m.turn);
	for (const l of leaders) CombatLog.addLeader(leaderUnit(m, w, l));
	CombatLog.addCombatEnd(logged(m, e.attacker, true), logged(m, e.defender, true), id, e.support);
	if (e.support) {
		result.support.push(unitObject(m, e.attacker.unit));
		return;
	}
	result.cr = e.result as unknown as combatResults;
	result.attacking.leaderGain = e.result.atkLeaderGain;
	result.defending.leaderGain = e.result.defLeaderGain;
}

//The old Actions.finishAttack: the units destroyed (by the strengths in the result) off the map, the
//retreat or the surrender, the victory. The worlds it went through (w: at the shots)
function finishAttack(m: GameMap, result: AttackResult, cp: Checkpoint, w: World): { result: AttackResult; worlds: World[] } {
	for (const side of [result.attacking, result.defending])
		if (side.oldstr - side.newstr >= side.oldstr) result.destroyed.push(side.unit);
	const cleaned = resume(w, cp);
	result.cleanedUp = cleaned.world;
	const ended = resume(cleaned.world, cleaned.checkpoint as Checkpoint);
	result.events.push(...cleaned.events, ...ended.events);
	for (const e of ended.events) ending(m, result, e, ended);
	return { result, worlds: [cleaned.world, ended.world] };
}

//What the attack's end did: the retreat, the surrender, the victory
function ending(m: GameMap, result: AttackResult, e: GameEvent, ended: { world: World; events: GameEvent[] }) {
	if (e.type === "retreated") retreated(m, result, ended.world, ended.events);
	if (e.type === "surrendered") result.surrender = true;
	if (e.type === "victory") result.victorySides.push(e.side);
}

//Map.retreatUnit: the retreat's move, its capture and the victory it won (w: the world after it)
function retreated(_m: GameMap, result: AttackResult, w: World, events: GameEvent[]) {
	const u = unitIn(w, result.defending.unit.id);
	logCaptures(w, events);
	const mr = movementOf(events, u.id, null);
	const captured = events.find((e) => e.type === "captured" && e.unit === u.id);
	if (captured !== undefined && captured.type === "captured" && captured.win) mr.isVictorySide = sideOf(w, u);
	result.retreat = cellOf(u);
	result.retreatMove = mr;
}

//A unit leaving its carrier put back on it: the selection left it, or it can't land any more (the
//selection's flip of its carrier, src/legacy/selection.ts). The embark's step alone: what the selection shows
//beside it (the unit selected again) is its own business there. The hexes' counters stay as
//they were until the next command, as the flip left them (the world's sight has the unit aboard),
//unless counters: then they are the world's (an attack's selection put it back aboard before the attack's
//end, whose update counted them again)
export function backAboard(scenario: Scenario, unit: number, counters = false) {
	const b = begin(worldNow(scenario), { type: "embark", unit });
	if ("refusal" in b) throw new Error("Commands: " + b.refusal.reason);
	applyData(scenario, b.world, engineContext.host(), counters);
}

export interface CommandsAPI {
	check(scenario: Scenario, cmd: Command): Refusal | null;
	execute<C extends Command>(scenario: Scenario, cmd: C): Executed<C["type"]>;
}

//(a module object: the harness's and the contracts' Commands)
export const Commands: CommandsAPI = {
	check: checkNow,
	execute: execute,
};
