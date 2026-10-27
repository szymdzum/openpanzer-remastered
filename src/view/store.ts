//The new UI's signals (#380): the view model (src/view/model.ts) carried to the components. The screen
//(src/view/screen.tsx) refreshes the world after each step and each view event; each value the
//components read is a computed signal of it, so a component renders again only when what it reads
//changed. The person's commands go to the game host from here (dispatch), and a refused one leaves its
//reason for the status bar.
import { computed, signal } from "@preact/signals";
import type { Command, CommandType, ResultOf } from "../commands";
import type { GameEvent } from "../core/events";
import type { Position, UnitId, World } from "../core/types";
import { isAir } from "../core/units";
import { unitById, unitData } from "../core/world";
import type { GameHost } from "../host";
import type { ScenarioOutcome } from "../scenario";
import { fogOf, mapPlaques, supportOf } from "./mapinfo";
import { clickOn, mapUnits, pathOf, selectionOf, unitsToAct } from "./mapview";
import { strategicOf } from "./strategic";
import { deploymentOf, ghostOf, placeOn, reserveOf, trayOf } from "./deploy";
import { type ActionKey, endTurnRefusal, isYourTurn, neighbourUnit, prestigeText, reasonOf, statusOf, stillToAct, yourPlayer } from "./model";
import type { MenuKey, Shortcut } from "./shortcuts";
import { type CardSize, type CardView, unitCardOf } from "./unitcard";
import { createShopState } from "./shopstate";
import { combatLogOf, emptyLog, logStep, logTurnStart } from "./log";
import { campaignEndOf, dossierOf } from "./dossier";
import { outcomeNames, uiSettings } from "../prototypes";
import { contextOf } from "./context";
import { locationOf, pinsOf } from "./hextip";
import { aiStatusOf, type EnemyTurn, firstUnitOf, noteEnemy, quietTurn, turnReportOf } from "./turn";
import { glanceOf } from "./odds";
import { type News, type Results, resultsOf } from "./results";
import { beatsFor } from "./beats";
import { createPlayer, type Motion, type Stage } from "./player";
import { hexCentre } from "./hexgrid";
import { MENU_CLOSED, type MenuButton, menuAfter, menuBack, menuToggled } from "./menus";
import { createNewGame, type NewGameHost } from "./newgamestate";
import { createSettings, type SettingsHost } from "./settingsstate";
import { createSaveLoad, type SaveLoadHost } from "./saveloadstate";

//What the store asks of the game host: the world it plays, the person's commands, the victories they won; the new games
//the start menu starts (none in the tests of the map and the HUD)
export type StoreHost = Pick<GameHost, "world" | "command" | "won"> & Partial<Pick<GameHost, "cosmetic" | "startTutorial">> & NewGameHost & SettingsHost & SaveLoadHost;

//What the page gives the step's beats (src/view/player.ts): its sounds, and whether the person asked for reduced motion;
//its reload, which some settings need, and its download of a saved game. Without a page (the tests): silence and motion,
//no reload and no download
export type Page = Pick<Stage, "sound" | "still"> & { reload?: () => void, download?: (name: string, text: string) => void };
const QUIET_PAGE: Page = { sound: () => {}, still: () => false };

//A message window: its title, its text (HTML: the scenarios' briefings and the tutorial's messages are the
//game's own), the hex it points at (the map's, D2) and what its OK does
export interface Note {
	title: string;
	html: string;
	at: Position | null;
	ok: () => void;
	//a scenario's briefing (MessageDialog): the full window with its stamp; else a short notice
	briefing?: boolean;
}

export function createStore(host: StoreHost, page: Page = QUIET_PAGE) {
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
	//what the enemy's turn did to the side shown (from a program's steps), and the short turn report open (TurnBanner)
	const enemy = signal<EnemyTurn>(quietTurn());
	const banner = signal(false);
	//the turn's log from the person's end of turn on, and the full turn report open (CombatLog)
	const log = signal(emptyLog());
	const logOpen = signal(false);
	//the dossier open (Dossier), or the campaign's end over it with what its close does (CampaignEnd)
	const dossierOpen = signal(false);
	const ending = signal<{ outcome: ScenarioOutcome, html: string, closed: () => void } | null>(null);
	//What the last step told (CombatResults): its chips and stamp over the map until they fade, its line in the status bar
	//until the next command
	const results = signal<Results | null>(null);
	const news = signal<News | null>(null);
	//A step's beats while they play (src/view/player.ts): what the map draws over the units, the unit hidden from its hex
	//while it moves; the map takes no click meanwhile
	const motion = signal<Motion | null>(null);
	const moving = signal<UnitId | null>(null);
	//The unit card at the bottom (UnitInfo): the view picked for a unit (none, or another unit's: the one it opens on), and
	//its size: a strip, one row, or unfolded over the map
	const cardView = signal<{ unit: UnitId, view: CardView } | null>(null);
	const cardSize = signal<CardSize>("row");
	//the dock's height over the bottom of the map in CSS pixels, which the map scrolls past so that its last row clears
	//the dock (#453)
	const dockHeight = signal(0);
	//The start menu's window shown, none while the game shows (StartMenu)
	const menu = signal(MENU_CLOSED);
	let busy = false;
	//(the sprite and sound picks from the cosmetic stream; with no host to draw from, the first of each)
	const cosmetic = host.cosmetic;
	const player = createPlayer({ pick: cosmetic === undefined ? () => 0 : () => cosmetic.call(host), show: (m) => { motion.value = m; },
		hide: (id) => { moving.value = id; }, centre: (p) => hexCentre(p.row, p.col), ...page });

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
	const askingText = computed(() => asking.value === null ? null : stillToAct(asking.value));
	const card = computed(() => {
		const w = world.value, id = selected.value, picked = cardView.value;
		if (w === null || id === null) return null;
		return unitCardOf(w, id, picked !== null && picked.unit === id ? picked.view : null);
	});
	//the pins over the side playing's units, cleared with the labels (L)
	const pins = computed(() => world.value === null || !labels.value || strategic.value ? [] : pinsOf(world.value));
	//the turn report while it is open; the program's turn in progress (the AI indicator)
	const report = computed(() => world.value === null || !banner.value ? null : turnReportOf(world.value, enemy.value));
	const combatLog = computed(() => world.value === null || !logOpen.value ? null : combatLogOf(world.value, log.value, enemy.value));
	const dossier = computed(() => world.value === null || (!dossierOpen.value && ending.value === null) ? null : dossierOf(world.value));
	const campaignEnd = computed(() => ending.value === null ? null : campaignEndOf(ending.value.outcome, ending.value.html));
	const ai = computed(() => world.value === null ? null : aiStatusOf(world.value));
	//(the status bar's turn report button: the person's report, none while a program plays)
	//(the report is there whenever the person has a side, turn.ts turnReportOf)
	const reportRefusal = computed(() => world.value === null || yourPlayer(world.value) === null ? "No report to show" : undefined);
	//the selected unit's context menu (UnitContext), none while deploying, on the strategic map or while a unit moves on it
	const context = computed(() => world.value === null || selected.value === null || deployment.value !== null || strategic.value
		|| moving.value !== null ? null : contextOf(world.value, selected.value));
	const note = computed(() => notes.value.length === 0 ? null : notes.value[0]);
	//What the map draws: the units the side sees, the selection with its move area and targets, the path to
	//the hovered hex (computed again only when the hovered hex changes, MovePath)
	const units = computed(() => world.value === null ? [] : mapUnits(world.value, airMode.value, selected.value).filter((u) => u.id !== moving.value));
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
	const plaques = computed(() => world.value === null || !labels.value ? [] : mapPlaques(world.value, uiSettings.showDetailInfoToolTips));
	//The attack cursor (AttackPreview, stage 1): the losses over the pointed target, as the old cursor showed them
	const glance = computed(() => pointed.value === null ? null : glanceOf(world.value!, selection.value, pointed.value, airMode.value));
	//the strategic map's chips and objectives, while it is open
	const overview = computed(() => world.value === null || !strategic.value ? null : strategicOf(world.value, airMode.value));

	//The world as the host plays it now
	const refresh = () => { world.value = host.world(); };

	//A person's command sent to the host: the screen shows the step at once (the animations are D4's),
	//then its victories are told; refused, the reason, which the status bar shows until the next command
	const dispatch = (cmd: Command): string | null => {
		const before = world.value;
		//(the person's turn ending: the enemy's starts quiet, nothing stays selected under it, the report goes; before the
		//command, which may play the program's whole turn and start the person's next)
		if (cmd.type === "endTurn") {
			enemy.value = quietTurn();
			log.value = emptyLog();
			logOpen.value = false;
			selected.value = null;
			banner.value = false;
		}
		const r = host.command(cmd);
		news.value = null;
		refresh();
		//(a command played had a world to start from: with none, no game is playing and the host refuses it)
		if (r.ok) showStep(before!, eventsOf(r.result), () => host.won(r.result));
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

	//A unit key (M, E, S, R, O, U): the selected unit's action of that key, sent as its button sends it; nothing when the
	//menu doesn't show it, as the old UI's keys did
	const unitKey = (key: ActionKey) => {
		const action = context.value === null ? undefined : context.value.actions.find((a) => a.key === key);
		if (action !== undefined) dispatch(action.command);
	};

	//N and P: the next or previous unit that hasn't moved, selected and in the middle of the map
	const cycle = (direction: 1 | -1) => {
		const w = world.value;
		if (w === null || selected.value === null) return;
		const next = neighbourUnit(w, selected.value, direction), u = unitById(w, next)!;
		select(next);
		lookAt.value = { row: u.row, col: u.col };
	};

	//The air layer on or off (AirLayer, the A key and the rail's button). Leaving it deselects an aircraft, which
	//would be underneath, as the old UI did
	const toggleAir = () => {
		const w = world.value, u = w === null || selected.value === null ? null : unitById(w, selected.value);
		if (airMode.value && u !== null && isAir(w!, u)) selected.value = null;
		airMode.value = !airMode.value;
	};

	//What a step told over the map and in the status bar (nothing to tell: the last results stay until they fade)
	const tell = (before: World, events: GameEvent[]) => {
		const told = resultsOf(before, world.value!, events);
		if (told === null) return;
		results.value = told;
		news.value = told.news;
	};

	//A step shown: its beats played, then what it told, then what follows (a person's victories, a program's next action).
	//Without the world before it, nothing to play
	const showStep = (before: World | null, events: GameEvent[], then: () => void) => {
		if (before === null) {
			then();
			return;
		}
		log.value = logStep(log.value, before, world.value!, events);
		busy = true;
		player.play(beatsFor(before, world.value!, events), () => {
			busy = false;
			tell(before, events);
			then();
		});
	};

	//The new campaign's and the new scenario's windows, on the game's lists
	const newGame = createNewGame({ host, world, menu, lists: () => ({ campaigns: campaignlist, scenarios: scenariolist }) });

	//The settings window
	const settings = createSettings({ host, menu, scale, refresh, reload: page.reload });

	//The save and load window
	const saveLoad = createSaveLoad({ host, world, menu, download: page.download });

	//The unit list and the equipment window (UnitList, Equipment)
	const shops = createShopState({ world, deploying: deployment, selected, select, look: (at) => { lookAt.value = at; }, dispatch });

	//What each menu key does (GameMenu): the rail's buttons, L, N and P, Escape
	const menuKeys: Record<MenuKey, () => void> = {
		inspect: () => { infoShown.value = !infoShown.value; },
		buy: () => shops.toggleShop(),
		hex: () => { hexGrid.value = !hexGrid.value; },
		air: () => toggleAir(),
		zoom: () => { strategic.value = !strategic.value; },
		options: () => { menu.value = menuToggled(menu.value); },
		labels: () => { labels.value = false; },
		next: () => cycle(1),
		previous: () => cycle(-1),
		//Escape deselects the unit; with none, Options
		escape: () => {
			if (banner.value) banner.value = false;
			else if (selected.value !== null) select(null);
			else menu.value = menuToggled(menu.value);
		},
	};


	return {
		dispatch,
		world, selected, notes, refused, lookAt, airMode, hover, scale, strategic, side, sideName, turn, prestige, prestigeShown, country, nation,
		date, weather, ground, rules, endTurn, note, hexGrid, infoShown, railOpen, labels, asking, askingText, context, located, pins, banner, report, ai, enemy, reportRefusal, toggleAir,
		units, selection, path, fog, support, plaques, overview, deploying, reserve, deployment, ghost, refresh, glance,
		results, news, motion, showStep, card, cardSize, dockHeight, ...shops, tray, combatLog, dossier, campaignEnd, menu, ...newGame, ...settings, ...saveLoad,

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

		//Either report's Dossier: the campaign's record over them
		openDossier() {
			dossierOpen.value = true;
		},

		//Its close: at the campaign's end, what the game asked (the main menu)
		closeDossier() {
			const end = ending.value;
			dossierOpen.value = false;
			ending.value = null;
			if (end !== null) end.closed();
		},

		//The campaign's end (the screen's campaignEnd): the dossier under its outcome and closing words; with no campaign
		//player to show (no world), the outcome as a message, as before
		endCampaign(outcome: ScenarioOutcome, html: string, then: () => void) {
			if (world.value !== null && dossierOf(world.value) !== null) ending.value = { outcome, html, closed: then };
			else notes.value = [...notes.value, { title: outcomeNames[outcome], html, at: null, ok: then }];
		},

		//The full turn report (the short one's Turn report), in place of the short one; closed
		openLog() {
			banner.value = false;
			logOpen.value = true;
		},

		closeLog() {
			logOpen.value = false;
		},

		//What a turn's start did (the screen's turnEvents): its resupplies and reinforcements in the log
		logTurn(events: GameEvent[]) {
			const w = host.world();
			if (w !== null) log.value = logTurnStart(log.value, w, events);
		},

		//The unit card as a strip, one row, or unfolded over the map
		sizeCard(size: CardSize) {
			cardSize.value = size;
		},

		//One of the selected unit's views on the card: itself, its transport, its carrier
		viewCard(view: CardView) {
			if (selected.value !== null) cardView.value = { unit: selected.value, view };
		},

		//The chips and the stamp faded (the status bar's line stays)
		faded: () => {
			results.value = null;
		},

		//A click on a hex of the map: on the strategic map, the map back at its scale centred there; while deploying,
		//the picked unit placed there when it can go there; else the selected unit's attack or move there, sent as the
		//person's command, or the unit there selected (none on an empty hex)
		clickHex(at: Position) {
			const w = world.value;
			if (w === null || busy) return;
			//(the first click on the map closes the turn report, and does what it does)
			banner.value = false;
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
			else menuKeys[sc.menu]();
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

		//A program's step shown: what it did to the side shown, for the next turn's report
		noteEnemy(events: GameEvent[]) {
			if (world.value !== null) enemy.value = noteEnemy(enemy.value, world.value, events);
		},

		//A person's turn starts (TurnStart): the short report under the status bar, and unless the reserve is being
		//deployed, the first ground unit selected and in the middle of the map
		startTurn() {
			const w = world.value;
			if (w === null || !isYourTurn(w)) return;
			banner.value = true;
			const first = deployment.value === null ? firstUnitOf(w) : null;
			if (first === null) return;
			select(first);
			const u = unitById(w, first)!;
			lookAt.value = { row: u.row, col: u.col };
		},

		//The report's close (×), or the status bar's turn report button: closed, or open again
		showReport(open: boolean) {
			banner.value = open;
		},

		//The reports' Briefing (the short and the full one): the scenario's description in the message window, while one
		//of them is open
		briefing() {
			const w = world.value;
			if (w !== null && (report.value !== null || combatLog.value !== null)) notes.value = [...notes.value, { title: w.data.name, html: w.data.description, at: null, ok: () => {}, briefing: true }];
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

		//A new scenario's start: every open message dropped, its OK not run (#405), and the last step's beats stopped
		clear() {
			notes.value = [];
			log.value = emptyLog();
			logOpen.value = false;
			dossierOpen.value = false;
			player.stop();
			busy = false;
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

//The events of a command's result: a move's and an attack's carry theirs, the others none
function eventsOf(result: ResultOf<CommandType>): GameEvent[] {
	return result !== null && typeof result === "object" && "events" in result ? result.events : [];
}

