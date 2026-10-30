/**
 * The weather's change at each new round in the remaster's rules: the sky moves at most one step between fair,
 * overcast and a storm (rain, or snow on frozen ground), by the chances of the scenario's weather zone and month.
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

import { respot } from "./draft";
import { nextRandom } from "./random";
import { groundCondition, weatherType } from "./tables";
import type { Draft } from "./types";

const { fair: FAIR, overcast: OVERCAST, rain: RAIN, snow: SNOW } = weatherType;

/**
 * A weather zone's chances in percent per round, by month (January first). front: a fair sky clouds over;
 * storm: an overcast sky turns to rain, or snow on frozen ground.
 */
interface Climate {
	front: number[];
	storm: number[];
}

/**
 * The climates by the scenario's latitude: 0 North Africa (the desert, also East Africa and some Pacific
 * islands), 1 the Mediterranean and the Balkans, 2 western and central Europe, 3 Russia and eastern Europe.
 * With the chances of clearing below, a storm lasts 2-3 rounds on average and the summer is fair more than
 * half of the time (a fifth stormy in the west, hardly ever in the south); the winter and the east's mud
 * seasons a third stormy.
 */
const climates: Climate[] = [
	//It never rains or snows in North Africa (the manual)
	{ front: [12, 12, 10, 8, 6, 4, 4, 4, 6, 8, 10, 12], storm: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
	{ front: [20, 20, 16, 14, 10, 6, 5, 5, 8, 14, 18, 20], storm: [40, 40, 35, 30, 20, 12, 10, 10, 20, 35, 40, 40] },
	{ front: [25, 25, 22, 20, 16, 12, 12, 12, 16, 22, 25, 25], storm: [45, 45, 40, 38, 32, 30, 30, 30, 35, 40, 45, 45] },
	{ front: [25, 25, 25, 25, 15, 10, 10, 10, 18, 25, 25, 25], storm: [50, 50, 50, 50, 35, 30, 30, 30, 40, 50, 50, 50] },
];

//The chances in percent per round in every zone: an overcast sky clears, a storm eases to overcast
const CLEARS = 30, EASES = 40;

/**
 * The new round's weather: one draw from the game stream, whatever the weather. A zone the table doesn't know
 * keeps its weather and draws nothing. The month is the round's date's, in local time as the date advances.
 */
export function changeWeather(d: Draft) {
	const s = d.state.scenario, climate = climates[s.latitude];
	if (climate === undefined) return;
	const month = new Date(s.date).getMonth(), roll = nextRandom(d.rng) * 100;
	//Snow on frozen ground: the scenarios set it for their winters (every one that starts in snow but two), and
	//only there, so a winter month in the Pacific doesn't snow
	const storming = s.ground === groundCondition.frozen ? SNOW : RAIN;
	const atmospheric = nextWeather(s.atmospheric, roll, climate.front[month], climate.storm[month], storming);
	if (atmospheric !== s.atmospheric) respot(d, () => { d.state.scenario = { ...s, atmospheric }; });
}

//The weather a roll in [0, 100) leads to, one step at a time. A storm keeps its rain or snow until it eases
function nextWeather(weather: number, roll: number, front: number, storm: number, storming: number): number {
	switch (weather) {
		case FAIR: return roll < front ? OVERCAST : FAIR;
		case OVERCAST: return roll < storm ? storming : roll < storm + CLEARS ? FAIR : OVERCAST;
		case RAIN: case SNOW: return roll < EASES ? OVERCAST : weather;
		default: return weather;
	}
}
