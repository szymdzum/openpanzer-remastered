/**
 * What the weather does in the remaster's rules, as the manual says: rain and snow halve the strength a ground
 * unit fires with and keep aircraft and air defence from firing, overcast halves an aircraft's; bad weather
 * halves spotting and supply, and snow on the ground doubles the fuel a move burns.
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

import { groundCondition, leaderType, terrainType, unitClass, weatherType } from "./tables";
import type { UnitState, World } from "./types";
import { hasLeader, isAir, isGround, isSea } from "./units";
import { hexIndex, sideOf, unitData } from "./world";

const isStorm = (w: World) => w.state.scenario.atmospheric === weatherType.rain || w.state.scenario.atmospheric === weatherType.snow;

//All Weather Combat: an air unit the weather doesn't touch
const allWeather = (w: World, u: UnitState) => isAir(w, u) && hasLeader(w, u, leaderType.allWeatherCombat);

//Overcast clouds an aircraft's view and aim, rain and snow everybody's
function hinders(w: World, u: UnitState): boolean {
	if (allWeather(w, u)) return false;
	return isStorm(w) || (isAir(w, u) && w.state.scenario.atmospheric === weatherType.overcast);
}

/** In rain or snow aircraft and air defence can't fire at all: not to attack, nor back, nor in support. */
export function grounded(w: World, u: UnitState): boolean {
	if (!w.rules.weatherLimitsCombat || !isStorm(w) || allWeather(w, u)) return false;
	const uclass = unitData(w, u).uclass;
	return isAir(w, u) || uclass === unitClass.flak || uclass === unitClass.airDefence;
}

/** The strength points a unit fires of `points`: half, rounded up, when the weather hinders it (ships sail on). */
export function firingStrength(w: World, u: UnitState, points: number): number {
	return w.rules.weatherLimitsCombat && !isSea(w, u) && hinders(w, u) ? Math.ceil(points / 2) : points;
}

/** A spotting range in this weather: half of it, rounded down but at least 1, when the weather hinders the unit. */
export function weatherSpotRange(w: World, u: UnitState, range: number): number {
	return w.rules.weatherLimitsSpotting && hinders(w, u) ? Math.max(1, range >> 1) : range;
}

//A city, port or airfield its side holds
function inFriendlyTown(w: World, u: UnitState): boolean {
	const hex = hexIndex(w, u.row, u.col), terrain = w.data.hexes[hex].terrain, owner = w.state.map.hexes[hex].owner;
	return (terrain === terrainType.City || terrain === terrainType.Port || terrain === terrainType.Airfield)
		&& owner >= 0 && w.state.players[owner].side === sideOf(w, u);
}

/** What rain and snow divide a unit's supply and replacements by: 2 out of a city, port or airfield of its side. */
export function weatherSupplyDivisor(w: World, u: UnitState): number {
	return w.rules.weatherLimitsSupply && isStorm(w) && !inFriendlyTown(w, u) ? 2 : 1;
}

/** The fuel a movement point burns: two for a ground unit on frozen ground, the snow the manual's rule means. */
export function fuelPerPoint(w: World, u: UnitState): number {
	return w.rules.snowDoublesFuel && w.state.scenario.ground === groundCondition.frozen && isGround(w, u) ? 2 : 1;
}
