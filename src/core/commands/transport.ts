/**
 * Mount and unmount a ground transport, embark on and disembark from an air or naval one. Mount and
 * unmount are refused where canMount and canUnmount refuse them (#147: the original played them)
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

import type { CommandOf } from "../command";
import { unitClass } from "../tables";
import { changeUnit, emit, spotOff, spotOn, writePlayer, writeUnit } from "../draft";
import { disembarkPositions, embarkTypeOf } from "../movement";
import { reselect } from "../moves";
import type { Draft, CommandHandler, UnitId, World } from "../types";
import { canMount, canUnmount } from "../units";
import { unitById } from "../world";
import { playerAt, unitCheck } from "./common";

//The first equipment of a unit class a country has (Equipment.getCountryEquipmentByClass(...)[0]), undefined for none

export function firstOfClass(w: World, uclass: number, country: number): number | undefined {
	const indexes = w.state.equipment.indexes[country];
	const list = indexes !== undefined && indexes.unitclass !== undefined ? indexes.unitclass[uclass] : undefined;
	return list === undefined ? undefined : list[0];
}

//The transport's spotting range is the unit's while mounted (Map.mountUnitHandler)
export function setMounted(d: Draft, id: UnitId, mounted: boolean) {
	const u = writeUnit(d, id);
	spotOff(d, u);
	u.isMounted = mounted;
	spotOn(d, u);
}

export const mount: CommandHandler<CommandOf<"mount">> = {
	check(w, cmd) {
		return unitCheck(w, cmd.unit, (u) => canMount(w, u), "can't mount");
	},
	run(d, cmd) {
		setMounted(d, cmd.unit, true);
		emit(d, { type: "mounted", unit: cmd.unit });
		reselect(d, cmd.unit);
	},
};

export const unmount: CommandHandler<CommandOf<"unmount">> = {
	check(w, cmd) {
		return unitCheck(w, cmd.unit, canUnmount, "can't unmount");
	},
	run(d, cmd) {
		setMounted(d, cmd.unit, false);
		emit(d, { type: "unmounted", unit: cmd.unit });
		reselect(d, cmd.unit);
	},
};

//Back on the carrier it was leaving, or on a transport of its port or airfield that the player has
//left and its country has (Map.embarkUnit). The counters stayed as they were (#73)
export const embark: CommandHandler<CommandOf<"embark">> = {
	check(w, cmd) {
		return unitCheck(w, cmd.unit, (u) => {
			if (u.carrier < 0) return true;
			const type = embarkTypeOf(w, u);
			return type > 0 && !!firstOfClass(w, type, playerAt(w, u.owner).country + 1);
		}, "can't embark");
	},
	run(d, cmd) {
		const u = unitById(d, cmd.unit);
		if (u.carrier < 0) {
			changeUnit(d, cmd.unit, (x) => { x.carrier = -x.carrier; });
		} else {
			const type = embarkTypeOf(d, u), player = playerAt(d, u.owner);
			const carrier = firstOfClass(d, type, player.country + 1);
			changeUnit(d, cmd.unit, (x) => { x.carrier = carrier; });
			const p = writePlayer(d, player.id);
			if (type === unitClass.airTransport) p.airTransports--;
			else p.navalTransports--;
		}
		emit(d, { type: "embarked", unit: cmd.unit, carrier: unitById(d, cmd.unit).carrier });
	},
};

//Off the carrier, keeping it (a negative carrier) until the unit moves: its next move is to one of
//the hexes it can land on. The counters stayed as they were (#73)
export const disembark: CommandHandler<CommandOf<"disembark">> = {
	check(w, cmd) {
		return unitCheck(w, cmd.unit, (u) => disembarkPositions(w, u).length > 0, "can't disembark");
	},
	run(d, cmd) {
		const cells = disembarkPositions(d, unitById(d, cmd.unit));
		changeUnit(d, cmd.unit, (x) => { x.carrier = -x.carrier; });
		emit(d, { type: "disembarked", unit: cmd.unit, cells });
	},
};
