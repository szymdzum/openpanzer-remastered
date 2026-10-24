//A step's events as text from one side's view (#279): its own units in full, the enemy's where it saw
//them. One formatter per event type; the events a side doesn't see or doesn't need say nothing
import type { Fighter, GameEvent } from "../src/core/events";
import type { CombatResult, UnitState, World } from "../src/core/types";
import { hexIndex, isSpotted, sideOf, unitById } from "../src/core/world";
import { cell, own, playerOfSide, positionOf, seen, SIDES, sideOfPlayer } from "./known";

//What a formatter reads: the worlds after and before the events (a destroyed unit is only in the one
//before), the side, and a unit's name and whether it is the side's
interface View {
	after: World;
	before: World;
	side: number;
	actor: number;		//the side whose turn the events are of (turnStarted changes it)
	unit: (id: number) => UnitState | null;
	name: (id: number) => string;
	mine: (id: number) => boolean;
}

type Formatters = { [K in GameEvent["type"]]?: (e: Extract<GameEvent, { type: K }>, v: View) => string };

//A unit in a fight, as the core's event has it or the screen's combat log saw it (cli/fightlog.ts)
type FighterView = Pick<Fighter, "unit" | "eqid" | "side" | "row" | "col"> & { before: { strength: number }; after: { strength: number } };

//A fight: its attacker, its defender, whether it was support fire
export interface FightView { support: boolean; attacker: FighterView; defender: FighterView }

const fighter = (w: World, f: FighterView) =>
	`${SIDES[f.side]} ${w.equipment[f.eqid].name} #${f.unit} @${cell(f)} ${f.before.strength}->${Math.max(0, f.after.strength)}`;

//A fight the side was in, by its units or its own support fire, as text; how: rugged defense, overrun
function fightText(w: World, side: number, f: FightView, how = ""): string {
	if (f.attacker.side !== side && f.defender.side !== side) return "";
	return `${f.support ? "support fire" : "attack"}: ${fighter(w, f.attacker)} on ${fighter(w, f.defender)}${how}`;
}

//The fights the screen played, as the side saw them (the page doesn't see the core's events, #307)
export const fightLines = (w: World, side: number, fights: FightView[]) => fights.map((f) => fightText(w, side, f)).filter(Boolean);

const ifMine = (v: View, id: number, text: string) => v.mine(id) ? text : "";

function moved(e: Extract<GameEvent, { type: "moved" }>, v: View): string {
	const end = e.path[e.path.length - 1];
	if (v.mine(e.unit)) return `${v.name(e.unit)} moved to ${cell(end)} (cost ${e.cost})`;
	return end && end.visible ? `${v.name(e.unit)} seen moving to ${cell(end)}` : "";
}

const how = (r: CombatResult) => (r.isRugged ? " (rugged defense)" : "") + (r.isOverrun ? " (overrun)" : "");

const fight = (e: Extract<GameEvent, { type: "fight" }>, v: View) => fightText(v.after, v.side, e, how(e.result));

function captured(e: Extract<GameEvent, { type: "captured" }>, v: View): string {
	const what = e.objective ? " (OBJECTIVE)" : e.flag ? " (flag)" : "";
	return `${v.name(e.unit)} captured ${cell(e.at)}${what}, +${e.prestige} prestige${e.win ? ", WINS" : ""}`;
}

function arrived(e: Extract<GameEvent, { type: "arrived" }>, v: View): string {
	const visible = v.mine(e.unit) || isSpotted(v.after, hexIndex(v.after, e.at.row, e.at.col), v.side);
	return visible ? `${v.name(e.unit)} arrived at ${cell(e.at)}` : "";
}

const FORMAT: Formatters = {
	moved, fight, captured, arrived,
	surprised: (e, v) => `${v.name(e.unit)} surprised at ${cell(e.at)}`,
	spotted: (e, v) => ifMine(v, e.unit, `${v.name(e.unit)} spotted ${e.units.map(v.name).join(", ")}`),
	victory: (e) => `VICTORY of ${SIDES[e.side]} by ${e.kind}`,
	destroyed: (e, v) => `${v.name(e.unit)} destroyed at ${cell(e.at)}`,
	retreated: (e, v) => `${v.name(e.unit)} retreated from ${cell(e.from)} to ${cell(e.to)}`,
	surrendered: (e, v) => `${v.name(e.unit)} surrendered at ${cell(e.at)}`,
	attackStopped: (e, v) => `${v.name(e.unit)}'s attack stopped`,
	leader: (e, v) => ifMine(v, e.unit, `${v.name(e.unit)} got a leader (${e.leader})`),
	resupplied: (e, v) => ifMine(v, e.unit, `${v.name(e.unit)} resupplied: +${e.supply.ammo} ammo, +${e.supply.fuel} fuel`),
	reinforced: (e, v) => ifMine(v, e.unit, `${v.name(e.unit)} reinforced +${e.strength}`),
	mounted: (e, v) => ifMine(v, e.unit, `${v.name(e.unit)} mounted`),
	unmounted: (e, v) => ifMine(v, e.unit, `${v.name(e.unit)} unmounted`),
	dismounted: (e, v) => ifMine(v, e.unit, `${v.name(e.unit)} dismounted`),
	embarked: (e, v) => ifMine(v, e.unit, `${v.name(e.unit)} embarked`),
	disembarked: (e, v) => ifMine(v, e.unit, `${v.name(e.unit)} disembarked`),
	undone: (e, v) => `${v.name(e.unit)} back to ${cell(e.to)}`,
	deployed: (e, v) => ifMine(v, e.unit, `${v.name(e.unit)} deployed at ${cell(e.at)}`),
	bought: (e, v) => sideOfPlayer(v.after, e.player) === v.side ? `bought ${v.after.equipment[e.eqid].name} for ${e.cost}` : "",
	upgraded: (e, v) => v.actor === v.side ? `upgraded to ${v.after.equipment[e.eqid].name} for ${e.cost}` : "",
	disbanded: (e, v) => `${v.name(e.unit)} disbanded, +${e.prestige}`,
	turnStarted: (e, v) => `-- ${SIDES[sideOfPlayer(v.after, e.player)]} turn ${e.turn} --`,
	turnLimit: (e) => `${SIDES[e.side]} played its last turn`,
};

function viewOf(after: World, before: World, side: number): View {
	const unit = (id: number) => unitById(after, id) || unitById(before, id);
	const name = (id: number) => {
		const u = unit(id);
		return u ? `${SIDES[sideOf(before, u)]} #${id} ${own(before, u).name}` : `#${id}`;
	};
	const actor = sideOfPlayer(before, before.state.turn.currentPlayer);
	return { after, before, side, actor, unit, name, mine: (id) => unit(id) !== null && sideOf(before, unit(id)) === side };
}

const format = (e: GameEvent, v: View) => (FORMAT[e.type] as ((x: GameEvent, y: View) => string) | undefined)?.(e, v) ?? "";

//Events as text from side's view; before: the world before them, for the units they destroyed
export function describe(after: World, before: World, side: number, events: GameEvent[]): string[] {
	const v = viewOf(after, before, side), lines: string[] = [];
	for (const e of events) {
		if (e.type === "turnStarted") v.actor = sideOfPlayer(after, e.player);
		lines.push(format(e, v));
	}
	return lines.filter(Boolean);
}

//What changed between two worlds, from side's view, for a turn whose events aren't known (the page
//plays it on the screen): its units and the enemy's it saw, moved, worn, gone or new, and the victory
//hexes that changed hands
export function changes(before: World, after: World, side: number): string[] {
	const v = viewOf(after, before, side);
	return [
		...before.state.units.filter((u) => seen(before, side, u)).map((u) => unitChange(v, u)),
		...after.state.units.filter((u) => seen(after, side, u) && !wasSeen(before, side, u.id)).map((u) => newcomer(v, u)),
		...after.state.map.hexes.map((h, i) => ownerChange(v, i, h.owner)),
		prestigeChange(v),
	].filter(Boolean);
}

//A unit the side didn't see before: its own deployed or arrived, the enemy's come into sight
const newcomer = (v: View, u: UnitState) => `${v.name(u.id)} ${v.mine(u.id) ? "arrived" : "seen"} at ${cell(u)}`;

function prestigeChange(v: View): string {
	const was = playerOfSide(v.before, v.side).prestige, now = playerOfSide(v.after, v.side).prestige;
	return was === now ? "" : `prestige ${was} -> ${now}`;
}

const wasSeen = (w: World, side: number, id: number) => {
	const u = unitById(w, id);
	return u !== null && seen(w, side, u);
};

function unitChange(v: View, u: UnitState): string {
	const now = unitById(v.after, u.id);
	if (now === null) return `${v.name(u.id)} gone from ${cell(u)} (destroyed)`;
	if (!seen(v.after, v.side, now)) return `${v.name(u.id)} out of sight (last at ${cell(u)})`;
	const went = now.row !== u.row || now.col !== u.col ? ` ${cell(u)} -> ${cell(now)}` : "";
	const worn = now.strength !== u.strength ? ` str ${u.strength} -> ${now.strength}` : "";
	return went || worn ? `${v.name(u.id)}${went}${worn}` : "";
}

function ownerChange(v: View, i: number, owner: number): string {
	const was = v.before.state.map.hexes[i].owner;
	if (owner === was || v.after.state.map.hexes[i].victorySide < 0 || owner < 0) return "";
	return `${SIDES[sideOfPlayer(v.after, owner)]} took the victory hex ${cell(positionOf(v.after, i))}`;
}
