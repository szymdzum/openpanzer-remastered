/**
 * CorePlay - the running game's commands played on the core (#137): the world made from the game's
 * objects (src/mirror.ts), the command stepped checkpoint by checkpoint, the objects updated after
 * each piece, and what the old engine did beside the state, where it did it: the selection's hexes,
 * the combat log, the image cache, and the hooks the UI animates and alerts with
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 *
 * The same entry as Commands.execute, with the same hooks: a move hands its finish to the animate hook
 * (the UI calls it when the move's animation ends) and an attack its own, which the UI calls when the
 * attack's animation ends. Between the two the objects show the state in between, as before: the move
 * made, the shots fired. What the UI or the harness writes into the objects meanwhile (the animation's
 * facing, #187) is in the world the finish plays on: each piece starts from the world made again from
 * the objects.
 *
 * What the state doesn't hold, done on the objects as the old engine's commands did it: a move shows
 * the unit's new move and attack hexes, an attack clears the attack hexes, a resupply, a reinforcement,
 * a mount, an embark or a disembark clear the selection's hexes, a mount, an unmount, an embark and an
 * undo select the unit again, a disembark shows the hexes it can land on, a disband deselects. The
 * selection's own changes to the units (a unit leaving its carrier put back on it) are the objects' and
 * reach the next command's world.
 */

import { Cell, type combatResults, movementResults, type Supply, uiSettings } from "./prototypes";
import { CombatLog } from "./combatlog";
import { engineContext } from "./context";
import type { AttackResult, AttackSide, FinishAttackHooks, MoveResult } from "./actions";
import type { AttackCommandHooks, Command, CommandOf, CommandType, Executed, Refusal, ResultOf } from "./commands";
import type { ReinforceResults } from "./map";
import type { Scenario } from "./scenario";
import type { Unit } from "./unit";
import { applyData, mirrorDifference, unitObject, worldOf } from "./mirror";
import { attackResult } from "./core/combat";
import type { Fighter, GameEvent } from "./core/events";
import { begin, check, resume } from "./core/step";
import type { Checkpoint, World } from "./core/types";
import { unitById } from "./core/world";

//The move's finish, as the UI calls it when the move's animation ends: the surprise attack's hooks
//(its animation finishes it later), the capture's and the victory's
export interface CoreFinishMoveHooks {
	onSurprised?(cell: Cell, unit: Unit): void;
	attackHooks?(attacker: Unit, target: Unit): AttackCommandHooks;
	onCapture?(unit: Unit): void;
	onVictory?(side: number): void;
}

//A move command's hooks: animate gets the move and the finish to call when it ends, with the air mode
//of that moment (the hidden unit a surprise attack hits, #77). Without animate it finishes at once
//(air mode off) with finish's hooks, the surprise attack with surprise's
export interface CoreMoveHooks {
	animate?(mr: movementResults, finish: (airMode: boolean | number, hooks?: CoreFinishMoveHooks) => MoveResult): void;
	finish?: CoreFinishMoveHooks;
	surprise?: FinishAttackHooks;
}

interface CoreHooks {
	move: CoreMoveHooks;
	attack: AttackCommandHooks;
}
export type CoreHooksOf<T extends CommandType> = T extends keyof CoreHooks ? CoreHooks[T] : undefined;

//The world of the game's objects now
function worldNow(scenario: Scenario): World {
	return worldOf(scenario, engineContext.host(), { spotSide: engineContext.spotSide(), noFOW: !!uiSettings.noFOW });
}

//The objects to the world: they must then mirror it (a difference is a bug in the mirror)
function mirror(scenario: Scenario, w: World) {
	const host = engineContext.host();
	applyData(scenario, w, host);
	const difference = mirrorDifference(scenario, w, host);
	if (difference !== "") throw new Error("CorePlay: " + difference);
}

//Whether cmd is allowed now, or why not
function checkNow(scenario: Scenario, cmd: Command): Refusal | null {
	return check(worldNow(scenario), cmd);
}

//Checks cmd, then plays it on the core and mirrors it, with the old commands' hooks
function execute<C extends Command>(scenario: Scenario, cmd: C, hooks?: CoreHooksOf<C["type"]>): Executed<C["type"]> {
	const w = worldNow(scenario);
	const refusal = check(w, cmd);
	if (refusal !== null) return { ok: false, refusal };
	return { ok: true, result: run(scenario, w, cmd, hooks) as ResultOf<C["type"]> };
}

function run(scenario: Scenario, w: World, cmd: Command, hooks: unknown): unknown {
	if (cmd.type === "move") return move(scenario, w, cmd, (hooks || {}) as CoreMoveHooks);
	if (cmd.type === "attack") return attack(scenario, w, cmd, (hooks || {}) as AttackCommandHooks);
	if (cmd.type === "disband") scenario.map.delCurrentUnit();
	const b = begin(cmd.type === "disband" ? worldNow(scenario) : w, cmd);
	if ("refusal" in b) throw new Error("CorePlay: " + b.refusal.reason);
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

function move(scenario: Scenario, w: World, cmd: CommandOf<"move">, h: CoreMoveHooks): movementResults {
	const b = begin(w, cmd);
	if ("refusal" in b) throw new Error("CorePlay: " + b.refusal.reason);
	mirror(scenario, b.world);
	const m = scenario.map, unit = m.getUnitById(cmd.unit);
	logCaptures(scenario, b.events);
	m.setMoveRange(unit);
	m.setAttackRange(unit);
	const cp = b.checkpoint as MoveCheckpoint;
	const mr = movementOf(b.events, cmd.unit, cp);
	if (cp.win) mr.isVictorySide = unit.player.side;
	const finish = (airMode: boolean | number, fh?: CoreFinishMoveHooks) => finishMove(scenario, unit, mr, cp, airMode, fh);
	if (h.animate) {
		h.animate(mr, finish);
	} else {
		const res = finish(false, h.finish);
		if (res.surprise !== null && res.surprise.attack !== null) (res.surprise.attack as Finishing).finish(h.surprise);
	}
	return mr;
}

//Where a move waits for its animation's end
type MoveCheckpoint = Extract<Checkpoint, { next: "surprise" }>;

//An attack's result with the finish that ends it
type Finishing = AttackResult & { finish(hooks?: FinishAttackHooks): AttackResult };

//Actions.finishMove: the surprise attack on the hidden unit the air mode picks (its finish is the
//caller's: the UI's when its animation ends, a headless caller's after this), the capture and the victory
function finishMove(scenario: Scenario, unit: Unit, mr: movementResults, cp: MoveCheckpoint, airMode: boolean | number,
	fh?: CoreFinishMoveHooks): MoveResult {
	const h = fh || {};
	const result: MoveResult = { move: mr, surprise: null, capture: mr.isCapture, victorySide: mr.isVictorySide };
	if (cp.surprise !== null) result.surprise = surprise(scenario, unit, cp, airMode, h);
	else mirror(scenario, resume(worldNow(scenario), cp).world);
	if (mr.isCapture && h.onCapture) h.onCapture(unit);
	if (mr.isVictorySide >= 0 && h.onVictory) h.onVictory(mr.isVictorySide);
	return result;
}

//The surprise attack: told, its target the unit the air mode shows first that the mover can attack,
//its shots as an attack's, animated by the target's hooks; the mover no longer surprised
function surprise(scenario: Scenario, unit: Unit, cp: MoveCheckpoint, airMode: boolean | number,
	h: CoreFinishMoveHooks): MoveResult["surprise"] {
	const cell = new Cell(cp.surprise.row, cp.surprise.col);
	if (h.onSurprised) h.onSurprised(cell, unit);
	const target = scenario.map.map[cell.row][cell.col].getAttackableUnit(unit, airMode);
	if (target === null) {
		mirror(scenario, resume(worldNow(scenario), cp, { airMode: !!airMode }).world);
		return { cell, target, attack: null };
	}
	const ah = h.attackHooks ? h.attackHooks(unit, target) : {};
	if (ah.onStart) ah.onStart();
	const w = worldNow(scenario), sides = sidesOf(unit, target), estimate = estimateOf(w, unit, target);
	const r = resume(w, cp, { airMode: !!airMode });
	mirror(scenario, r.world);
	if (!r.events.some((e) => e.type === "fight" && !e.support && e.defender.unit === target.id))
		throw new Error("CorePlay: the surprise attack's target isn't the screen's");
	const shot = shots(scenario, r.events, sides, r.checkpoint, ah, estimate);
	if (ah.animate) ah.animate(shot, (fhooks) => shot.finish(fhooks));
	return { cell, target, attack: shot };
}

//The attack's estimate (Actions.resolveAttack's first combat result, before any shot)
function estimateOf(w: World, attacker: Unit, defender: Unit): combatResults {
	return attackResult(w, unitById(w, attacker.id), unitById(w, defender.id), null) as unknown as combatResults;
}

//---- The attack

//The two sides before the attack: their units, cells and strengths
function sidesOf(attacker: Unit, defender: Unit): [AttackSide, AttackSide] {
	const side = (u: Unit): AttackSide => ({ unit: u, cell: u.getPos(), oldstr: u.strength, newstr: 0, leaderGain: false });
	return [side(attacker), side(defender)];
}

function attack(scenario: Scenario, w: World, cmd: CommandOf<"attack">, h: AttackCommandHooks): AttackResult {
	const m = scenario.map;
	if (h.onStart) h.onStart();
	const sides = sidesOf(m.getUnitById(cmd.unit), m.getUnitById(cmd.target));
	const estimate = estimateOf(w, sides[0].unit, sides[1].unit);
	const b = begin(w, cmd);
	if ("refusal" in b) throw new Error("CorePlay: " + b.refusal.reason);
	mirror(scenario, b.world);
	const result = shots(scenario, b.events, sides, b.checkpoint, h, estimate);
	if (h.animate) h.animate(result, (fh) => result.finish(fh));
	else result.finish(h.finish);
	return result;
}

//A unit of a fight as the combat log reads it, before or after
function logged(scenario: Scenario, f: Fighter, done: boolean) {
	const s = done ? f.after : f.before, u = unitObject(scenario.map, f.unit);
	return { id: f.unit, eqid: f.eqid, player: { side: f.side }, strength: s.strength, experience: s.experience,
		entrenchment: s.entrenchment, ammo: s.ammo, isMounted: f.isMounted, isSurprised: f.isSurprised, isCore: u.isCore,
		getPos: () => new Cell(f.row, f.col) } as unknown as Unit;
}

//(Map.attackUnit logs the combat with the turn of a global map: the page's, whatever it holds)
function globalTurn(): number {
	const g = globalThis as unknown as { map?: { turn?: number } };
	return g.map ? g.map.turn : undefined;
}

//Actions.resolveAttack after the shots: each fire in the combat log with the leaders it gave, the
//attack hexes cleared by the attack itself, the support shots and the attack told to the hooks, the
//result as the old one (the estimate's when there was no attack)
function shots(scenario: Scenario, events: GameEvent[], sides: [AttackSide, AttackSide], cp: Checkpoint | null,
	h: AttackCommandHooks, estimate: combatResults): Finishing {
	const result = { attacking: sides[0], defending: sides[1], cr: estimate, support: [], attackStopped: false, destroyed: [],
		retreat: null, retreatMove: null, surrender: false, victorySides: [] } as Finishing;
	events.forEach((e, i) => {
		if (e.type === "attackStopped") result.attackStopped = true;
		if (e.type === "fight") fired(scenario, e, leadersAfter(events, i), result, h);
	});
	result.attacking.newstr = result.attacking.unit.strength;
	result.defending.newstr = result.defending.unit.strength;
	result.finish = (fh) => finishAttack(scenario, result, cp, fh || {});
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
//the leaders, the attack hexes cleared by the attack itself, the hooks
function fired(scenario: Scenario, e: Extract<GameEvent, { type: "fight" }>, leaders: number[], result: AttackResult,
	h: AttackCommandHooks) {
	const m = scenario.map;
	const id = CombatLog.addCombatStart(logged(scenario, e.attacker, false), logged(scenario, e.defender, false), globalTurn());
	if (!e.support) m.delAttackSel();
	for (const l of leaders) CombatLog.addLeader(unitObject(m, l));
	CombatLog.addCombatEnd(logged(scenario, e.attacker, true), logged(scenario, e.defender, true), id, e.support);
	if (e.support) {
		const u = unitObject(m, e.attacker.unit);
		result.support.push(u);
		if (h.onSupportShot) h.onSupportShot(u, new Cell(e.attacker.row, e.attacker.col));
		return;
	}
	result.cr = e.result as unknown as combatResults;
	result.attacking.leaderGain = e.result.atkLeaderGain;
	result.defending.leaderGain = e.result.defLeaderGain;
	if (h.onAttack) h.onAttack(result);
}

//Actions.finishAttack: the losses told, the units destroyed (by the strengths in the result: the UI's
//finish of an attack with nothing to animate reads them as 0, kept) off the map, the selection's turn,
//the retreat or the surrender, the victory
function finishAttack(scenario: Scenario, result: AttackResult, cp: Checkpoint | null, h: FinishAttackHooks): AttackResult {
	if (h.onLosses) h.onLosses(result);
	const seen = [result.attacking, result.defending].map((side) => {
		const gone = side.oldstr - side.newstr >= side.oldstr;
		if (gone) {
			result.destroyed.push(side.unit);
			if (h.onDestroyed) h.onDestroyed(side.cell, side.unit);
		}
		return gone;
	});
	if (cp === null) return result;
	const cleaned = resume(worldNow(scenario), cp);
	mirror(scenario, cleaned.world);
	if (h.afterCleanup) h.afterCleanup(result);
	const ended = resume(worldNow(scenario), cleaned.checkpoint, { retreat: !seen[1] });
	mirror(scenario, ended.world);
	for (const e of ended.events) ending(scenario, result, e, ended.events, h);
	return result;
}

//What the attack's end did, told: the retreat, the surrender, the victory
function ending(scenario: Scenario, result: AttackResult, e: GameEvent, events: GameEvent[], h: FinishAttackHooks) {
	if (e.type === "retreated") retreated(scenario, result, events, h);
	if (e.type === "surrendered") {
		result.surrender = true;
		if (h.onSurrender) h.onSurrender(result.defending.cell, result.defending.unit);
	}
	if (e.type === "victory") {
		result.victorySides.push(e.side);
		if (h.onVictory) h.onVictory(e.side);
	}
}

//Map.retreatUnit: the retreat's move shows the unit's move and attack hexes as a move does (with the
//move's points spent, which the retreat gives back after), then the unit selected before is selected
//again; the hook animates the retreat
function retreated(scenario: Scenario, result: AttackResult, events: GameEvent[], h: FinishAttackHooks) {
	const m = scenario.map, u = result.defending.unit, before = m.currentUnit;
	logCaptures(scenario, events);
	const kept = { moveLeft: u.moveLeft, hasMoved: u.hasMoved, hasOverstrength: u.hasOverstrength };
	u.move(0);
	m.setMoveRange(u);
	m.setAttackRange(u);
	Object.assign(u, kept);
	if (before !== null) m.selectUnit(before);
	const mr = movementOf(events, u.id, null);
	const captured = events.find((e) => e.type === "captured" && e.unit === u.id);
	if (captured !== undefined && captured.type === "captured" && captured.win) mr.isVictorySide = u.player.side;
	const to = u.getPos();
	result.retreat = to;
	result.retreatMove = mr;
	if (h.onRetreat) h.onRetreat(u, to, mr);
}

export interface CorePlayAPI {
	check(scenario: Scenario, cmd: Command): Refusal | null;
	execute<C extends Command>(scenario: Scenario, cmd: C, hooks?: CoreHooksOf<C["type"]>): Executed<C["type"]>;
}

export const CorePlay: CorePlayAPI = {
	check: checkNow,
	execute: execute,
};
