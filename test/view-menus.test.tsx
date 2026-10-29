//The start menu (src/view/menus.ts, src/view/startmenu.tsx, #349): its windows switched as the old start
//menu's buttons switch them (src/ui.ts startMenuButton, mainMenuButton "options", before #351), its main window with the old
//entries, and the screen opening it over the first scenario's briefing and at a game's end
import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import { handWorld } from "./coreworld";
import { MENU_CLOSED, menuAfter, menuToggled, type MenuState } from "../src/view/menus";
import { StartMenu } from "../src/view/startmenu";
import { createStore } from "../src/view/store";
import { newScreen } from "../src/view/screen";
import { VERSION } from "../src/app/settings";
import type { World } from "../src/core/types";
import type { GameHost } from "../src/app/host";

afterEach(() => {
	cleanup();
	document.body.innerHTML = "";
});

test("The start menu's windows follow the old start menu's buttons: New Game's panel, a window each, back to the game (#349)", () => {
	const main: MenuState = { window: "main", newGame: false };
	expect(menuToggled(MENU_CLOSED)).toEqual(main);
	const panel = menuAfter(main, "newgame");
	expect(panel).toEqual({ window: "main", newGame: true });
	//(each window closes the New Game panel)
	expect((["newcampaign", "newscenario", "saveload", "settings"] as const).map((b) => menuAfter(panel, b)))
		.toEqual(["campaign", "scenario", "saveload", "settings"].map((window) => ({ window, newGame: false })));
	//Continue Game and the tutorial close the start menu; the panel stays open for the next time, as the old one did
	expect([menuAfter(panel, "continuegame"), menuAfter(panel, "tutorial")]).toEqual([{ window: null, newGame: true }, { window: null, newGame: true }]);
	expect(menuToggled({ window: null, newGame: true })).toEqual({ window: "main", newGame: true });
	//Options closes it from any of its windows
	expect(menuToggled({ window: "campaign", newGame: false })).toEqual(MENU_CLOSED);
});

function menuOf(world: World | null = handWorld({ rows: 4, cols: 4, units: [] })) {
	const startTutorial = vi.fn();
	const store = createStore({ world: () => world, command: vi.fn(), won: vi.fn(), startTutorial });
	store.refresh();
	render(<StartMenu store={store} />);
	return { store, startTutorial };
}

const names = (el: HTMLElement) => within(el).getAllByRole("button").map((b) => b.textContent);

test("The main window has the old start menu's entries in its order, its version, links and credits; the focus on its first entry (#349)", async () => {
	const { store } = menuOf();
	expect(document.getElementById("startmenu")).toBeNull();
	await act(() => { store.shortcut({ menu: "options" }); });
	const main = screen.getByRole("dialog", { name: "Panzer Marshal" });
	expect(main.id).toBe("smMain");
	expect(names(screen.getByRole("navigation", { name: "Start menu" }))).toEqual(["New Game", "Settings", "Save / Load", "Continue Game"]);
	expect(document.activeElement!.id).toBe("newgame");
	expect(document.getElementById("smLogoText")!.textContent).toBe("version " + VERSION);
	expect(within(main).getAllByRole("link").map((a) => [a.getAttribute("aria-label"), a.getAttribute("href"), a.getAttribute("target")])).toEqual([
		["Manual", "https://nicupavel.github.io/openpanzer-manual/", "_blank"],
		["Panzer Marshal on itch.io", "https://openpanzer.itch.io/panzermarshal", "_blank"],
		["Panzer Marshal on Facebook", "https://www.facebook.com/panzermarshal/", "_blank"],
		["Issues on GitHub", "https://github.com/nicupavel/openpanzer/issues", "_blank"]]);
	expect(document.getElementById("smCredits")!.textContent).toBe("Copyright Nicu Pavel");
	//(the six photographs of the old slideshow behind it)
	expect(document.querySelectorAll("#startmenu > .pm-photo").length).toBe(6);
	//Every entry is on
	expect(within(main).getAllByRole("button").filter((b) => (b as HTMLButtonElement).disabled)).toEqual([]);
});

test("New Game opens the panel of Campaigns, Scenarios and Tutorial, each with the old hint; the tutorial starts on the host (#349)", async () => {
	const { store, startTutorial } = menuOf();
	await act(() => { store.shortcut({ menu: "options" }); });
	expect(screen.queryByRole("navigation", { name: "New Game" })).toBeNull();
	await act(() => { fireEvent.click(screen.getByRole("button", { name: "New Game" })); });
	const panel = screen.getByRole("navigation", { name: "New Game" });
	expect(names(panel)).toEqual(["Campaigns", "Scenarios", "Tutorial"]);
	expect(document.activeElement!.id).toBe("newcampaign");
	expect((document.getElementById("tutorial") as HTMLButtonElement).title).toBe("Learn the basic mechanics of the game. First turns are automatically played by the computer but later the control is given to the player.");
	expect(document.getElementById("newcampaign")!.title).toMatch(/^Lead your troops to victory over multiple scenarios\./);
	await act(() => { fireEvent.click(screen.getByRole("button", { name: "Tutorial" })); });
	expect([startTutorial.mock.calls.length, document.getElementById("startmenu")]).toEqual([1, null]);
});

test("Continue Game and Esc close the start menu, back to the game (#349)", async () => {
	const { store } = menuOf();
	await act(() => { store.shortcut({ menu: "options" }); });
	await act(() => { fireEvent.click(screen.getByRole("button", { name: "Continue Game" })); });
	expect(document.getElementById("startmenu")).toBeNull();
	await act(() => { store.shortcut({ menu: "options" }); });
	const esc = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
	await act(() => { document.dispatchEvent(esc); });
	expect([document.getElementById("startmenu"), esc.defaultPrevented]).toEqual([null, true]);
	expect(store.menu.value.window).toBeNull();
});

test("The screen opens the start menu over the first scenario's briefing only, and at a game's end; the old main menu event folds the rail (#349)", async () => {
	const root = document.createElement("div");
	document.body.append(root);
	const w = handWorld({ rows: 4, cols: 4, units: [] });
	const host = { world: () => w, command: vi.fn(), won: vi.fn(), play: vi.fn(), holdForMessage: vi.fn(), messageClosed: vi.fn() };
	let s: ReturnType<typeof newScreen>;
	await act(() => { s = newScreen(host as unknown as GameHost, root); });
	await act(() => { s.showScenario(); });
	//(the briefing under it)
	expect([document.getElementById("smMain") !== null, document.getElementById("ui-message") !== null]).toEqual([true, true]);
	await act(() => { fireEvent.click(screen.getByRole("button", { name: "Continue Game" })); });
	await act(() => { fireEvent.click(screen.getByRole("button", { name: "Understood" })); });
	await act(() => { s.showScenario(); });
	expect(document.getElementById("startmenu")).toBeNull();
	await act(() => { s.mainMenu(); });
	expect(document.getElementById("smMain")).not.toBeNull();
	expect(document.getElementById("slidemenu")).not.toBeNull();
	await act(() => { s.view({ type: "mainMenu" }); });
	expect(document.getElementById("slidemenu")).toBeNull();
});
