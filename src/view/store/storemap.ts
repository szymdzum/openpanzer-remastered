//The store's map (src/view/store/store.ts, review proposal 3): what the canvas draws (the units, the selection, the path to the
//hovered hex, the fog, the plaques, the strategic map, the deployment zone), the pointer, and a click on a hex
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

//clicked: what a click on the map closes, the turn report and the open unit card
export function createMap(core: Core, step: Step, clicked: () => void) {
	const { world, selected, airMode, dispatch, select, pickUnit, look } = core;
	const { moving, shown, showing } = step;
	const setting = settingSignals();
	//the hex under the pointer (the map's scale is the settings')
	const hover = signal<Position | null>(null);
	//the strategic map: the whole map fit to the window (StrategicMap)
	const strategic = signal(false);
	//the reserve unit picked to deploy, by its place in the core list (Deployment), null: none
	const deploying = signal<number | null>(null);
	//The HUD's (GameMenu): the hex grid drawn, the labels over the map (L clears them until the next turn)
	const hexGrid = signal(false);
	const labels = signal(true);

	//The world whose units the map draws: while a step's beats play, its units as each beat has them (#503)
	const drawn = computed(() => shown.value === null ? world.value : shown.value);
	//What the map draws: the units the side sees, the selection with its move area and targets, the path to
	//the hovered hex (computed again only when the hovered hex changes, MovePath)
	const units = computed(() => drawn.value === null ? [] : mapUnits(drawn.value, airMode.value, selected.value).filter((u) => u.id !== moving.value));
	//the person's reserve, and the deployment zone while one of its units is picked
	const reserve = computed(() => world.value === null ? [] : reserveOf(world.value));
	const deployment = computed(() => world.value === null ? null : deploymentOf(world.value, deploying.value));
	//the reserve tray while deploying (Deployment)
	const tray = computed(() => deployment.value === null ? null : trayOf(world.value!, deploying.value));
	//(no move area or target while deploying, as the old UI drew none in deploy mode)
	const selection = computed(() => world.value === null || deployment.value !== null ? null : selectionOf(world.value, selected.value));
	//(none of what the pointer shows on the strategic map, which has no cursor)
	const pointed = computed(() => world.value === null || strategic.value ? null : hover.value);
	const ghost = computed(() => pointed.value === null ? null : ghostOf(world.value!, deployment.value, pointed.value));
	//the hex under the pointer as the status line tells it, where the old UI's #locmsg did
	const located = computed(() => pointed.value === null ? null : locationOf(world.value!, pointed.value, airMode.value));
	const path = computed(() => pointed.value === null ? null : pathOf(world.value!, selection.value, pointed.value));
	//the fog of war, the support fire on the hovered target, the objectives' and towns' plaques
	const fog = computed(() => world.value === null ? null : fogOf(world.value));
	const support = computed(() => pointed.value === null ? null : supportOf(world.value!, selection.value, pointed.value, airMode.value));
	//(and again when the towns' setting changes, which changes no world, #467)
	const plaques = computed(() => world.value === null ? [] : mapPlaques(world.value, setting.showDetailInfoToolTips.value, labels.value));
	//The old map's marks the settings ask for (#464)
	const marks = computed(() => ({ own: setting.markOwnUnits.value, enemy: setting.markEnemyUnits.value }));
	//The attack cursor (AttackPreview, stage 1): the losses over the pointed target, as the old cursor showed them
	const glance = computed(() => pointed.value === null ? null : glanceOf(world.value!, selection.value, pointed.value, airMode.value));
	//the strategic map's chips and objectives, while it is open
	const overview = computed(() => drawn.value === null || !strategic.value ? null : strategicOf(drawn.value, airMode.value));
	//the pins over the side playing's units, cleared with the labels (L)
	const pins = stableComputed(() => drawn.value === null || !labels.value || strategic.value ? [] : pinsOf(drawn.value));

	//A reserve unit picked to deploy (its core list index), or none: deploying ends. Nothing stays selected
	const pick = (index: number | null) => {
		deploying.value = index;
		if (index !== null) pickUnit(null);
	};

	return {
		//The labels over the map shown, or cleared until the next turn (L)
		showLabels(on: boolean) {
			labels.value = on;
		},

		hover, strategic, deploying, hexGrid, labels: labels as ReadonlySignal<boolean>, units, reserve, deployment, tray, selection, ghost, located, path, fog, support, plaques,
		marks, glance, overview, pins, pick,

		//A click on a hex of the map: on the strategic map, the map back at its scale centred there; while deploying,
		//the picked unit placed there when it can go there; else the selected unit's attack or move there, sent as the
		//person's command, or the unit there selected (none on an empty hex)
		clickHex(at: Position) {
			const w = world.value;
			if (w === null || showing.value) return;
			//(a click on the map closes the turn report and folds the unit card, and does what it does)
			clicked();
			if (strategic.value) {
				strategic.value = false;
				look({ row: at.row, col: at.col });
				return;
			}
			const place = placeOn(w, deployment.value, at);
			if (place !== null) {
				//(the next unit in the reserve picked, as the old UI's deployment list did; none left, deploying ends)
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
		//zone's first hex, as the old UI opened its deployment list (uiShowDeploymentWindow)
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
