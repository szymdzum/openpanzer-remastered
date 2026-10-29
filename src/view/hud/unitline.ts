//The unit card's line (docs/ui/components/UnitInfo): the card hidden, its default size, docked at the bottom. Who the
//unit is, its four gauges (the fuel's with what it means: "3 full moves") and what it can still do this turn as chips.
//Every phrase reads a core query (the README's table); only the gauges' low and critical thresholds are the view's
import { canFireThisTurn } from "../../core/attack";
import { dismountsWhenAttacked, entrenchmentFacts } from "../../core/combat";
import { fullMoves, movesLeftThisTurn } from "../../core/movement";
import { entrenchBase, entrenchLimit } from "../../core/turn";
import type { UnitState, World } from "../../core/types";
import { canEntrench, unitUsesFuel } from "../../core/units";
import { ammoOf, fuelOf, isRiding, unitData } from "../../core/world";
import type { IconName } from "../components/icon";
import type { SupplyState } from "../components/meter";
import { supplyState } from "./unitinfo";

/** Past ten is over strength; base is one of the terrain's own levels of entrenchment, dug or not. */
export type Seg = "off" | "on" | "over" | "base" | "base-on";

export interface LineGauge {
	label: string;
	say: string | null; //what the value means, beside the label
	value: string; //"18", "+4", "–"
	of: string | null; //its maximum, "/50"
	state: SupplyState | "dug" | null;
	segs: Seg[] | null; //none: a bar of `fill` instead
	fill: number;
}

//What it can still do this turn. The icons are the map's readiness marks: an arrow to move, a crosshair to fire
export interface LineChip {
	icon: IconName;
	count: number | null; //with its unit: "9 moves"
	unit: string | null;
	words: string; //its tooltip and its name for screen readers
	tone: "ok" | "off" | null; //null for a state (riding)
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

//Ten segments, those past ten (over strength) in brass; low at 6, critical at 3. No words: the segments say the loss
function strengthOf(u: UnitState): LineGauge {
	const n = u.strength;
	const state = n <= 3 ? "critical" : n <= 6 ? "low" : "ok";
	return { label: "Strength", say: null, value: String(n), of: null, state, fill: Math.min(1, n / 10),
		segs: segs(Math.max(10, n), (i) => i >= n ? "off" : i >= 10 ? "over" : "on") };
}

//The transport's fuel when riding, and the full moves it is enough for; none counted for an aircraft (fuelOf alone)
function fuelGauge(w: World, u: UnitState): LineGauge {
	if (!unitUsesFuel(w, u)) return none("Fuel");
	const fuel = fuelOf(u), max = unitData(w, u).fuel, moves = fullMoves(w, u);
	return { label: "Fuel", say: moves === null ? null : plural(moves, "full move", "full moves"), value: String(fuel), of: "/" + max,
		state: supplyState(fuel, max), segs: null, fill: Math.min(1, fuel / max) };
}

//A segment a round, every shot uses one (return and support fire too). What it has now (ammoOf), but riding infantry's
//own: attacked, it gets off and fights with its own rounds. No words: the number is the shots left
function ammoGauge(w: World, u: UnitState): LineGauge {
	const self = dismountsWhenAttacked(w, u), max = unitData(w, u, self).ammo;
	if (max === 0) return none("Ammo");
	const ammo = self ? u.ammo : ammoOf(u);
	return { label: "Ammo", say: null, value: String(ammo), of: "/" + max,
		state: supplyState(ammo, max), fill: Math.min(1, ammo / max), segs: max > MAX_SEGS ? null : segs(max, (i) => i < ammo ? "on" : "off") };
}

//A segment a level the hex allows, the terrain's own levels lighter
function entrenchGauge(w: World, u: UnitState): LineGauge {
	if (!canEntrench(w, u)) return none("Entrenched");
	const level = entrenchmentFacts(w, u).level, base = entrenchBase(w, u), limit = Math.max(level, entrenchLimit(w, u));
	return { label: "Entrenched", say: null, value: level > 0 ? "+" + level : "0", of: null, state: "dug", fill: level / limit,
		segs: segs(limit, (i) => i < base ? (i < level ? "base-on" : "base") : i < level ? "on" : "off") };
}

function chipsOf(w: World, u: UnitState): LineChip[] {
	const moves = movesLeftThisTurn(w, u), fires = canFireThisTurn(w, u);
	const chips: LineChip[] = isRiding(u) ? [{ icon: "mount", count: null, unit: null, words: "Riding", tone: null }] : [];
	const unit = moves === 1 ? "move" : "moves";
	chips.push(moves > 0 ? { icon: "arrow-right", count: moves, unit, words: plural(moves, "move left", "moves left"), tone: "ok" }
		: { icon: "arrow-right", count: 0, unit, words: u.hasMoved ? "Moved" : "Can't move", tone: "off" });
	chips.push({ icon: "target", count: null, unit: null, words: fires ? "Can fire" : "Can't fire", tone: fires ? "ok" : "off" });
	return chips;
}

/** `own`: the side's own unit, which has the This turn chips. */
export function unitLineOf(w: World, u: UnitState, formation: string, own: boolean): CardLine {
	const t = isRiding(u) ? w.equipment[u.transport!.eqid] : null;
	return {
		sprite: unitData(w, u, true).icon, rides: t === null ? null : { sprite: t.icon, name: t.name }, formation,
		gauges: [strengthOf(u), fuelGauge(w, u), ammoGauge(w, u), entrenchGauge(w, u)],
		chips: own ? chipsOf(w, u) : [],
	};
}
