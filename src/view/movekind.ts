//What kind of mover a unit looks like to the screen, for its move type's name and its move's sound (src/view/beats.ts,
//src/view/hud/unitcard.ts). The rules have their own say (src/core/units.ts isTrain) and this changes none of it.
import { movMethod, terrainType, unitClass } from "../core/tables";
import type { UnitState, World } from "../core/types";
import { hexIndex } from "../core/world";
import { isTrain } from "../core/units";

/** Whether the unit stands on an ocean hex. */
export const isAtSea = (w: World, u: UnitState): boolean => w.data.hexes[hexIndex(w, u.row, u.col)].terrain === terrainType.Ocean;

/**
 * Whether the unit is a train on land. The rules call any ground unit with the deep naval movement a train, but the AA
 * Cruiser and the Naval support DD and LC are ships: standing at sea they are shown as ships.
 */
export function isTrainOnLand(w: World, u: UnitState): boolean {
	return isTrain(w, u) && !isAtSea(w, u);
}

/**
 * Whether the equipment is a horse-drawn transport: the only wheeled ground transports with no fuel (all 85 of them in
 * the equipment files, Horse, Light horse, Szeker, Zaprzeg... in every language, and no truck).
 */
export function isHorseDrawn(e: EquipmentEntry): boolean {
	return e.uclass === unitClass.groundTransport && e.movmethod === movMethod.wheeled && e.fuel === 0;
}
