//The save and load window of the new UI (src/view/saveload.ts, saveloadstate.ts, saveloadwindow.tsx, #349): the old
//#smState's file and cloud saves and loads (src/uibuilder.ts buildGameStateMenu, gameStateButton, onCloudSaved), on the
//host, and a game saved to a file and loaded back on a real game state
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import { handWorld } from "./coreworld";
import { fakeMapImages, until } from "./lifecycle";
import { headlessGame } from "./headlessgame";
import { cloudRows, fileName, LOAD_ERROR, rememberCloudSave, saveName } from "../src/view/saveload";
import { StartMenu } from "../src/view/startmenu";
import { createStore } from "../src/view/store";
import { newScreen } from "../src/view/screen";
import { nullScreen } from "../src/nullscreen";
import { GameState, type CloudField } from "../src/gamestate";
import { uiSettings } from "../src/prototypes";
import type { World } from "../src/core/types";

fakeMapImages();
let lastCloudSave: typeof uiSettings.lastCloudSave, isAI: number[];
beforeEach(() => {
	lastCloudSave = uiSettings.lastCloudSave;
	isAI = [...uiSettings.isAI];
});
afterEach(() => {
	cleanup();
	document.body.innerHTML = "";
	uiSettings.lastCloudSave = lastCloudSave;
	uiSettings.isAI = isAI;
	vi.restoreAllMocks();
});

//A world named, on turn 4, in a campaign or not
function worldAt(campaign: boolean): World {
	const w = handWorld({ rows: 4, cols: 4, units: [] });
	return { ...w, data: { ...w.data, name: "Ciechanow" }, state: { ...w.state, turn: { ...w.state.turn, turn: 4 },
		campaign: campaign ? { id: 1 } : null } } as World;
}

test("A save is named as the old window named it; the last three cloud saves are remembered, a known id renamed (#349)", () => {
	expect([saveName(worldAt(true)), saveName(worldAt(false))]).toEqual(["(Campaign) Ciechanow Turn 4", "(Scenario) Ciechanow Turn 4"]);
	const at = new Date(2026, 9, 21, 19, 20, 11);
	expect(fileName(worldAt(true), at)).toBe("(Campaign) Ciechanow Turn 4 " + at.toDateString() + " " + at.toLocaleTimeString() + ".json");
	const a = { name: "a", id: "1" }, b = { name: "b", id: "2" }, c = { name: "c", id: "3" };
	expect(rememberCloudSave([a, b], "c", "3")).toEqual([a, b, c]);
	expect(rememberCloudSave([a, b, c], "d", "4")).toEqual([b, c, { name: "d", id: "4" }]);
	expect(rememberCloudSave([a, b, c], "B", "2")).toEqual([a, { name: "B", id: "2" }, c]);
	expect(cloudRows([a])).toEqual([a, { name: "", id: "" }, { name: "", id: "" }]);
});

function windowOf(world: World | null = worldAt(false)) {
	const host = {
		exportGame: vi.fn(() => "{\"the\":\"game\"}"),
		loadGame: vi.fn<(file: Blob, done: () => void, fail: () => void) => void>(),
		saveToCloud: vi.fn<(field: CloudField, saved: (error: string | null, id?: string) => void) => void>(),
		loadFromCloud: vi.fn<(field: CloudField, done: () => void) => void>(),
		saveSettings: vi.fn(),
	};
	const download = vi.fn();
	const store = createStore({ world: () => world, command: vi.fn(), won: vi.fn(), ...host }, { sound: () => {}, still: () => false, download });
	store.refresh();
	render(<StartMenu store={store} />);
	return { store, host, download };
}

const open = async (store: ReturnType<typeof windowOf>["store"]) => {
	await act(() => { store.shortcut({ menu: "options" }); });
	await act(() => { fireEvent.click(screen.getByRole("button", { name: "Save / Load" })); });
};
const field = () => screen.getByRole("textbox", { name: "Cloud save ID" }) as HTMLInputElement;

test("The window has the old buttons in order, the field the last cloud save's id, the last three saves; OK goes back (#349)", async () => {
	uiSettings.lastCloudSave = [{ name: "(Scenario) Bzura Turn 2", id: "c71d" }, { name: "(Campaign) Danzig Turn 9", id: "3b90" }];
	const { store } = windowOf();
	await open(store);
	const win = screen.getByRole("dialog", { name: "Save / Load" });
	expect(within(win).getAllByRole("button").map((b) => b.textContent || b.getAttribute("aria-label"))).toEqual(["Save to Disk",
		"Load from Disk", "Cloud Save", "Cloud Load", "(Scenario) Bzura Turn 2", "(Campaign) Danzig Turn 9", "Clear the ID", "OK"]);
	expect(document.activeElement!.id).toBe("disksave");
	expect([field().value, document.getElementById("disksaveupdate")!.textContent]).toEqual(["3b90", "none"]);
	//A row puts its id in the field, an empty one clears it
	await act(() => { fireEvent.click(screen.getByRole("button", { name: "(Scenario) Bzura Turn 2" })); });
	expect(field().value).toBe("c71d");
	await act(() => { fireEvent.click(screen.getByRole("button", { name: "Clear the ID" })); });
	expect([field().value, field().placeholder]).toEqual(["", "Enter numeric ID to Load from Cloud"]);
	await act(() => { fireEvent.input(field(), { target: { value: "42" } }); });
	expect(field().value).toBe("42");
	await act(() => { fireEvent.click(screen.getByRole("button", { name: "OK" })); });
	expect(store.menu.value).toEqual({ window: "main", newGame: false });
});

test("Save to Disk downloads the game under the save's name; Load from Disk loads a file, says when it can't, closes the start menu when it did (#349)", async () => {
	const { store, host, download } = windowOf();
	await open(store);
	await act(() => { fireEvent.click(screen.getByRole("button", { name: "Save to Disk" })); });
	const name = download.mock.calls[0][0] as string;
	expect(name.startsWith("(Scenario) Ciechanow Turn 4 ")).toBe(true);
	expect([download.mock.calls[0][1], document.getElementById("disksaveupdate")!.textContent]).toEqual(["{\"the\":\"game\"}", name]);
	//(the button opens the file input, which loads the file picked)
	const input = document.getElementById("diskloadfile") as HTMLInputElement;
	const opened = vi.spyOn(input, "click");
	await act(() => { fireEvent.click(screen.getByRole("button", { name: "Load from Disk" })); });
	expect(opened).toHaveBeenCalledTimes(1);
	const file = new File(["{}"], "save.json");
	await act(() => { fireEvent.change(input, { target: { files: [file] } }); });
	expect(host.loadGame.mock.calls[0][0]).toBe(file);
	await act(() => { host.loadGame.mock.calls[0][2](); });
	expect(screen.getByRole("alert").textContent).toBe(LOAD_ERROR);
	await act(() => { host.loadGame.mock.calls[0][1](); });
	expect([store.menu.value.window, document.getElementById("startmenu")]).toEqual([null, null]);
	//(no file picked: nothing)
	await open(store);
	await act(() => { fireEvent.change(document.getElementById("diskloadfile")!, { target: { files: [] } }); });
	expect(host.loadGame).toHaveBeenCalledTimes(1);
});

test("Cloud Save writes its progress in the field and remembers the save once saved; Cloud Load loads the field's id (#349)", async () => {
	uiSettings.lastCloudSave = [{ name: "a", id: "1" }, { name: "b", id: "2" }, { name: "c", id: "3" }];
	const { store, host } = windowOf(worldAt(true));
	await open(store);
	await act(() => { fireEvent.click(screen.getByRole("button", { name: "Cloud Save" })); });
	const [f, saved] = host.saveToCloud.mock.calls[0];
	//(the game's state reads the id from the field: the last save's)
	expect(f.value).toBe("3");
	//(the game's state writes into the field as it did into the old input)
	await act(() => { f.value = "Overwriting cloud save 3 ..."; });
	expect(field().value).toBe("Overwriting cloud save 3 ...");
	await act(() => { f.value = ""; f.setAttribute("placeholder", "Cannot create save !"); saved("Cannot create save"); });
	expect([field().placeholder, uiSettings.lastCloudSave.length, host.saveSettings.mock.calls.length]).toEqual(["Cannot create save !", 3, 0]);
	await act(() => { saved(null, "4"); });
	expect(uiSettings.lastCloudSave).toEqual([{ name: "b", id: "2" }, { name: "c", id: "3" }, { name: "(Campaign) Ciechanow Turn 4", id: "4" }]);
	expect([host.saveSettings.mock.calls.length, field().value]).toEqual([1, "4"]);
	expect(screen.getByRole("button", { name: "(Campaign) Ciechanow Turn 4" })).not.toBeNull();
	await act(() => { fireEvent.click(screen.getByRole("button", { name: "Cloud Load" })); });
	const [g, done] = host.loadFromCloud.mock.calls[0];
	expect(g).toBe(f);
	await act(() => { done(); });
	expect(store.menu.value.window).toBeNull();
});

test("Without a host or a page, the window's buttons do nothing (the map's and the HUD's tests) (#349)", () => {
	const store = createStore({ world: () => null, command: vi.fn(), won: vi.fn() });
	store.startMenu("saveload");
	store.saveToFile();
	store.saveToCloud();
	store.loadFromCloud();
	store.loadFile(new Blob([]));
	expect(store.saveLoad.value!.lastFile).toBe("none");
});

test("A game saved to a file on the new UI loads back on the game's state, shown again on the new screen (#349)", async () => {
	uiSettings.isAI = [0, 1, 0, 0];
	const g = headlessGame(nullScreen);
	Object.assign(g, { cleanup: (keep?: boolean) => g.host.cleanup(keep), setupGameState: () => g.host.gameLoaded(),
		onScenarioLoadFinished: (intro: string | null, restore: boolean) => g.host.scenarioLoaded(intro, restore) });
	g.state = new GameState(g);
	const root = document.createElement("div");
	document.body.append(root);
	await act(() => { g.host.screen = newScreen(g.host, root); });
	g.host.newScenario("tutorial.xml");
	await until(() => g.gameStarted, "the scenario");
	//(the file's text, from the link the page clicks)
	let text = "";
	vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
		text = decodeURIComponent(this.href.replace("data:application/force-download,", ""));
	});
	await act(() => { fireEvent.click(screen.getByRole("button", { name: "Save / Load" })); });
	await act(() => { fireEvent.click(screen.getByRole("button", { name: "Save to Disk" })); });
	expect(JSON.parse(text)).toEqual(JSON.parse(g.state.exportGameState()));
	const before = g.scenario;
	await act(async () => {
		fireEvent.change(document.querySelector("dialog #diskloadfile")!, { target: { files: [new File([text], "save.json")] } });
		await until(() => g.scenario !== before && g.scenario !== null && g.scenario.isLoaded && g.gameStarted, "the game loaded");
	});
	expect([g.scenario.file, document.querySelector("dialog#smState"), g.state.exportGameState()]).toEqual(["tutorial.xml", null, text]);
	expect(screen.getByRole("dialog").querySelector("h1")!.textContent).toBe(g.host.world()!.data.name);
	localStorage.clear();
}, 60_000);
