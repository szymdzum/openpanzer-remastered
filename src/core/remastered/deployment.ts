/**
 * The remastered AI's deployment (#640): each unit waiting to deploy on the free deployment hex its part of the
 * commander's plan wants, the main effort's nearest the assault's axis, the line by the objectives held under threat.
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

import type { Command } from "../command";
import { deploymentHexes } from "../deployment";
import { distance } from "../geometry";
import { check } from "../step";
import { movMethod, unitClass } from "../tables";
import type { OffMapUnit, Position, World } from "../types";
import { type Analysis, type AnalysisCache, fieldTo } from "./analysis";
import { LOCAL_TURNS } from "./assault";
import { assaults } from "./clock";
import type { Directive } from "./directives";
import { UNREACHED } from "./fields";
import { deploysOn } from "./purchases";

//How each unit picks its hex. The front: the main effort's units nearest its axis, a defender's infantry and anti-tank
//guns nearest the objectives it holds under threat (the line of a hold, #645). Back: a defender's tanks and recon out
//of the enemy's ground reach, near the same objectives, to strike back. Guns: out of reach, in range of the front.
//Air defence: where the enemy's aircraft strike, out of the ground's reach. Aircraft: nearest the axis
type Place = "front" | "back" | "guns" | "airDefence" | "air";

//In this order the units take their hexes: those that hold the line or lead the main effort first
const ORDER: readonly Place[] = ["front", "back", "guns", "airDefence", "air"];

function placeOf(e: EquipmentEntry, assaulting: boolean): Place {
	if (e.movmethod === movMethod.air) return "air";
	if (e.uclass === unitClass.artillery) return "guns";
	if (e.uclass === unitClass.airDefence || e.uclass === unitClass.flak) return "airDefence";
	return !assaulting && (e.uclass === unitClass.tank || e.uclass === unitClass.recon) ? "back" : "front";
}

/**
 * Where the plan points: the assault's objective, else the objectives the commander holds, else those the side has to
 * take when it assaults or to hold when it doesn't, else every objective.
 */
export function axisOf(w: World, a: Analysis, directives: readonly Directive[]): Position[] {
	const assault = directives.find((d) => d.task === "assault");
	if (assault !== undefined) return [assault.target];
	const holds = directives.filter((d) => d.task === "hold" || d.task === "delay").map((d) => d.target);
	if (holds.length > 0) return holds;
	const first = assaults(w, a.side) ? a.objectives.take : a.objectives.hold;
	return first.length > 0 ? first : [...a.objectives.take, ...a.objectives.hold];
}

interface Deploying {
	w: World;
	a: Analysis;
	cache: AnalysisCache;
	axis: Position[];
	assaulting: boolean;
}

//A hex's rank for a unit, the lower the better, compared part by part
type Rank = number[];

const better = (x: Rank, y: Rank) => {
	for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i];
	return false;
};

//The points of the unit's march from the hex to the axis (its transport's way when that goes further), by hex distance
//where the terrain leads no way. A hex within LOCAL_TURNS of another objective to take counts its points to that one:
//the planner pulls a unit there to it (assault.ts, `pullTo`), and with every unit sent to the assault's objective
//Japan's landings in Indochina went to its guns and its attack took fewer objectives (docs/ai/arena.md)
function toAxis(d: Deploying, unit: OffMapUnit, hex: number): number {
	if (d.axis.length === 0) return 0;
	const own = d.w.equipment[unit.eqid], ride = unit.transport === null ? own : d.w.equipment[unit.transport.eqid];
	const march = ride.movpoints > own.movpoints ? ride : own;
	let points = fieldTo(d.w, d.cache, march.movmethod, d.axis)[hex];
	if (d.a.objectives.take.length > 0) {
		const nearest = fieldTo(d.w, d.cache, march.movmethod, d.a.objectives.take)[hex];
		if (nearest < points && nearest <= LOCAL_TURNS * march.movpoints) points = nearest;
	}
	if (points !== UNREACHED) return points;
	const cols = d.w.state.map.cols, row = Math.floor(hex / cols), col = hex % cols;
	return UNREACHED + Math.min(...d.axis.map((p) => distance(row, col, p.row, p.col)));
}

const inReach = (a: Analysis, hex: number) => (a.influence.enemy[hex] > 0 ? 1 : 0);

//Whether a gun on the hex reaches a hex of the front; every hex does while the side sees no front
function coversFront(d: Deploying, hex: number, range: number): boolean {
	if (d.a.front.length === 0) return true;
	const cols = d.w.state.map.cols, row = Math.floor(hex / cols), col = hex % cols;
	return d.a.front.some((f) => distance(row, col, Math.floor(f / cols), f % cols) <= range);
}

function rankOf(d: Deploying, unit: OffMapUnit, place: Place, hex: number): Rank {
	const axis = toAxis(d, unit, hex);
	switch (place) {
	case "back": return [inReach(d.a, hex), axis];
	case "guns": return [inReach(d.a, hex), coversFront(d, hex, d.w.equipment[unit.eqid].gunrange) ? 0 : 1, axis];
	case "airDefence": return [inReach(d.a, hex), -d.a.threat.air[hex], axis];
	default: return [axis];
	}
}

/**
 * The next deployment of the player's units waiting to deploy: the first by its part in the plan (`ORDER`) on its best
 * free hex; null when none can deploy. A gun isn't put on the ocean, where it would board a ship and couldn't fire.
 */
export function deploymentOrder(w: World, a: Analysis, cache: AnalysisCache, directives: readonly Directive[], player: number)
	: Command | null {
	const d: Deploying = { w, a, cache, axis: axisOf(w, a, directives), assaulting: assaults(w, a.side) };
	const waiting: { unit: OffMapUnit; index: number }[] = [];
	w.state.players[player].core.forEach((c, index) => {
		if ("reserve" in c) waiting.push({ unit: c.reserve, index });
	});
	const places = waiting.map((x) => placeOf(w.equipment[x.unit.eqid], d.assaulting));
	for (const place of ORDER) {
		for (let i = 0; i < waiting.length; i++) {
			if (places[i] !== place) continue;
			const cmd = bestHex(d, waiting[i].unit, waiting[i].index, place);
			if (cmd !== null) return cmd;
		}
	}
	return null;
}

function bestHex(d: Deploying, unit: OffMapUnit, index: number, place: Place): Command | null {
	const cols = d.w.state.map.cols, air = place === "air";
	let best: Command | null = null, bestRank: Rank | null = null;
	for (const hex of deploymentHexes(d.w, d.a.side, unit.eqid)) {
		if (!air && !deploysOn(d.w, d.w.equipment[unit.eqid], hex)) continue;
		const cmd: Command = { type: "deploy", index, to: { row: Math.floor(hex / cols), col: hex % cols } };
		if (check(d.w, cmd) !== null) continue;
		const rank = rankOf(d, unit, place, hex);
		if (bestRank === null || better(rank, bestRank)) {
			best = cmd;
			bestRank = rank;
		}
	}
	return best;
}
