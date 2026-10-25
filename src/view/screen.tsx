//The new UI as the game's screen (src/screen.ts, #380): the second implementation of the interface, beside
//the old UI's (src/oldscreen.ts). It reads the game only through the host (its world, src/host.ts) and
//sends the person's commands to it (src/view/store.ts). For now it animates nothing: a program's move or
//attack is played whole, shown at once and its victories told then, and every shown is called at once
//but a message's, which waits for its OK (the tutorial's orders too). The animations from the step's
//events are D2-D4's, the main menu D6's.
import { render } from "preact";
import type { ViewEvent } from "../core/controller";
import type { Position } from "../core/types";
import type { GameHost } from "../host";
import { type Cell, outcomeNames, uiSettings } from "../prototypes";
import type { ScenarioOutcome } from "../scenario";
import type { Screen } from "../screen";
import type { Unit } from "../unit";
import { App } from "./app";
import { setHexGrid } from "./map";
import { createStore } from "./store";
import { applyTheme, type Theme } from "./theme";

const nothing = () => {};

//What the screen asks of the host: the store's, and the course of the game it shows
type ScreenHost = Pick<GameHost, "world" | "command" | "won" | "play" | "holdForMessage" | "messageClosed">;

export function newScreen(host: ScreenHost, root: HTMLElement): Screen {
	const store = createStore(host);
	const { refresh } = store;
	//(the map's scale as the settings saved it, as the old UI applies it at its start, until the Settings window
	//has it, D6)
	store.scale.value = uiSettings.zoomLevel;
	render(<App store={store} />, root);
	const show = (title: string, html: string, ok: () => void, at: Position | null = null) => store.show({ title, html, at, ok });
	//A message the player clicks away: the game waits for it (a program's turn, a campaign's next scenario)
	const holding = (title: string, html: string, then?: () => void) => {
		host.holdForMessage();
		show(title, html, then || (() => host.messageClosed()));
	};
	//A program's move or attack, played whole and shown at once: its victories told, then the next action
	const played = (r: ReturnType<ScreenHost["play"]>, shown: () => void) => {
		refresh();
		if (r.ok) host.won(r.result);
		shown();
	};
	//A new scenario or turn: the last one's pick dropped, the person's reserve to deploy from first (Deployment)
	const deployment = () => {
		store.pick(null);
		store.startDeployment();
	};
	return {
		//The scenario's briefing; a new scenario's units are none selected
		showScenario() {
			store.selected.value = null;
			refresh();
			deployment();
			const w = store.world.value;
			holding(w === null ? "" : w.data.name, w === null ? "" : w.data.description);
		},
		loadFailed(file: string) { show("Error", "Error loading scenario " + file, nothing); },
		showPrototype(eqid: number) {
			const w = host.world();
			const name = w === null || w.equipment[eqid] === undefined ? "a prototype" : w.equipment[eqid].name;
			show("Prototype", "For your brilliant victory you receive " + name + " as a prototype unit.", nothing);
		},
		message: holding,
		campaignEnd(outcome: ScenarioOutcome, text: string, then: () => void) { show(outcomeNames[outcome], text, then); },
		//(the main menu is D6's)
		mainMenu: nothing,
		//(no platform score board on the web: the old UI's OSGlue does nothing there either)
		reportScore: nothing,
		reportAchievement: nothing,

		move(unit: Unit, to: Cell, cells: Cell[], shown: () => void) {
			played(host.play({ type: "move", unit: unit.id, to: { row: to.row, col: to.col }, cells }), shown);
		},
		attack(attacker: Unit, target: Unit, shown: () => void) {
			played(host.play({ type: "attack", unit: attacker.id, target: target.id }), shown);
		},
		view(event: ViewEvent, shown?: () => void) {
			if (event.type === "message") {
				show("Orders", event.text, shown || nothing, event.at);
				return;
			}
			if (event.type === "select") store.selected.value = event.unit;
			else if (event.type === "viewport") store.lookAt.value = event.at;
			//(the main menu is D6's; stuck shows nothing, as in the old game)
			refresh();
			if (shown) shown();
		},
		aiTurnEnded: refresh,
		//The next player's turn: the program's plays after the browser has drawn this one
		turnChanged(next: () => void) {
			refresh();
			deployment();
			setTimeout(next, 0);
		},
		unitsPlaced: refresh,
		//(the alert on the map is D3's)
		reinforced: refresh,
	};
}

//The Theme setting until the Settings window has it (D6): ?theme=paper or blackout, else the system's
function themeOf(search: string): Theme {
	const t = new URLSearchParams(search).get("theme");
	return t === "paper" || t === "blackout" ? t : "system";
}

//?ui=new (src/main.ts): the new UI on the page instead of the old one, which isn't built. The new UI's
//stylesheets and faces loaded, the old UI's stylesheet and markup set aside (nothing reads them without
//the old UI), data-theme set, and the new screen given to the host before the game starts
export function startNewUI(host: GameHost, page: Document = document) {
	void import("./game.css");
	for (const link of page.querySelectorAll<HTMLLinkElement>("link[rel=stylesheet]")) link.disabled = true;
	for (const old of page.body.children) (old as HTMLElement).hidden = true;
	const root = page.createElement("div");
	page.body.append(root);
	applyTheme(themeOf(page.location.search), page.documentElement);
	//(the hex grid as the settings saved it, until the Settings window has it, D6)
	setHexGrid(uiSettings.hexGrid);
	host.screen = newScreen(host, root);
}
