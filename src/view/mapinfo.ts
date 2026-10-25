//What the map tells beside the selected unit's moves (#345, the MapOverlays card): the fog of war, the guns
//that will fire in support when the hovered target is attacked, and the plaques of the objectives and the
//towns (#62). Plain functions of the core's World, tested without the DOM (test/view-map.test.ts).
import { attackableUnit, supportFireUnits } from "../core/attack";
import type { Position, World } from "../core/types";
import { hexIndex, isSpotted, sideOf, unitById } from "../core/world";
import { prestigeGains } from "../prototypes";
import type { Selection } from "./mapview";

//The hexes the side shown doesn't see, by hex index (row * cols + col): 1 under the fog. Null without fog:
//no side shown, or the fog of war off
export function fogOf(w: World): Uint8Array | null {
	if (w.noFOW || w.spotSide < 0 || w.spotSide > 1) return null;
	const { rows, cols } = w.state.map;
	const fog = new Uint8Array(rows * cols);
	for (let hex = 0; hex < fog.length; hex++) fog[hex] = isSpotted(w, hex, w.spotSide) ? 0 : 1;
	return fog;
}

//The support fire an attack on the hovered target draws: the attacker's hex, the target's, and the guns that
//will fire on the attacker first. Only those its side sees, as the attack's estimate counts them (src/core/
//combat.ts combatResult); none when the attacker was surprised
export interface Support {
	attacker: Position;
	target: Position;
	guns: Position[];
}

export function supportOf(w: World, sel: Selection | null, hover: Position | null, airMode: boolean): Support | null {
	if (sel === null || hover === null || !sel.targets.some((c) => c.row === hover.row && c.col === hover.col)) return null;
	const atk = unitById(w, sel.unit), side = sideOf(w, atk);
	const target = attackableUnit(w, atk, hexIndex(w, hover.row, hover.col), airMode);
	if (target === null || atk.isSurprised) return null;
	const guns = supportFireUnits(w, atk, target).filter((s) => isSpotted(w, hexIndex(w, s.row, s.col), side) || s.tempSpotted)
		.map((s) => ({ row: s.row, col: s.col }));
	return guns.length === 0 ? null : { attacker: sel.at, target: { row: hover.row, col: hover.col }, guns };
}

//A plaque over a flag or an objective (#62): its name, what taking it gives, its owner's side (-1: none).
//Every objective has one, also without a flag (the old map marked those only with showHiddenVictoryHexes)
export interface Plaque {
	row: number;
	col: number;
	name: string;
	objective: boolean;
	prestige: number;
	side: number;
}

export function plaquesOf(w: World): Plaque[] {
	const plaques: Plaque[] = [];
	const { rows, cols, hexes } = w.state.map;
	for (let row = 0; row < rows; row++)
		for (let col = 0; col < cols; col++) {
			const hex = hexIndex(w, row, col), h = hexes[hex];
			if (h.flag === -1 && h.victorySide === -1) continue;
			const objective = h.victorySide !== -1;
			plaques.push({ row, col, name: w.data.hexes[hex].name, objective,
				prestige: objective ? prestigeGains.objectiveCapture : prestigeGains.flagCapture,
				side: h.owner === -1 ? -1 : w.state.players[h.owner].side });
		}
	return plaques;
}
