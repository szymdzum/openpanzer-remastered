//What the status line says of the hex under the pointer, as the old UI's #locmsg (updateStatusBarLocation,
//src/ui.ts:1350), and the pins over the side playing's units low on fuel or out of ammo (Tooltips, #346), from the core's
//World and nothing else. Plain TypeScript tested on hand-built worlds (test/view-tooltips.test.tsx)
import type { Position, UnitId, World } from "../core/types";
import { unitLowAmmo, unitLowFuel } from "../core/units";
import { hexIndex, onMap, unitAt, unitData } from "../core/world";
import { roadType, terrainNames, terrainType } from "../prototypes";
import type { IconName } from "./icon";
import { isShown } from "./mapview";

//The hex under the pointer: the unit on it the side sees, in the layer shown (null: none), then its name, the current
//player's transports there, its terrain and road and where it is, "Llucmacanes · City/Road (9,15)"
export interface Location {
	unit: string | null;
	text: string;
}

//The air transports on an airfield, the naval ones in a port, of the current player, when it has any
function transportsAt(w: World, terrain: number): string {
	const p = w.state.players[w.state.turn.currentPlayer];
	if (terrain === terrainType.Airfield && p.airTransports > 0) return "Air transports: " + p.airTransports;
	if (terrain === terrainType.Port && p.navalTransports > 0) return "Naval transports: " + p.navalTransports;
	return "";
}

//The hex as the status line tells it, null off the map
export function locationOf(w: World, at: Position, airMode: boolean): Location | null {
	if (!onMap(w, at.row, at.col)) return null;
	const i = hexIndex(w, at.row, at.col), d = w.data.hexes[i], u = unitAt(w, i, airMode);
	const terrain = terrainNames[d.terrain] + (d.road > roadType.none ? "/Road" : "") + " (" + at.row + "," + at.col + ")";
	return { unit: u !== null && isShown(w, u) ? unitData(w, u, true).name : null,
		text: [d.name || "", transportsAt(w, d.terrain), terrain].filter(Boolean).join(" · ") };
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
