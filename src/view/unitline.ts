//The unit card's line (UnitInfo, #37, docs/ui/components/UnitInfo): the card hidden, its default size, one line docked
//at the bottom. Who the unit is, its four gauges each with what it means ("3 full moves", "1 shot left"), and what it
//can still do this turn as chips. Every phrase reads a core query (the README's table); only the gauges' low and
//critical thresholds are the view's
import { canFireThisTurn } from "../core/attack";
import { dismountsWhenAttacked, entrenchmentFacts } from "../core/combat";
import { fullMoves, movesLeftThisTurn } from "../core/movement";
import { entrenchBase, entrenchLimit } from "../core/turn";
import type { UnitState, World } from "../core/types";
import { canEntrench, unitUsesFuel } from "../core/units";
import { ammoOf, fuelOf, isRiding, unitData } from "../core/world";
import type { IconName } from "./icon";
import type { SupplyState } from "./meter";
import { supplyState } from "./unitinfo";

//A gauge's segment: off, on, past ten (over strength), or one of the terrain's own levels of entrenchment, dug or not
export type Seg = "off" | "on" | "over" | "base" | "base-on";

//A gauge of the line: its label and, beside it, what the value means; the value ("18", "+4", "–") and its maximum
//("/50"); segments, or a bar's fill when it has none
export interface LineGauge {
	label: string;
	say: string | null;
	value: string;
	of: string | null;
	state: SupplyState | "dug" | null;
	segs: Seg[] | null;
	fill: number;
}

//What it can still do this turn: an icon, a number, the words (its tooltip and its name for screen readers); ok when it
//can, off when it can't, neither for a state (riding)
export interface LineChip {
	icon: IconName;
	count: number | null;
	words: string;
	tone: "ok" | "off" | null;
}

export interface CardLine {
	sprite: string; //the unit's own
	rides: { sprite: string, name: string } | null; //the transport it rides
	formation: string; //"1st Tank"
	gauges: LineGauge[];
	chips: LineChip[]; //none for a unit not the side's own
}

//Ammo has a segment a round up to this many, a bar past it (a PaK 36 has 24)
const MAX_SEGS = 15;

const segs = (n: number, of: (i: number) => Seg): Seg[] => Array.from({ length: n }, (_, i) => of(i));
const plural = (n: number, one: string, many: string) => n + " " + (n === 1 ? one : many);
const none = (label: string): LineGauge => ({ label, say: null, value: "–", of: null, state: null, segs: null, fill: 0 });

//Strength: ten segments, those past ten (over strength) in brass; low at 6, critical at 3
function strengthOf(u: UnitState): LineGauge {
	const n = u.strength;
	const say = n > 10 ? `+${n - 10} over` : n === 10 ? "full" : `lost ${10 - n}`;
	const state = n <= 3 ? "critical" : n <= 6 ? "low" : "ok";
	return { label: "Strength", say, value: String(n), of: null, state, fill: Math.min(1, n / 10),
		segs: segs(Math.max(10, n), (i) => i >= n ? "off" : i >= 10 ? "over" : "on") };
}

//Fuel: the transport's when riding, and the full moves it is enough for; none counted for an aircraft (fuelOf alone)
function fuelGauge(w: World, u: UnitState): LineGauge {
	if (!unitUsesFuel(w, u)) return none("Fuel");
	const fuel = fuelOf(u), max = unitData(w, u).fuel, moves = fullMoves(w, u);
	return { label: "Fuel", say: moves === null ? null : plural(moves, "full move", "full moves"), value: String(fuel), of: "/" + max,
		state: supplyState(fuel, max), segs: null, fill: Math.min(1, fuel / max) };
}

//Ammo: a segment a round, every shot uses one (return and support fire too). What it is now has (ammoOf), but riding
//infantry's own: attacked, it gets off and fights with its own rounds
function ammoGauge(w: World, u: UnitState): LineGauge {
	const self = dismountsWhenAttacked(w, u), max = unitData(w, u, self).ammo;
	if (max === 0) return none("Ammo");
	const ammo = self ? u.ammo : ammoOf(u);
	return { label: "Ammo", say: ammo === 0 ? "no shots left" : plural(ammo, "shot left", "shots left"), value: String(ammo), of: "/" + max,
		state: supplyState(ammo, max), fill: Math.min(1, ammo / max), segs: max > MAX_SEGS ? null : segs(max, (i) => i < ammo ? "on" : "off") };
}

//Entrenchment: a segment a level the hex allows, the terrain's own levels lighter
function entrenchGauge(w: World, u: UnitState): LineGauge {
	if (!canEntrench(w, u)) return none("Entrenched");
	const level = entrenchmentFacts(w, u).level, base = entrenchBase(w, u), limit = Math.max(level, entrenchLimit(w, u));
	return { label: "Entrenched", say: null, value: level > 0 ? "+" + level : "0", of: null, state: "dug", fill: level / limit,
		segs: segs(limit, (i) => i < base ? (i < level ? "base-on" : "base") : i < level ? "on" : "off") };
}

function chipsOf(w: World, u: UnitState): LineChip[] {
	const moves = movesLeftThisTurn(w, u), fires = canFireThisTurn(w, u);
	const chips: LineChip[] = isRiding(u) ? [{ icon: "mount", count: null, words: "Riding", tone: null }] : [];
	chips.push(moves > 0 ? { icon: "play", count: moves, words: plural(moves, "move left", "moves left"), tone: "ok" }
		: { icon: "play", count: 0, words: u.hasMoved ? "Moved" : "Can't move", tone: "off" });
	chips.push({ icon: "attack", count: null, words: fires ? "Can fire" : "Can't fire", tone: fires ? "ok" : "off" });
	return chips;
}

//The line of a unit on the map; own: the side's own unit, which has the This turn chips
export function unitLineOf(w: World, u: UnitState, formation: string, own: boolean): CardLine {
	const t = isRiding(u) ? w.equipment[u.transport!.eqid] : null;
	return {
		sprite: unitData(w, u, true).icon, rides: t === null ? null : { sprite: t.icon, name: t.name }, formation,
		gauges: [strengthOf(u), fuelGauge(w, u), ammoGauge(w, u), entrenchGauge(w, u)],
		chips: own ? chipsOf(w, u) : [],
	};
}
