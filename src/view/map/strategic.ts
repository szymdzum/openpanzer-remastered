//The strategic map (#345, the StrategicMap card): the whole map fit to the window under the status bar, each
//unit a chip of its side and each objective a large plaque, as the old map's uiToggleMapZoom drew flags. Plain
//functions of the core's World, tested without the DOM (test/view-map.test.ts); src/view/map/strategicdraw.ts draws them.
import type { World } from "../../core/types";
import { sideOf } from "../../core/world";
import { eachSlot, isShown } from "./mapview";
import { flagStrip, type Plaque, plaquesOf } from "./mapinfo";

//A unit as a chip: its hex, its side's colour, its shape (a square for the side shown's, pointed ends for the
//enemy's, as the strength plates), its nation's flag (its player's country in the flag strip), dimmed when it moved
export interface Chip {
	row: number;
	col: number;
	side: number;
	own: boolean;
	flag: number;
	moved: boolean;
}

export interface Strategic {
	chips: Chip[];
	plaques: Plaque[]; //the objectives only: the towns are left out at this size, as the old strategic map left them
	flags: string; //the flag strip of the scenario's equipment set
}

//The layer's units the side shown sees, row by row: the aircraft with the air layer on, else the ground units (each
//slot as the layer has it, as the old strategic map took hex.airunit or hex.unit)
export function strategicOf(w: World, airMode: boolean): Strategic {
	const chips: Chip[] = [];
	eachSlot(w, airMode, (u) => {
		if (u === null || !isShown(w, u)) return;
		const side = sideOf(w, u);
		chips.push({ row: u.row, col: u.col, side, own: side === w.spotSide, flag: w.state.players[u.owner].country, moved: u.hasMoved });
	});
	return { chips, plaques: plaquesOf(w).filter((p) => p.objective), flags: flagStrip(w) };
}
