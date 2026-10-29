//The unit card's view model (UnitInfo, #348 with #37): everything the old unit info window said about a unit (uiInfo:
//updateUnitInfoWindow), for the one card docked at the bottom, and no more (docs/ui/PLAN.md, a 1:1 port): its identity
//and tags, its experience, its condition, every stat, move, range, spotting and value, its leaders. The old window's
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
import { type CardLine, unitLineOf } from "./unitline";

//What the card shows of a unit: itself, the transport it has (mounted or not), the carrier it rides
export type CardView = "unit" | "transport" | "carrier";

//How much of the map the card takes: its line (hidden, the default), or unfolded over the map
export type CardSize = "line" | "full";

//A tag under the name: what the rules care about
export interface CardTag {
	text: string;
	icon: IconName | null;
	core: boolean; //the core tag, in brass
}

//An attack or defence stat: its bar on the 0-15 scale
export interface CardStat {
	name: string;
	value: number;
	fill: number;
}

//Move, range, spotting, value: the figure as the rules count it (a leader's hexes in it)
export interface CardFigure {
	label: string;
	value: number;
	prestige: boolean;
}

export interface UnitCard {
	unit: UnitId | null; //null: an equipment entry
	name: string;
	nation: Nation | null;
	sub: string; //"1st Tank · Germany"
	sprite: string; //the sprite strip's file
	tags: CardTag[];
	stars: number; //one per 100 XP, five at most
	xp: string; //"120 XP"
	condition: Gauge[];
	attack: CardStat[];
	defence: CardStat[];
	figures: CardFigure[];
	leaders: LeaderLine[];
	//the views it has besides the one shown (the old window's transport and carrier buttons), and the one shown
	views: CardView[];
	view: CardView;
	next: boolean; //the side shown's own unit: Next unit selects its next one that hasn't moved
	line: CardLine | null; //the card hidden, as one line: a unit on the map's, none for an equipment entry
}

//The stats' scale: the bars run to 15
const SCALE = 15;
const XP_STAR = 100, MAX_STARS = 5;

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

function xpOf(experience: number): { stars: number, xp: string } {
	return { stars: Math.min(MAX_STARS, Math.floor(experience / XP_STAR)), xp: experience + " XP" };
}

//"1st Tank · Germany"; a unit with no country of its own (a fortification): its class alone
const subOf = (what: string, country: string) => country === "" ? what : what + " · " + country;

//The supply the shown equipment has: its fuel and ammo, the unit's or its transport's
interface Supply {
	strength: number;
	fuel: number;
	ammo: number;
	entrenchment: number;
	dug: number; //the most entrenchment the hex gives, for the meter's fill
}

function conditionOf(e: EquipmentEntry, s: Supply): Gauge[] {
	const fuel = usesFuel(e), ammo = e.ammo !== 0;
	return [
		{ icon: "strength", label: "Strength", value: s.strength + "/10", fill: Math.min(1, s.strength / 10), state: supplyState(s.strength, 10) },
		fuel ? { icon: "fuel", label: "Fuel", value: s.fuel + "/" + e.fuel, fill: Math.min(1, s.fuel / e.fuel), state: supplyState(s.fuel, e.fuel) }
			: { icon: "fuel", label: "Fuel", value: "–", fill: 0 },
		ammo ? { icon: "ammo", label: "Ammo", value: s.ammo + "/" + e.ammo, fill: Math.min(1, s.ammo / e.ammo), state: supplyState(s.ammo, e.ammo) }
			: { icon: "ammo", label: "Ammo", value: "–", fill: 0 },
		{ icon: "entrench", label: "Entrenchment", value: String(s.entrenchment), fill: s.dug > 0 ? Math.min(1, s.entrenchment / s.dug) : 0 },
	];
}

const stat = (name: string, value: number): CardStat => ({ name, value, fill: Math.min(1, Math.max(0, value) / SCALE) });

//The stats as the old window listed them
function statsOf(e: EquipmentEntry): { attack: CardStat[], defence: CardStat[] } {
	return {
		attack: [stat("Soft", e.softatk), stat("Hard", e.hardatk), stat("Air", e.airatk), stat("Naval", e.navalatk)],
		defence: [stat("Ground", e.grounddef), stat("Air", e.airdef), stat("Close", e.closedef), stat("Ranged", e.rangedefmod),
			stat("Initiative", e.initiative)],
	};
}

function figuresOf(e: EquipmentEntry, move: number, range: number, spot: number, cost: number): CardFigure[] {
	return [
		{ label: "Move", value: e.movpoints + move, prestige: false },
		{ label: "Range", value: range, prestige: false },
		{ label: "Spotting", value: spot, prestige: false },
		{ label: "Value", value: cost, prestige: true },
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
	const own = unitData(w, u, true), next = w.state.players[u.owner].side === w.spotSide;
	const order = own.uclass === unitClass.fortification ? "" : ordinal(u.id) + " ";
	const line = unitLineOf(w, u, order + unitClassNames[own.uclass], next);
	if (shown === "carrier") return { ...entryCardOf(w, u.carrier, u.flag - 1), unit: id, views, view: shown, next: false, line };
	const t = shown === "transport" ? u.transport! : null;
	const e = t === null ? own : w.equipment[t.eqid];
	const dug = terrainEntrenchment[w.data.hexes[hexIndex(w, u.row, u.col)].terrain] + 5;
	const country = countryName(w, u.flag - 1);
	//(range and spotting as the rules count them, the leaders' hexes in them: the unit's own data, as the panel shows it)
	const range = t === null ? unitAttackRange(w, { ...u, isMounted: false, carrier: 0 }) : (e.gunrange || 1);
	const spot = t === null ? unitSpotRange(w, { ...u, isMounted: false, carrier: 0 }) : e.spotrange;
	const figures = figuresOf(e, leaderMoves(w, u), range, spot, unitCost(w, u.eqid, u.transport === null ? undefined : u.transport.eqid));
	return {
		unit: id, name: own.name, nation: nationOf(country), sub: subOf(order + unitClassNames[own.uclass], country),
		sprite: e.icon, tags: tagsOf(e, u.isCore), ...xpOf(u.experience),
		condition: conditionOf(e, { strength: u.strength, fuel: t === null ? u.fuel : t.fuel, ammo: t === null ? u.ammo : t.ammo,
			entrenchment: u.entrenchment, dug }),
		...statsOf(e), figures,
		leaders: leadersOf(w, u.leader, own.uclass), views, view: shown, next, line,
	};
}

//The card of an equipment entry (the equipment window's, a carrier's): new and full, as the old window filled it
export function entryCardOf(w: World, eqid: number, country: number): UnitCard {
	const e = w.equipment[eqid], name = countryName(w, country);
	const figures = figuresOf(e, 0, e.gunrange || 1, e.spotrange, unitCost(w, eqid));
	return {
		unit: null, name: e.name, nation: nationOf(name), sub: subOf(unitClassNames[e.uclass], name), sprite: e.icon,
		tags: tagsOf(e, null), ...xpOf(0),
		condition: conditionOf(e, { strength: 10, fuel: e.fuel, ammo: e.ammo, entrenchment: 0, dug: 0 }),
		...statsOf(e), figures, leaders: [], views: [], view: "unit", next: false, line: null,
	};
}
