//The new UI's signals (#380): the view model (src/view/model.ts) carried to the components. The screen
//(src/view/screen.tsx) refreshes the world after each step and each view event; each value the
//components read is a computed signal of it, so a component renders again only when what it reads
//changed. The person's commands go to the game host from here (dispatch), and a refused one leaves its
//reason for the status bar.
import { computed, signal } from "@preact/signals";
import type { Command } from "../commands";
import type { GameEvent } from "../core/events";
import type { Position, UnitId, World } from "../core/types";
import { isAir } from "../core/units";
import { unitById, unitData } from "../core/world";
import type { GameHost } from "../host";
import { fogOf, plaquesOf, supportOf } from "./mapinfo";
import { clickOn, mapUnits, pathOf, selectionOf, unitsToAct } from "./mapview";
import { strategicOf } from "./strategic";
import { deploymentOf, ghostOf, placeOn, reserveOf, trayOf } from "./deploy";
import { type ActionKey, endTurnRefusal, isYourTurn, neighbourUnit, prestigeText, reasonOf, statusOf, stillToAct, unitView } from "./model";
import type { MenuKey, Shortcut } from "./shortcuts";
import { unitInfoOf } from "./unitinfo";
import { type CardView, entryCardOf, unitCardOf } from "./unitcard";
import { createShopState } from "./shopstate";
import { combatLogOf, emptyLog, logStep, logTurnStart } from "./log";
import { campaignEndOf, dossierOf, type Outcome } from "./dossier";
import { outcomeNames } from "../prototypes";
import { contextOf, type UndoLoss, undoLoss } from "./context";
import { hexTipOf, pinsOf } from "./hextip";
import { aiStatusOf, type EnemyTurn, firstUnitOf, noteEnemy, quietTurn, turnReportOf } from "./turn";
import { blockedOf, glanceOf, oddsOf } from "./odds";
import { type News, type Results, resultsOf } from "./results";
import { beatsFor } from "./beats";
import { createPlayer, type Motion, type Stage } from "./player";
import { hexCentre } from "./hexgrid";

//What the store asks of the game host: the world it plays, the person's commands, the victories they won
export type StoreHost = Pick<GameHost, "world" | "command" | "won"> & Partial<Pick<GameHost, "cosmetic">>;

//What the page gives the step's beats (src/view/player.ts): its sounds, and whether the person asked for reduced motion.
//Without a page (the tests): silence and motion
export type Page = Pick<Stage, "sound" | "still">;
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
	//why the last undo went, from the step that took it (src/view/context.ts undoLoss)
	const lost = signal<UndoLoss | null>(null);
	//the hex the pointer rests on, or a finger held (the hex tooltip, Tooltips), null: none
	const rested = signal<Position | null>(null);
	//what the enemy's turn did to the side shown (from a program's steps), and the short turn report open (TurnBanner)
	const enemy = signal<EnemyTurn>(quietTurn());
	const banner = signal(false);
	//the turn's log from the person's end of turn on, and the full turn report open (CombatLog)
	const log = signal(emptyLog());
	const logOpen = signal(false);
	//the dossier open (Dossier), or the campaign's end over it with what its close does (CampaignEnd)
	const dossierOpen = signal(false);
	const ending = signal<{ outcome: Outcome, html: string, closed: () => void } | null>(null);
	//the target whose odds card is open (AttackPreview, stage 2): the pointer rested on it, Shift held, or a finger tapped
	//it (touch: the next tap on it attacks), null: none
	const oddsAt = signal<Position | null>(null);
	const oddsTouch = signal(false);
	//What the last step told (CombatResults): its chips and stamp over the map until they fade, its line in the status bar
	//until the next command
	const results = signal<Results | null>(null);
	const news = signal<News | null>(null);
	//A step's beats while they play (src/view/player.ts): what the map draws over the units, the unit hidden from its hex
	//while it moves; the map takes no click meanwhile
	const motion = signal<Motion | null>(null);
	const moving = signal<UnitId | null>(null);
	//The unit card open (UnitCard): the selected unit's, in the view picked for that unit (none: the one it opens on), or
	//an equipment entry's (the equipment window's); null: closed
	const cardOpen = signal<{ unit: UnitId | null, view: CardView | null } | { eqid: number, country: number } | null>(null);
	const closeCard = () => { cardOpen.value = null; };
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
	const unit = computed(() => world.value === null || selected.value === null ? null : unitView(world.value, selected.value));
	const askingText = computed(() => asking.value === null ? null : stillToAct(asking.value));
	const info = computed(() => world.value === null || selected.value === null ? null : unitInfoOf(world.value, selected.value));
	const card = computed(() => {
		const w = world.value, open = cardOpen.value;
		if (w === null || open === null) return null;
		if ("eqid" in open) return entryCardOf(w, open.eqid, open.country);
		return selected.value === null ? null : unitCardOf(w, selected.value, open.unit === selected.value ? open.view : null);
	});
	//the hex tooltip of the hex rested on; the pins over the side playing's units, cleared with the labels (L)
	const hexTip = computed(() => world.value === null || rested.value === null || strategic.value || odds.value !== null ? null
		: hexTipOf(world.value, rested.value, selected.value));
	const pins = computed(() => world.value === null || !labels.value || strategic.value ? [] : pinsOf(world.value));
	//the turn report while it is open; the program's turn in progress (the AI indicator)
	const report = computed(() => world.value === null || !banner.value ? null : turnReportOf(world.value, enemy.value));
	const combatLog = computed(() => world.value === null || !logOpen.value ? null : combatLogOf(world.value, log.value, enemy.value));
	const dossier = computed(() => world.value === null || (!dossierOpen.value && ending.value === null) ? null : dossierOf(world.value));
	const campaignEnd = computed(() => ending.value === null ? null : campaignEndOf(ending.value.outcome, ending.value.html));
	const ai = computed(() => world.value === null ? null : aiStatusOf(world.value));
	//(the status bar's turn report button: the person's report, none while a program plays)
	const reportRefusal = computed(() => world.value === null || turnReportOf(world.value, enemy.value) === null ? "No report to show"
		: undefined);
	//the selected unit's context menu (UnitContext), none while deploying, on the strategic map or while a unit moves on it
	const context = computed(() => world.value === null || selected.value === null || deployment.value !== null || strategic.value
		|| moving.value !== null ? null : contextOf(world.value, selected.value, lost.value));
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
	const path = computed(() => pointed.value === null ? null : pathOf(world.value!, selection.value, pointed.value));
	//the fog of war, the support fire on the hovered target, the objectives' and towns' plaques
	const fog = computed(() => world.value === null ? null : fogOf(world.value));
	const support = computed(() => pointed.value === null ? null : supportOf(world.value!, selection.value, pointed.value, airMode.value));
	const plaques = computed(() => world.value === null || !labels.value ? [] : plaquesOf(world.value));
	//The attack preview (AttackPreview): the enemies in range the selected unit can't attack (stage 0) and the reason of
	//the one pointed at, the losses at a glance over the pointed target (stage 1), the odds card (stage 2)
	const blocked = computed(() => world.value === null ? [] : blockedOf(world.value, selection.value));
	const blockedAt = computed(() => pointed.value === null ? null : blocked.value.find((b) => same(b.at, pointed.value!)) || null);
	const glance = computed(() => pointed.value === null ? null : glanceOf(world.value!, selection.value, pointed.value, airMode.value));
	const odds = computed(() => world.value === null || strategic.value || oddsAt.value === null ? null
		: oddsOf(world.value, selection.value, oddsAt.value, airMode.value, oddsTouch.value));
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
		oddsAt.value = null;
		news.value = null;
		refresh();
		//(a command played had a world to start from: with none, no game is playing and the host refuses it)
		if (r.ok) played(cmd, before!, r.result);
		refused.value = "refusal" in r ? reasonOf(r.refusal) : null;
		return refused.value;
	};

	//A command played: what it told over the map, its victories, and why the undo went, which the core doesn't keep (the
	//context menu says it, #316)
	const played = (cmd: Command, before: World, result: Parameters<StoreHost["won"]>[0]) => {
		showStep(before, eventsOf(result), () => host.won(result));
		const loss = undoLoss(before, cmd, world.value!);
		if (loss !== null) lost.value = loss;
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
		oddsAt.value = null;
		if (u !== null) airMode.value = isAir(w!, u);
		refused.value = null;
	};

	//A unit key (M, E, S, R, O, U): the selected unit's action of that key that it can take now, sent as its button
	//sends it; none it can take, the reason of the first in the status line (the same rule and refusal as the button)
	const unitKey = (key: ActionKey) => {
		const action = context.value === null ? undefined : context.value.actions.find((a) => a.key === key);
		if (action === undefined) return;
		if (action.refusal === null) dispatch(action.command);
		else refused.value = action.label + ": " + action.refusal;
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

	//A tap or click closes the odds card; a finger's first tap on a target opens it there instead of attacking (true: the tap
	//did that), its second on the same target goes on to attack
	const firstTap = (w: World, at: Position, touch: boolean): boolean => {
		const open = oddsAt.value !== null && oddsTouch.value && same(oddsAt.value, at);
		oddsAt.value = null;
		if (!touch || open || glanceOf(w, selection.value, at, airMode.value) === null) return false;
		oddsAt.value = at;
		oddsTouch.value = true;
		return true;
	};

	//The unit list and the equipment window (UnitList, Equipment)
	const shops = createShopState({ world, deploying: deployment, selected, select, look: (at) => { lookAt.value = at; }, dispatch });

	//What each menu key does (GameMenu): the rail's buttons, L, N and P, Escape
	const menu: Record<MenuKey, () => void> = {
		inspect: () => { infoShown.value = !infoShown.value; },
		buy: () => shops.toggleShop(),
		hex: () => { hexGrid.value = !hexGrid.value; },
		air: () => toggleAir(),
		zoom: () => { strategic.value = !strategic.value; },
		labels: () => { labels.value = false; },
		next: () => cycle(1),
		previous: () => cycle(-1),
		//Escape deselects the unit; with none, Options
		escape: () => {
			if (oddsAt.value !== null) oddsAt.value = null;
			else if (banner.value) banner.value = false;
			else if (selected.value !== null) select(null);
			else notYet();
		},
	};


	return {
		dispatch,
		world, selected, notes, refused, lookAt, airMode, hover, scale, strategic, side, sideName, turn, prestige, prestigeShown, country, nation,
		date, weather, ground, rules, endTurn, unit, note, hexGrid, infoShown, railOpen, labels, asking, askingText, info, context, lost, hexTip, pins, banner, report, ai, enemy, reportRefusal, toggleAir,
		units, selection, path, fog, support, plaques, overview, deploying, reserve, deployment, ghost, refresh, blocked, blockedAt, glance, odds,
		results, news, motion, showStep, card, ...shops, tray, combatLog, dossier, campaignEnd,

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
		endCampaign(outcome: Outcome, html: string, then: () => void) {
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

		//The unit card opened on the selected unit, or on an equipment entry of a country
		openCard(entry?: { eqid: number, country: number }) {
			cardOpen.value = entry === undefined ? { unit: selected.value, view: null } : entry;
		},

		closeCard,

		//One of the selected unit's views on the card: itself, its transport, its carrier
		viewCard(view: CardView) {
			cardOpen.value = { unit: selected.value, view };
		},

		//The chips and the stamp faded (the status bar's line stays)
		faded: () => {
			results.value = null;
		},

		//A click on a hex of the map: on the strategic map, the map back at its scale centred there; while deploying,
		//the picked unit placed there when it can go there; else the selected unit's attack or move there, sent as the
		//person's command, or the unit there selected (none on an empty hex). touch: a finger's tap, whose first tap
		//on a target opens its odds card and the second attacks (AttackPreview: no attack on the first tap)
		clickHex(at: Position, touch = false) {
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
			if (firstTap(w, at, touch)) return;
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

		//The hex the pointer has rested on, or a finger held, for its tooltip; null: none
		restHex(at: Position | null) {
			rested.value = at;
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

		//The hex under the pointer, null off the map: kept when it is the same hex, so the path isn't computed again. The
		//pointer leaving the target of the odds card it opened closes it
		hoverHex(at: Position | null) {
			const old = hover.value;
			if (old === at || (old !== null && at !== null && old.row === at.row && old.col === at.col)) return;
			hover.value = at;
			if (oddsAt.value !== null && !oddsTouch.value) oddsAt.value = null;
		},

		//The odds card opened on a target the pointer rests on, or Shift held over it; on any other hex nothing
		showOdds(at: Position) {
			const w = world.value;
			if (w === null || glanceOf(w, selection.value, at, airMode.value) === null) return;
			oddsAt.value = { row: at.row, col: at.col };
			oddsTouch.value = false;
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
function eventsOf(result: unknown): GameEvent[] {
	return result !== null && typeof result === "object" && "events" in result ? (result as { events: GameEvent[] }).events : [];
}

const same = (a: Position, b: Position) => a.row === b.row && a.col === b.col;
