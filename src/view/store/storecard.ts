//The store's unit card: the selected unit's card docked at the bottom, its size, its context menu and the unit keys
import { signal } from "@preact/signals";
import { contextOf } from "./context";
import type { ActionKey } from "./model";
import { stableComputed } from "../stable";
import type { Core } from "./storecore";
import type { MapPart } from "./storemap";
import type { createStep } from "./storestep";
import { type CardSize, unitCardOf } from "../hud/unitcard";

type Step = Pick<ReturnType<typeof createStep>, "moving">;

export function createCard(core: Pick<Core, "world" | "selected" | "dispatch">, map: Pick<MapPart, "deployment" | "strategic">, step: Step) {
	const { world, selected, dispatch } = core;
	//The card is its line or open over the map: it opens only on More, and a click on the map folds it (clickHex)
	const cardSize = signal<CardSize>("line");
	//Inspect unit: the card shown
	const infoShown = signal(true);
	//The dock's height over the bottom of the map in CSS pixels, which the map scrolls past so that its last row clears
	//the dock (#453)
	const dockHeight = signal(0);
	const card = stableComputed(() => {
		const w = world.value, id = selected.value;
		return w === null || id === null ? null : unitCardOf(w, id);
	});
	//The selected unit's context menu, none while deploying, on the strategic map or while a unit moves on it
	const context = stableComputed(() => world.value === null || selected.value === null || map.deployment.value !== null || map.strategic.value
		|| step.moving.value !== null ? null : contextOf(world.value, selected.value));

	return {
		card, cardSize, infoShown, dockHeight, context,

		sizeCard(size: CardSize) {
			cardSize.value = size;
		},

		//A unit key (M, E, S, R, O, U) sends the selected unit's action of that key as its button does; nothing when the
		//menu doesn't show it
		unitKey(key: ActionKey) {
			const action = context.value === null ? undefined : context.value.actions.find((a) => a.key === key);
			if (action !== undefined) dispatch(action.command);
		},
	};
}
