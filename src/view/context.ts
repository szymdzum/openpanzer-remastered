//The unit context menu's view model (UnitContext, SupplyRules, #346): the actions of the person's selected unit, each
//with what it will do, computed with the functions the command runs (src/core/supply.ts, src/core/costs.ts), or the
//reason it can't, the undo's included (#316); and the arithmetic behind Supply and Reinforce for the tooltip. Plain
//TypeScript tested on hand-built worlds (test/view-context.test.ts)
import type { Command } from "../commands";
import { canDisembark, canEmbark, embarkTypeOf } from "../core/movement";
import { check } from "../core/step";
import { adjacentEnemies, canSupplyHere, reinforcement, reinforceDivisors, resupplyDivisors, resupplyValue } from "../core/supply";
import type { Position, Supply, UnitId, UnitState, World } from "../core/types";
import { isAir, isGround } from "../core/units";
import { unitById, unitData } from "../core/world";
import { OVERSTRENGTH_PENALTY, unitClass } from "../prototypes";
import type { IconName } from "./icon";
import { type ActionKey, canOrder, prestigeText } from "./model";

//A line of the tooltip's sum: what, how much; tot: the result, prestige: a cost
export interface Row {
	label: string;
	value: string;
	tone?: "tot" | "prestige";
}

//The arithmetic behind an action's number (.pm-ctxtip): what's missing, each division, what it gets and costs, the
//best case, and that it ends the unit's turn
export interface Breakdown {
	title: string;
	rows: Row[];
	alt: string | null;
	warn: string;
}

export interface ContextAction {
	key: ActionKey;
	label: string;
	icon: IconName;
	command: Command;
	line: string; //what it will do: "+5 ammo · +14 fuel", "+2", the transport
	cost?: number;
	partial?: boolean; //the prestige pays for part of it: "+1 of 2"
	refusal: string | null; //why it can't now, in place of the line
	tip: Breakdown | null;
	apart?: boolean; //after a rule: Undo
}

export interface UnitContext {
	unit: UnitId;
	at: Position;
	actions: ContextAction[];
}

//Why the last move of a unit can't be taken back, kept by the screen from the step that took it away: the core keeps
//only the slot, not why it is empty (#316)
export interface UndoLoss {
	unit: UnitId;
	reason: string;
}

const WARN = "Ends this unit's turn: no move or attack after.";
const BEST = "In a city with no enemy next to it: ";

//What a step did to the undo: the move it made that left nothing to undo (it revealed units, or ran into a hidden
//enemy), or the slot of another unit's move it took away; null when the undo is as it was
const LOST: Partial<Record<Command["type"], string>> = { move: "another unit moved", attack: "after an attack", resupply: "after supply",
	reinforce: "after supply", upgrade: "after an upgrade", disband: "after a disband" };

export function undoLoss(before: World, cmd: Command, after: World): UndoLoss | null {
	const was = before.state.turn.undoable, now = after.state.turn.undoable;
	if (cmd.type === "move" && (now === null || now.unit !== cmd.unit)) {
		const u = unitById(after, cmd.unit);
		return u === null ? null : { unit: cmd.unit, reason: u.isSurprised ? "ambushed" : "revealed units" };
	}
	if (was === null || (now !== null && now.unit === was.unit)) return null;
	return { unit: was.unit, reason: LOST[cmd.type] || "another order since" };
}

//"÷1.3"
const divided = (d: number) => "÷" + d;

//"+5 ammo · +14 fuel": a mounted unit's transport's share added in
function supplyText(s: Supply, sep = " · "): string {
	const ammo = s.ammo + s.transportAmmo, fuel = s.fuel + s.transportFuel;
	return [ammo > 0 && "+" + ammo + " ammo", fuel > 0 && "+" + fuel + " fuel"].filter(Boolean).join(sep);
}

//What the unit (and its transport) is missing
function missing(w: World, u: UnitState): Supply {
	const own = unitData(w, u, true), t = u.transport === null ? null : w.equipment[u.transport.eqid];
	return { ammo: own.ammo - u.ammo, fuel: own.fuel - u.fuel, transportAmmo: t === null ? 0 : t.ammo - u.transport!.ammo,
		transportFuel: t === null ? 0 : t.fuel - u.transport!.fuel };
}

//The divisions that apply, as rows: outside a city, then the enemies next to it
function divisionRows(w: World, u: UnitState, d: [number, number]): Row[] {
	const rows: Row[] = [];
	if (d[0] !== 1) rows.push({ label: "Outside a city", value: divided(d[0]) });
	if (d[1] !== 1) {
		const n = adjacentEnemies(w, u);
		rows.push({ label: n === 1 ? "Next to 1 enemy" : `Next to ${n} enemies`, value: divided(d[1]) });
	}
	return rows;
}

//Where the unit can't be supplied at all: an aircraft away from an airfield, a ship out of a port (#19); a ground unit
//can be anywhere
function placeRefusal(w: World, u: UnitState): string | null {
	if (canSupplyHere(w, u)) return null;
	return isAir(w, u) ? "no airfield" : "not in port";
}

function supplyRefusal(w: World, u: UnitState): string | null {
	if (u.hasMoved || u.hasFired) return "moved";
	if (u.hasResupplied) return "supplied";
	const m = missing(w, u);
	if (m.ammo + m.fuel + m.transportAmmo + m.transportFuel <= 0) return "full";
	return placeRefusal(w, u);
}

function supplyAction(w: World, u: UnitState, name: string): ContextAction {
	const command: Command = { type: "resupply", unit: u.id };
	const base = { key: "resupply" as const, label: "Supply", icon: "resupply" as const, command };
	const refusal = supplyRefusal(w, u);
	if (refusal !== null) return { ...base, line: "", refusal, tip: null };
	const s = resupplyValue(w, u), m = missing(w, u), d = resupplyDivisors(w, u);
	const rows: Row[] = [{ label: "Missing", value: supplyText(m, ", ").replace(/\+/g, "") }, ...divisionRows(w, u, d),
		{ label: "Gets", value: supplyText(s, ", "), tone: "tot" }];
	const best = d[0] * d[1] === 1 ? null : BEST + supplyText(m, ", ") + ".";
	return { ...base, line: supplyText(s), refusal: null, tip: { title: "Supply " + name, rows, alt: best, warn: WARN } };
}

function reinforceRefusal(w: World, u: UnitState, over: boolean): string | null {
	if (u.hasMoved || u.hasFired || u.hasOverstrength) return "moved";
	if (!over && u.hasResupplied) return "supplied";
	if (u.strength >= topOf(u, over)) return "full";
	return placeRefusal(w, u);
}

//The most strength a reinforcement goes up to: 10, overstrength 10 and a point a bar of experience
const topOf = (u: UnitState, over: boolean) => over ? 10 + Math.round(u.experience / 100) : 10;

//Reinforce's or Overstrength's button before what it says: its key, caption, icon and command
function reinforceBase(u: UnitState, over: boolean) {
	return over ? { key: "overstrength" as const, label: "Overstrength", icon: "overstrength" as const,
		command: { type: "reinforce", unit: u.id, overstrength: true } as Command }
		: { key: "reinforce" as const, label: "Reinforce", icon: "reinforce" as const, command: { type: "reinforce", unit: u.id } as Command };
}

//Why a reinforcement buys nothing here: a point divided away to nothing (three enemies round a unit one short), or
//not the prestige for one point
function planRefusal(plan: ReturnType<typeof reinforcement>): string | null {
	if (plan.wanted < 1) return "none here";
	return plan.bought < 1 ? "needs " + prestigeText(plan.perPoint) : null;
}

//The arithmetic behind a reinforcement: what's missing, the divisions, what it gets for what, what it also refills
function reinforceTip(w: World, u: UnitState, name: string, over: boolean, plan: ReturnType<typeof reinforcement>): Breakdown {
	const short = topOf(u, over) - u.strength, d = reinforceDivisors(w, u), refills = supplyText(resupplyValue(w, u), ", ");
	const penalty = over ? " (×" + OVERSTRENGTH_PENALTY + ")" : "";
	const rows: Row[] = [{ label: "Missing", value: String(short) }, ...divisionRows(w, u, d),
		{ label: "Gets", value: `+${plan.bought} → ${u.strength + plan.bought}/10`, tone: "tot" },
		{ label: `Cost, ${prestigeText(plan.perPoint)} a point${penalty}`, value: prestigeText(plan.bought * plan.perPoint), tone: "prestige" }];
	if (refills !== "") rows.push({ label: "Also refills", value: refills });
	const best = d[0] * d[1] === 1 || plan.wanted >= short ? null : BEST + `+${short} for ${prestigeText(short * plan.perPoint)}.`;
	return { title: (over ? "Overstrength " : "Reinforce ") + name, rows, alt: best, warn: WARN };
}

function reinforceAction(w: World, u: UnitState, name: string, over: boolean): ContextAction {
	const base = reinforceBase(u, over);
	const refusal = reinforceRefusal(w, u, over);
	if (refusal !== null) return { ...base, line: "", refusal, tip: null };
	const plan = reinforcement(w, u, over), poor = planRefusal(plan);
	if (poor !== null) return { ...base, line: "", refusal: poor, tip: null };
	const partial = plan.bought < plan.wanted;
	return { ...base, line: partial ? `+${plan.bought} of ${plan.wanted}` : `+${plan.wanted}`, cost: plan.bought * plan.perPoint, partial,
		refusal: null, tip: reinforceTip(w, u, name, over, plan) };
}

//Mount or Unmount, naming the transport; only for a ground unit that has one
function mountAction(w: World, u: UnitState): ContextAction | null {
	if (u.transport === null || !isGround(w, u)) return null;
	const command: Command = u.isMounted ? { type: "unmount", unit: u.id } : { type: "mount", unit: u.id };
	return { key: "mount", label: u.isMounted ? "Unmount" : "Mount", icon: "mount", command, line: w.equipment[u.transport.eqid].name,
		refusal: u.hasMoved ? "moved" : null, tip: null };
}

//The kind of transport a unit is aboard or would embark on: "air" or "naval"
function carrierKind(w: World, u: UnitState): string {
	const uclass = u.carrier !== 0 ? w.equipment[Math.abs(u.carrier)].uclass : embarkTypeOf(w, u);
	return uclass === unitClass.airTransport ? "air" : "naval";
}

//Embark or Disembark, naming the kind of transport; only where the unit can do one of them or is aboard
function embarkAction(w: World, u: UnitState): ContextAction | null {
	if (u.carrier === 0 && !canEmbark(w, u) && !canDisembark(w, u)) return null;
	const aboard = u.carrier > 0;
	const command: Command = aboard ? { type: "disembark", unit: u.id } : { type: "embark", unit: u.id };
	const refusal = check(w, command) === null ? null : aboard ? "nowhere to land" : "no transport";
	return { key: "embark", label: aboard ? "Disembark" : "Embark", icon: "embark", command, line: carrierKind(w, u), refusal, tip: null };
}

//Why the unit's move can't be taken back, null when it can (#316): it didn't move, another unit's move is the last
//one, or why the slot went (kept by the screen), else what the unit's state tells
function undoRefusal(w: World, u: UnitState, lost: UndoLoss | null): string | null {
	const slot = w.state.turn.undoable;
	if (slot !== null && slot.unit === u.id) return null;
	if (u.hasResupplied) return "after supply";
	if (!u.hasMoved) return "not moved";
	if (slot !== null) return "not the last move";
	return lost !== null && lost.unit === u.id ? lost.reason : stateReason(u);
}

//What the unit's state tells of why its move went, when the screen didn't see the step that took it
function stateReason(u: UnitState): string {
	if (u.isSurprised) return "ambushed";
	return u.hasFired ? "after an attack" : "not the last move";
}

function undoAction(w: World, u: UnitState, lost: UndoLoss | null): ContextAction {
	const refusal = undoRefusal(w, u, lost), slot = w.state.turn.undoable;
	return { key: "undo", label: "Undo move", icon: "undo", command: { type: "undo", unit: u.id }, apart: true, tip: null, refusal,
		line: refusal === null ? `to ${slot!.before.row},${slot!.before.col}` : "" };
}

//The menu of the person's unit on their turn, null for any other: Supply and Reinforce always, Overstrength where the
//unit could go over 10 (full strength and a bar of experience), Mount and Embark where they apply, and Undo after a rule
export function contextOf(w: World, id: UnitId, lost: UndoLoss | null): UnitContext | null {
	const u = unitById(w, id);
	if (u === null || u.row < 0 || !canOrder(w, u)) return null;
	const name = unitData(w, u, true).name;
	const actions = [supplyAction(w, u, name), reinforceAction(w, u, name, false),
		u.strength >= 10 && u.experience >= 100 ? reinforceAction(w, u, name, true) : null,
		mountAction(w, u), embarkAction(w, u), undoAction(w, u, lost)].filter((a): a is ContextAction => a !== null);
	return { unit: id, at: { row: u.row, col: u.col }, actions };
}
