//The game as one side knows it (#279): an enemy unit appears only where that side sees it, and every
//preview (a move, an attack from another hex) runs on the "known world", the state without the enemy
//units the side doesn't see, so a preview can't reveal one
import { createWorld } from "../src/core/create";
import type { GameState, HexState, Position, UnitState, World } from "../src/core/types";
import { hexIndex, isSpotted, sideOf, unitData } from "../src/core/world";

export const SIDES = ["Axis", "Allies"];
export const cell = (p: Position) => `${p.row},${p.col}`;
export const positionOf = (w: World, hex: number): Position => ({ row: Math.floor(hex / w.state.map.cols), col: hex % w.state.map.cols });
export const sideOfPlayer = (w: World, player: number) => w.state.players[player].side;
export const playerOfSide = (w: World, side: number) => w.state.players.find((p) => p.side === side);
export const own = (w: World, u: UnitState) => unitData(w, u, true);
export const label = (w: World, u: UnitState) => `#${u.id} ${own(w, u).name} @${cell(u)}`;

//Whether side sees u: its own, on a hex it spots, or shown for the turn (it fired, it was just seen)
export function seen(w: World, side: number, u: UnitState): boolean {
	return sideOf(w, u) === side || u.tempSpotted || isSpotted(w, hexIndex(w, u.row, u.col), side);
}

const unhide = (h: HexState, hidden: Set<number>): HexState =>
	({ ...h, unit: hidden.has(h.unit) ? null : h.unit, air: hidden.has(h.air) ? null : h.air });

//The world as side knows it: the enemy units it doesn't see taken off the map, the sight computed again
export function knownWorld(w: World, side: number): World {
	const hidden = new Set(w.state.units.filter((u) => !seen(w, side, u)).map((u) => u.id));
	if (hidden.size === 0) return w;
	const state: GameState = { ...w.state, units: w.state.units.filter((u) => !hidden.has(u.id)),
		map: { ...w.state.map, hexes: w.state.map.hexes.map((h) => unhide(h, hidden)) } };
	return createWorld({ data: w.data, state }, w.equipment, { spotSide: w.spotSide, noFOW: w.noFOW });
}
