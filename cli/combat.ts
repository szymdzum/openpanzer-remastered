//Attacks as the command-line player previews them (#279), on the known world: the core's estimate (no
//dice), the support fire it counted, what the attack would do, from where a unit stands or a hex it can
//move to first, and which units can hit a target this turn
import { attackCells, canInitiateAttack, supportFireUnits, unitAttackRange } from "../src/core/attack";
import { combatResult, shouldDefenderRetreat } from "../src/core/combat";
import { distance } from "../src/core/geometry";
import { moveRange, retreatPosition } from "../src/core/movement";
import { check, step } from "../src/core/step";
import type { MoveCell, Position, UnitState, World } from "../src/core/types";
import { ammoOf, hexIndex, sideOf, unitById } from "../src/core/world";
import { cell, knownWorld, label } from "./known";

export interface Estimate {
	attacker: number;
	target: number;
	from: string;
	kills: number;
	losses: number;
	support: string[];
	rugged: boolean;
	overrun: boolean;
	outcome: "destroyed" | "surrenders" | "retreats" | "holds";
	attackerDestroyed: boolean;
}

//What the kills do to the defender: destroy it, make it retreat, or surrender with nowhere to go
function outcomeOf(w: World, atk: UnitState, def: UnitState, kills: number): Estimate["outcome"] {
	if (def.strength - kills <= 0) return "destroyed";
	if (!shouldDefenderRetreat(w, atk, { ...def, strength: def.strength - kills }, def.strength)) return "holds";
	return retreatPosition(w, def) === null ? "surrenders" : "retreats";
}

//The attack's estimate as the attack cursor and the AI have it, with the support fire the side sees
export function estimate(w: World, atk: UnitState, def: UnitState): Estimate {
	const cr = combatResult(w, atk, def, false, null);
	return { attacker: atk.id, target: def.id, from: cell(atk), kills: cr.kills, losses: cr.losses,
		support: supportFireUnits(w, atk, def).map((s) => label(w, s)), rugged: cr.isRugged, overrun: cr.isOverrun,
		outcome: outcomeOf(w, atk, def, cr.kills), attackerDestroyed: cr.losses >= atk.strength };
}

const NOTES: ((e: Estimate) => string)[] = [
	(e) => e.attackerDestroyed ? "ATTACKER DESTROYED" : "",
	(e) => e.rugged ? "RUGGED DEFENSE" : "",
	(e) => e.overrun ? "overrun" : "",
	(e) => e.support.length ? `support fire from ${e.support.join("; ")}` : "",
];

export function estimateLine(w: World, e: Estimate): string {
	const t = unitById(w, e.target);
	return [`${t ? label(w, t) : "#" + e.target} from ${e.from}: kills ${e.kills}, losses ${e.losses}, ${e.outcome}`,
		...NOTES.map((n) => n(e)).filter(Boolean)].join(", ");
}

//An attacker's estimate with the other hexes it can attack from after a move (#308)
export interface AttackerEstimate extends Estimate {
	also: Estimate[];
}

//Another hex an attacker can attack from: its estimate only when it differs from the best's
const sameAs = (a: Estimate, b: Estimate) => a.kills === b.kills && a.losses === b.losses && a.outcome === b.outcome;
const otherHex = (best: Estimate) => (e: Estimate) => sameAs(e, best) ? e.from : `${e.from} (kills ${e.kills}, losses ${e.losses}, ${e.outcome})`;

export function attackerLine(w: World, e: AttackerEstimate): string {
	const u = unitById(w, e.attacker), also = e.also.map(otherHex(e));
	return `${u ? label(w, u) : "#" + e.attacker} on ` + estimateLine(w, e) + (also.length ? `; also from ${also.join(", ")}` : "");
}

const unitsOnHex = (w: World, c: Position) => {
	const h = w.state.map.hexes[hexIndex(w, c.row, c.col)];
	return [h.unit, h.air].filter((id) => id !== null).map((id) => unitById(w, id));
};

const canAttack = (w: World, u: UnitState, t: UnitState) =>
	canInitiateAttack(w, u, t) && check(w, { type: "attack", unit: u.id, target: t.id }) === null;

//The enemy units u can attack from where it stands in w
export const targetsOf = (w: World, u: UnitState): UnitState[] =>
	attackCells(w, u).flatMap((c) => unitsOnHex(w, c)).filter((t) => canAttack(w, u, t));

//Whether t is one of the screen's targets of u where it stands. In the classic rules the core's check of
//an attack asks only the distance, as the AI's attacks do, so a unit with no air attack would hit an
//aircraft, and an aircraft of range 1 a ground unit from the next hex, which the screen allows only from
//over it; in the remaster's the core's check refuses them itself (#285)
export const isTarget = (w: World, u: UnitState, t: UnitState) => targetsOf(w, u).some((x) => x.id === t.id);

//The known world after u moves to a hex, or why it can't
function movedTo(kw: World, u: UnitState, to: Position): { world: World } | { refusal: string } {
	if (u.row === to.row && u.col === to.col) return { world: kw };
	const r = step(kw, { type: "move", unit: u.id, to });
	if ("refusal" in r) return { refusal: r.refusal.reason };
	const moved = unitById(r.world, u.id);
	return moved.row === to.row && moved.col === to.col ? { world: r.world } : { refusal: `the move stops at ${cell(moved)}` };
}

//The hexes u can move to, as the screen shows its range: computed on the game, where a zone of control
//on a hex the side spots stops a move whoever casts it (reference/src/gamerules.js getMoveRange)
const reachable = (w: World, u: UnitState) => moveRange(w, unitById(w, u.id)).filter((c) => c.canMove);
const inReach = (w: World, u: UnitState, p: Position) =>
	(u.row === p.row && u.col === p.col) || reachable(w, u).some((c) => c.row === p.row && c.col === p.col);

//What a unit of side's can attack, from where it stands or from a hex in its move range it moves to
//first (the estimate on the known world)
export function targets(w: World, side: number, id: number, from?: Position): { estimates: Estimate[]; note: string } {
	const kw = knownWorld(w, side), u = unitById(kw, id);
	if (!u || sideOf(kw, u) !== side) return { estimates: [], note: `#${id} is not your unit` };
	if (from && !inReach(w, u, from)) return { estimates: [], note: `can't get to ${cell(from)}: not in its move range` };
	const at = movedTo(kw, u, from || u);
	if ("refusal" in at) return { estimates: [], note: `can't get to ${cell(from)}: ${at.refusal}` };
	const moved = unitById(at.world, id);
	const estimates = targetsOf(at.world, moved).map((t) => estimate(at.world, moved, t));
	return { estimates, note: estimates.length ? "" : `no target from ${cell(moved)}` + (moved.hasFired ? " (it has fired, or moved on its transport)" : "") };
}

//The estimate after u moves to a hex and attacks t from there, null when it can't
function estimateFrom(kw: World, u: UnitState, t: UnitState, c: MoveCell): Estimate | null {
	const at = movedTo(kw, u, c);
	if ("refusal" in at) return null;
	const moved = unitById(at.world, u.id), target = unitById(at.world, t.id);
	return isTarget(at.world, moved, target) ? estimate(at.world, moved, target) : null;
}

const worth = (e: Estimate) => e.kills - e.losses;

//Every hex of its move range u can move to and attack t from this turn, the best estimate first
function afterMove(w: World, kw: World, u: UnitState, t: UnitState): Estimate[] {
	if (u.hasMoved) return [];
	const reach = unitAttackRange(kw, u);
	return reachable(w, u).filter((c) => distance(c.row, c.col, t.row, t.col) <= reach)
		.map((c) => estimateFrom(kw, u, t, c)).filter((e) => e !== null).sort((a, b) => worth(b) - worth(a));
}

const ready = (kw: World, side: number, u: UnitState) => sideOf(kw, u) === side && !u.hasFired && ammoOf(u) > 0;

//u's attack on t: from where it stands, else from the best hex it can move to, with the other hexes
function attackOf(w: World, kw: World, u: UnitState, t: UnitState): AttackerEstimate | null {
	if (isTarget(kw, u, t)) return { ...estimate(kw, u, t), also: [] };
	const [best, ...also] = afterMove(w, kw, u, t);
	return best ? { ...best, also } : null;
}

//Which of side's units can attack a target this turn: from where they stand, or after a move (the hex
//with the best estimate, then every other hex it can attack from: a target's approaches, #308), the
//best first
export function attackers(w: World, side: number, targetId: number): { estimates: AttackerEstimate[]; note: string } {
	const kw = knownWorld(w, side), t = unitById(kw, targetId);
	if (!t || sideOf(kw, t) === side) return { estimates: [], note: `#${targetId} is not an enemy unit you see` };
	const estimates = kw.state.units.filter((u) => ready(kw, side, u)).map((u) => attackOf(w, kw, u, t)).filter((e) => e !== null)
		.sort((a, b) => worth(b) - worth(a));
	return { estimates, note: estimates.length ? "" : "none of your units can reach it this turn" };
}
