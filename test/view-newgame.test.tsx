//The new campaign's and the new scenario's windows (src/view/newgame.ts, newgamestate.ts, newgamewindows.tsx,
//#349): the old start menu's campaign and scenario windows (src/uibuilder.ts buildStartMenu, src/ui.ts startMenuButton, before #351),
//on hand-made lists and on the game's
import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import { handWorld } from "./coreworld";
import { fakeMapImages, until } from "./lifecycle";
import { headlessGame } from "./headlessgame";
import { nullScreen } from "../src/app/nullscreen";
import { newScreen } from "../src/view/screen";
import { campaignAtOpen, campaignRows, campaignView, DIFFICULTY_HELP, scenarioAtOpen, scenarioGroups, scenarioView, settleAI }
	from "../src/view/newgame";
import { StartMenu } from "../src/view/startmenu";
import { createStore } from "../src/view/store";
import { uiSettings } from "../src/app/settings";
import type { World } from "../src/core/types";

fakeMapImages();
const isAI = [...uiSettings.isAI];
afterEach(() => {
	cleanup();
	document.body.innerHTML = "";
	uiSettings.isAI = [...isAI];
});

const CAMPAIGNS: CampaignListEntry[] = [
	{ title: "Fall Weiss", desc: "<b>Poland</b>", file: "a.json", eqp: "eqp-adlerkorps", flag: 7, prestige: 2000, scenarios: 4 },
	{ title: "Big Red One", desc: "Africa", file: "b.json", eqp: "eqp-adlerkorps", flag: 9, prestige: 3150, scenarios: 16 }];
const SCENARIOS: ScenarioListEntry[] = [
	["x.xml", "Loose", "before any header", [{ country: 7, id: 0 }], [{ country: 15, id: 1 }], "eqp-adlerkorps"],
	["Poland"],
	["a.xml", "Ciechanow ", "<i>Herr General</i>", [{ country: 7, id: 0 }], [{ country: 15, id: 1 }, { country: 19, id: 2 }], "eqp-adlerkorps"]];

//A world whose scenario is named, with a campaign of the list's index or none
function worldNamed(name: string, campaign: number | null = null): World {
	const w = handWorld({ rows: 4, cols: 4, units: [] });
	return { ...w, data: { ...w.data, name }, state: { ...w.state, campaign: campaign === null ? null : { ...w.state.campaign!, id: campaign } } } as World;
}

test("A campaign's details are the old window's: its country by the campaign's equipment set, its scenarios and the list's prestige (#349)", () => {
	expect(campaignRows(CAMPAIGNS)).toEqual([{ id: "0", title: "Fall Weiss" }, { id: "1", title: "Big Red One" }]);
	expect(campaignView(CAMPAIGNS, 1)).toEqual({ title: "Big Red One", country: "USA", nation: "us", scenarios: 16, prestige: 3150, description: "Africa" });
	//The one played is picked at the window's opening, else the first
	expect([campaignAtOpen(CAMPAIGNS, null), campaignAtOpen(CAMPAIGNS, worldNamed("x")), campaignAtOpen(CAMPAIGNS, worldNamed("x", 1))]).toEqual([0, 0, 1]);
});

test("The scenarios are grouped under the list's headers; the one played is picked by its name, its players' AI from the settings (#349)", () => {
	expect(scenarioGroups(SCENARIOS)).toEqual([{ rows: [{ id: "0", title: "Loose" }] }, { name: "Poland", rows: [{ id: "2", title: "Ciechanow " }] }]);
	expect([scenarioAtOpen(SCENARIOS, null), scenarioAtOpen(SCENARIOS, worldNamed("Ciechanow")), scenarioAtOpen(SCENARIOS, worldNamed("Nowhere"))])
		.toEqual([null, 2, null]);
	const ai = [0, 2, 0, 3];
	//(a scenario picked makes its players' truthy AI 1, as the old window did: the tutorial's 2)
	settleAI(SCENARIOS, 2, ai);
	expect(ai).toEqual([0, 1, 0, 3]);
	expect(scenarioView(SCENARIOS, 2, ai)).toEqual({ title: "Ciechanow ", description: "<i>Herr General</i>", sides: [
		{ name: "Axis", players: [{ id: 0, country: "Germany", nation: "de", ai: false }] },
		{ name: "Allies", players: [{ id: 1, country: "Poland", nation: "pl", ai: true }, { id: 2, country: "Russia", nation: "su", ai: false }] }] });
});

function menuOf(world: World | null) {
	const host = { startScenario: vi.fn(), startCampaign: vi.fn(), campaignFlow: vi.fn((_i: number, done: (html: string) => void) => done("the flow")) };
	const store = createStore({ world: () => world, command: vi.fn(), won: vi.fn(), ...host });
	store.refresh();
	render(<StartMenu store={store} />);
	return { store, host };
}

//HTML as the page writes it back
const html = (text: string) => Object.assign(document.createElement("div"), { innerHTML: text }).innerHTML;

const open = async (store: ReturnType<typeof menuOf>["store"], button: "newcampaign" | "newscenario") => {
	await act(() => { store.shortcut({ menu: "options" }); });
	await act(() => { fireEvent.click(screen.getByRole("button", { name: "New Game" })); });
	await act(() => { fireEvent.click(document.getElementById(button)!); });
};

test("The campaign window: the campaign played picked, its difficulty Tactical, the help and the flow in the description, Play starts it (#349)", async () => {
	const { store, host } = menuOf(worldNamed("x", 1));
	await open(store, "newcampaign");
	const win = screen.getByRole("dialog", { name: "Campaigns" });
	const picked = within(win).getByRole("radio", { checked: true }) as HTMLInputElement;
	expect([picked.value, document.activeElement]).toEqual(["1", picked]);
	expect(within(win).getAllByRole("radio").length).toBe(campaignlist.length);
	expect(win.querySelector("h2")!.textContent).toBe(campaignlist[1].title);
	expect(document.getElementById("smCampDesc")!.innerHTML).toBe(html(campaignlist[1].desc));
	expect(within(screen.getByRole("group", { name: "Difficulty" })).getAllByRole("button").map((b) => [b.textContent, b.getAttribute("aria-pressed")]))
		.toEqual([["Historical", "false"], ["Tactical", "true"], ["Operational", "false"]]);
	await act(() => { fireEvent.click(screen.getByRole("button", { name: "Difficulty help" })); });
	expect(document.getElementById("smCampDesc")!.innerHTML).toBe(DIFFICULTY_HELP);
	await act(() => { fireEvent.click(screen.getByRole("button", { name: "Campaign flow" })); });
	expect([document.getElementById("smCampDesc")!.textContent, host.campaignFlow.mock.calls[0][0]]).toEqual(["the flow", 1]);
	//Another campaign: its own description again
	await act(() => { fireEvent.click(within(win).getAllByRole("radio")[0]); });
	expect(document.getElementById("smCampDesc")!.innerHTML).toBe(html(campaignlist[0].desc));
	await act(() => { fireEvent.click(screen.getByRole("button", { name: "Operational" })); });
	await act(() => { fireEvent.click(screen.getByRole("button", { name: "Play" })); });
	expect(host.startCampaign.mock.calls).toEqual([[0, 2]]);
	expect(store.menu.value.window).toBeNull();
	//The difficulty stays as it was picked, the next time
	await open(store, "newcampaign");
	expect(screen.getByRole("button", { name: "Operational" }).getAttribute("aria-pressed")).toBe("true");
	await act(() => { fireEvent.click(screen.getByRole("button", { name: "Back" })); });
	expect(store.menu.value).toEqual({ window: "main", newGame: false });
});

test("The scenario window: the scenario played picked, its sides with who the AI plays, Play starts it with its briefing (#349)", async () => {
	uiSettings.isAI = [0, 2, 0, 0];
	const entry = scenariolist.find((e) => e[0] === "tutorial.xml") as Exclude<ScenarioListEntry, [string]>;
	const { store, host } = menuOf(worldNamed(entry[1]));
	await open(store, "newscenario");
	const win = screen.getByRole("dialog", { name: "Scenarios" });
	const picked = within(win).getByRole("radio", { checked: true }) as HTMLInputElement;
	expect([scenariolist[Number(picked.value)][0], document.activeElement]).toEqual(["tutorial.xml", picked]);
	//(the list's headers are its groups)
	expect(within(win).getAllByRole("group")[0].querySelector("legend")!.textContent).toBe(scenariolist[0][0]);
	expect(document.getElementById("smScenDesc")!.innerHTML).toBe(html(entry[2]));
	expect([document.getElementById("smSide0")!.querySelector(".pm-label")!.textContent, document.getElementById("smVS")!.textContent]).toEqual(["Axis", "VS"]);
	//(the tutorial's scripted side shown as the AI's, and made 1)
	expect(uiSettings.isAI.slice(0, 2)).toEqual([0, 1]);
	const ai = within(win).getAllByRole("switch");
	expect(ai.map((t) => t.getAttribute("aria-checked"))).toEqual(["false", "true"]);
	await act(() => { fireEvent.click(ai[0]); });
	await act(() => { fireEvent.click(ai[1]); });
	expect([uiSettings.isAI.slice(0, 2), ai.map((t) => t.getAttribute("aria-checked"))]).toEqual([[1, 0], ["true", "false"]]);
	await act(() => { fireEvent.click(screen.getByRole("button", { name: "Play" })); });
	expect(host.startScenario.mock.calls).toEqual([["tutorial.xml", entry[2], [1, 0, 0, 0]]]);
	expect(store.menu.value.window).toBeNull();
});

test("A scenario the list hasn't picks none: Play waits for one; Esc closes the start menu (#349)", async () => {
	const { store, host } = menuOf(worldNamed("Nowhere"));
	await open(store, "newscenario");
	expect(document.getElementById("smScenDesc")).toBeNull();
	expect((document.getElementById("smSPlayBut") as HTMLButtonElement).title).toBe("Pick a scenario");
	store.playScenario();
	expect(host.startScenario).not.toHaveBeenCalled();
	await act(() => { fireEvent.click(screen.getAllByRole("radio")[1]); });
	expect(document.getElementById("smScenDesc")).not.toBeNull();
	await act(() => { fireEvent.click(screen.getByRole("button", { name: "Back" })); });
	expect(store.menu.value).toEqual({ window: "main", newGame: false });
	await act(() => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
	expect(store.menu.value.window).toBeNull();
});

test("Without the host's new games (the map's and the HUD's tests), the windows' buttons start nothing (#349)", () => {
	const store = createStore({ world: () => null, command: vi.fn(), won: vi.fn() });
	store.startMenu("newcampaign");
	store.campaignFlow();
	store.playCampaign();
	store.startMenu("newscenario");
	store.pickScenario(2);
	store.playScenario();
	expect(store.menu.value.window).toBeNull();
});

test("A scenario and a campaign picked in the start menu start on the game host and show on the new screen (#349)", async () => {
	uiSettings.isAI = [0, 1, 0, 0];
	const g = headlessGame(nullScreen);
	const root = document.createElement("div");
	document.body.append(root);
	await act(() => { g.host.screen = newScreen(g.host, root); });
	g.host.newScenario("tutorial.xml");
	await until(() => g.gameStarted, "the first scenario");
	//(the start menu over the first briefing: a new scenario from it)
	const first = g.scenario;
	await act(() => { fireEvent.click(screen.getByRole("button", { name: "New Game" })); });
	await act(() => { fireEvent.click(screen.getByRole("button", { name: "Scenarios" })); });
	const entry = scenariolist.findIndex((e) => e[0] === "drpzop01.xml");
	await act(() => { fireEvent.click(screen.getByRole("radio", { name: scenariolist[entry][1] })); });
	await act(async () => {
		fireEvent.click(screen.getByRole("button", { name: "Play" }));
		await until(() => g.scenario !== first && g.scenario !== null && g.scenario.isLoaded && g.gameStarted, "the scenario picked");
	});
	expect([g.scenario.file, g.campaign, document.getElementById("startmenu")]).toEqual(["drpzop01.xml", null, null]);
	expect(screen.getByRole("dialog").querySelector("h1")!.textContent).toBe(g.host.world()!.data.name);
	//Options, then a campaign
	const second = g.scenario;
	await act(() => { fireEvent.click(document.getElementById("options")!); });
	await act(() => { fireEvent.click(screen.getByRole("button", { name: "New Game" })); });
	await act(() => { fireEvent.click(screen.getByRole("button", { name: "Campaigns" })); });
	await act(async () => {
		fireEvent.click(screen.getByRole("button", { name: "Play" }));
		await until(() => g.scenario !== second && g.scenario !== null && g.scenario.isLoaded && g.gameStarted, "the campaign's first scenario");
	});
	expect([g.campaign.id, g.campaign.difficulty, g.scenario.file]).toEqual([0, 1, g.campaign.getCampaignData()[0].scenario]);
}, 60_000);
