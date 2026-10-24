//A side's units as the command-line player shows them (#279): one line each with what it carries and
//can still do, where it can move and at what cost, what it is short of and what a resupply or a
//reinforcement gives where it stands
import { costPerStrength } from "../src/core/costs";
import { moveRange, pathTo, terrainCost } from "../src/core/movement";
import { canReinforce, canResupply, reinforceValue, resupplyValue } from "../src/core/supply";
import type { MoveCell, UnitState, World } from "../src/core/types";
import { canMount, canUnmount } from "../src/core/units";
import { ammoOf, fuelOf, movesLeft, sideOf, unitById, unitData } from "../src/core/world";
import { OVERSTRENGTH_PENALTY, unitClassNames } from "../src/prototypes";
import { targetsOf } from "./combat";
import { cell, label, own } from "./known";

const canMoveNow = (w: World, u: UnitState) => !u.hasMoved && movesLeft(w, u) > 0 && moveRange(w, u).some((c) => c.canMove);

//What a unit can still do this turn, w the known world
const ABILITIES: [string, (w: World, u: UnitState) => boolean][] = [
	["move", canMoveNow],
	["attack", (w, u) => targetsOf(w, u).length > 0],
	["resupply", canResupply],
	["reinforce", (w, u) => canReinforce(w, u)],
	["mount", (w, u) => !u.hasMoved && canMount(w, u)],
	["unmount", (_w, u) => canUnmount(u)],
];

const DONE: [keyof UnitState, string][] = [["hasMoved", "moved"], ["hasFired", "fired"], ["hasResupplied", "supplied"]];

function fuelPart(w: World, u: UnitState): string[] {
	const d = unitData(w, u);
	return d.fuel > 0 ? [`fuel ${fuelOf(u)}/${d.fuel}`] : [];
}

function carriedPart(w: World, u: UnitState): string[] {
	if (u.transport === null) return [];
	const name = w.equipment[u.transport.eqid].name;
	return [u.isMounted ? `mounted on ${name}` : `transport ${name}`];
}

function ownPart(w: World, u: UnitState): string[] {
	const done = DONE.filter(([k]) => u[k]).map(([, t]) => t), can = ABILITIES.filter(([, f]) => f(w, u)).map(([t]) => t);
	return [`moves ${movesLeft(w, u)}/${unitData(w, u).movpoints}`, ...(done.length ? [`[${done.join(" ")}]`] : []),
		...(can.length ? [`can: ${can.join(" ")}`] : [])];
}

//A unit as one line; mine: the side's own, with its moves, flags and what it can still do (w: the known
//world, for its attacks)
export function unitLine(w: World, u: UnitState, mine: boolean): string {
	return [label(w, u), unitClassNames[own(w, u).uclass], `str ${u.strength}`, `ammo ${ammoOf(u)}/${unitData(w, u).ammo}`,
		...(mine ? fuelPart(w, u) : []), `ent ${u.entrenchment}`, `xp ${u.experience}`, ...carriedPart(w, u),
		...(u.leader >= 0 ? [`leader ${u.leader}`] : []), ...(mine ? ownPart(w, u) : [])].join(" | ");
}

export interface MoveTo { cell: string; cost: number; fuelLeft: number | null; stops: boolean }

//What a move to c costs: a path cell's dist is the cost before it, the move pays it and the last hex.
//A hex that takes every point left (254: the terrain, or a zone of control on a hex the side spots)
//stops the move there: the points left go, the fuel pays its terrain (#214)
function moveTo(w: World, u: UnitState, c: MoveCell): MoveTo {
	const path = pathTo(w, u, c), last = path[path.length - 1];
	const stops = last !== undefined && last.cost >= 254, before = last ? last.dist : 0;
	const cost = stops ? movesLeft(w, u) : before + (last ? last.cost : 0);
	const fuel = unitData(w, u).fuel > 0 ? fuelOf(u) - (stops ? before + terrainCost(w, u, c) : cost) : null;
	return { cell: cell(c), cost, fuelLeft: fuel, stops };
}

//The hexes a unit of side's can move to, the cheapest first: the screen's move range, as the core
//computes it on the game, so a move to any of them is allowed and none other is
export function moves(w: World, side: number, id: number): { cells: MoveTo[]; note: string } {
	const u = unitById(w, id);
	if (!u || sideOf(w, u) !== side) return { cells: [], note: `#${id} is not your unit` };
	if (u.hasMoved) return { cells: [], note: "it has moved this turn" };
	const cells = moveRange(w, u).filter((c) => c.canMove).map((c) => moveTo(w, u, c)).sort((a, b) => a.cost - b.cost);
	return { cells, note: u.isMounted ? "on its transport: it can't attack after this move" : "" };
}

export const moveLine = (m: MoveTo) => `${m.cell} cost ${m.cost}` + (m.fuelLeft === null ? "" : ` fuel left ${m.fuelLeft}`)
	+ (m.stops ? " (the move stops here)" : "");

const short = (w: World, u: UnitState) => {
	const d = unitData(w, u);
	return ammoOf(u) < d.ammo || (d.fuel > 0 && fuelOf(u) < d.fuel) || u.strength < 10;
};

function resupplyPart(w: World, u: UnitState): string {
	if (!canResupply(w, u)) return "can't resupply now";
	const v = resupplyValue(w, u);
	return `resupply now: +${v.ammo} ammo +${v.fuel} fuel`;
}

function reinforcePart(w: World, u: UnitState): string[] {
	const per = Math.round(costPerStrength(w, u)), over = Math.round(costPerStrength(w, u) * OVERSTRENGTH_PENALTY);
	const v = reinforceValue(w, u), o = reinforceValue(w, u, true);
	return [canReinforce(w, u) ? `reinforce now: +${v} for ${v * per} prestige (${per} a point)` : "can't reinforce now",
		...(canReinforce(w, u, true) ? [`overstrength +${o} at ${over} a point`] : [])];
}

//What side's units are short of, and what a resupply or a reinforcement gives where they stand now
export function supply(w: World, side: number): string[] {
	const out = w.state.units.filter((u) => sideOf(w, u) === side && short(w, u))
		.map((u) => [label(w, u), `str ${u.strength}`, `ammo ${ammoOf(u)}/${unitData(w, u).ammo}`, ...fuelPart(w, u),
			resupplyPart(w, u), ...reinforcePart(w, u)].join(" | "));
	return out.length ? out : ["every unit is full"];
}
