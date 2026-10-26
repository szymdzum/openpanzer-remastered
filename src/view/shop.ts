//The equipment window's view model (Equipment, #348): what the old window showed and did (updateEquipmentWindow,
//updateEquipmentCosts, UIBuilder.showEquipmentCosts, equipmentWindowButtons), on the core. The person picks a class,
//a country of their side and a model in service this year, its transport where one carries it, and buys it new,
//upgrades the unit chosen to it, or sells that unit; each with its price and the core's refusal. From the core's
//World and nothing else
import type { Command } from "../commands";
import { asUnit, coreAt, coreUnitOf } from "../core/commands/common";
import { sellCost, unitCost, upgradeCost } from "../core/costs";
import { check } from "../core/step";
import type { OffMapUnit, PlayerState, UnitId, World } from "../core/types";
import { isTransportable } from "../core/units";
import { unitById } from "../core/world";
import { unitClass, unitClassNames } from "../prototypes";
import type { IconName, Nation } from "./icon";
import { classIcon, countryName, isYourTurn, MONTH_NAMES, nationOf, prestigeText, reasonOf } from "./model";
import { ordinal, tagsOf } from "./unitcard";

//The unit the window works on: one on the map, or a core unit off it by its place in the core list (the reserve)
export type Target = { unit: UnitId } | { index: number };

//What the old window sorts by (UIBuilder.unitstats' sort keys), the card's four first. Close defence is closedef here: the
//old window's "closeddef" (uibuilder.ts:153) is no model's key, so its list didn't sort by it
export const SORTS = [
	{ key: "cost", label: "Cost" }, { key: "softatk", label: "Soft atk" }, { key: "hardatk", label: "Hard atk" },
	{ key: "grounddef", label: "Defence" }, { key: "ammo", label: "Ammo" }, { key: "gunrange", label: "Range" },
	{ key: "movpoints", label: "Movement" }, { key: "initiative", label: "Initiative" }, { key: "spotrange", label: "Spotting" },
	{ key: "airatk", label: "Air atk" }, { key: "navalatk", label: "Naval atk" }, { key: "airdef", label: "Air def" },
	{ key: "closedef", label: "Close def" }, { key: "rangedefmod", label: "Ranged def" },
] as const;
export type SortKey = typeof SORTS[number]["key"];

//What the person has picked in the window. transport: -1 none picked yet (the unit's own, when it has one), -2 none
//on purpose (its button pressed again), else the eqid, as the old window kept it
export interface ShopChoice {
	target: Target | null;
	uclass: number;
	country: number; //which of the side's countries, by its place in the list
	eqid: number; //-1: none
	transport: number;
	sort: SortKey;
	reverse: boolean;
}

//The classes the window sells, in the old window's order (UIBuilder.eqClassButtons)
const CLASSES = [unitClass.infantry, unitClass.tank, unitClass.recon, unitClass.antiTank, unitClass.artillery, unitClass.airDefence,
	unitClass.fighter, unitClass.tacticalBomber];
const CLASS_NAMES: Partial<Record<number, string>> = { [unitClass.antiTank]: "Anti-tank", [unitClass.airDefence]: "Anti-air",
	[unitClass.fighter]: "Fighter", [unitClass.tacticalBomber]: "Bomber" };

export interface ClassTab {
	uclass: number;
	label: string;
	icon: IconName;
	count: number; //models in service this year
}

export interface Model {
	eqid: number;
	name: string;
	year: number;
	cost: number;
	stat: string | null; //the sorted stat, "HA 7"; null when sorted by cost
	sprite: string;
	current: boolean; //what the unit has now
}

//A stat of the picked model beside the unit's: its value, its bar on the 0-15 scale (fuel and ammo on their own) and
//the difference, typed +4, −1 or =
export interface Compare {
	name: string;
	value: number;
	fill: number;
	delta: string | null; //null: no unit to compare with
	tone: "up" | "dn" | "";
}

export interface Transport {
	eqid: number; //-2: none
	name: string;
	on: boolean;
}

//A button of the action bar: its price, and why it can't be pressed (null: it can)
export interface ShopAction {
	cost: number;
	refusal: string | null;
	command: Command | null;
}

export interface Shop {
	title: string; //"Germany · September 1939"
	country: { name: string, nation: Nation | null, many: boolean };
	prestige: string;
	tabs: ClassTab[];
	uclass: number;
	sort: SortKey;
	reverse: boolean;
	models: Model[];
	picked: { eqid: number, name: string, line: string, sprite: string, compare: Compare[], against: string | null } | null;
	transports: Transport[]; //none: the model goes on its own
	target: string | null; //"1st Pz IIA": the unit the window works on
	sell: ShopAction | null; //null: nothing to sell
	upgrade: ShopAction | null; //null: nothing to upgrade
	buy: ShopAction;
	after: { action: string, prestige: string } | null;
}

//The side's countries, the player's own and its support countries, as Map.getCountriesBySide lists them
export function sideCountries(w: World, side: number): number[] {
	const list: number[] = [];
	for (const p of w.state.players) {
		if (p.side !== side) continue;
		list.push(p.country);
		for (const s of p.supportCountries) if (s > 0) list.push(s - 1);
	}
	return list;
}

//(flak is bought and upgraded as air defence)
const shopClass = (uclass: number) => uclass === unitClass.flak ? unitClass.airDefence : uclass;

const yearOf = (w: World) => new Date(w.state.scenario.date).getFullYear();
const inService = (e: EquipmentEntry, year: number) => e.yearavailable <= year && e.yearexpired >= year;

//The country's models of a class in service this year, sorted as the old window sorted them (ties by eqid; reversed,
//both ways)
function modelsOf(w: World, country: number, uclass: number, sort: SortKey, reverse: boolean): number[] {
	const indexes = w.state.equipment.indexes[country + 1];
	const list = indexes === undefined ? undefined : indexes.unitclass[String(uclass)];
	const year = yearOf(w), order = reverse ? -1 : 1;
	const value = (eqid: number) => w.equipment[eqid][sort];
	return (list || []).filter((eqid) => w.equipment[eqid] !== undefined && inService(w.equipment[eqid], year)).sort((a, b) => {
		const va = value(a), vb = value(b);
		return va < vb ? -order : va > vb ? order : (a - b) * order;
	});
}

//The unit the window works on, as the core has it, with its name: none when it is gone or isn't the player's
function targetOf(w: World, p: PlayerState, t: Target | null): OffMapUnit | null {
	if (t === null) return null;
	if ("unit" in t) {
		const u = unitById(w, t.unit);
		return u === null || u.owner !== p.id || u.row < 0 ? null : u;
	}
	const c = coreAt(w, t.index);
	return c === null ? null : coreUnitOf(w, c);
}

//The transport picked: the unit's own until another is (when the model can ride one), none where none carries the
//model; and the transports that carry it, in service, of the country, sorted as the models are (the old window did)
function transportsOf(w: World, choice: ShopChoice, country: number, picked: number): { transport: number, list: number[] } {
	const eqid = choice.eqid;
	if (!isTransportable(w, eqid) && !(picked > 0)) return { transport: picked, list: [] };
	const weight = eqid > 0 ? w.equipment[eqid].groundweight : 0;
	const list = modelsOf(w, country, unitClass.groundTransport, choice.sort, choice.reverse).filter((t) => (w.equipment[t].groundweight & weight) !== 0);
	return { transport: picked > 0 && !list.includes(picked) ? -1 : picked, list };
}

const STAT_ROWS: [string, keyof EquipmentEntry][] = [["Soft attack", "softatk"], ["Hard attack", "hardatk"], ["Air attack", "airatk"],
	["Naval attack", "navalatk"], ["Ground def", "grounddef"], ["Air def", "airdef"], ["Close def", "closedef"], ["Ranged def", "rangedefmod"],
	["Initiative", "initiative"], ["Range", "gunrange"], ["Movement", "movpoints"], ["Spotting", "spotrange"], ["Fuel", "fuel"], ["Ammo", "ammo"]];

//(a range of 0 is 1, as the old window showed it; fuel and ammo have bars of their own scale)
const statOf = (e: EquipmentEntry, k: keyof EquipmentEntry) => k === "gunrange" ? Math.max(1, e[k]) : e[k] as number;
const scaleOf = (k: keyof EquipmentEntry) => k === "fuel" ? 100 : k === "ammo" ? 20 : 15;

function deltaOf(diff: number): Pick<Compare, "delta" | "tone"> {
	if (diff === 0) return { delta: "=", tone: "" };
	return diff > 0 ? { delta: "+" + diff, tone: "up" } : { delta: "−" + -diff, tone: "dn" };
}

function compareOf(e: EquipmentEntry, than: EquipmentEntry | null): Compare[] {
	return STAT_ROWS.map(([name, k]) => {
		const value = statOf(e, k);
		const delta = than === null ? { delta: null, tone: "" as const } : deltaOf(value - statOf(than, k));
		return { name, value, fill: Math.min(1, Math.max(0, value) / scaleOf(k)), ...delta };
	});
}

//"Need 40 more prestige to upgrade": the old window's words when the price is over the prestige; else the core's
//refusal of the command
function refusalOf(w: World, cmd: Command, cost: number, prestige: number, verb: string): string | null {
	if (cost > prestige) return `Need ${cost - prestige} more prestige to ${verb}`;
	const r = check(w, cmd);
	return r === null ? null : reasonOf(r);
}

interface Pricing {
	w: World;
	p: PlayerState;
	target: Target | null;
	unit: OffMapUnit | null;
	eqid: number;
	transport: number;
	year: number;
}

//Why the old window didn't sell the model: the unit picked is of a class it doesn't sell, the model is out of service, a
//campaign buys only its own country's
function notSold({ w, unit, eqid, year }: Pricing): string | null {
	const e = w.equipment[eqid], campaign = w.state.campaign;
	if (unit !== null && !CLASSES.includes(shopClass(w.equipment[unit.eqid].uclass))) return "Not sold for this unit's class";
	if (!inService(e, year)) return "Out of service";
	return campaign !== null && campaign.country !== +e.country - 1 ? "Not your country's" : null;
}

//Buy new: the model and its transport, unless it isn't sold (the unit picked is of a class the window doesn't sell,
//the model is out of service, a campaign buys only its own country's), as the old window priced it
function buyOf(c: Pricing): ShopAction {
	const { w, p, eqid, transport } = c;
	if (eqid === -1) return { cost: 0, refusal: "Pick a model", command: null };
	const refusal = notSold(c);
	const cost = refusal === null ? unitCost(w, eqid, transport) : 0;
	const command: Command = { type: "buy", eqid, transport };
	return { cost, refusal: refusal ?? refusalOf(w, command, cost, p.prestige, "buy"), command: refusal === null ? command : null };
}

//Upgrade: to a model of the unit's class and country, for more than nothing (a downgrade isn't offered)
function upgradeOf(c: Pricing): ShopAction | null {
	const { w, p, target, unit, eqid, transport } = c;
	if (unit === null || target === null) return null;
	const own = w.equipment[unit.eqid];
	if (eqid === -1) return { cost: 0, refusal: "Pick a model", command: null };
	const e = w.equipment[eqid];
	if (shopClass(own.uclass) !== shopClass(e.uclass) || own.country !== e.country) return { cost: 0, refusal: "Not the same class", command: null };
	const cost = upgradeCost(w, asUnit(unit), eqid, transport);
	if (!(cost > 0)) return { cost: 0, refusal: "Nothing to upgrade", command: null };
	const command: Command = "unit" in target ? { type: "upgrade", unit: target.unit, eqid, transport }
		: { type: "upgradeUndeployed", index: target.index, eqid, transport };
	return { cost, refusal: refusalOf(w, command, cost, p.prestige, "upgrade"), command };
}

//Sell: a unit on the map is disbanded, one off it sold; in a campaign only a core unit
function sellOf(c: Pricing): ShopAction | null {
	const { w, target, unit } = c;
	if (unit === null || target === null || (w.state.campaign !== null && !unit.isCore)) return null;
	const command: Command = "unit" in target ? { type: "disband", unit: target.unit } : { type: "sell", index: target.index };
	const r = check(w, command);
	return { cost: sellCost(w, asUnit(unit)), refusal: r === null ? null : reasonOf(r), command };
}

function afterOf(p: PlayerState, upgrade: ShopAction | null, buy: ShopAction): Shop["after"] {
	const left = (a: ShopAction) => prestigeText(p.prestige - a.cost);
	if (upgrade !== null && upgrade.refusal === null) return { action: "upgrade", prestige: left(upgrade) };
	return buy.refusal === null ? { action: "buying", prestige: left(buy) } : null;
}

function tabsOf(w: World, country: number, choice: ShopChoice): ClassTab[] {
	return CLASSES.map((c) => ({ uclass: c, label: CLASS_NAMES[c] ?? unitClassNames[c], icon: classIcon(c)!,
		count: modelsOf(w, country, c, choice.sort, choice.reverse).length }));
}

function modelOf(w: World, eqid: number, sort: SortKey, current: number): Model {
	const e = w.equipment[eqid], label = SORTS.find((s) => s.key === sort)!.label;
	const stat = sort === "cost" ? null : label + " " + e[sort];
	return { eqid, name: e.name, year: e.yearavailable, cost: unitCost(w, eqid), stat, sprite: e.icon as unknown as string, current: eqid === current };
}

//The model picked beside the unit's own (none to compare with when it is the same)
function pickedOf(e: EquipmentEntry | null, eqid: number, own: EquipmentEntry | null): Shop["picked"] {
	if (e === null) return null;
	const than = own === null || own === e ? null : own;
	return { eqid, name: e.name, line: tagsOf(e, null).map((t) => t.text).join(" · ") + " · in service from " + e.yearavailable,
		sprite: e.icon as unknown as string, compare: compareOf(e, than), against: than === null ? null : than.name };
}

function transportList(w: World, list: number[], transport: number): Transport[] {
	if (list.length === 0) return [];
	return [{ eqid: -2, name: "None", on: !(transport > 0) }, ...list.map((t) => ({ eqid: t, name: w.equipment[t].name, on: t === transport }))];
}

//(the unit's own transport until another is picked, as the old window preselected it)
function presetOf(w: World, unit: OffMapUnit | null, choice: ShopChoice): number {
	const keeps = unit !== null && unit.transport !== null && choice.transport === -1 && (choice.eqid === -1 || isTransportable(w, choice.eqid));
	return keeps ? unit.transport!.eqid : choice.transport;
}

//"1st Pz IIA" on the map, "Pz IIA" in the reserve
const targetName = (w: World, unit: OffMapUnit, target: Target) => ("unit" in target ? ordinal(target.unit) + " " : "") + w.equipment[unit.eqid].name;

//The window as the person has it, on their turn; null on a program's, where the old window didn't open
export function shopOf(w: World, choice: ShopChoice): Shop | null {
	if (!isYourTurn(w)) return null;
	const p = w.state.players[w.state.turn.currentPlayer], countries = sideCountries(w, p.side);
	const country = countries[choice.country] ?? p.country, name = countryName(w, country);
	const unit = targetOf(w, p, choice.target), target = unit === null ? null : choice.target;
	const { transport, list } = transportsOf(w, choice, country, presetOf(w, unit, choice));
	const year = yearOf(w), pricing: Pricing = { w, p, target, unit, eqid: choice.eqid, transport, year };
	const upgrade = upgradeOf(pricing), buy = buyOf(pricing), own = unit === null ? null : w.equipment[unit.eqid];
	return {
		title: name + " · " + MONTH_NAMES[new Date(w.state.scenario.date).getMonth()] + " " + year,
		country: { name, nation: nationOf(name), many: countries.length > 1 }, prestige: prestigeText(p.prestige), tabs: tabsOf(w, country, choice),
		uclass: choice.uclass, sort: choice.sort, reverse: choice.reverse,
		models: modelsOf(w, country, choice.uclass, choice.sort, choice.reverse).map((m) => modelOf(w, m, choice.sort, unit === null ? -1 : unit.eqid)),
		picked: pickedOf(choice.eqid > 0 ? w.equipment[choice.eqid] : null, choice.eqid, own), transports: transportList(w, list, transport),
		target: unit === null ? null : targetName(w, unit, target!), sell: sellOf(pricing), upgrade, buy, after: afterOf(p, upgrade, buy),
	};
}

//The window opened on a unit: its class, its country and its own model picked (a click on it in the old list); on
//none, the tank class of the player's country
export function choiceFor(w: World, target: Target | null): ShopChoice {
	const base: ShopChoice = { target: null, uclass: unitClass.tank, country: 0, eqid: -1, transport: -1, sort: "cost", reverse: false };
	if (!isYourTurn(w)) return base;
	const p = w.state.players[w.state.turn.currentPlayer], unit = targetOf(w, p, target);
	if (unit === null) return base;
	const e = w.equipment[unit.eqid], uclass = shopClass(e.uclass);
	const country = Math.max(0, sideCountries(w, p.side).indexOf(+e.country - 1));
	return { ...base, target, uclass: CLASSES.includes(uclass) ? uclass : unitClass.tank, country, eqid: unit.eqid };
}
