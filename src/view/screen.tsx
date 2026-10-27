//The UI as the game's screen (src/screen.ts, #380), beside the one that shows nothing (src/nullscreen.ts). It
//reads the game only through the host (its world, src/host.ts) and sends the person's commands to it (src/view/store.ts). A program's move or attack is played whole, then
//animated from its events (#347, src/view/beats.ts), its results and victories told when the last beat
//ends, and its shown called then: the program's turn plays at a pace the person can follow. Every other
//shown is called at once but a message's, which waits for its OK (the tutorial's orders too). The start menu opens over
//the first scenario's briefing and at a game's end, as the old UI's did (#349).
import { render } from "preact";
import { effect } from "@preact/signals";
import type { ViewEvent } from "../core/controller";
import type { GameEvent } from "../core/events";
import type { Position, UnitId } from "../core/types";
import type { GameHost } from "../host";
import type { ScenarioOutcome } from "../scenario";
import type { Screen } from "../screen";
import { App } from "./app";
import { pageSounds } from "./player";
import { createStore } from "./store";
import { applyTheme, type Theme } from "./theme";

const nothing = () => {};

//What the screen asks of the host: the store's, and the course of the game it shows
type ScreenHost = Pick<GameHost, "world" | "command" | "won" | "play" | "holdForMessage" | "messageClosed" | "cosmetic" | "startTutorial"
	| "startScenario" | "startCampaign" | "campaignFlow" | "saveSettings" | "exportGame" | "loadGame" | "saveToCloud" | "loadFromCloud">;

//prefers-reduced-motion, asked at each step: the map moves nothing then (src/view/player.ts)
const still = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

//A saved game downloaded as a file, as the old window did: a link to its text, clicked
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
	//windows the old interface width sized take it (base.css, screen.css)
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
	//A program's move or attack, played whole: what it did to the side shown kept for the turn report (its events),
	//then animated, its victories told, then the next action
	const played = (r: ReturnType<ScreenHost["play"]>, events: GameEvent[], shown: () => void) => {
		const before = store.world.value;
		refresh();
		store.noteEnemy(events);
		store.showStep(before, events, () => {
			if (r.ok) host.won(r.result);
			shown();
		});
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
	//the first scenario's start opens the start menu over its briefing, as the old UI's first did when it built itself
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
		//(Options, as the old UI's: the start menu opens, or closes when it is open)
		mainMenu() { store.shortcut({ menu: "options" }); },
		//(no platform score board on the web: the old UI's OSGlue did nothing there either)
		reportScore: nothing,
		reportAchievement: nothing,

		move(unit: UnitId, to: Position, cells: Position[], shown: () => void) {
			const r = host.play({ type: "move", unit, to: { row: to.row, col: to.col }, cells });
			played(r, r.ok && r.result !== null ? r.result.events : [], shown);
		},
		attack(attacker: UnitId, target: UnitId, shown: () => void) {
			const r = host.play({ type: "attack", unit: attacker, target });
			played(r, r.ok && r.result !== null ? r.result.events : [], shown);
		},
		view(event: ViewEvent, shown?: () => void) {
			if (event.type === "message") {
				show("Orders", event.text, shown || nothing, event.at);
				return;
			}
			if (event.type === "select") store.pickUnit(event.unit);
			else if (event.type === "viewport") store.look(event.at);
			//(the old UI's main menu button folds or opens the rail; stuck shows nothing, as in the old game)
			else if (event.type === "mainMenu") store.toggleRail();
			refresh();
			if (shown) shown();
		},
		//A step whose beats still play, the program's or the person's: the host's turn loop, the harness and the command-line
		//player wait on it (#459)
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
		//(the alert on the map is D3's)
		reinforced: refresh,
		//(the turn report's resupplies and reinforcements)
		turnEvents(events: GameEvent[]) { store.logTurn(events); },
	};
}

//The Theme (?theme=paper or blackout, else the system's): the card's Settings has it, the old list doesn't, so it waits
//for after the switch (#349)
function themeOf(search: string): Theme {
	const t = new URLSearchParams(search).get("theme");
	return t === "paper" || t === "blackout" ? t : "system";
}

//The UI on the page (src/main.ts, #351): its stylesheets and faces loaded, its root added, data-theme set, and the
//screen given to the host before the game starts
export function startNewUI(host: GameHost, page: Document = document) {
	void import("./game.css");
	const root = page.createElement("div");
	page.body.append(root);
	applyTheme(themeOf(page.location.search), page.documentElement);
	host.screen = newScreen(host, root);
}
