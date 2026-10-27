//The store's unit card (src/view/store.ts, review proposal 3): the selected unit's card docked at the bottom (UnitInfo),
//its size and the view picked on it, and its context menu (UnitContext) with the unit keys
import { signal } from "@preact/signals";
import type { UnitId } from "../core/types";
import { contextOf } from "./context";
import type { ActionKey } from "./model";
import { stableComputed } from "./stable";
import type { Core } from "./storecore";
import type { MapPart } from "./storemap";
import type { createStep } from "./storestep";
import { type CardSize, type CardView, unitCardOf } from "./unitcard";

type Step = Pick<ReturnType<typeof createStep>, "moving">;

export function createCard(core: Pick<Core, "world" | "selected" | "dispatch">, map: Pick<MapPart, "deployment" | "strategic">, step: Step) {
	const { world, selected, dispatch } = core;
	//The unit card at the bottom (UnitInfo): the view picked for a unit (none, or another unit's: the one it opens on), and
	//its size: a strip, one row, or unfolded over the map
	const cardView = signal<{ unit: UnitId, view: CardView } | null>(null);
	const cardSize = signal<CardSize>("row");
	//the unit info shown (Inspect unit)
	const infoShown = signal(true);
	//the dock's height over the bottom of the map in CSS pixels, which the map scrolls past so that its last row clears
	//the dock (#453)
	const dockHeight = signal(0);
	const card = stableComputed(() => {
		const w = world.value, id = selected.value, picked = cardView.value;
		if (w === null || id === null) return null;
		return unitCardOf(w, id, picked !== null && picked.unit === id ? picked.view : null);
	});
	//the selected unit's context menu (UnitContext), none while deploying, on the strategic map or while a unit moves on it
	const context = stableComputed(() => world.value === null || selected.value === null || map.deployment.value !== null || map.strategic.value
		|| step.moving.value !== null ? null : contextOf(world.value, selected.value));

	return {
		card, cardSize, infoShown, dockHeight, context,

		//The unit card as a strip, one row, or unfolded over the map
		sizeCard(size: CardSize) {
			cardSize.value = size;
		},

		//One of the selected unit's views on the card: itself, its transport, its carrier
		viewCard(view: CardView) {
			if (selected.value !== null) cardView.value = { unit: selected.value, view };
		},

		//A unit key (M, E, S, R, O, U): the selected unit's action of that key, sent as its button sends it; nothing when the
		//menu doesn't show it, as the old UI's keys did
		unitKey(key: ActionKey) {
			const action = context.value === null ? undefined : context.value.actions.find((a) => a.key === key);
			if (action !== undefined) dispatch(action.command);
		},
	};
}
