//A step's events as text from one side's view (#279): its own units in full, the enemy's where it saw
//them. One formatter per event type; the events a side doesn't see or doesn't need say nothing
import type { Fighter, GameEvent } from "../src/core/events";
import type { CombatResult, UnitState, World } from "../src/core/types";
import { hexIndex, isSpotted, sideOf, unitById } from "../src/core/world";
import { cell, own, SIDES, sideOfPlayer } from "./known";

//What a formatter reads: the worlds after and before the events (a destroyed unit is only in the one
//before), the side, and a unit's name and whether it is the side's
interface View {
	after: World;
	before: World;
	side: number;
	unit: (id: number) => UnitState | null;
	name: (id: number) => string;
	mine: (id: number) => boolean;
}

type Formatters = { [K in GameEvent["type"]]?: (e: Extract<GameEvent, { type: K }>, v: View) => string };

const fighter = (v: View, f: Fighter) =>
	`${SIDES[f.side]} ${v.after.equipment[f.eqid].name} #${f.unit} @${cell(f)} ${f.before.strength}->${Math.max(0, f.after.strength)}`;

const ifMine = (v: View, id: number, text: string) => v.mine(id) ? text : "";

function moved(e: Extract<GameEvent, { type: "moved" }>, v: View): string {
	const end = e.path[e.path.length - 1];
	if (v.mine(e.unit)) return `${v.name(e.unit)} moved to ${cell(end)} (cost ${e.cost})`;
	return end && end.visible ? `${v.name(e.unit)} seen moving to ${cell(end)}` : "";
}

const how = (r: CombatResult) => (r.isRugged ? " (rugged defense)" : "") + (r.isOverrun ? " (overrun)" : "");

function fight(e: Extract<GameEvent, { type: "fight" }>, v: View): string {
	if (e.attacker.side !== v.side && e.defender.side !== v.side) return "";
	return `${e.support ? "support fire" : "attack"}: ${fighter(v, e.attacker)} on ${fighter(v, e.defender)}${how(e.result)}`;
}

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
	leader: (e, v) => `${v.name(e.unit)} got a leader (${e.leader})`,
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
	upgraded: (e, v) => `upgraded to ${v.after.equipment[e.eqid].name} for ${e.cost}`,
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
	return { after, before, side, unit, name, mine: (id) => unit(id) !== null && sideOf(before, unit(id)) === side };
}

const format = (e: GameEvent, v: View) => (FORMAT[e.type] as ((x: GameEvent, y: View) => string) | undefined)?.(e, v) ?? "";

//Events as text from side's view; before: the world before them, for the units they destroyed
export function describe(after: World, before: World, side: number, events: GameEvent[]): string[] {
	const v = viewOf(after, before, side);
	return events.map((e) => format(e, v)).filter(Boolean);
}
