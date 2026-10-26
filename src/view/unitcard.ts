//The unit card's view model (UnitCard, #348 with #37): everything the old unit info window said about a unit (uiInfo:
//updateUnitInfoWindow), written out as the card's sheet: its identity and tags, its experience, its condition with a
//note in words, every stat with what it is for, move, range, spotting and value, its leaders. The old window's
//buttons are the card's views: the unit itself, its transport, the carrier it rides. An equipment entry (the
//equipment window's) is shown as the old window showed it, full and new. From the core's World and nothing else
import { unitAttackRange } from "../core/attack";
import { unitCost } from "../core/costs";
import { leaderMoves } from "../core/movement";
import { unitSpotRange } from "../core/sight";
import type { UnitId, UnitState, World } from "../core/types";
import { usesFuel } from "../core/units";
import { hexIndex, unitData } from "../core/world";
import { movMethod, movMethodNames, terrainEntrenchment, unitClass, unitClassNames, unitTypeNames } from "../prototypes";
import type { IconName, Nation } from "./icon";
import { classIcon, countryName, nationOf, shownUnit } from "./model";
import { type Gauge, type LeaderLine, leadersOf, supplyState } from "./unitinfo";

//What the card shows of a unit: itself, the transport it has (mounted or not), the carrier it rides
export type CardView = "unit" | "transport" | "carrier";

//A tag under the name: what the rules care about
export interface CardTag {
	text: string;
	icon: IconName | null;
	core: boolean; //the core tag, in brass
}

//A condition meter with its note in words ("enough for 3 moves")
export interface CardGauge extends Gauge {
	note: string | null;
}

//An attack or defence stat: its bar on the 0-15 scale, and what it is for
export interface CardStat {
	name: string;
	value: number;
	fill: number;
	note: string;
}

//Move, range, spotting, value: the figure, and the line under it ("5 + 1 leader")
export interface CardFigure {
	label: string;
	value: number;
	note: string;
	prestige: boolean;
}

export interface UnitCard {
	unit: UnitId | null; //null: an equipment entry
	name: string;
	nation: Nation | null;
	sub: string; //"1st Tank · Germany"
	sprite: string; //the sprite strip's file
	tags: CardTag[];
	bars: number;
	xp: string; //"120 XP, 80 to the next"
	condition: CardGauge[];
	attack: CardStat[];
	defence: CardStat[];
	figures: CardFigure[];
	leaders: LeaderLine[];
	//the views it has besides the one shown (the old window's transport and carrier buttons), and the one shown
	views: CardView[];
	view: CardView;
	next: boolean; //the side shown's own unit: Next unit selects its next one that hasn't moved
}

//The stats' scale: the bars run to 15
const SCALE = 15;
const XP_BAR = 100, MAX_BARS = 5;

//A unit's ordinal as the old window wrote it before the name (UIBuilder.unitIDToOrdinal): 1st, 2nd, 11th, 101st for 0
export function ordinal(id: number): string {
	if (id < 0) return "";
	if (id === 0) return "101st";
	const last = id % 10;
	//(only 11, 12 and 13 themselves are "th": 111 is 111st, as the old window wrote it)
	if (last === 1 && id !== 11) return id + "st";
	if (last === 2 && id !== 12) return id + "nd";
	if (last === 3 && id !== 13) return id + "rd";
	return id + "th";
}

//What an entry is as a mover: a train is a ground unit on rails (uclass up to air defence with naval movement)
function moveName(e: EquipmentEntry): string {
	return e.uclass <= unitClass.airDefence && e.movmethod === movMethod.deepnaval ? "Rail road" : movMethodNames[e.movmethod];
}

export function tagsOf(e: EquipmentEntry, core: boolean | null): CardTag[] {
	const tags: CardTag[] = [
		{ text: unitClassNames[e.uclass], icon: classIcon(e.uclass), core: false },
		{ text: unitTypeNames[e.target] + " target", icon: null, core: false },
		{ text: moveName(e), icon: null, core: false },
	];
	if (core !== null) tags.push({ text: core ? "Core" : "Auxiliary", icon: null, core });
	return tags;
}

function xpOf(experience: number): { bars: number, xp: string } {
	const bars = Math.min(MAX_BARS, Math.floor(experience / XP_BAR));
	const xp = bars === MAX_BARS ? experience + " XP" : `${experience} XP, ${XP_BAR - experience % XP_BAR} to the next`;
	return { bars, xp };
}

//"1st Tank · Germany"; a unit with no country of its own (a fortification): its class alone
const subOf = (what: string, country: string) => country === "" ? what : what + " · " + country;

const plural = (n: number, one: string, many: string) => n + " " + (n === 1 ? one : many);

//The supply the shown equipment has: its fuel and ammo, the unit's or its transport's
interface Supply {
	strength: number;
	fuel: number;
	ammo: number;
	entrenchment: number;
	dug: number; //the most entrenchment the hex gives, for the meter's fill
}

function conditionOf(e: EquipmentEntry, s: Supply): CardGauge[] {
	const fuel = usesFuel(e), ammo = e.ammo !== 0;
	return [
		{ icon: "strength", label: "Strength", value: s.strength + "/10", fill: Math.min(1, s.strength / 10), state: supplyState(s.strength, 10), note: null },
		fuel ? { icon: "fuel", label: "Fuel", value: s.fuel + "/" + e.fuel, fill: Math.min(1, s.fuel / e.fuel), state: supplyState(s.fuel, e.fuel),
			note: e.movpoints > 0 ? "enough for " + plural(Math.floor(s.fuel / e.movpoints), "move", "moves") : null }
			: { icon: "fuel", label: "Fuel", value: "–", fill: 0, note: "uses none" },
		ammo ? { icon: "ammo", label: "Ammo", value: s.ammo + "/" + e.ammo, fill: Math.min(1, s.ammo / e.ammo), state: supplyState(s.ammo, e.ammo),
			note: s.ammo === 0 ? "no attacks left" : plural(s.ammo, "attack", "attacks") + " left" }
			: { icon: "ammo", label: "Ammo", value: "–", fill: 0, note: "uses none" },
		{ icon: "entrench", label: "Entrenchment", value: String(s.entrenchment), fill: s.dug > 0 ? Math.min(1, s.entrenchment / s.dug) : 0,
			note: s.entrenchment === 0 ? "not dug in" : "dug in" },
	];
}

const stat = (name: string, value: number, note: string): CardStat => ({ name, value, fill: Math.min(1, Math.max(0, value) / SCALE), note });

//The stats as the old window listed them, each with what it is for
function statsOf(e: EquipmentEntry): { attack: CardStat[], defence: CardStat[] } {
	return {
		attack: [stat("Soft", e.softatk, "infantry, guns, trucks"), stat("Hard", e.hardatk, "tanks, armoured cars"),
			stat("Air", e.airatk, "aircraft overhead"), stat("Naval", e.navalatk, "ships")],
		defence: [stat("Ground", e.grounddef, "against ground attacks"), stat("Air", e.airdef, "against air attacks"),
			stat("Close", e.closedef, "in cities and forests"), stat("Ranged", e.rangedefmod, "against fire from range"),
			stat("Initiative", e.initiative, "who fires first")],
	};
}

//A figure with the leader's part said under it: "5 + 1 leader"
function figure(label: string, base: number, bonus: number, note: string): CardFigure {
	return { label, value: base + bonus, note: bonus > 0 ? `${base} + ${bonus} leader` : note, prestige: false };
}

const rangeNote = (range: number) => range <= 1 ? "adjacent only" : range + " hexes";

function figuresOf(e: EquipmentEntry, move: number, range: number, spot: number, cost: number): CardFigure[] {
	const gun = e.gunrange === 0 ? 1 : e.gunrange;
	return [
		figure("Move", e.movpoints, move, "hexes a turn"),
		figure("Range", gun, range - gun, rangeNote(range)),
		figure("Spotting", e.spotrange, spot - e.spotrange, "hexes of sight"),
		{ label: "Value", value: cost, note: "prestige", prestige: true },
	];
}

//The views a unit has: itself, and its transport when it has one; the carrier while it rides one
function viewsOf(u: UnitState): CardView[] {
	const views: CardView[] = ["unit"];
	if (u.transport !== null) views.push("transport");
	if (u.carrier > 0) views.push("carrier");
	return views;
}

//The view the card opens on, as the old window did: the transport when mounted, else the unit (the carrier has a button)
export function defaultView(u: UnitState): CardView {
	return u.isMounted && u.transport !== null ? "transport" : "unit";
}

//The card of a unit on the map that the side shown sees, in one of its views (a view it doesn't have: the one it
//opens on); null when there is none
export function unitCardOf(w: World, id: UnitId, view: CardView | null): UnitCard | null {
	const u = shownUnit(w, id);
	if (u === null) return null;
	const views = viewsOf(u), shown = view !== null && views.includes(view) ? view : defaultView(u);
	if (shown === "carrier") return { ...entryCardOf(w, u.carrier, u.flag - 1), unit: id, views, view: shown, next: false };
	const own = unitData(w, u, true), t = shown === "transport" ? u.transport! : null;
	const e = t === null ? own : w.equipment[t.eqid];
	const dug = terrainEntrenchment[w.data.hexes[hexIndex(w, u.row, u.col)].terrain] + 5;
	const country = countryName(w, u.flag - 1);
	const order = own.uclass === unitClass.fortification ? "" : ordinal(u.id) + " ";
	//(range and spotting as the rules count them, the leaders' hexes in them: the unit's own data, as the panel shows it)
	const range = t === null ? unitAttackRange(w, { ...u, isMounted: false, carrier: 0 }) : (e.gunrange || 1);
	const spot = t === null ? unitSpotRange(w, { ...u, isMounted: false, carrier: 0 }) : e.spotrange;
	return {
		unit: id, name: own.name, nation: nationOf(country), sub: subOf(order + unitClassNames[own.uclass], country),
		sprite: e.icon as unknown as string, tags: tagsOf(e, u.isCore), ...xpOf(u.experience),
		condition: conditionOf(e, { strength: u.strength, fuel: t === null ? u.fuel : t.fuel, ammo: t === null ? u.ammo : t.ammo,
			entrenchment: u.entrenchment, dug }),
		...statsOf(e), figures: figuresOf(e, leaderMoves(w, u), range, spot, unitCost(w, u.eqid, u.transport === null ? undefined : u.transport.eqid)),
		leaders: leadersOf(w, u.leader, own.uclass), views, view: shown, next: w.state.players[u.owner].side === w.spotSide,
	};
}

//The card of an equipment entry (the equipment window's, a carrier's): new and full, as the old window filled it
export function entryCardOf(w: World, eqid: number, country: number): UnitCard {
	const e = w.equipment[eqid], name = countryName(w, country);
	return {
		unit: null, name: e.name, nation: nationOf(name), sub: subOf(unitClassNames[e.uclass], name), sprite: e.icon as unknown as string,
		tags: tagsOf(e, null), ...xpOf(0),
		condition: conditionOf(e, { strength: 10, fuel: e.fuel, ammo: e.ammo, entrenchment: 0, dug: 0 }),
		...statsOf(e), figures: figuresOf(e, 0, e.gunrange || 1, e.spotrange, unitCost(w, eqid)), leaders: [], views: [], view: "unit", next: false,
	};
}
