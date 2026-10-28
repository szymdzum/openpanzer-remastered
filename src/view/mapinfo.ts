//What the map tells beside the selected unit's moves (#345, the MapOverlays card): the fog of war, the guns
//that will fire in support when the hovered target is attacked, and the plaques of the objectives and the
//towns (#62). Plain functions of the core's World, tested without the DOM (test/view-map.test.ts).
import { attackableUnit, supportFireUnits } from "../core/attack";
import type { Position, World } from "../core/types";
import { hexIndex, isSpotted, sideOf, unitById } from "../core/world";
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

//A plaque over a flag or an objective (#62): its name, its owner's side (-1: none) and the flag on it (a country in
//the flag strip, -1: none), whether its name shows or only its flag (named). Every objective has one; one without a
//flag of its own shows its owner's, as the old map did with showHiddenVictoryHexes on (its default, #504)
export interface Plaque {
	row: number;
	col: number;
	name: string;
	objective: boolean;
	side: number;
	flag: number;
	named: boolean;
}

//The flag strip the old map drew its flags from, 21 by 14 pixels a country (a save from before the equipment set
//was kept has none: the default set's)
export const flagStrip = (w: World) => "resources/ui/flags/" + (w.data.equipment || "eqp-adlerkorps") + "/flags_med.png";

//A hex's flag: its own, else an objective's holder's country (the old map's showHiddenVictoryHexes), else none
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

//The map's plaques: every flag on the map, as the old map drew them (#504); the names over them only while the labels
//show (L clears them), the objectives' always, the other towns' with the setting the old map's tooltips read for
//them (showDetailInfoToolTips, src/ui.ts addSmallToolTips)
export function mapPlaques(w: World, towns: boolean, labels: boolean): Plaque[] {
	return plaquesOf(w).map((p) => ({ ...p, named: labels && (p.objective || towns) }));
}
