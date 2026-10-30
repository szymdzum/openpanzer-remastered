//The new UI's game menu (src/view/hud/rail.tsx, GameMenu, #346) in jsdom, on a hand-built world whose host plays the
//person's commands on the core: the rail's buttons as the card has them, every key the old UI reads (the shortcuts,
//src/view/shortcuts.ts), the next and previous unit, and End turn's question while units can still act (#8)
import { afterEach, expect, test } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import { handWorld } from "./coreworld";
import { step } from "../src/core/step";
import { unitById } from "../src/core/world";
import type { World } from "../src/core/types";
import type { Command } from "../src/core/command";
import { EndTurn, EndTurnQuestion, Rail } from "../src/view/hud/rail";
import { shortcutOf } from "../src/view/shortcuts";
import { neighbourUnit, stillToAct } from "../src/view/store/model";
import { unitsToAct } from "../src/view/map/mapview";
import { createStore } from "../src/view/store/store";
import { playerType } from "../src/core/tables";

afterEach(cleanup);

//Two tanks, an aircraft and a gun of the person's (player 0), a Polish infantry far off
const UNITS = [{ eqid: 140, owner: 0, row: 4, col: 3 }, { eqid: 140, owner: 0, row: 5, col: 3 }, { eqid: 159, owner: 0, row: 6, col: 3 },
	{ eqid: 140, owner: 0, row: 7, col: 3 }, { eqid: 273, owner: 1, row: 1, col: 9 }];

function railOf(w: World = handWorld({ rows: 10, cols: 10, units: UNITS }, undefined, { spotSide: 0 })) {
	let now = w;
	const sent: Command[] = [];
	const store = createStore({
		world: () => now,
		command: (cmd) => {
			sent.push(cmd);
			const r = step(now, cmd);
			if ("refusal" in r) return { ok: false, refusal: r.refusal };
			now = r.world;
			return { ok: true, result: null };
		},
		won: () => {},
	});
	store.refresh();
	render(<><Rail store={store} /><EndTurn store={store} /><EndTurnQuestion store={store} /></>);
	return { store, sent, world: () => now };
}

const key = (code: string, more: KeyboardEventInit = {}, on: EventTarget = window) =>
	act(() => { on.dispatchEvent(new KeyboardEvent("keydown", { code, key: code.replace("Key", "").toLowerCase(), bubbles: true, ...more })); });
const button = (id: string) => document.getElementById(id) as HTMLButtonElement;

test("The rail has the game's buttons in the card's groups, each named with its shortcut; Options toggles the start menu (#349)", async () => {
	railOf();
	const groups = [...document.querySelectorAll("#menu .group")].map((g) => [...g.querySelectorAll("button")].map((b) => b.id));
	expect(groups).toEqual([["inspectunit"], ["buy", "hex", "air", "zoom", "options"], ["mainmenu"]]);
	expect(screen.getByRole("navigation", { name: "Game menu" }).id).toBe("menu");
	//(the key in the rail's tooltip, test/view-tooltips.test.tsx, and for screen readers)
	expect(["inspectunit", "hex", "air", "zoom"].map((id) => [button(id).getAttribute("aria-label"), button(id).getAttribute("aria-keyshortcuts")]))
		.toEqual([["Inspect unit", "I"], ["Hex grid", "H"], ["Air layer", "A"], ["Strategic map", "Z"]]);
	expect([button("buy").disabled, button("buy").hasAttribute("title"), button("options").disabled, button("options").getAttribute("aria-keyshortcuts")])
		.toEqual([false, false, false, "Escape"]);
	//Options opens the start menu on its main window and closes it, pressed while it is open
	expect(button("options").getAttribute("aria-pressed")).toBe("false");
	await act(() => { fireEvent.click(button("options")); });
	expect(button("options").getAttribute("aria-pressed")).toBe("true");
	await act(() => { fireEvent.click(button("options")); });
	expect(button("options").getAttribute("aria-pressed")).toBe("false");
	//the toggles say whether they are on; Inspect unit and the fold don't
	expect(["hex", "air", "zoom"].map((id) => button(id).getAttribute("aria-pressed"))).toEqual(["false", "false", "false"]);
	expect(button("inspectunit").hasAttribute("aria-pressed")).toBe(false);
});

test("The rail's toggles show what is on; the fold hides the middle group and says so", async () => {
	const { store } = railOf();
	await act(() => { fireEvent.click(button("hex")); });
	await act(() => { fireEvent.click(button("air")); });
	await act(() => { fireEvent.click(button("zoom")); });
	expect([store.hexGrid.value, store.airMode.value, store.strategic.value]).toEqual([true, true, true]);
	expect(["hex", "air", "zoom"].map((id) => [button(id).getAttribute("aria-pressed"), button(id).className]))
		.toEqual([["true", "pm-btn icon is-on"], ["true", "pm-btn icon is-on"], ["true", "pm-btn icon is-on"]]);
	await act(() => { fireEvent.click(button("inspectunit")); });
	expect(store.infoShown.value).toBe(false);
	const fold = button("mainmenu");
	expect([fold.getAttribute("aria-expanded"), fold.getAttribute("aria-controls"), fold.getAttribute("aria-label"), fold.textContent])
		.toEqual(["true", "slidemenu", "Hide menu", "Less"]);
	await act(() => { fireEvent.click(fold); });
	expect([document.getElementById("slidemenu"), fold.getAttribute("aria-expanded"), fold.getAttribute("aria-label"), fold.textContent])
		.toEqual([null, "false", "Show menu", "More"]);
	expect(document.querySelectorAll("#menu button").length).toBe(2);
});

test("Every key the old UI reads: I, H, A, Z, L and B, by their physical keys; none with a modifier, held, or in a field", async () => {
	const { store } = railOf();
	await key("KeyH");
	await key("KeyA");
	await key("KeyZ");
	await key("KeyI");
	expect([store.hexGrid.value, store.airMode.value, store.strategic.value, store.infoShown.value]).toEqual([true, true, true, false]);
	//L clears the labels over the map until the next turn (removeAllSmallToolTips)
	expect(store.plaques.value).toEqual([]);
	await key("KeyL");
	expect(store.labels.value).toBe(false);
	//B: the equipment window opens, and closes again (#348)
	await key("KeyB");
	expect([store.shop.value !== null, button("buy").getAttribute("aria-pressed")]).toEqual([true, "true"]);
	await key("KeyB");
	expect(store.shop.value).toBeNull();
	await key("KeyH", { ctrlKey: true });
	await key("KeyH", { repeat: true });
	await key("KeyQ");
	const field = document.body.appendChild(document.createElement("input"));
	await key("KeyH", {}, field);
	field.remove();
	expect(store.hexGrid.value).toBe(true);
	//(a French keyboard's A is the KeyQ code: the key the old UI reads is where A is on a US keyboard)
	expect(shortcutOf(new KeyboardEvent("keydown", { code: "KeyQ", key: "a" }))).toBeNull();
	expect(shortcutOf(new KeyboardEvent("keydown", { code: "KeyA", key: "q" }))).toEqual({ menu: "air" });
});

test("Escape deselects the unit; with none selected it is Options; a window that took it keeps it", async () => {
	const { store } = railOf();
	await act(() => { store.clickHex({ row: 4, col: 3 }); });
	expect(store.selected.value).toBe(0);
	await act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
	expect([store.selected.value, store.refused.value]).toEqual([null, null]);
	await act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Esc" })); });
	expect(store.menu.value).toEqual({ window: "main", newGame: false });
	const taken = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
	taken.preventDefault();
	expect(shortcutOf(taken)).toBeNull();
});

test("N and P select the next and previous unit of the player that hasn't moved, round the list, and look at it", async () => {
	const { store, world } = railOf();
	//(no unit selected: nothing)
	await key("KeyN");
	expect(store.selected.value).toBeNull();
	await act(() => { store.clickHex({ row: 4, col: 3 }); });
	await act(() => { store.clickHex({ row: 4, col: 4 }); }); //(the tank moves)
	expect(unitById(world(), 0).hasMoved).toBe(true);
	await key("KeyN");
	expect([store.selected.value, store.lookAt.value]).toEqual([1, { row: 5, col: 3 }]);
	//the aircraft: its layer shown
	await key("KeyN");
	expect([store.selected.value, store.airMode.value]).toEqual([2, true]);
	await key("KeyN");
	await key("KeyN");
	//round the list, past the tank that moved: the selected one is in it, the others that moved aren't
	expect(store.selected.value).toBe(1);
	await key("KeyP");
	expect([store.selected.value, store.airMode.value]).toEqual([3, false]);
	const w = world();
	expect([neighbourUnit(w, 0, 1), neighbourUnit(w, 0, -1), neighbourUnit(w, 4, 1), neighbourUnit(w, 99, 1)]).toEqual([1, 3, 4, 99]);
});

test("The unit keys play the selected unit's action as its button would, and do nothing for an action it doesn't show (#437)", async () => {
	const { store, sent } = railOf();
	await act(() => { store.clickHex({ row: 4, col: 3 }); });
	await act(() => { store.clickHex({ row: 4, col: 4 }); });
	//U takes the move back
	await key("KeyU");
	expect(sent[sent.length - 1]).toEqual({ type: "undo", unit: 0 });
	expect(store.units.value.find((u) => u.id === 0)).toMatchObject({ row: 4, col: 3 });
	//S, R, O, M and E: a full tank has no such button, nothing is sent or said, as the old UI's keys did
	for (const code of ["KeyS", "KeyR", "KeyO", "KeyM", "KeyE"]) await key(code);
	expect([sent.length, store.refused.value]).toEqual([2, null]);
	//No unit selected: nothing
	await act(() => { store.clickHex({ row: 9, col: 9 }); });
	await key("KeyS");
	expect([sent.length, store.refused.value]).toEqual([2, null]);
});

test("End turn asks while units can still move or fire, naming them; Keep playing or Esc plays on, End turn ends it (#8)", async () => {
	const { sent, world } = railOf();
	const end = () => document.querySelector<HTMLButtonElement>("#endturn button")!;
	expect(unitsToAct(world()).map((u) => u.id)).toEqual([0, 1, 2, 3]);
	await act(() => { fireEvent.click(end()); });
	const dialog = screen.getByRole("dialog");
	const name = world().equipment[140].name, air = world().equipment[159].name;
	expect(dialog.querySelector("p")!.textContent).toBe(`4 units can still move or fire: ${name}, ${name}, ${air}, ${name}. End the turn?`);
	await act(() => { fireEvent.click(within(dialog).getByRole("button", { name: "Keep playing" })); });
	expect([screen.queryByRole("dialog"), sent]).toEqual([null, []]);
	await act(() => { fireEvent.click(end()); });
	await act(() => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
	expect([screen.queryByRole("dialog"), sent]).toEqual([null, []]);
	await act(() => { fireEvent.click(end()); });
	await act(() => { fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "End turn" })); });
	expect([screen.queryByRole("dialog"), sent]).toEqual([null, [{ type: "endTurn" }]]);
});

test("On a program's turn End turn is off with its reason and asks nothing", async () => {
	const w = handWorld({ rows: 10, cols: 10, units: UNITS }, undefined, { spotSide: 0 });
	(w.state.players[0] as { type: number }).type = playerType.aiLocal;
	const { store, sent } = railOf(w);
	expect(document.querySelector<HTMLButtonElement>("#endturn button")!.title).toBe("Not your turn");
	await act(() => store.askEndTurn());
	expect([sent, screen.queryByRole("dialog")]).toEqual([[], null]);
});

test("End turn ends at once when no unit can still act; the question counts one unit, or names six and the rest", async () => {
	const done = handWorld({ rows: 10, cols: 10, units: [{ eqid: 140, owner: 0, row: 4, col: 3, hasMoved: true, hasFired: true }] }, undefined,
		{ spotSide: 0 });
	const { sent } = railOf(done);
	await act(() => { fireEvent.click(document.querySelector<HTMLButtonElement>("#endturn button")!); });
	expect(sent).toEqual([{ type: "endTurn" }]);
	expect(stillToAct(["Pz IIA"])).toBe("1 unit can still move or fire: Pz IIA. End the turn?");
	expect(stillToAct(["a", "b", "c", "d", "e", "f", "g", "h"])).toBe("8 units can still move or fire: a, b, c, d, e, f and 2 more. End the turn?");
});

test("A shortcut does nothing while End turn's question, the turn report or the dossier is open (#567)", async () => {
	const w = handWorld({ rows: 10, cols: 10, units: UNITS }, undefined, { spotSide: 0 });
	//(a campaign's state: the dossier is the campaign's)
	const { store, sent } = railOf({ ...w, state: { ...w.state, campaign: { country: w.state.players[0].country } as never } });
	await act(() => { store.clickHex({ row: 4, col: 3 }); });
	const info = store.infoShown.value;
	const windows: [string, () => void, () => void][] = [
		["the question", () => store.askEndTurn(), () => store.answerEndTurn(false)],
		["the turn report", () => store.openLog(), () => store.closeLog()],
		["the dossier", () => store.openDossier(), () => store.closeDossier()],
	];
	for (const [name, open, close] of windows) {
		await act(() => { open(); });
		for (const code of ["KeyU", "KeyS", "KeyH", "KeyA", "KeyZ", "KeyN", "KeyI"]) await key(code);
		expect([name, sent, store.hexGrid.value, store.airMode.value, store.strategic.value, store.selected.value, store.infoShown.value])
			.toEqual([name, [], false, false, false, 0, info]);
		await act(() => { close(); });
	}
});
