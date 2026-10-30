//The store: the view model (model.ts) carried to the components as computed signals of the world, which the screen
//refreshes after each step and view event, so a component renders again only when what it reads changed. Made of the
//parts storecore, storestep, storemap, storecard, storeturn, storenotes and the start menu's windows; here the keys.
import { computed, type ReadonlySignal, signal } from "@preact/signals";
import type { GameEvent } from "../../core/events";
import type { World } from "../../core/types";
import { isAir } from "../../core/units";
import { unitById } from "../../core/world";
import type { GameHost } from "../../app/host";
import { neighbourUnit } from "./model";
import type { MenuKey, Shortcut } from "../shortcuts";
import { createShopState } from "../windows/shopstate";
import type { Stage } from "../player";
import { MENU_CLOSED, type MenuButton, menuAfter, menuBack, menuToggled } from "../windows/menus";
import { createNewGame, type NewGameHost } from "../windows/newgamestate";
import { createSettings, type SettingsHost } from "../windows/settingsstate";
import { createSaveLoad, type SaveLoadHost } from "../windows/saveloadstate";
import { createCore } from "./storecore";
import { createStep, eventsOf } from "./storestep";
import { createMap } from "./storemap";
import { createCard } from "./storecard";
import { createTurn } from "./storeturn";
import { createNotes } from "./storenotes";

/** The game host's world, the person's commands and victories; the start menu's new games are absent in the tests. */
export type StoreHost = Pick<GameHost, "world" | "command" | "won"> & Partial<Pick<GameHost, "cosmetic" | "startTutorial">> & NewGameHost & SettingsHost & SaveLoadHost;

/** The step's page plus the reload some settings need and the saved game's download; the tests: silence and motion. */
export type Page = Pick<Stage, "sound" | "still"> & { reload?: () => void, download?: (name: string, text: string) => void };
const QUIET_PAGE: Page = { sound: () => {}, still: () => false };

export function createStore(host: StoreHost, page: Page = QUIET_PAGE) {
	const core = createCore(host, {
		busy: () => step.showing.value,
		endingTurn: () => turn.endingTurn(),
		answered: () => { step.news.value = null; },
		played: (before, result) => showStep(before, eventsOf(result), () => host.won(result)),
	});
	const { world, selected, airMode, refresh, dispatch, select, pickUnit, look } = core;
	const step = createStep(core, host, page);
	const notes = createNotes();
	//A click on the map closes the turn report and folds the unit card
	const map = createMap(core, step, () => { turn.banner.value = false; card.sizeCard("line"); });
	const card = createCard(core, map, step);
	const turn = createTurn(core, map, step, notes, host);
	const { strategic, hexGrid } = map;
	//The rail's middle group open
	const railOpen = signal(true);
	//The start menu's window shown, none while the game shows
	const menu = signal(MENU_CLOSED);

	//Selects the neighbour unit and centres the map on it
	const cycle = (direction: 1 | -1) => {
		const w = world.value;
		if (w === null || selected.value === null) return;
		const next = neighbourUnit(w, selected.value, direction), u = unitById(w, next)!;
		select(next);
		look({ row: u.row, col: u.col });
	};

	//Leaving the air layer deselects an aircraft, which would be underneath, as in the original game (reference/src/ui.js)
	const toggleAir = () => {
		const w = world.value, u = w === null || selected.value === null ? null : unitById(w, selected.value);
		if (airMode.value && u !== null && isAir(w!, u)) pickUnit(null);
		airMode.value = !airMode.value;
	};

	//A step shown: in the turn's log, its beats played, then what it told, then what follows (a person's victories, a
	//program's next action). Without the world before it, nothing to play
	const showStep = (before: World | null, events: GameEvent[], then: () => void) => {
		if (before === null) {
			then();
			return;
		}
		turn.logStep(before, events);
		step.play(before, events, then);
	};

	const newGame = createNewGame({ host, world, menu, lists: () => ({ campaigns: campaignlist, scenarios: scenariolist }) });

	const settings = createSettings({ host, menu, refresh, reload: page.reload });

	const saveLoad = createSaveLoad({ host, world, menu, download: page.download });

	const shops = createShopState({ world, deploying: map.deployment, selected, select, pickReserve: map.pick, look, dispatch });

	//The windows over a scrim: the keys are theirs
	const modal = computed(() => turn.asking.value !== null || turn.combatLog.value !== null || turn.dossier.value !== null);

	const menuKeys: Record<MenuKey, () => void> = {
		inspect: () => { card.infoShown.value = !card.infoShown.value; },
		buy: () => shops.toggleShop(),
		hex: () => { hexGrid.value = !hexGrid.value; },
		air: () => toggleAir(),
		zoom: () => { strategic.value = !strategic.value; },
		options: () => { menu.value = menuToggled(menu.value); },
		labels: () => map.showLabels(false),
		next: () => cycle(1),
		previous: () => cycle(-1),
		//Escape closes the turn report, else deselects the unit, else opens Options
		escape: () => {
			if (turn.banner.value) turn.banner.value = false;
			else if (selected.value !== null) select(null);
			else menu.value = menuToggled(menu.value);
		},
	};

	return {
		...core, ...step, ...notes, ...map, ...card, ...turn, showing: step.showing as ReadonlySignal<boolean>, showStep, toggleAir, railOpen,
		...shops, menu, ...newGame, ...settings, ...saveLoad,

		//A button of the start menu: its window, or the game (the tutorial starts on the host)
		startMenu(button: MenuButton) {
			menu.value = menuAfter(menu.value, button);
			if (button === "tutorial" && host.startTutorial) host.startTutorial();
			if (button === "newcampaign") newGame.openNewGame("campaign");
			if (button === "newscenario") newGame.openNewGame("scenario");
		},

		menuBack() {
			menu.value = menuBack();
		},

		shortcut(sc: Shortcut) {
			if (modal.value) return;
			if ("unit" in sc) card.unitKey(sc.unit);
			else menuKeys[sc.menu]();
		},

		toggleRail() {
			railOpen.value = !railOpen.value;
		},

		//A new scenario's start: every open message dropped, its OK not run (#405), the last step's beats stopped, and the
		//last game's enemy turn not reported (#466), its looked-at hex, refusal, combat line and chips gone (#566)
		clear() {
			core.reset();
			notes.notes.value = [];
			turn.reset();
			step.stop();
		},
	};
}

export type Store = ReturnType<typeof createStore>;
