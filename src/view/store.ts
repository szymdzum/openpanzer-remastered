//The new UI's signals (#380): the view model (src/view/model.ts) carried to the components. The screen
//(src/view/screen.tsx) refreshes the world after each step and each view event; each value the
//components read is a computed signal of it, so a component renders again only when what it reads
//changed. The person's commands go to the game host from here (dispatch), and a refused one leaves its
//reason for the status bar.
//The store is made of parts along its seams (review proposal 3), each in its own module: the core (the world, the
//selection, the commands: storecore.ts), the step's beats (storestep.ts), the map (storemap.ts), the unit card
//(storecard.ts), the turn and its reports (storeturn.ts), the messages (storenotes.ts), and the start menu's windows
//(newgamestate.ts, settingsstate.ts, saveloadstate.ts). Here: the HUD's keys, and the parts put together.
import { type ReadonlySignal, signal } from "@preact/signals";
import type { GameEvent } from "../core/events";
import type { World } from "../core/types";
import { isAir } from "../core/units";
import { unitById } from "../core/world";
import type { GameHost } from "../app/host";
import { neighbourUnit } from "./model";
import type { MenuKey, Shortcut } from "./shortcuts";
import { createShopState } from "./shopstate";
import type { Stage } from "./player";
import { MENU_CLOSED, type MenuButton, menuAfter, menuBack, menuToggled } from "./menus";
import { createNewGame, type NewGameHost } from "./newgamestate";
import { createSettings, type SettingsHost } from "./settingsstate";
import { createSaveLoad, type SaveLoadHost } from "./saveloadstate";
import { createCore } from "./storecore";
import { createStep, eventsOf } from "./storestep";
import { createMap } from "./storemap";
import { createCard } from "./storecard";
import { createTurn } from "./storeturn";
import { createNotes } from "./storenotes";

//What the store asks of the game host: the world it plays, the person's commands, the victories they won; the new games
//the start menu starts (none in the tests of the map and the HUD)
export type StoreHost = Pick<GameHost, "world" | "command" | "won"> & Partial<Pick<GameHost, "cosmetic" | "startTutorial">> & NewGameHost & SettingsHost & SaveLoadHost;

//What the page gives the step's beats (src/view/player.ts): its sounds, and whether the person asked for reduced motion;
//its reload, which some settings need, and its download of a saved game. Without a page (the tests): silence and motion,
//no reload and no download
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
	//(a click on the map closes the turn report and folds the unit card)
	const map = createMap(core, step, () => { turn.banner.value = false; card.sizeCard("line"); });
	const card = createCard(core, map, step);
	const turn = createTurn(core, map, step, notes, host);
	const { strategic, hexGrid } = map;
	//The HUD's (GameMenu): the rail's middle group open
	const railOpen = signal(true);
	//The start menu's window shown, none while the game shows (StartMenu)
	const menu = signal(MENU_CLOSED);

	//N and P: the next or previous unit that hasn't moved, selected and in the middle of the map
	const cycle = (direction: 1 | -1) => {
		const w = world.value;
		if (w === null || selected.value === null) return;
		const next = neighbourUnit(w, selected.value, direction), u = unitById(w, next)!;
		select(next);
		look({ row: u.row, col: u.col });
	};

	//The air layer on or off (AirLayer, the A key and the rail's button). Leaving it deselects an aircraft, which
	//would be underneath, as the old UI did
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

	//The new campaign's and the new scenario's windows, on the game's lists
	const newGame = createNewGame({ host, world, menu, lists: () => ({ campaigns: campaignlist, scenarios: scenariolist }) });

	//The settings window
	const settings = createSettings({ host, menu, refresh, reload: page.reload });

	//The save and load window
	const saveLoad = createSaveLoad({ host, world, menu, download: page.download });

	//The unit list and the equipment window (UnitList, Equipment)
	const shops = createShopState({ world, deploying: map.deployment, selected, select, pickReserve: map.pick, look, dispatch });

	//What each menu key does (GameMenu): the rail's buttons, L, N and P, Escape
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
		//Escape deselects the unit; with none, Options
		escape: () => {
			if (turn.banner.value) turn.banner.value = false;
			else if (selected.value !== null) select(null);
			else menu.value = menuToggled(menu.value);
		},
	};

	return {
		...core, ...step, ...notes, ...map, ...card, ...turn, showing: step.showing as ReadonlySignal<boolean>, showStep, toggleAir, railOpen,
		...shops, menu, ...newGame, ...settings, ...saveLoad,

		//A button of the start menu: its window, or the game; the tutorial starts on the host
		startMenu(button: MenuButton) {
			menu.value = menuAfter(menu.value, button);
			if (button === "tutorial" && host.startTutorial) host.startTutorial();
			if (button === "newcampaign") newGame.openNewGame("campaign");
			if (button === "newscenario") newGame.openNewGame("scenario");
		},

		//A window's Back: the start menu's main window
		menuBack() {
			menu.value = menuBack();
		},

		//A key or a rail button (GameMenu)
		shortcut(sc: Shortcut) {
			if ("unit" in sc) card.unitKey(sc.unit);
			else menuKeys[sc.menu]();
		},

		//The rail's middle group folded or open (#mainmenu)
		toggleRail() {
			railOpen.value = !railOpen.value;
		},

		//A new scenario's start: every open message dropped, its OK not run (#405), and the last step's beats stopped; the last
		//game's enemy turn not reported (#466)
		clear() {
			notes.notes.value = [];
			turn.reset();
			step.stop();
		},
	};
}

export type Store = ReturnType<typeof createStore>;
