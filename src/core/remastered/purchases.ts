/**
 * The remastered AI's purchases (#640): what its army lacks for its commander's directives against the enemy its side
 * knows of, the best equipment of each kind for the prestige, a transport with what one carries (#224).
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

import { inService } from "../commands/units";
import { unitCost } from "../costs";
import { deploymentHexes } from "../deployment";
import { reinforcement } from "../supply";
import { movMethod, terrainType, unitClass, unitType } from "../tables";
import type { World } from "../types";
import { unitData } from "../world";
import type { Directive } from "./directives";
import type { SideView } from "./perception";

/** What a unit is bought for. */
export type Role = "infantry" | "tank" | "antiTank" | "artillery" | "airDefence" | "fighter" | "bomber";

//In this order a role wins a tie
const ROLES: readonly Role[] = ["infantry", "tank", "antiTank", "artillery", "airDefence", "fighter", "bomber"];

const CLASSES: Record<Role, readonly number[]> = {
	infantry: [unitClass.infantry], tank: [unitClass.tank], antiTank: [unitClass.antiTank], artillery: [unitClass.artillery],
	airDefence: [unitClass.airDefence, unitClass.flak], fighter: [unitClass.fighter], bomber: [unitClass.tacticalBomber],
};

/** The role a unit class is bought for, null for the classes the AI doesn't buy. */
export function roleOf(uclass: number): Role | null {
	return ROLES.find((r) => CLASSES[r].includes(uclass)) ?? null;
}

/** A unit to buy: its equipment, its transport (-1: none) and its role. */
export interface Purchase {
	eqid: number;
	transport: number;
	role: Role;
}

type Stat = "softatk" | "hardatk" | "airatk" | "grounddef" | "airdef" | "closedef" | "initiative" | "gunrange" | "movpoints";

//What a model of each role is worth, a weight for each of its numbers: the attack it is bought for counts most. A
//tank's hard attack, an anti-tank gun's and the air defence's air attack are what they are there for; the artillery's
//range lets it fire from out of the enemy's reach; infantry holds close terrain, so its close defence counts
const WORTH: Record<Role, Partial<Record<Stat, number>>> = {
	infantry: { softatk: 1, hardatk: 1, grounddef: 1, closedef: 1, initiative: 0.5 },
	tank: { softatk: 1, hardatk: 1.5, grounddef: 1, movpoints: 1, initiative: 0.5 },
	antiTank: { hardatk: 2, grounddef: 1, initiative: 0.5 },
	artillery: { softatk: 1, hardatk: 0.5, gunrange: 2, grounddef: 0.5 },
	airDefence: { airatk: 2, gunrange: 2, grounddef: 0.5 },
	fighter: { airatk: 2, airdef: 1, initiative: 1 },
	bomber: { softatk: 1, hardatk: 1, airdef: 1 },
};

//A model's worth grows with the square of its numbers: the combat result goes by the difference between the attack and
//the defence, so a point more counts for more on the stronger unit, and a cheap weak unit doesn't win on its price
const WORTH_EXPONENT = 2;

//The share of the army's strength each role should have. Infantry takes and holds the objectives; the main effort
//(an assault directive) wants tanks, artillery to fire before the attack and bombers
const INFANTRY_SHARE = 0.35;
const TANK_SHARE = { assault: 0.25, other: 0.15 };
const ARTILLERY_SHARE = { assault: 0.2, other: 0.15 };
const BOMBER_SHARE = { assault: 0.05, other: 0 };
//Anti-tank guns, more against an enemy whose ground forces are armour: their share of its known ground strength
const ANTI_TANK_SHARE = 0.1;
const ANTI_TANK_PER_ARMOUR = 0.3;
//Air defence and fighters only against an enemy that flies, as its aircraft's share of its known strength, to this
//share of the army at most each
const AIR_SHARE_CAP = 0.2;

/** The shares of its strength the army should have by role, and what it has. */
export interface Needs {
	wanted: Record<Role, number>;
	own: Record<Role, number>;
	//Its infantry, tanks and recon, by units, and how many its objectives to take want
	capturers: number;
	capturersWanted: number;
}

//The units that take a hex in an attack: what the capturing floor counts, one by one (a strength point doesn't stand on
//two objectives)
const CAPTURER_CLASSES: readonly number[] = [unitClass.infantry, unitClass.tank, unitClass.recon];
//The capturing units a side wants for each objective it has to take: one to take it, one to hold it, one lost on the
//way. Below it the purchases buy infantry or tanks first (in the arena, a side short of them took fewer objectives)
const CAPTURERS_PER_OBJECTIVE = 3;

const noRoles = (): Record<Role, number> => ({ infantry: 0, tank: 0, antiTank: 0, artillery: 0, airDefence: 0, fighter: 0, bomber: 0 });

/**
 * The shares of strength the side's army should have by role for its directives (the main effort, the holds) against
 * the enemy it knows of (#17), and the strength it has, its units waiting to deploy included; the capturing units it
 * has and wants for its objectives to take.
 */
export function needsOf(w: World, view: SideView, directives: readonly Directive[], player: number): Needs {
	const own = noRoles();
	const count = (eqid: number, strength: number) => {
		const role = roleOf(w.equipment[eqid].uclass);
		if (role !== null) own[role] += strength;
	};
	let capturers = 0;
	const capturing = (eqid: number) => CAPTURER_CLASSES.includes(w.equipment[eqid].uclass) ? 1 : 0;
	for (const u of view.own) {
		count(u.eqid, u.strength);
		capturers += capturing(u.eqid);
	}
	for (const c of w.state.players[player].core) if ("reserve" in c) {
		count(c.reserve.eqid, c.reserve.strength);
		capturers += capturing(c.reserve.eqid);
	}
	return { wanted: wantedShares(w, view, directives), own, capturers, capturersWanted: CAPTURERS_PER_OBJECTIVE * w.state.objectives[view.side].length };
}

//The enemy's known strength (#17), each by the side's confidence in it: on the ground, the armour of it, in the air
interface EnemyForce {
	ground: number;
	armour: number;
	air: number;
}

function enemyForce(w: World, view: SideView): EnemyForce {
	const f: EnemyForce = { ground: 0, armour: 0, air: 0 };
	for (const s of view.enemies) {
		const e = w.equipment[s.eqid], strength = s.strength * s.confidence;
		if (e.movmethod === movMethod.air) f.air += e.uclass === unitClass.airTransport ? 0 : strength;
		else if (e.uclass <= unitClass.airDefence) {
			f.ground += strength;
			if (e.target === unitType.hard) f.armour += strength;
		}
	}
	return f;
}

const shareOf = (part: number, whole: number) => whole > 0 ? part / whole : 0;

function wantedShares(w: World, view: SideView, directives: readonly Directive[]): Record<Role, number> {
	const enemy = enemyForce(w, view), main = directives.some((d) => d.task === "assault") ? "assault" : "other";
	const airShare = Math.min(AIR_SHARE_CAP, shareOf(enemy.air, enemy.ground + enemy.air));
	const raw: Record<Role, number> = { infantry: INFANTRY_SHARE, tank: TANK_SHARE[main],
		antiTank: ANTI_TANK_SHARE + ANTI_TANK_PER_ARMOUR * shareOf(enemy.armour, enemy.ground), artillery: ARTILLERY_SHARE[main],
		airDefence: airShare, fighter: airShare, bomber: BOMBER_SHARE[main] };
	const total = ROLES.reduce((n, r) => n + raw[r], 0);
	for (const r of ROLES) raw[r] /= total;
	return raw;
}

//A unit below this strength is reinforced before it does anything else (rear.ts, `urgentSupply`): its prestige is spent
const OWED_BELOW = 4;

/**
 * The prestige the purchases leave: the rules' reserve (the classic AI's), or more when the player's worn-out units
 * would cost more to reinforce where they stand: the planner reinforces them first, and a point of a veteran costs what
 * a point of a new unit of its model does, keeps its experience and needs no deployment hex.
 */
export function reserveOf(w: World, player: number): number {
	let owed = 0;
	for (const u of w.state.units) {
		if (u.owner !== player || u.strength >= OWED_BELOW || unitData(w, u, true).uclass === unitClass.fortification) continue;
		const r = reinforcement(w, u);
		owed += r.wanted * r.perPoint;
	}
	return Math.max(w.rules.ai.config.prestigeReserve, owed);
}

type Kind = "air" | "ground";
const kindOf = (w: World, eqid: number): Kind => w.equipment[eqid].movmethod === movMethod.air ? "air" : "ground";

/** Whether the model is a gun that fires from where it stands: on a ship it can't fire, so it deploys on land. */
export const isGun = (e: EquipmentEntry): boolean => e.uclass === unitClass.artillery || e.uclass === unitClass.airDefence
	|| e.uclass === unitClass.flak;

/** Whether a ground unit of the model may deploy on the hex: on the ocean it boards a ship (commands/units.ts). */
export const deploysOn = (w: World, e: EquipmentEntry, hex: number): boolean => !isGun(e) || w.data.hexes[hex].terrain !== terrainType.Ocean;

//The free deployment hexes of the side: for aircraft, for ground units and, of those, on land for the guns; less one
//for each unit already waiting to deploy
interface Slots {
	air: number;
	ground: number;
	land: number;
}

function freeSlots(w: World, side: number, player: number): Slots {
	const slots: Slots = { air: 0, ground: 0, land: 0 }, seen = new Set<Kind>();
	const waiting = w.state.players[player].core.filter((c) => "reserve" in c).map((c) => "reserve" in c ? c.reserve.eqid : 0);
	for (const eqid of shopOf(w, player)) {
		const kind = kindOf(w, eqid);
		if (seen.has(kind)) continue;
		seen.add(kind);
		const free = deploymentHexes(w, side, eqid).filter((h) => kind === "air" ? w.state.map.hexes[h].air === null
			: w.state.map.hexes[h].unit === null);
		const queued = waiting.filter((x) => kindOf(w, x) === kind).length;
		slots[kind] = Math.max(0, free.length - queued);
		if (kind === "ground") slots.land = Math.max(0, free.filter((h) => w.data.hexes[h].terrain !== terrainType.Ocean).length - queued);
	}
	return slots;
}

//Whether a unit of the model has a free deployment hex left
const hasSlot = (s: Slots, e: EquipmentEntry) => e.movmethod === movMethod.air ? s.air > 0 : s.ground > 0 && (!isGun(e) || s.land > 0);

function takeSlot(s: Slots, e: EquipmentEntry) {
	if (e.movmethod === movMethod.air) s.air--;
	else {
		s.ground--;
		if (isGun(e)) s.land--;
	}
}

//A model that doesn't move and that no transport carries: a static unit, which never reaches the front it is bought for
const immobile = (e: EquipmentEntry) => e.movpoints <= 0 && e.groundweight === 0;

//The models of the classes the AI buys that the player's country sells now (the equipment window's lists)
function shopOf(w: World, player: number): number[] {
	const indexes = w.state.equipment.indexes[w.state.players[player].country + 1];
	if (indexes === undefined) return [];
	const out: number[] = [];
	for (const r of ROLES) for (const c of CLASSES[r]) out.push(...(indexes.unitclass[String(c)] ?? []));
	return out.filter((eqid) => buyable(w, eqid));
}

function buyable(w: World, eqid: number): boolean {
	const e = w.equipment[eqid];
	return e !== undefined && e.cost > 0 && inService(w, eqid) && !immobile(e);
}

/** What a model is worth in its role, before its price. */
export function worthOf(e: EquipmentEntry, role: Role): number {
	const weights = WORTH[role];
	let sum = 0;
	for (const k of Object.keys(weights) as Stat[]) sum += (weights[k] ?? 0) * e[k];
	return sum ** WORTH_EXPONENT;
}

//The country's ground transports in service, the fastest first, then the cheapest
function transportsOf(w: World, player: number): number[] {
	const indexes = w.state.equipment.indexes[w.state.players[player].country + 1];
	const list = (indexes?.unitclass[String(unitClass.groundTransport)] ?? []).filter((t) => w.equipment[t] !== undefined && inService(w, t));
	return list.sort((a, b) => w.equipment[b].movpoints - w.equipment[a].movpoints || unitCost(w, -1, a) - unitCost(w, -1, b));
}

//The fastest transport that carries the model and fits the prestige left, -1 when none does
function transportFor(w: World, transports: readonly number[], eqid: number, prestige: number): number {
	const weight = w.equipment[eqid].groundweight;
	if (weight === 0) return -1;
	return transports.find((t) => (w.equipment[t].groundweight & weight) !== 0 && unitCost(w, -1, t) <= prestige) ?? -1;
}

//A gun that moves only on its transport: bought without one it never leaves its hex
const towed = (e: EquipmentEntry) => e.movmethod === movMethod.towed;

interface Buying {
	w: World;
	shop: readonly number[];
	transports: readonly number[];
	budget: number;
	slots: Slots;
}

//A price counts at least the budget's share for each free deployment hex of the unit's kind, up to this: with prestige
//to spare the best model up to it wins, with little the one worth most for its price. Above it a dearer model has to be
//worth its price: spending a large budget on the few hexes free bought a few super-heavy guns where the army needed
//numbers (in the arena, Zitadelle's attack won 14 games of 40 against the general instead of 30)
const SLOT_PRICE_CAP = 450;

//The best model of the role for the budget, its worth over its price (SLOT_PRICE_CAP), with its transport; null when
//none fits
function bestOf(b: Buying, role: Role): Purchase | null {
	let best: Purchase | null = null, bestScore = 0;
	for (const eqid of b.shop) {
		const e = b.w.equipment[eqid], kind = kindOf(b.w, eqid);
		if (!CLASSES[role].includes(e.uclass) || !hasSlot(b.slots, e)) continue;
		const cost = unitCost(b.w, eqid);
		if (cost > b.budget) continue;
		const transport = transportFor(b.w, b.transports, eqid, b.budget - cost);
		if (transport < 0 && towed(e)) continue;
		const price = cost + unitCost(b.w, -1, transport);
		const score = worthOf(e, role) / Math.max(price, Math.min(SLOT_PRICE_CAP, b.budget / b.slots[kind]));
		if (score > bestScore) {
			best = { eqid, transport, role };
			bestScore = score;
		}
	}
	return best;
}

//The classic AI's rule: the share of the budget for aircraft (the rules' `airPrestigeRatio`), none under this. Aircraft
//deploy beside the ground units, on the hexes' air slots: without their share the AI fielded none where the classic
//AI fielded several, and Indochina's and Luttich's battles went worse for it in the arena
const AIR_MINIMUM = 300;

const AIR_ROLES: readonly Role[] = ["fighter", "bomber"];

/**
 * What the player buys now, in the order it buys: its prestige over its reserve (`reserveOf`), the rules' share of it
 * for aircraft as the classic AI's, each while it pays and a deployment hex is free for the unit. On the ground,
 * infantry or tanks while it has fewer capturing units than its objectives to take want, else the role whose strength
 * is furthest below its share (`needsOf`); in the air, the air role furthest below its share; the
 * best model of it for the prestige. No draw: of equal choices the first role and the first model of the lists win.
 */
export function purchases(w: World, view: SideView, directives: readonly Directive[], player: number): Purchase[] {
	const budget = w.state.players[player].prestige - reserveOf(w, player);
	if (budget <= 0) return [];
	const needs = needsOf(w, view, directives, player), own = { ...needs.own };
	const shop = shopOf(w, player), slots = freeSlots(w, view.side, player), transports = transportsOf(w, player);
	let air = budget * w.rules.ai.config.airPrestigeRatio;
	if (air < AIR_MINIMUM) air = 0;
	const ground = buyFor({ w, shop, transports, budget: budget - air, slots }, needs, own, ROLES.filter((r) => !AIR_ROLES.includes(r)), true);
	return [...ground, ...buyFor({ w, shop, transports, budget: air, slots }, needs, own, AIR_ROLES, false)];
}

//The purchases of the roles for the budget: the one furthest below its share first, only those below it when
//`lackingOnly`
function buyFor(b: Buying, needs: Needs, own: Record<Role, number>, roles: readonly Role[], lackingOnly: boolean): Purchase[] {
	const out: Purchase[] = [];
	let capturers = needs.capturers;
	for (;;) {
		const total = ROLES.reduce((n, r) => n + own[r], 0) + FULL_STRENGTH;
		const short = lackingOnly && capturers < needs.capturersWanted;
		const lacking = roles.filter((r) => short ? CAPTURING_ROLES.includes(r) : !lackingOnly || needs.wanted[r] * total > own[r])
			.sort((x, y) => (needs.wanted[y] * total - own[y]) - (needs.wanted[x] * total - own[x]));
		const p = firstOf(b, lacking) ?? (short ? firstOf(b, roles.filter((r) => needs.wanted[r] * total > own[r])) : null);
		if (p !== null && CAPTURING_ROLES.includes(p.role)) capturers++;
		if (p === null) return out;
		out.push(p);
		own[p.role] += FULL_STRENGTH;
		b.budget -= unitCost(b.w, p.eqid, p.transport);
		takeSlot(b.slots, b.w.equipment[p.eqid]);
	}
}

const FULL_STRENGTH = 10;
const CAPTURING_ROLES: readonly Role[] = ["infantry", "tank"];

function firstOf(b: Buying, roles: readonly Role[]): Purchase | null {
	for (const r of roles) {
		const p = bestOf(b, r);
		if (p !== null) return p;
	}
	return null;
}
