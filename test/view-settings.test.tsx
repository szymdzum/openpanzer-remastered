//The settings window of the new UI (src/view/settings.ts, settingsstate.ts, settingswindow.tsx, #349): the old settings list
//(src/uibuilder.ts buildStartMenu), the same keys in uiSettings, saved on the host
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import { handWorld } from "./coreworld";
import { sliderText, toggleSetting, TOGGLES } from "../src/view/settings";
import { App } from "../src/view/app";
import { createStore } from "../src/view/store";
import { newScreen } from "../src/view/screen";
import { type UISettings, uiSettings } from "../src/prototypes";
import type { GameHost } from "../src/host";
import { GameState } from "../src/gamestate";

let saved: UISettings;
beforeEach(() => { saved = structuredClone(uiSettings); });
afterEach(() => {
	cleanup();
	document.body.innerHTML = "";
	Object.assign(uiSettings, saved);
});

test("A switch flips its setting; the graphics and the device's resolution need a reload, the resolution suggests a scale (#349)", () => {
	const s = structuredClone(uiSettings);
	s.noFOW = false;
	expect([toggleSetting(s, "noFOW", 2), s.noFOW]).toEqual([{ reload: false, scale: null }, true]);
	expect(toggleSetting(s, "hdGraphics", 2)).toEqual({ reload: true, scale: null });
	//(the old window's suggestion: 1.6 for the full resolution at a scale up to 1, 1 back from 1.5 and more)
	Object.assign(s, { useRetina: false, uiScale: 1 });
	expect(toggleSetting(s, "useRetina", 2)).toEqual({ reload: true, scale: 1.6 });
	s.uiScale = 1.6;
	expect(toggleSetting(s, "useRetina", 2)).toEqual({ reload: true, scale: 1 });
	s.uiScale = 1.2;
	expect(toggleSetting(s, "useRetina", 0.5)).toEqual({ reload: true, scale: null });
	expect([sliderText(840), sliderText(1.6000000000000003)]).toEqual(["840", "1.6"]);
});

function settingsOf() {
	const saveSettings = vi.fn(), reload = vi.fn();
	const w = handWorld({ rows: 4, cols: 4, units: [] });
	const world = vi.fn(() => w);
	const store = createStore({ world, command: vi.fn(), won: vi.fn(), saveSettings }, { sound: () => {}, still: () => false, reload });
	store.refresh();
	render(<App store={store} />);
	return { store, saveSettings, reload, world };
}

const open = async (store: ReturnType<typeof settingsOf>["store"]) => {
	await act(() => { store.shortcut({ menu: "options" }); });
	await act(() => { fireEvent.click(screen.getByRole("button", { name: "Settings" })); });
};

test("The settings window has the old list in its order, each switch on its uiSettings key; it opens over the game (#349)", async () => {
	Object.assign(uiSettings, { uiSize: 840, uiScale: 1, zoomLevel: 1, classicRules: false, showHiddenVictoryHexes: true });
	const { store } = settingsOf();
	await open(store);
	expect(document.getElementById("startmenu")).toBeNull();
	const win = screen.getByRole("dialog", { name: "Settings" });
	expect([...win.querySelectorAll(".pm-setting .t")].map((t) => t.textContent)).toEqual(["Interface width (px)", "Interface scale",
		"Game Map scale", "Show terrain with Hex Grid", "Quick combat and move animations", "Mute unit combat sounds", "Disable Fog of War",
		"Zoom to full device resolution", "High resolution map and units", "Mark own units on map", "Mark enemy strength in red",
		"Show optional objectives tooltips", "Show hidden victory hexes", "New games play the classic rules"]);
	expect(within(win).getAllByRole("slider").map((r) => [r.getAttribute("min"), r.getAttribute("max"), r.getAttribute("step"), (r as HTMLInputElement).value]))
		.toEqual([["470", "1920", "10", "840"], ["0.5", "3", "0.1", "1"], ["1", "3", "0.1", "1"]]);
	expect(document.activeElement).toBe(within(win).getAllByRole("slider")[0]);
	expect(within(win).getAllByRole("switch").map((t) => [t.id, t.getAttribute("aria-checked")]))
		.toEqual(TOGGLES.map((t) => [t.key, String(Boolean(uiSettings[t.key]))]));
	//(the label names its switch)
	expect(screen.getByRole("switch", { name: "New games play the classic rules" }).id).toBe("classicRules");
});

test("A switch and a slider change the settings at once; OK saves them and goes back to the start menu (#349)", async () => {
	Object.assign(uiSettings, { noFOW: false, classicRules: false, zoomLevel: 1, uiScale: 1, uiSize: 840 });
	const { store, saveSettings, reload, world } = settingsOf();
	await open(store);
	const reads = world.mock.calls.length;
	await act(() => { fireEvent.click(screen.getByRole("switch", { name: "Disable Fog of War" })); });
	await act(() => { fireEvent.click(screen.getByRole("switch", { name: "New games play the classic rules" })); });
	expect([uiSettings.noFOW, uiSettings.classicRules, screen.getByRole("switch", { name: "Disable Fog of War" }).getAttribute("aria-checked")])
		.toEqual([true, true, "true"]);
	//(the world read again: the fog of war is one of its inputs)
	expect(world.mock.calls.length).toBeGreaterThan(reads);
	const [width, scale, map] = screen.getAllByRole("slider");
	await act(() => { fireEvent.input(map, { target: { value: "1.5" } }); });
	await act(() => { fireEvent.input(scale, { target: { value: "1.2" } }); });
	await act(() => { fireEvent.input(width, { target: { value: "1000" } }); });
	expect([uiSettings.zoomLevel, uiSettings.mapZoom, store.scale.value, uiSettings.uiScale, store.uiScale.value, uiSettings.uiSize, store.uiWidth.value])
		.toEqual([1.5, true, 1.5, 1.2, 1.2, 1000, 1000]);
	expect(screen.getByText("1.5")).not.toBeNull();
	await act(() => { fireEvent.click(screen.getByRole("button", { name: "OK" })); });
	expect([saveSettings.mock.calls.length, reload.mock.calls.length, store.menu.value]).toEqual([1, 0, { window: "main", newGame: false }]);
});

test("The device's resolution suggests a scale, applied at OK with the reload; Esc is OK; the message under it waits (#349)", async () => {
	Object.assign(uiSettings, { useRetina: false, uiScale: 1 });
	const { store, saveSettings, reload } = settingsOf();
	await act(() => { store.show({ title: "Briefing", html: "x", at: null, ok: () => {} }); });
	await open(store);
	expect(document.getElementById("ui-message")).toBeNull();
	await act(() => { fireEvent.click(screen.getByRole("switch", { name: "Zoom to full device resolution" })); });
	//(shown on the slider, applied when the window closes)
	expect([(screen.getAllByRole("slider")[1] as HTMLInputElement).value, uiSettings.uiScale]).toEqual(["1.6", 1]);
	await act(() => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
	expect([uiSettings.uiScale, store.uiScale.value, saveSettings.mock.calls.length, reload.mock.calls.length]).toEqual([1.6, 1.6, 1, 1]);
	//(back to the start menu, the message under it again)
	expect([store.menu.value.window, document.getElementById("ui-message") !== null]).toEqual(["main", true]);
});

test("Without a host to save to nor a page to reload, OK only goes back; the screen puts the interface's scale and width on the page (#349)", async () => {
	const store = createStore({ world: () => null, command: vi.fn(), won: vi.fn() });
	store.startMenu("settings");
	store.toggleSetting("hdGraphics");
	store.closeSettings();
	expect(store.menu.value.window).toBe("main");
	Object.assign(uiSettings, { uiScale: 1.4, uiSize: 960 });
	const root = document.createElement("div");
	document.body.append(root);
	const host = { world: (): null => null, command: vi.fn(), won: vi.fn(), play: vi.fn(), holdForMessage: vi.fn(), messageClosed: vi.fn() };
	await act(() => { newScreen(host as unknown as GameHost, root); });
	const page = document.documentElement.style;
	expect([page.getPropertyValue("--ui-scale"), page.getPropertyValue("--ui-width")]).toEqual(["1.4", "60rem"]);
});

test("Every setting the window changes is one the game's saved settings keep: a change on the new UI holds on the old (#349)", async () => {
	localStorage.clear();
	const { store } = settingsOf();
	await open(store);
	const before = structuredClone(uiSettings);
	for (const t of screen.getAllByRole("switch")) await act(() => { fireEvent.click(t); });
	const [width, scale, map] = screen.getAllByRole("slider");
	await act(() => { fireEvent.input(width, { target: { value: "1200" } }); });
	await act(() => { fireEvent.input(scale, { target: { value: "0.8" } }); });
	await act(() => { fireEvent.input(map, { target: { value: "2" } }); });
	//(the window's OK saves them as the old one did: through the game's state)
	new GameState(null).saveSettings();
	const changed = structuredClone(uiSettings);
	Object.assign(uiSettings, before);
	new GameState(null).restoreSettings();
	const keys = [...TOGGLES.map((t) => t.key), "uiSize", "uiScale", "zoomLevel"] as const;
	expect(keys.map((k) => uiSettings[k])).toEqual(keys.map((k) => changed[k]));
	expect(keys.filter((k) => changed[k] === before[k])).toEqual([]);
	localStorage.clear();
});
