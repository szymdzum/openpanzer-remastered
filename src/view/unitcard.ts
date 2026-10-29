//The unit card's view model (UnitInfo, #348 with #37, docs/ui/components/UnitInfo): the selected unit's card docked at
//the bottom in its two sizes. Hidden, the default: its line (src/view/unitline.ts). Open, on More: who it is (name,
//formation and country, target type, movement and Core, its experience to the next star, its leaders), its condition
//(the line's four gauges, each with what it means, and the Resupply stamp), what it can still do this turn, what it hits
//and holds against each kind of enemy with the bonuses in force, its initiative, range, spotting and value, and the
//band of what riding means. Every phrase reads a core query (the README's table, test/unitfacts.test.ts); only the
//thresholds of the gauges' states and the bars' scale are the view's. From the core's World and nothing else
import { firesOnAircraft, unitAttackRange } from "../core/attack";
import {
	defenderEqid, entrenchmentAttacking, entrenchmentCountsTwiceAgainst, entrenchmentFacts, experienceBonus, INITIATIVE_DEFENCE,
	INITIATIVE_MAX_ATTACK, isCloseCombat, isStreetTerrain, rangeDefence, riding
} from "../core/combat";
import { unitCost } from "../core/costs";
import { type DefenceField, weakDefences } from "../core/equipment";
import { unitSpotRange } from "../core/sight";
import { canResupply } from "../core/supply";
import { entrenchBase, entrenchLimit } from "../core/turn";
import type { UnitId, UnitState, World } from "../core/types";
import { canEntrench, isGround } from "../core/units";
import { hexIndex, unitData } from "../core/world";
import { leaderDescriptions } from "../legacy/prototypes";
import { leaderType, movMethod, movMethodNames, terrainNames, terrainType, unitClass, unitClassNames, unitTypeNames } from "../core/tables";
import type { IconName, Nation } from "./icon";
import { classIcon, countryName, nationOf, shownUnit } from "./model";
import { type LeaderLine, leadersOf } from "./unitinfo";
import { type CardLine, type LineChip, type LineGauge, unitLineOf } from "./unitline";

//How much of the map the card takes: its line (hidden, the default), or open over the map
export type CardSize = "line" | "open";

//A tag under the name: what the rules care about (the shop's line of an entry too)
export interface CardTag {
	text: string;
	icon: IconName | null;
	core: boolean; //the core tag, in brass
}

//A gauge of the open card: the line's, with what its label and its meaning say in their tooltips
export interface CardGauge extends LineGauge {
	tip: string | null;
	sayTip: string | null;
}

//What it hits or holds against a kind of enemy: its icon, name and what it means, its value and its bar on the 0-15
//scale. none: it can't ("can't" against aircraft); weak: its weak defence; plus: added to the defence, with no bar
export interface CardStat {
	icon: IconName;
	name: string;
	tip: string;
	value: string;
	fill: number;
	tone: "none" | "weak" | "plus" | null;
}

//A bonus in force ("+1 veteran") and what it adds to ("attack and defence")
export interface CardBonus {
	text: string;
	to: string;
	tip: string;
}

//What riding its transport (or a carrier) means: "On Opel Blitz", then its phrases, warn ones in critical
export interface BandItem {
	text: string;
	tip: string | null;
	warn: boolean;
}

export interface RideBand {
	on: string;
	items: BandItem[];
}

export interface UnitCard {
	unit: UnitId;
	name: string;
	nation: Nation | null;
	sub: string; //"1st Tank · Germany"
	tags: CardTag[]; //"Hard target", "Tracked", "Core"
	stars: number; //one per 100 XP, five at most
	xp: string; //"120 XP"
	toNextStar: number; //how far to the next star, 0 to 1 (full at five)
	leaders: LeaderLine[];
	condition: CardGauge[];
	resupply: boolean; //ammo or fuel critical, and it can resupply here now
	chips: LineChip[];
	hits: CardStat[];
	holds: CardStat[];
	initiative: { value: number, tip: string };
	fires: number; //its gun range in hexes, the leaders' in it
	sees: number;
	bonuses: CardBonus[];
	value: number; //in prestige
	band: RideBand | null;
	next: boolean; //the side shown's own unit: Next unit selects its next one that hasn't moved
	line: CardLine; //the card hidden, as one line
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

//"1st Tank · Germany"; a unit with no country of its own (a fortification): its class alone
const subOf = (what: string, country: string) => country === "" ? what : what + " · " + country;

//"a, b or c": the several terrains or classes a rule names
const anyOf = (names: string[]) => names.slice(0, -1).join(", ") + " or " + names[names.length - 1];

const leaderName = (l: number) => leaderDescriptions[l][0];
//The terrains a rule of the core names
const terrainsWhere = (rule: (t: number) => boolean) => anyOf(Object.values(terrainType).filter(rule).map((t) => terrainNames[t].toLowerCase()));

//What its entrenchment does, as the attack counts it (entrenchmentFacts, entrenchmentAttacking): never a written list
function entrenchmentTip(w: World, u: UnitState): string {
	const f = entrenchmentFacts(w, u), said = ["Each level adds a point to its defence"];
	if (f.holds) said.push(leaderName(leaderType.ferociousDefense) + ": nothing ignores it");
	else said.push("not against units that ignore entrenchment, nor " + leaderName(leaderType.infiltrationTactics) + " anywhere"
		+ (f.streetFighters ? ", nor " + leaderName(leaderType.streetFighter) + " in a " + terrainsWhere(isStreetTerrain) : ""));
	if (f.doubled) {
		const twice = unitClassNames.filter((_, c) => entrenchmentCountsTwiceAgainst(c)).map((n) => n.toLowerCase());
		said.push("twice here against " + anyOf(twice));
	}
	//(none in close combat: entrenchmentAttacking's test)
	said.push("attacking, it adds " + entrenchmentAttacking(f.level, true, false) + " to its defence too, but not in close combat");
	return said.join("; ");
}

//The open card's gauges: the line's, strength out of ten, the entrenchment's limit here and what it does
function conditionOf(w: World, u: UnitState, line: CardLine): CardGauge[] {
	const [strength, fuel, ammo, dug] = line.gauges;
	const plain = (g: LineGauge): CardGauge => ({ ...g, tip: null, sayTip: null });
	if (!canEntrench(w, u)) return [{ ...plain(strength), of: "/10" }, plain(fuel), plain(ammo), plain(dug)];
	const level = u.entrenchment, base = entrenchBase(w, u), limit = entrenchLimit(w, u);
	const terrain = terrainNames[w.data.hexes[hexIndex(w, u.row, u.col)].terrain].toLowerCase();
	const tip = "Entrenchment: up to " + limit + " here" + (base > 0 ? ", the " + terrain + "'s own " + base + " at once" : "");
	const say = level > 0 ? "+" + level + " defence" : u.hasMoved ? "it moved" : null;
	const sayTip = level > 0 ? entrenchmentTip(w, u) : u.hasMoved ? "A move leaves no entrenchment" : null;
	return [{ ...plain(strength), of: "/10" }, plain(fuel), plain(ammo), { ...dug, say, tip, sayTip }];
}

const stat = (icon: IconName, name: string, tip: string, value: number, weak = false): CardStat =>
	({ icon, name, tip, value: String(value), fill: Math.min(1, Math.max(0, value) / SCALE), tone: weak ? "weak" : null });

//What it hits: its attack on each kind of target. Soft and hard as the game words them, said once in their tooltips
function hitsOf(e: EquipmentEntry): CardStat[] {
	return [
		stat("infantry", "Soft", "Its attack on soft targets: unarmoured", e.softatk),
		stat("tank", "Hard", "Its attack on hard targets: armoured", e.hardatk),
		firesOnAircraft(e) ? stat("air", "Aircraft", "Its attack on aircraft", e.airatk)
			: { icon: "air", name: "Aircraft", tip: "It can't fire on aircraft: only a unit with an air attack does", value: "can't", fill: 0, tone: "none" },
		stat("naval", "Ships", "Its attack on ships", e.navalatk),
	];
}

//What it holds: its defence against each kind of attack, the weak one in critical. Close assault and the range
//defence modifier (what it adds: rangeDefence) only on the ground: an aircraft fights over clear terrain, where infantry
//doesn't close in, and range defence is for ground units against ground units
function holdsOf(w: World, self: UnitState, e: EquipmentEntry): CardStat[] {
	const weak = weakDefences(e), is = (f: DefenceField) => weak.includes(f);
	const ground = isGround(w, self), none = (icon: IconName, name: string, tip: string): CardStat => ({ icon, name, tip, value: "–", fill: 0, tone: "none" });
	const anywhere = isCloseCombat(unitClass.infantry, e.uclass, terrainType.Clear);
	const close = ground ? stat("infantry", "Close assault", "Its defence when infantry attacks it" + (anywhere ? ", anywhere: it is a fortification"
		: " in a " + terrainsWhere((t) => isCloseCombat(unitClass.infantry, e.uclass, t)) + " hex"), e.closedef, is("closedef"))
		: none("infantry", "Close assault", "Never in the air: infantry closes in on the ground");
	const mod = e.rangedefmod, range = unitAttackRange(w, self);
	const near = rangeDefence(mod, 1, range), far = rangeDefence(mod, 2, range);
	const ranged: CardStat = !ground ? none("artillery", "From range", "Only between ground units")
		: { icon: "artillery", name: "From range", value: "+" + mod, fill: 0, tone: "plus",
			tip: "Added to its defence when ground units fire on it, not in close combat: " + (range >= 2
				? "+" + far + " from 2 to " + range + " hexes off, +" + near + " next to it or from further"
				: "+" + near + ", half, as it fires only at its neighbours") };
	return [
		stat("ground", "Ground fire", "Its defence against ground units and ships", e.grounddef, is("grounddef")),
		stat("air", "Air attack", "Its defence against aircraft", e.airdef, is("airdef")),
		close,
		ranged,
	];
}

//The bonuses in force and what they add to: experience to attack and defence, entrenchment to defence alone
function bonusesOf(w: World, u: UnitState): CardBonus[] {
	const bonuses: CardBonus[] = [], vet = experienceBonus(u), level = entrenchmentFacts(w, u).level;
	if (vet > 0) bonuses.push({ text: "+" + vet + " veteran", to: "attack and defence", tip: "Its experience: +" + vet + " to its attack and its defence in every fight" });
	if (level > 0) bonuses.push({ text: "+" + level + " entrenched", to: "defence", tip: entrenchmentTip(w, u) });
	return bonuses;
}

//The band over the card while it rides its transport (riding) or a carrier: what its moves use, its shot, and what it
//defends with when attacked; in critical when it can't get off and fight on foot
function bandOf(w: World, u: UnitState): RideBand | null {
	const r = riding(w, u);
	if (r !== null) {
		const t = w.equipment[r.transport], d = w.equipment[r.defendsWith];
		return { on: "On " + t.name, items: [
			{ text: "moves " + t.movpoints + ", on the " + t.name + "'s fuel", tip: null, warn: false },
			{ text: "can't fire the turn it rides", tip: null, warn: false },
			r.dismounts ? { text: "attacked, it gets off and fights on foot", tip: null, warn: false }
				: { text: "attacked or ambushed, it defends " + d.grounddef, tip: "As its " + d.name + ": ground defence " + d.grounddef
					+ ", air defence " + d.airdef, warn: true },
		] };
	}
	if (u.carrier <= 0) return null;
	const c = w.equipment[u.carrier], d = w.equipment[defenderEqid(w, u)];
	return { on: "On " + c.name, items: [
		{ text: "moves " + c.movpoints, tip: null, warn: false },
		{ text: "attacked, it defends " + d.grounddef, tip: "As its " + d.name + ": ground defence " + d.grounddef + ", air defence " + d.airdef, warn: false },
	] };
}

//The card of a unit on the map that the side shown sees; null when there is none
export function unitCardOf(w: World, id: UnitId): UnitCard | null {
	const u = shownUnit(w, id);
	if (u === null) return null;
	const own = unitData(w, u, true), next = w.state.players[u.owner].side === w.spotSide;
	const order = own.uclass === unitClass.fortification ? "" : ordinal(u.id) + " ";
	const line = unitLineOf(w, u, order + unitClassNames[own.uclass], next);
	//(its own values, the ones it fights with on foot: the band says what riding changes)
	const self: UnitState = { ...u, isMounted: false, carrier: 0 };
	const stars = Math.min(MAX_STARS, experienceBonus(u));
	const condition = conditionOf(w, u, line);
	const short = condition[1].state === "critical" || condition[2].state === "critical";
	const country = countryName(w, u.flag - 1);
	return {
		unit: id, name: own.name, nation: nationOf(country), sub: subOf(order + unitClassNames[own.uclass], country),
		tags: tagsOf(own, u.isCore).slice(1), stars, xp: u.experience + " XP",
		toNextStar: stars >= MAX_STARS ? 1 : (u.experience % XP_STAR) / XP_STAR, leaders: leadersOf(w, u.leader, own.uclass),
		condition, resupply: short && canResupply(w, u), chips: line.chips,
		hits: hitsOf(own), holds: holdsOf(w, self, own),
		initiative: { value: own.initiative, tip: "In a fight the side with more initiative, the attacker on a tie, gets +" + INITIATIVE_DEFENCE
			+ " defence and its lead in attack, up to +" + INITIATIVE_MAX_ATTACK },
		fires: unitAttackRange(w, self), sees: unitSpotRange(w, self), bonuses: bonusesOf(w, u),
		value: unitCost(w, u.eqid, u.transport === null ? undefined : u.transport.eqid), band: bandOf(w, u), next, line,
	};
}
