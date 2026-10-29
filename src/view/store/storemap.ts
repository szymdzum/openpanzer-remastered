//The store's map: what the canvas draws (the units, the selection, the path to the hovered hex, the fog, the plaques,
//the strategic map, the deployment zone), the pointer, and a click on a hex
import { computed, type ReadonlySignal, signal } from "@preact/signals";
import type { Position } from "../../core/types";
import { deploymentOf, ghostOf, placeOn, reserveOf, trayOf } from "../map/deploy";
import { locationOf, pinsOf } from "../map/hextip";
import { fogOf, mapPlaques, supportOf } from "../map/mapinfo";
import { clickOn, mapUnits, pathOf, selectionOf } from "../map/mapview";
import { glanceOf } from "../hud/odds";
import { stableComputed } from "../stable";
import type { Core } from "./storecore";
import type { createStep } from "./storestep";
import { strategicOf } from "../map/strategic";
import { settingSignals } from "../uisettings";

type Step = Pick<ReturnType<typeof createStep>, "moving" | "shown" | "showing">;

/** `clicked` closes what a click on the map closes: the turn report and the open unit card. */
export function createMap(core: Core, step: Step, clicked: () => void) {
	const { world, selected, airMode, dispatch, select, pickUnit, look } = core;
	const { moving, shown, showing } = step;
	const setting = settingSignals();
	const hover = signal<Position | null>(null);
	//The strategic map: the whole map fit to the window
	const strategic = signal(false);
	//The reserve unit picked to deploy, by its place in the core list, null: none
	const deploying = signal<number | null>(null);
	//The labels over the map: L clears them until the next turn
	const hexGrid = signal(false);
	const labels = signal(true);

	//The world whose units the map draws: while a step's beats play, its units as each beat has them (#503)
	const drawn = computed(() => shown.value === null ? world.value : shown.value);
	//The units the side sees, but the one hidden from its hex while it moves
	const units = computed(() => drawn.value === null ? [] : mapUnits(drawn.value, airMode.value, selected.value).filter((u) => u.id !== moving.value));
	//The person's reserve, and the deployment zone while one of its units is picked
	const reserve = computed(() => world.value === null ? [] : reserveOf(world.value));
	const deployment = computed(() => world.value === null ? null : deploymentOf(world.value, deploying.value));
	const tray = computed(() => deployment.value === null ? null : trayOf(world.value!, deploying.value));
	//(no move area or target while deploying)
	const selection = computed(() => world.value === null || deployment.value !== null ? null : selectionOf(world.value, selected.value));
	//(none of what the pointer shows on the strategic map, which has no cursor)
	const pointed = computed(() => world.value === null || strategic.value ? null : hover.value);
	const ghost = computed(() => pointed.value === null ? null : ghostOf(world.value!, deployment.value, pointed.value));
	//The hex under the pointer as the status line tells it
	const located = computed(() => pointed.value === null ? null : locationOf(world.value!, pointed.value, airMode.value));
	const path = computed(() => pointed.value === null ? null : pathOf(world.value!, selection.value, pointed.value));
	const fog = computed(() => world.value === null ? null : fogOf(world.value));
	const support = computed(() => pointed.value === null ? null : supportOf(world.value!, selection.value, pointed.value, airMode.value));
	//Computed again when the towns' setting changes, which changes no world (#467)
	const plaques = computed(() => world.value === null ? [] : mapPlaques(world.value, setting.showDetailInfoToolTips.value, labels.value));
	//The marks the settings ask for (#464)
	const marks = computed(() => ({ own: setting.markOwnUnits.value, enemy: setting.markEnemyUnits.value }));
	//The attack cursor: the losses over the pointed target
	const glance = computed(() => pointed.value === null ? null : glanceOf(world.value!, selection.value, pointed.value, airMode.value));
	const overview = computed(() => drawn.value === null || !strategic.value ? null : strategicOf(drawn.value, airMode.value));
	//The pins over the side playing's units, cleared with the labels
	const pins = stableComputed(() => drawn.value === null || !labels.value || strategic.value ? [] : pinsOf(drawn.value));

	//A reserve unit picked to deploy (its core list index), or none: deploying ends. Nothing stays selected
	const pick = (index: number | null) => {
		deploying.value = index;
		if (index !== null) pickUnit(null);
	};

	return {
		showLabels(on: boolean) {
			labels.value = on;
		},

		hover, strategic, deploying, hexGrid, labels: labels as ReadonlySignal<boolean>, units, reserve, deployment, tray, selection, ghost, located, path, fog, support, plaques,
		marks, glance, overview, pins, pick,

		//A click on a hex: on the strategic map, the map back at its scale centred there; while deploying, the picked unit
		//placed there when it can go; else the selected unit's attack or move there, or the unit there selected
		clickHex(at: Position) {
			const w = world.value;
			if (w === null || showing.value) return;
			//(it closes the turn report and folds the unit card first)
			clicked();
			if (strategic.value) {
				strategic.value = false;
				look({ row: at.row, col: at.col });
				return;
			}
			const place = placeOn(w, deployment.value, at);
			if (place !== null) {
				//(the next unit in the reserve picked; none left, deploying ends)
				if (dispatch(place) === null) deploying.value = reserve.value.length === 0 ? null : reserve.value[0].index;
				return;
			}
			const click = clickOn(w, selection.value, at, airMode.value);
			if ("command" in click) {
				dispatch(click.command);
				return;
			}
			select(click.select);
		},

		//At a scenario's or a turn's start, with units in the person's reserve: the first one picked and the map on the
		//zone's first hex, as the original game opens its deployment list (uiShowDeploymentWindow, reference/src/ui.js)
		startDeployment() {
			const first = reserve.value[0];
			if (first === undefined) return;
			pick(first.index);
			//(a side with no deployment hex has an empty zone: the map stays where it is)
			const zone = deployment.value!.zone;
			if (zone.length > 0) look(zone[0]);
		},

		//The hex under the pointer, null off the map: kept when it is the same hex, so the path isn't computed again
		hoverHex(at: Position | null) {
			const old = hover.value;
			if (old === at || (old !== null && at !== null && old.row === at.row && old.col === at.col)) return;
			hover.value = at;
		},
	};
}

export type MapPart = ReturnType<typeof createMap>;
