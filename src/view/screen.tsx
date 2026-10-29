//The UI as the game's screen (src/app/screen.ts), beside the one that shows nothing (src/app/nullscreen.ts). It reads
//the game through the host (src/app/host.ts) and sends the person's commands to the store. Every shown is called at
//once but a program's step's (when its last beat ends, so its turn plays at a pace to follow) and a message's (at its
//OK, the tutorial's orders too).
import { render } from "preact";
import { effect } from "@preact/signals";
import type { ViewEvent } from "../core/controller";
import type { GameEvent } from "../core/events";
import type { Position } from "../core/types";
import type { GameHost } from "../app/host";
import type { ScenarioOutcome } from "../core/types";
import type { Screen, ShownCommand } from "../app/screen";
import type { Executed } from "../legacy/commands";
import type { CommandType } from "../core/command";
import { App } from "./app";
import { pageSounds } from "./player";
import { createStore } from "./store/store";
import { eventsOf } from "./store/storestep";
import { applyTheme, type Theme } from "./theme";

const nothing = () => {};

//What the screen asks of the host: the store's, and the course of the game it shows
type ScreenHost = Pick<GameHost, "world" | "command" | "won" | "holdForMessage" | "messageClosed" | "cosmetic" | "startTutorial"
	| "startScenario" | "startCampaign" | "campaignFlow" | "saveSettings" | "exportGame" | "loadGame" | "saveToCloud" | "loadFromCloud">;

//prefers-reduced-motion, asked at each step: the map moves nothing then (src/view/player.ts)
const still = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

//A saved game downloaded as a file: a link to its text, clicked
function downloadOn(page: Document) {
	return (name: string, text: string) => {
		const link = page.createElement("a");
		link.download = name;
		link.href = "data:application/force-download," + encodeURIComponent(text);
		link.click();
	};
}

export function newScreen(host: ScreenHost, root: HTMLElement): Screen {
	const store = createStore(host, { sound: pageSounds(), still, reload: location.reload.bind(location), download: downloadOn(root.ownerDocument) });
	const { refresh } = store;
	//The interface's scale and width as the settings say, on the page's root: every rem scales from its font size, and the
	//windows sized by the interface width take it (base.css, screen.css)
	effect(() => {
		const page = root.ownerDocument.documentElement.style;
		page.setProperty("--ui-scale", String(store.uiScale.value));
		page.setProperty("--ui-width", store.uiWidth.value / 16 + "rem");
	});
	render(<App store={store} />, root);
	const show = (title: string, html: string, ok: () => void, at: Position | null = null, briefing = false) =>
		store.show({ title, html, at, ok, briefing });
	//A message the player clicks away: the game waits for it (a program's turn, a campaign's next scenario); a briefing
	//is the full window (MessageDialog)
	const holding = (title: string, html: string, then?: () => void, briefing = false) => {
		host.holdForMessage();
		show(title, html, then || (() => host.messageClosed()), null, briefing);
	};
	//A program's move or attack, played whole by the host: what it did to the side shown kept for the turn report (its
	//events), then animated from the world before it (the store's, not read again yet), then the host goes on (its
	//victories, the next action)
	const played = (events: GameEvent[], shown: () => void) => {
		const before = store.world.value;
		refresh();
		store.noteEnemy(events);
		store.showStep(before, events, shown);
	};
	//A new scenario or turn: the last one's pick dropped, the person's reserve to deploy from first (Deployment), the
	//labels over the map back (L cleared them for the turn)
	const deployment = () => {
		store.pick(null);
		store.startDeployment();
		store.showLabels(true);
	};
	//A scenario's start, its prototype then its briefing: what the screen still showed of the scenario before goes,
	//its OKs not run, so a stale briefing's OK can't let a program play under the new one (#405). The prototype
	//shown first is the new scenario's own
	let starting = false;
	//As the original (reference/src/game.js): the first scenario's start opens the start menu over its briefing
	let first = true;
	const startScenario = () => {
		if (!starting) store.clear();
		starting = true;
	};
	return {
		//The scenario's briefing; a new scenario's units are none selected
		showScenario() {
			startScenario();
			starting = false;
			store.pickUnit(null);
			refresh();
			deployment();
			const w = store.world.value;
			holding(w === null ? "" : w.data.name, w === null ? "" : w.data.description, undefined, true);
			if (first) store.shortcut({ menu: "options" });
			first = false;
		},
		loadFailed(file: string) { show("Error", "Error loading scenario " + file, nothing); },
		showPrototype(eqid: number) {
			startScenario();
			const w = host.world();
			const name = w === null || w.equipment[eqid] === undefined ? "a prototype" : w.equipment[eqid].name;
			show("Prototype", "For your brilliant victory you receive " + name + " as a prototype unit.", nothing);
		},
		message(title: string, text: string, then?: () => void) { holding(title, text, then); },
		campaignEnd(outcome: ScenarioOutcome, text: string, then: () => void) { store.endCampaign(outcome, text, then); },
		//(Options: the start menu opens, or closes when it is open)
		mainMenu() { store.shortcut({ menu: "options" }); },
		//(no platform score board on the web: the original's OSGlue.generic does nothing there either)
		reportScore: nothing,
		reportAchievement: nothing,

		step(_cmd: ShownCommand, done: Executed<CommandType>, shown: () => void) {
			played(eventsOf(done.ok ? done.result : null), shown);
		},
		view(event: ViewEvent, shown?: () => void) {
			if (event.type === "message") {
				show("Orders", event.text, shown || nothing, event.at);
				return;
			}
			if (event.type === "select") store.pickUnit(event.unit);
			else if (event.type === "viewport") store.look(event.at);
			//(the main menu button folds or opens the rail; stuck shows nothing)
			else if (event.type === "mainMenu") store.toggleRail();
			refresh();
			if (shown) shown();
		},
		//A step whose beats still play, the program's or the person's: the host's turn loop, the harness and the command-line
		//player wait on it
		showingStep: () => store.showing.value,
		aiTurnEnded: refresh,
		//The next player's turn: the program's plays after the browser has drawn this one
		turnChanged(next: () => void) {
			refresh();
			deployment();
			store.startTurn();
			setTimeout(next, 0);
		},
		unitsPlaced: refresh,
		reinforced: refresh,
		//(the turn report's resupplies and reinforcements)
		turnEvents(events: GameEvent[]) { store.logTurn(events); },
	};
}

//The Theme: ?theme=paper or blackout, else the system's
function themeOf(search: string): Theme {
	const t = new URLSearchParams(search).get("theme");
	return t === "paper" || t === "blackout" ? t : "system";
}

//The UI on the page: its stylesheets and faces loaded, its root added, data-theme set, and the screen given to the host
//before the game starts
export function startNewUI(host: GameHost, page: Document = document) {
	void import("./game.css");
	const root = page.createElement("div");
	page.body.append(root);
	applyTheme(themeOf(page.location.search), page.documentElement);
	host.screen = newScreen(host, root);
}
