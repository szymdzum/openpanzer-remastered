//The new UI's signals (#380): the view model (src/view/model.ts) carried to the components. The screen
//(src/view/screen.tsx) refreshes the world after each step and each view event; each value the
//components read is a computed signal of it, so a component renders again only when what it reads
//changed. The person's commands go to the game host from here (dispatch), and a refused one leaves its
//reason for the status bar.
import { computed, signal } from "@preact/signals";
import type { Command } from "../commands";
import type { Position, UnitId, World } from "../core/types";
import { isAir } from "../core/units";
import { unitById, unitData } from "../core/world";
import type { GameHost } from "../host";
import { fogOf, plaquesOf, supportOf } from "./mapinfo";
import { clickOn, mapUnits, pathOf, selectionOf, unitsToAct } from "./mapview";
import { strategicOf } from "./strategic";
import { deploymentOf, ghostOf, placeOn, reserveOf } from "./deploy";
import { type ActionKey, endTurnRefusal, neighbourUnit, prestigeText, reasonOf, statusOf, stillToAct, unitView } from "./model";
import type { MenuKey, Shortcut } from "./shortcuts";
import { unitInfoOf } from "./unitinfo";

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
	//The HUD's (GameMenu): the hex grid drawn, the unit info shown (Inspect unit), the rail's middle group open, the
	//labels over the map (L clears them until the next turn), the units End turn warns of while it asks (#8)
	const hexGrid = signal(false);
	const infoShown = signal(true);
	const railOpen = signal(true);
	const labels = signal(true);
	const asking = signal<string[] | null>(null);

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
	const askingText = computed(() => asking.value === null ? null : stillToAct(asking.value));
	const info = computed(() => world.value === null || selected.value === null ? null : unitInfoOf(world.value, selected.value));
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
	const plaques = computed(() => world.value === null || !labels.value ? [] : plaquesOf(world.value));
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

	//A unit selected, or none: a unit shows its layer, as the old UI did (an aircraft switches the air layer on)
	const select = (id: UnitId | null) => {
		const w = world.value, u = w === null || id === null ? null : unitById(w, id);
		selected.value = id;
		if (u !== null) airMode.value = isAir(w!, u);
		refused.value = null;
	};

	//A unit key (M, E, S, R, O, U): the selected unit's action of that key that it can take now, sent as its button
	//sends it; none it can take, the reason of the first in the status line (the same rule and refusal as the button)
	const unitKey = (key: ActionKey) => {
		const actions = unit.value === null ? [] : unit.value.actions.filter((a) => a.key === key);
		const ready = actions.find((a) => a.refusal === null);
		if (ready !== undefined) dispatch(ready.command);
		else if (actions.length > 0) refused.value = actions[0].refusal;
	};

	//N and P: the next or previous unit that hasn't moved, selected and in the middle of the map
	const cycle = (direction: 1 | -1) => {
		const w = world.value;
		if (w === null || selected.value === null) return;
		const next = neighbourUnit(w, selected.value, direction), u = unitById(w, next)!;
		select(next);
		lookAt.value = { row: u.row, col: u.col };
	};

	//The windows Buy and Options open come with the windows and the menus (D5, D6): the status line says so
	const notYet = () => { refused.value = "Not in the new UI yet"; };

	//The air layer on or off (AirLayer, the A key and the rail's button). Leaving it deselects an aircraft, which
	//would be underneath, as the old UI did
	const toggleAir = () => {
		const w = world.value, u = w === null || selected.value === null ? null : unitById(w, selected.value);
		if (airMode.value && u !== null && isAir(w!, u)) selected.value = null;
		airMode.value = !airMode.value;
	};

	//What each menu key does (GameMenu): the rail's buttons, L, N and P, Escape
	const menu: Record<MenuKey, () => void> = {
		inspect: () => { infoShown.value = !infoShown.value; },
		buy: notYet,
		hex: () => { hexGrid.value = !hexGrid.value; },
		air: () => toggleAir(),
		zoom: () => { strategic.value = !strategic.value; },
		labels: () => { labels.value = false; },
		next: () => cycle(1),
		previous: () => cycle(-1),
		//Escape deselects the unit; with none, Options
		escape: () => {
			if (selected.value !== null) select(null);
			else notYet();
		},
	};


	return {
		dispatch,
		world, selected, notes, refused, lookAt, airMode, hover, scale, strategic, side, sideName, turn, prestige, prestigeShown, country, nation,
		date, weather, ground, rules, endTurn, unit, note, hexGrid, infoShown, railOpen, labels, asking, askingText, info, toggleAir,
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
			select(click.select);
		},

		//A key or a rail button (GameMenu)
		shortcut(sc: Shortcut) {
			if ("unit" in sc) unitKey(sc.unit);
			else menu[sc.menu]();
		},

		//End turn: on at once when every unit has done what it can; else the question, with the units that can still
		//act (#8)
		askEndTurn() {
			const w = world.value;
			if (w === null || endTurn.value !== null) return;
			const ready = unitsToAct(w);
			if (ready.length === 0) dispatch({ type: "endTurn" });
			else asking.value = ready.map((u) => unitData(w, u).name);
		},

		//The rail's middle group folded or open (#mainmenu)
		toggleRail() {
			railOpen.value = !railOpen.value;
		},

		//The question's answer: the turn ended, or played on
		answerEndTurn(end: boolean) {
			asking.value = null;
			if (end) dispatch({ type: "endTurn" });
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
