//What the map tells beside the selected unit's moves: the fog of war, the guns that will fire in support when the
//hovered target is attacked, and the plaques of the objectives and the towns (test/view-map.test.ts).
import { attackableUnit, supportFireUnits } from "../../core/attack";
import type { Position, World } from "../../core/types";
import { hexIndex, isSpotted, sideOf, unitById } from "../../core/world";
import { seesUnit } from "../../core/sight";
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
	const guns = supportFireUnits(w, atk, target).filter((s) => seesUnit(w, s, side))
		.map((s) => ({ row: s.row, col: s.col }));
	return guns.length === 0 ? null : { attacker: sel.at, target: { row: hover.row, col: hover.col }, guns };
}

//A plaque over a flag or an objective: its owner's side (-1: none), the flag on it (a country in the flag strip, -1:
//none), whether its name shows or only its flag (named). Every objective has one (#62); one without a flag of its own
//shows its owner's, as the original game does with showHiddenVictoryHexes on (its default)
export interface Plaque {
	row: number;
	col: number;
	name: string;
	objective: boolean;
	side: number;
	flag: number;
	named: boolean;
}

//The flag strip, 21 by 14 pixels a country (a save from before the equipment set was kept has none: the default
//set's)
export const flagStrip = (w: World) => "resources/ui/flags/" + (w.data.equipment || "eqp-adlerkorps") + "/flags_med.png";

//A hex's flag: its own, else an objective's holder's country (showHiddenVictoryHexes), else none
function flagOf(flag: number, objective: boolean, owner: { country: number } | null): number {
	if (flag !== -1) return flag;
	return objective && owner !== null ? owner.country : -1;
}

export function plaquesOf(w: World): Plaque[] {
	const plaques: Plaque[] = [];
	const { rows, cols, hexes } = w.state.map;
	for (let row = 0; row < rows; row++)
		for (let col = 0; col < cols; col++) {
			const hex = hexIndex(w, row, col), h = hexes[hex];
			if (h.flag === -1 && h.victorySide === -1) continue;
			const objective = h.victorySide !== -1, owner = h.owner === -1 ? null : w.state.players[h.owner];
			plaques.push({ row, col, name: w.data.hexes[hex].name, objective, side: owner === null ? -1 : owner.side,
				flag: flagOf(h.flag, objective, owner), named: true });
		}
	return plaques;
}

//Every flag on the map; the names over them only while the labels show (L clears them): the objectives' always, the
//other towns' with showDetailInfoToolTips, the setting the original's tooltips read (reference/src/ui.js)
export function mapPlaques(w: World, towns: boolean, labels: boolean): Plaque[] {
	return plaquesOf(w).map((p) => ({ ...p, named: labels && (p.objective || towns) }));
}
