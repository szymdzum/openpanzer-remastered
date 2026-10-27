//The new UI as the game's screen (src/view/screen.tsx, #380) in jsdom: a scenario played on the game host
//through it, the person's commands sent from its controls, the AI's turn shown, the tutorial's orders
//clicked through; and its signals (src/view/store.ts), which render again only what changed
import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import { fakeMapImages, until } from "./lifecycle";
import { headlessGame } from "./headlessgame";
import { smallGame, smallGameData } from "./smallgame";
import { nullScreen } from "../src/nullscreen";
import { newScreen, startNewUI } from "../src/view/screen";
import { createStore, type StoreHost } from "../src/view/store";
import { prestigeText } from "../src/view/model";
import { worldOf } from "../src/mirror";
import { classicRules } from "../src/core/rules";
import { playerType, uiSettings } from "../src/prototypes";
import type { World } from "../src/core/types";
import type { Command } from "../src/commands";
import { step } from "../src/core/step";
import { handWorld } from "./coreworld";
import type { Game } from "../src/game";
import type { GameHost } from "../src/host";

fakeMapImages();
const isAI = [...uiSettings.isAI];
afterEach(() => {
	cleanup();
	document.body.innerHTML = "";
	uiSettings.isAI = [...isAI];
});

//A scenario started on the host, shown by the new screen in a root of the page
async function playing(file: string, ai: number[], rules: "classic" | "remaster" = "classic"): Promise<Game> {
	uiSettings.isAI = ai;
	const g = headlessGame(nullScreen);
	const root = document.createElement("div");
	document.body.append(root);
	await act(() => { g.host.screen = newScreen(g.host, root); });
	g.rules = rules;
	g.host.newScenario(file);
	await until(() => g.gameStarted, file);
	//(the first scenario opens the start menu over its briefing: the game goes on under it, #349)
	await act(() => { fireEvent.click(continueGame()); });
	return g;
}

const continueGame = () => screen.getByRole("button", { name: "Continue Game" });

//The message's one button: Understood on a briefing, Continue on the other messages (MessageDialog)
const ok = () => screen.getByRole("button", { name: /^(Understood|Continue)$/ });
const endTurn = () => document.querySelector<HTMLButtonElement>("#endturn button")!;
const turnShown = () => document.querySelector(".pm-status .cell")!.textContent;

test("A scenario plays a whole turn on the new screen: the briefing, the person's End turn, the AI's turn, the next turn (#380)", async () => {
	const g = await playing("tutorial.xml", [0, 1, 0, 0]);
	//The briefing holds the game until its OK
	expect(screen.getByRole("dialog").querySelector("h1")!.textContent).toBe(g.host.world()!.data.name);
	expect(g.uiMessageClicked).toBe(false);
	await act(() => { fireEvent.click(ok()); });
	expect([screen.queryByRole("dialog"), g.uiMessageClicked]).toEqual([null, true]);
	expect([turnShown(), document.querySelector(".pm-side")!.textContent]).toEqual(["Turn1/" + g.scenario.maxTurns, "Germany · Axis"]);
	expect(document.querySelector(".pm-prestige")!.textContent).toBe(prestigeText(g.scenario.map.currentPlayer.prestige));
	//The person ends the turn: the AI plays its turn through the host, then the person's next turn starts
	expect(endTurn().hasAttribute("disabled")).toBe(false);
	const ai = g.scenario.map.getPlayers().find((p) => p.side === 1)!;
	expect(ai.playedTurn).toBe(-1);
	await act(() => { fireEvent.click(endTurn()); });
	//(its units can all still act: End turn asks first, #8)
	const question = screen.getByRole("dialog");
	expect(question.querySelector("p")!.textContent).toMatch(/^\d+ units can still move or fire: /);
	await act(() => { fireEvent.click(within(question).getByRole("button", { name: "End turn" })); });
	await act(async () => { await until(() => g.scenario.map.currentPlayer.side === 0 && g.host.world()!.state.turn.turn === 2, "the person's next turn"); });
	expect(ai.playedTurn).toBe(1);
	expect([turnShown(), document.querySelector(".pm-side")!.textContent]).toEqual(["Turn2/" + g.scenario.maxTurns, "Germany · Axis"]);
	//the person's turn starts with its short report and its first ground unit selected (TurnStart, #346)
	expect(screen.getByRole("region", { name: "Turn 2 of " + g.scenario.maxTurns }).id).toBe("combatLog");
	expect(document.querySelector("#unit-info")).not.toBeNull();
	expect(endTurn().hasAttribute("disabled")).toBe(false);
}, 60_000);

test("The tutorial's orders at a hex are shown one by one, each OK playing on to the next (#380)", async () => {
	const g = await playing("tutorial.xml", [2, 2, 0, 0]);
	await act(() => { fireEvent.click(ok()); });
	//The scripted side's first orders: a message each, the program waiting for its OK
	const texts: string[] = [];
	for (let i = 0; i < 3; i++) {
		const dialog = screen.getByRole("dialog");
		expect(dialog.querySelector("h1")!.textContent).toBe("Orders");
		texts.push(dialog.querySelector(".pm-typed")!.textContent);
		expect(g.host.showing).toBe(true);
		await act(() => { fireEvent.click(ok()); });
	}
	expect(new Set(texts).size).toBe(3);
	//A program plays: End turn is off with its reason, and a command is refused by the host
	expect(endTurn().getAttribute("title")).toBe("Not your turn");
	expect(g.host.command({ type: "endTurn" })).toEqual({ ok: false, refusal: { reason: "Not your turn" } });
}, 60_000);

test("The selected unit's actions are sent to the host, and a refusal shows in the status bar (#380)", async () => {
	const g = await playing("tutorial.xml", [0, 1, 0, 0]);
	await act(() => { fireEvent.click(ok()); });
	const unit = g.scenario.map.getUnits().find((u) => u.player.type === playerType.humanLocal)!;
	await act(() => { g.host.screen.view({ type: "select", unit: unit.id }, () => {}); });
	//(the status line tells the hex under the pointer, none here: not the selected unit, #441)
	expect(document.querySelector(".pm-status .msg")!.textContent).toBe("");
	//the status line starts with the air layer while it is on (AirLayer)
	await act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "a", code: "KeyA" })); });
	expect([...document.querySelectorAll(".pm-status .msg b")].map((b) => b.textContent)).toEqual(["Air layer"]);
	await act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "a", code: "KeyA" })); });
	//on the strategic map, how to leave it (StrategicMap)
	const key = (k: string) => act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: k, code: "Key" + k.toUpperCase() })); });
	await key("z");
	//(drawn under the status bar)
	await act(() => new Promise((r) => requestAnimationFrame(() => r(null))));
	expect(document.querySelector(".pm-status .msg")!.textContent).toBe("Strategic mapground layer · click a place to zoom in there");
	await key("a");
	expect(document.querySelector(".pm-status .msg span")!.textContent).toBe("air layer · click a place to zoom in there");
	await key("a");
	await key("z");
	//the unit's context menu docked at the bottom (UnitContext): only actions, each named by its tooltip
	const bar = document.getElementById("unit-context");
	const tips = bar === null ? [] : [...bar.querySelectorAll("button")].map((b) => b.getAttribute("aria-label")!);
	expect(tips.filter((t) => !/^(Mount|Unmount|Embark|Disembark|Supply|Reinforce|Overstrength|Undo move)\b/.test(t))).toEqual([]);
	expect(bar === null || bar.parentElement!.className === "pm-dock").toBe(true);
	//An action the host refuses (sent anyway, as a stale control would): its reason in the status bar
	const store = createStore(g.host);
	await act(() => { store.dispatch({ type: "undo", unit: unit.id }); });
	expect(store.refused.value).toBe("Can't undo");
	g.gameEnded = true;
	expect(g.host.command({ type: "endTurn" })).toEqual({ ok: false, refusal: { reason: "No game is playing" } });
	g.gameEnded = false;
	g.host.holdForMessage();
	expect(g.host.personRefusal()).toEqual({ reason: "Read the message first" });
}, 60_000);

test("The screen shows the host's messages, the campaign's end and the view events, each OK doing what the host asked", async () => {
	const root = document.createElement("div");
	document.body.append(root);
	const host = { world: (): World | null => null, command: vi.fn(), won: vi.fn(), play: vi.fn(() => ({ ok: true, result: null })),
		holdForMessage: vi.fn(), messageClosed: vi.fn() };
	let s: ReturnType<typeof newScreen>;
	await act(() => { s = newScreen(host as unknown as GameHost, root); });
	const then = vi.fn(), shown = vi.fn();
	await act(() => {
		//(a prototype comes first, at a scenario's start)
		s.showPrototype(142);
		s.loadFailed("x.xml");
		s.message("VICTORY", "<b>won</b>");
		s.message("DEFEAT", "lost", then);
		s.campaignEnd("briliant", "the end", then);
		s.view({ type: "message", text: "Look here", at: { row: 1, col: 2 } }, shown);
	});
	const titles: string[] = [];
	for (let i = 0; i < 6; i++) {
		titles.push(screen.getByRole("dialog").querySelector("h1")!.textContent);
		await act(() => { fireEvent.click(ok()); });
	}
	expect(titles).toEqual(["Prototype", "Error", "VICTORY", "DEFEAT", "Brilliant Victory", "Orders"]);
	expect([host.holdForMessage.mock.calls.length, host.messageClosed.mock.calls.length, then.mock.calls.length, shown.mock.calls.length])
		.toEqual([2, 1, 2, 1]);
	//A program's move and attack played by the host and shown at once; the other events shown at once
	const next = vi.fn();
	await act(() => {
		s.move({ id: 1 } as never, { row: 2, col: 3 } as never, [], next);
		s.attack({ id: 1 } as never, { id: 2 } as never, next);
		s.view({ type: "viewport", at: { row: 0, col: 0 } }, next);
		s.view({ type: "mainMenu" });
		s.mainMenu();
		s.aiTurnEnded();
		s.unitsPlaced();
		s.reinforced({ row: 0, col: 0 }, true);
		s.reportScore(1);
		s.reportAchievement("c");
	});
	expect([host.play.mock.calls.map((c) => (c as unknown[])[0]), host.won.mock.calls.length, next.mock.calls.length]).toEqual([
		[{ type: "move", unit: 1, to: { row: 2, col: 3 }, cells: [] }, { type: "attack", unit: 1, target: 2 }], 2, 3]);
	vi.useFakeTimers();
	s.turnChanged(next);
	expect(next).toHaveBeenCalledTimes(3);
	vi.runAllTimers();
	vi.useRealTimers();
	expect(next).toHaveBeenCalledTimes(4);
});

//The world of the small game with the person's prestige given
function smallWorld(prestige: number): World {
	const saved = smallGameData();
	saved.state.players[0].prestige = prestige;
	return worldOf(smallGame(undefined, saved).scenario, null, { spotSide: 0, noFOW: false, rules: classicRules });
}

test("A signal renders again only the components that read what changed: a new prestige leaves the turn's alone (#380)", async () => {
	let w = smallWorld(10);
	const host: StoreHost = { world: () => w, command: () => ({ ok: true, result: null }), won: () => {} };
	const store = createStore(host);
	const turnRenders = vi.fn(), prestigeRenders = vi.fn();
	function Turn() { turnRenders(); return <span>{store.turn.value}</span>; }
	function Prestige() { prestigeRenders(); return <span>{store.prestige.value}</span>; }
	await act(() => { store.refresh(); });
	render(<><Turn /><Prestige /></>);
	w = smallWorld(30);
	await act(() => { store.refresh(); });
	expect([turnRenders.mock.calls.length, prestigeRenders.mock.calls.length]).toEqual([1, 2]);
	expect(document.body.textContent).toBe("1/1030");
	//A refused command leaves its reason, the next one clears it; a close with nothing open does nothing
	const refusing = createStore({ ...host, command: () => ({ ok: false, refusal: { reason: "not enough prestige" } }) });
	expect(refusing.dispatch({ type: "buy", eqid: 1, transport: 0 })).toBe("Not enough prestige");
	expect([store.dispatch({ type: "endTurn" }), store.refused.value]).toEqual([null, null]);
	refusing.close();
	expect(refusing.notes.value).toEqual([]);
});

test("?ui=new: the page's old stylesheet and markup set aside, the new UI's root and theme set, the screen given to the host", async () => {
	document.head.innerHTML = '<link rel="stylesheet" href="/game/css/ui.css">';
	document.body.innerHTML = '<div id="ui-message">old</div>';
	const host = { world: (): World | null => null } as unknown as GameHost;
	vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
	await act(() => { startNewUI(host); });
	expect(document.querySelector<HTMLLinkElement>("link")!.disabled).toBe(true);
	expect(document.getElementById("ui-message")!.hidden).toBe(true);
	expect(document.querySelector(".pm-screen")).not.toBeNull();
	expect(document.documentElement.dataset.theme).toBe("blackout"); //(the system's: dark here)
	vi.unstubAllGlobals();
	expect(typeof host.screen.showScenario).toBe("function");
});

//The map's scale as the settings saved it (the Game map scale, 1x to 3x), until the Settings window has it (D6)
test("The map is drawn at the scale the settings saved (#345)", async () => {
	const zoom = uiSettings.zoomLevel;
	const g = await playing("tutorial.xml", [0, 1, 0, 0]);
	const width = () => parseFloat(document.querySelector<HTMLElement>(".pm-mapview-area")!.style.inlineSize);
	const at1 = width();
	document.body.innerHTML = "";
	uiSettings.zoomLevel = 2;
	const root = document.createElement("div");
	document.body.append(root);
	await act(() => { newScreen(g.host, root).showScenario(); });
	expect(width()).toBe(at1 * 2);
	uiSettings.zoomLevel = zoom;
});

test("A scenario's start drops the briefing of the scenario before: the game stays held under the new one (#405)", async () => {
	const g = await playing("tutorial.xml", [0, 1, 0, 0]);
	const first = g.host.world()!.data.name;
	//The next scenario starts while the first one's briefing is still open (the CLI's "new", a load)
	await act(async () => {
		g.host.newScenario("drpzop01.xml");
		await until(() => g.gameStarted && g.host.world() !== null && g.host.world()!.data.name !== first, "the second scenario");
	});
	const dialogs = screen.getAllByRole("dialog");
	expect(dialogs.map((d) => d.querySelector("h1")!.textContent)).toEqual([g.host.world()!.data.name]);
	expect(g.uiMessageClicked).toBe(false);
	await act(() => { fireEvent.click(ok()); });
	expect([screen.queryByRole("dialog"), g.uiMessageClicked]).toEqual([null, true]);
}, 60_000);

test("A campaign's prototype shown at the scenario's start stays, before the briefing (#405)", async () => {
	const root = document.createElement("div");
	document.body.append(root);
	const host = { world: (): World | null => null, command: vi.fn(), won: vi.fn(), play: vi.fn(), holdForMessage: vi.fn(), messageClosed: vi.fn() };
	let s: ReturnType<typeof newScreen>;
	await act(() => { s = newScreen(host as unknown as GameHost, root); });
	await act(() => {
		s.message("VICTORY", "the scenario before");
		s.showPrototype(142);
		s.showScenario();
	});
	await act(() => { fireEvent.click(continueGame()); });
	const titles: string[] = [];
	while (screen.queryByRole("dialog") !== null) {
		titles.push(screen.getByRole("dialog").querySelector("h1")!.textContent);
		await act(() => { fireEvent.click(ok()); });
	}
	expect(titles).toEqual(["Prototype", ""]);
});

test("A program's attack is animated before its shown: the AI's next action waits for the last beat; reduced motion keeps the pace (#347)", async () => {
	const root = document.createElement("div");
	document.body.append(root);
	let w: World = handWorld({ rows: 10, cols: 10, units: [{ eqid: 140, owner: 0, row: 4, col: 3 }, { eqid: 273, owner: 1, row: 4, col: 4 }] },
		undefined, { spotSide: 0 });
	w = { ...w, state: { ...w.state, rng: { game: 1, ai: 7 } } };
	const host = { world: () => w, command: vi.fn(), won: vi.fn(), holdForMessage: vi.fn(), messageClosed: vi.fn(), cosmetic: vi.fn(() => 0.5),
		play: vi.fn((cmd: Command) => {
			const r = step(w, cmd);
			if ("refusal" in r) return r;
			w = r.world;
			return { ok: true, result: { events: r.events } };
		}) };
	const reduce = vi.fn(() => ({ matches: true }));
	vi.stubGlobal("matchMedia", reduce);
	vi.useFakeTimers();
	let s: ReturnType<typeof newScreen>;
	await act(() => { s = newScreen(host as unknown as GameHost, root); });
	const shown = vi.fn();
	//(the screen shows the world before the attack, as it has after any step)
	await act(() => { s.unitsPlaced(); });
	await act(() => { s.attack({ id: 0 } as never, { id: 1 } as never, shown); });
	expect([shown.mock.calls.length, host.won.mock.calls.length]).toEqual([0, 0]);
	await act(() => { vi.advanceTimersByTime(10000); });
	expect([shown.mock.calls.length, host.won.mock.calls.length, reduce.mock.calls.length > 0, host.cosmetic.mock.calls.length > 0])
		.toEqual([1, 1, true, true]);
	vi.useRealTimers();
	vi.unstubAllGlobals();
});
