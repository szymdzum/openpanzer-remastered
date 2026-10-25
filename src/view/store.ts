//The new UI's signals (#380): the view model (src/view/model.ts) carried to the components. The screen
//(src/view/screen.tsx) refreshes the world after each step and each view event; each value the
//components read is a computed signal of it, so a component renders again only when what it reads
//changed. The person's commands go to the game host from here (dispatch), and a refused one leaves its
//reason for the status bar.
import { computed, signal } from "@preact/signals";
import type { Command } from "../commands";
import type { Position, UnitId, World } from "../core/types";
import { isAir } from "../core/units";
import { unitById } from "../core/world";
import type { GameHost } from "../host";
import { fogOf, plaquesOf, supportOf } from "./mapinfo";
import { clickOn, mapUnits, pathOf, selectionOf } from "./mapview";
import { strategicOf } from "./strategic";
import { deploymentOf, ghostOf, placeOn, reserveOf } from "./deploy";
import { endTurnRefusal, prestigeText, reasonOf, statusOf, unitView } from "./model";

//What the store asks of the game host: the world it plays, the person's commands, the victories they won
export type StoreHost = Pick<GameHost, "world" | "command" | "won">;

//A message window: its title, its text (HTML: the scenarios' briefings and the tutorial's messages are the
//game's own), the hex it points at (the map's, D2) and what its OK does
export interface Note {
	title: string;
	html: string;
	at: Position | null;
	ok: () => void;
}

export function createStore(host: StoreHost) {
	const world = signal<World | null>(null);
	const selected = signal<UnitId | null>(null);
	const notes = signal<Note[]>([]);
	const refused = signal<string | null>(null);
	const lookAt = signal<Position | null>(null);
	//The map's (D2): the layer shown (the air layer when true), the hex under the pointer, the map's scale
	const airMode = signal(false);
	const hover = signal<Position | null>(null);
	const scale = signal(1);
	//the strategic map: the whole map fit to the window (StrategicMap)
	const strategic = signal(false);
	//the reserve unit picked to deploy, by its place in the core list (Deployment), null: none
	const deploying = signal<number | null>(null);

	const status = computed(() => world.value === null ? null : statusOf(world.value));
	//(each a value of its own: the status bar's cells render again only when theirs changes)
	const side = computed(() => status.value === null ? -1 : status.value.side);
	const sideName = computed(() => status.value === null ? "" : status.value.sideName);
	const turn = computed(() => status.value === null ? "" : status.value.turn + "/" + status.value.maxTurns);
	const prestige = computed(() => status.value === null ? null : status.value.prestige);
	//(written as the HUD writes it: 3,056)
	const prestigeShown = computed(() => prestige.value === null ? null : prestigeText(prestige.value));
	const country = computed(() => status.value === null ? "" : status.value.country);
	const nation = computed(() => status.value === null ? null : status.value.nation);
	const date = computed(() => status.value === null ? "" : status.value.date);
	const weather = computed(() => status.value === null ? null : status.value.weather);
	const ground = computed(() => status.value === null ? null : status.value.ground);
	const rules = computed(() => status.value === null ? "" : status.value.rules);
	const endTurn = computed(() => world.value === null ? "No game is playing" : endTurnRefusal(world.value));
	const unit = computed(() => world.value === null || selected.value === null ? null : unitView(world.value, selected.value));
	const note = computed(() => notes.value.length === 0 ? null : notes.value[0]);
	//What the map draws: the units the side sees, the selection with its move area and targets, the path to
	//the hovered hex (computed again only when the hovered hex changes, MovePath)
	const units = computed(() => world.value === null ? [] : mapUnits(world.value, airMode.value, selected.value));
	//the person's reserve, and the deployment zone while one of its units is picked
	const reserve = computed(() => world.value === null ? [] : reserveOf(world.value));
	const deployment = computed(() => world.value === null ? null : deploymentOf(world.value, deploying.value));
	//(no move area or target while deploying, as the old UI drew none in deploy mode)
	const selection = computed(() => world.value === null || deployment.value !== null ? null : selectionOf(world.value, selected.value));
	//(none of what the pointer shows on the strategic map, which has no cursor)
	const pointed = computed(() => world.value === null || strategic.value ? null : hover.value);
	const ghost = computed(() => pointed.value === null ? null : ghostOf(world.value!, deployment.value, pointed.value));
	const path = computed(() => pointed.value === null ? null : pathOf(world.value!, selection.value, pointed.value));
	//the fog of war, the support fire on the hovered target, the objectives' and towns' plaques
	const fog = computed(() => world.value === null ? null : fogOf(world.value));
	const support = computed(() => pointed.value === null ? null : supportOf(world.value!, selection.value, pointed.value, airMode.value));
	const plaques = computed(() => world.value === null ? [] : plaquesOf(world.value));
	//the strategic map's chips and objectives, while it is open
	const overview = computed(() => world.value === null || !strategic.value ? null : strategicOf(world.value, airMode.value));

	//The world as the host plays it now
	const refresh = () => { world.value = host.world(); };

	//A person's command sent to the host: the screen shows the step at once (the animations are D4's),
	//then its victories are told; refused, the reason, which the status bar shows until the next command
	const dispatch = (cmd: Command): string | null => {
		const r = host.command(cmd);
		refresh();
		if (r.ok) host.won(r.result);
		refused.value = "refusal" in r ? reasonOf(r.refusal) : null;
		return refused.value;
	};

	//A reserve unit picked to deploy (its core list index), or none: deploying ends. Nothing stays selected
	const pick = (index: number | null) => {
		deploying.value = index;
		if (index !== null) selected.value = null;
	};

	return {
		dispatch,
		world, selected, notes, refused, lookAt, airMode, hover, scale, strategic, side, sideName, turn, prestige, prestigeShown, country, nation,
		date, weather, ground, rules, endTurn, unit, note,
		units, selection, path, fog, support, plaques, overview, deploying, reserve, deployment, ghost, refresh,

		//A click on a hex of the map: on the strategic map, the map back at its scale centred there; while deploying,
		//the picked unit placed there when it can go there; else the selected unit's attack or move there, sent as the
		//person's command, or the unit there selected (none on an empty hex)
		clickHex(at: Position) {
			const w = world.value;
			if (w === null) return;
			if (strategic.value) {
				strategic.value = false;
				lookAt.value = { row: at.row, col: at.col };
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
			selected.value = click.select;
			//(a unit selected shows its layer, as the old UI did: an aircraft switches the air layer on)
			const u = click.select === null ? null : unitById(w, click.select);
			if (u !== null) airMode.value = isAir(w, u);
			refused.value = null;
		},

		//The air layer on or off (AirLayer, the A key; the rail's button is the HUD's, D3). Leaving it deselects an
		//aircraft, which would be underneath, as the old UI did
		toggleAir() {
			const w = world.value, u = w === null || selected.value === null ? null : unitById(w, selected.value);
			if (airMode.value && u !== null && isAir(w!, u)) selected.value = null;
			airMode.value = !airMode.value;
		},

		//The strategic map open or closed (StrategicMap, the Z key; the rail's button is the HUD's, D3)
		toggleStrategic() {
			strategic.value = !strategic.value;
		},

		pick,

		//At a scenario's or a turn's start, with units in the person's reserve: the first one picked and the map on the
		//zone's first hex, as the old UI opened its deployment list (uiShowDeploymentWindow)
		startDeployment() {
			const first = reserve.value[0];
			if (first === undefined) return;
			pick(first.index);
			//(a side with no deployment hex has an empty zone: the map stays where it is)
			const zone = deployment.value!.zone;
			if (zone.length > 0) lookAt.value = zone[0];
		},

		//The hex under the pointer, null off the map: kept when it is the same hex, so the path isn't computed again
		hoverHex(at: Position | null) {
			const old = hover.value;
			if (old === at || (old !== null && at !== null && old.row === at.row && old.col === at.col)) return;
			hover.value = at;
		},

		//A message shown after those already open, one at a time
		show(n: Note) {
			notes.value = [...notes.value, n];
		},

		//Every open message dropped, its OK not run: a new scenario's start (#405)
		clear() {
			notes.value = [];
		},

		//The open message's OK: closed, then what it does
		close() {
			const [top, ...rest] = notes.value;
			if (top === undefined) return;
			notes.value = rest;
			top.ok();
		},
	};
}

export type Store = ReturnType<typeof createStore>;
