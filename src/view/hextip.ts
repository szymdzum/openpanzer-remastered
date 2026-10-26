//What the hex tooltip and the unit pins say (Tooltips, #346), from the core's World and nothing else: the place, who
//holds it, and what its terrain does to a unit there, each value from the rule that applies it; and the side
//playing's units low on fuel or out of ammo. Plain TypeScript tested on hand-built worlds (test/view-tooltips.test.tsx)
import { inRiver } from "../core/combat";
import { terrainCost } from "../core/movement";
import type { Position, UnitId, World } from "../core/types";
import { unitLowAmmo, unitLowFuel } from "../core/units";
import { hexIndex, onMap, unitById, unitData } from "../core/world";
import { groundConditionNames, terrainEntrenchment, terrainNames, terrainType } from "../prototypes";
import type { IconName, Nation } from "./icon";
import { countryName, nationOf } from "./model";

export interface HexTip {
	at: Position;
	name: string; //the place's name, else its terrain's
	nation: Nation | null; //the flag on it
	line: string; //"City · held by Germany · objective"
	rows: [string, string][];
}

//The move costs that end a move, and that can't be entered (src/core/rules.ts)
const STOP = 254, NO_ENTRY = 255;

//What entering the hex costs the unit, "stops" where it ends its move; none where it can't go
function moveCost(w: World, at: Position, unit: UnitId | null): [string, string][] {
	const u = unit === null ? null : unitById(w, unit);
	if (u === null || u.row < 0) return [];
	const cost = terrainCost(w, u, at);
	if (cost >= NO_ENTRY) return [];
	const ground = groundConditionNames[w.state.scenario.ground].toLowerCase();
	return [["Move cost", (cost >= STOP ? "stops" : String(cost)) + " · " + unitData(w, u).name + ", " + ground]];
}

//A terrain step of the combat where there is one (src/core/combat.ts): the city's, the river's
function defence(w: World, terrain: number, road: number): [string, string][] {
	const steps = new Set(w.rules.combat.map((s) => s.name));
	if (terrain === terrainType.City && steps.has("city")) return [["Defence", "+4 defending"]];
	if (inRiver(terrain, road) && steps.has("river")) return [["Defence", "the enemy +4 attack and defence"]];
	return [];
}

//How much a unit's resupply gives here (resupplyValue, src/core/supply.ts)
function resupply(w: World, terrain: number, flag: number): string {
	if (terrain === terrainType.City) return "full, no enemy next to it";
	if (terrain === terrainType.Airfield) return `full for ${countryName(w, flag) || "its country's"} aircraft; ÷1.3 on the ground`;
	if (terrain === terrainType.Port) return "full for ships; ÷1.3 on the ground";
	if (terrain === terrainType.Ocean) return "none: ships take it in a port";
	return "÷1.3, less next to enemies";
}

//The hex tooltip of a hex of the map, null off it; unit: the selected unit, whose move cost it shows
export function hexTipOf(w: World, at: Position, unit: UnitId | null): HexTip | null {
	if (!onMap(w, at.row, at.col)) return null;
	const i = hexIndex(w, at.row, at.col), d = w.data.hexes[i], h = w.state.map.hexes[i];
	const holder = h.owner >= 0 && w.state.players[h.owner] !== undefined ? countryName(w, w.state.players[h.owner].country) : "";
	const line = [terrainNames[d.terrain], holder !== "" && "held by " + holder, h.victorySide >= 0 && "objective"].filter(Boolean).join(" · ");
	const dug = terrainEntrenchment[d.terrain];
	const rows: [string, string][] = [["Entrenchment", dug > 0 ? dug + " on arrival" : "none"], ...defence(w, d.terrain, d.road),
		...moveCost(w, at, unit), ["Resupply", resupply(w, d.terrain, h.flag)]];
	const deploys = d.deployment >= 0 && w.state.players[d.deployment] !== undefined ? countryName(w, w.state.players[d.deployment].country) : "";
	if (deploys !== "") rows.push(["Deploys", "units of " + deploys]);
	return { at, name: d.name || terrainNames[d.terrain], nation: h.flag >= 0 ? nationOf(countryName(w, h.flag)) : null, line, rows };
}

//A pin over a unit: its supply state in a word, with its icon and tone
export interface Pin {
	unit: UnitId;
	row: number;
	col: number;
	icon: IconName;
	word: string;
	tone: "low" | "critical";
}

//The pins over the units of the side playing (the current player's) that the side shown sees as its own: Low fuel
//below a quarter of the tank (the meters' critical line, src/view/unitinfo.ts), No ammo with none left
export function pinsOf(w: World): Pin[] {
	const pins: Pin[] = [];
	for (const u of w.state.units) {
		if (u.row < 0 || u.owner !== w.state.turn.currentPlayer || w.state.players[u.owner].side !== w.spotSide) continue;
		const e = unitData(w, u);
		if (unitLowFuel(w, u, e.fuel / 4)) pins.push({ unit: u.id, row: u.row, col: u.col, icon: "fuel", word: "Low fuel", tone: "low" });
		if (unitLowAmmo(w, u, 1)) pins.push({ unit: u.id, row: u.row, col: u.col, icon: "ammo", word: "No ammo", tone: "critical" });
	}
	return pins;
}
