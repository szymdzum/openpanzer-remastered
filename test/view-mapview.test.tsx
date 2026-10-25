//The map in the page (src/view/map.tsx, #345), in jsdom, on a store over a hand-built world whose host plays
//the person's commands on the core: the pointer's hex, the path's tag, a click that selects, moves and attacks,
//a refusal in the status line, and the canvas drawn again when what it shows changes
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { deployWorld, handWorld } from "./coreworld";
import { App } from "../src/view/app";
import { step } from "../src/core/step";
import { unitById } from "../src/core/world";
import type { World } from "../src/core/types";
import type { Command } from "../src/commands";
import { MapView, setHexGrid } from "../src/view/map";
import { hexCentre } from "../src/view/hexgrid";
import { createStore, type StoreHost } from "../src/view/store";

//A context that counts what is drawn
let drawn = 0;
beforeEach(() => {
	drawn = 0;
	const ctx = new Proxy({}, { get: (_t, name) => name === "measureText" ? () => ({ width: 10 }) : () => { if (name === "clearRect") drawn++; },
		set: () => true });
	vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
});
afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	setHexGrid(false);
});

const frame = () => act(() => new Promise((r) => requestAnimationFrame(() => r(null))));

//A host that plays the person's commands on the world, refusing what the core refuses
function hostOf(start: World) {
	let w = start;
	const sent: Command[] = [];
	const host: StoreHost = {
		world: () => w,
		command: (cmd) => {
			sent.push(cmd);
			const r = step(w, cmd);
			if ("refusal" in r) return { ok: false, refusal: r.refusal };
			w = r.world;
			return { ok: true, result: null };
		},
		won: () => {},
	};
	return { host, sent, world: () => w };
}

//The pointer on a hex's centre (the scroller at the page's top left, scrolled to look at the side's first unit)
function pointer(type: string, row: number, col: number) {
	const c = hexCentre(row, col), s = document.querySelector<HTMLElement>(".pm-mapview-scroll")!;
	s.dispatchEvent(new MouseEvent(type, { clientX: c.x - s.scrollLeft, clientY: c.y - s.scrollTop, bubbles: true }));
}

async function mapOf(w: World) {
	const h = hostOf(w), store = createStore(h.host);
	store.refresh();
	render(<MapView store={store} />);
	await frame();
	return { ...h, store };
}

test("A click selects a unit, the hovered hex shows the path's tag, a click in the area moves the unit there (#345)", async () => {
	const { store, sent, world } = await mapOf(handWorld({ rows: 10, cols: 10, units: [{ eqid: 140, owner: 0, row: 4, col: 3 },
		{ eqid: 273, owner: 1, row: 4, col: 6 }] }, undefined, { spotSide: 0 }));
	expect(drawn).toBeGreaterThan(0);
	await act(() => pointer("click", 4, 3));
	expect(store.selected.value).toBe(0);
	await act(() => pointer("mousemove", 4, 4));
	expect(document.querySelector(".pm-pathtag output")!.textContent).toBe("4 moves leftfuel 50 → 49 of 50");
	const before = drawn;
	await frame();
	expect(drawn).toBeGreaterThan(before);
	//the stop in the enemy zone: its tag in red
	await act(() => pointer("mousemove", 4, 5));
	expect(document.querySelector(".pm-pathtag")!.classList.contains("stop")).toBe(true);
	await act(() => pointer("click", 4, 4));
	expect(sent).toEqual([{ type: "move", unit: 0, to: { row: 4, col: 4 } }]);
	expect(unitById(world(), 0)).toMatchObject({ row: 4, col: 4, hasMoved: true });
	//off the map: no hex, no tag
	await act(() => pointer("mouseleave", 0, 0));
	expect([store.hover.value, document.querySelector(".pm-pathtag")]).toEqual([null, null]);
	await act(() => pointer("click", -5, -5));
	expect(store.selected.value).toBe(0);
	//the same hex again: the hover kept as it is, the path not computed again
	store.hoverHex({ row: 2, col: 2 });
	const hovered = store.hover.value;
	store.hoverHex({ row: 2, col: 2 });
	expect(store.hover.value).toBe(hovered);
	//an empty hex outside the area: nothing selected
	await act(() => pointer("click", 9, 9));
	expect(store.selected.value).toBeNull();
});

test("A click on a target attacks it through the host; a refused command says why in the status line", async () => {
	const { store, sent, world } = await mapOf(handWorld({ rows: 10, cols: 10, units: [{ eqid: 140, owner: 0, row: 4, col: 3 },
		{ eqid: 273, owner: 1, row: 4, col: 4 }] }, undefined, { spotSide: 0 }));
	await act(() => pointer("click", 4, 3));
	await act(() => pointer("click", 4, 4));
	expect(sent).toEqual([{ type: "attack", unit: 0, target: 1 }]);
	expect(unitById(world(), 0).hasFired).toBe(true);
	expect(store.refused.value).toBeNull();
	//the host refuses (the move's hex taken meanwhile): the reason stays for the status line
	expect(store.dispatch({ type: "move", unit: 0, to: { row: 4, col: 4 } })).toBe("The hex is taken");
	expect(store.refused.value).toBe("The hex is taken");
	await act(() => pointer("click", 9, 9));
	expect(store.refused.value).toBeNull();
});

test("The map looks at the side's first unit when the scenario starts, and at a hex a program looks at", async () => {
	setHexGrid(true);
	const { store } = await mapOf(handWorld({ rows: 30, cols: 30, units: [{ eqid: 140, owner: 0, row: 20, col: 20 }] }, undefined, { spotSide: 0 }));
	const s = document.querySelector<HTMLElement>(".pm-mapview-scroll")!;
	//(jsdom lays nothing out: the scroll is what the map asked for, the screen 0 wide)
	expect([s.scrollLeft, s.scrollTop]).toEqual([hexCentre(20, 20).x, hexCentre(20, 20).y]);
	await act(() => { store.lookAt.value = { row: 2, col: 2 }; });
	expect([s.scrollLeft, s.scrollTop]).toEqual([hexCentre(2, 2).x, hexCentre(2, 2).y]);
	const area = document.querySelector<HTMLElement>(".pm-mapview-area")!;
	expect([area.style.inlineSize, area.style.blockSize]).toEqual([29 * 45 + 15 + "px", 30 * 50 + "px"]);
	await act(() => { store.scale.value = 2; });
	expect(area.style.inlineSize).toBe((29 * 45 + 15) * 2 + "px");
	await act(() => { s.dispatchEvent(new Event("scroll")); });
	await frame();
});

test("No game playing: a click on the map does nothing, the map is empty", async () => {
	const store = createStore({ world: () => null, command: () => ({ ok: false, refusal: { reason: "No game is playing" } }), won: () => {} });
	store.refresh();
	render(<MapView store={store} />);
	await frame();
	store.clickHex({ row: 1, col: 1 });
	expect([store.selected.value, store.units.value, store.selection.value, store.path.value]).toEqual([null, [], null, null]);
	expect(document.querySelector<HTMLElement>(".pm-mapview-area")!.style.inlineSize).toBe("0px");
});

const press = (key: string, more: KeyboardEventInit = {}, on: EventTarget = window) =>
	act(() => { on.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...more })); });

//AirLayer: the A key switches the layer, selecting an aircraft switches it on, a ground unit off; leaving it deselects
//an aircraft, which would be underneath
test("The air layer: A switches it, a selected aircraft switches it on and a tank off, leaving it deselects the aircraft", async () => {
	const { store } = await mapOf(handWorld({ rows: 10, cols: 10, units: [{ eqid: 140, owner: 0, row: 4, col: 3 },
		{ eqid: 159, owner: 0, row: 6, col: 3 }] }, undefined, { spotSide: 0 }));
	await press("a");
	expect(store.airMode.value).toBe(true);
	await press("A");
	expect(store.airMode.value).toBe(false);
	//(not with a modifier, nor while a field takes the typing)
	await press("a", { ctrlKey: true });
	const field = document.body.appendChild(document.createElement("input"));
	await press("a", {}, field);
	await press("x");
	expect(store.airMode.value).toBe(false);
	field.remove();
	await act(() => pointer("click", 6, 3));
	expect([store.selected.value, store.airMode.value]).toEqual([1, true]);
	expect(store.units.value.find((u) => u.id === 1)).toMatchObject({ lifted: true, dim: false });
	//leaving the layer deselects the aircraft (a click on the tank would move the aircraft over it)
	await press("a");
	expect([store.selected.value, store.airMode.value]).toEqual([null, false]);
	await press("a");
	await act(() => pointer("click", 4, 3));
	expect([store.selected.value, store.airMode.value]).toEqual([0, false]);
	//a tank selected stays selected in the air layer
	await press("a");
	expect([store.selected.value, store.airMode.value]).toEqual([0, true]);
});

//StrategicMap: Z fits the whole map to the window under the status bar; a click there zooms back in, centred on its hex
test("The strategic map: Z opens it, the pointer shows no path there, a click zooms back in centred on the hex clicked", async () => {
	const { store } = await mapOf(handWorld({ rows: 20, cols: 20, units: [{ eqid: 140, owner: 0, row: 4, col: 3 }] }, undefined, { spotSide: 0 }));
	const s = document.querySelector<HTMLElement>(".pm-mapview-scroll")!;
	Object.defineProperty(s, "clientWidth", { value: 1000 });
	Object.defineProperty(s, "clientHeight", { value: 600 });
	await act(() => { store.selected.value = 0; });
	await press("z");
	expect(store.strategic.value).toBe(true);
	expect(document.querySelector(".pm-mapview")!.classList.contains("strategic")).toBe(true);
	await frame();
	//the map (19 * 45 + 15 by 20 * 50) fit to 1000 by 600: its height fills the screen, centred across
	const scale = 600 / 1000, left = (1000 - 870 * scale) / 2;
	const at = (row: number, col: number) => ({ clientX: hexCentre(row, col).x * scale + left, clientY: hexCentre(row, col).y * scale });
	await act(() => { s.dispatchEvent(new MouseEvent("mousemove", { ...at(4, 4), bubbles: true })); });
	expect([store.hover.value, store.path.value, document.querySelector(".pm-pathtag")]).toEqual([{ row: 4, col: 4 }, null, null]);
	expect(store.overview.value!.chips).toHaveLength(1);
	await act(() => { s.dispatchEvent(new MouseEvent("click", { ...at(15, 12), bubbles: true })); });
	expect([store.strategic.value, store.lookAt.value, store.selected.value]).toEqual([false, { row: 15, col: 12 }, 0]);
	expect([s.scrollLeft, s.scrollTop]).toEqual([hexCentre(15, 12).x - 500, hexCentre(15, 12).y - 300]);
	//Z again opens and closes it, the scroll kept
	await press("z");
	await press("z");
	expect([store.strategic.value, s.scrollLeft]).toEqual([false, hexCentre(15, 12).x - 500]);
});

//Deployment: the first reserve unit picked at the start, the map on the zone; the tag over a free hex; a click places it
//through the host and picks the next; the reserve picker until the tray (D5): another unit, Done, Deploy again
test("Deploying: the first reserve unit picked, its tag on a free hex, a click places it and picks the next", async () => {
	const h = hostOf(deployWorld()), store = createStore(h.host);
	store.refresh();
	render(<App store={store} />);
	await act(() => store.startDeployment());
	expect([store.deploying.value, store.lookAt.value]).toEqual([1, { row: 1, col: 1 }]);
	const msg = () => document.querySelector(".pm-status .msg")!.textContent;
	expect(msg()).toBe("DeployInfanterie · click a brass hex to place it · 2 in reserve");
	const s = document.querySelector<HTMLElement>(".pm-mapview-scroll")!;
	s.scrollLeft = s.scrollTop = 0;
	//(the fighter picked in the reserve, then the infantry again)
	await act(() => { fireEvent.click(screen.getByRole("radio", { name: /Me-109E-3/ })); });
	expect(store.deploying.value).toBe(2);
	await act(() => { fireEvent.click(screen.getByRole("radio", { name: /Infanterie/ })); });
	await act(() => pointer("mousemove", 2, 1));
	expect(document.querySelector(".pm-placetag")!.textContent).toBe("Place Infanterie" + "can't go back to the reserve");
	//the taken hex: no tag, and a click there selects nothing while deploying (no move area drawn)
	await act(() => pointer("mousemove", 1, 2));
	expect(document.querySelector(".pm-placetag")).toBeNull();
	await act(() => pointer("click", 2, 1));
	expect(h.sent).toEqual([{ type: "deploy", index: 1, to: { row: 2, col: 1 } }]);
	expect(store.deploying.value).toBe(2);
	//the picker: the fighter picked, then the infantry's gone; Done ends deploying, Deploy starts it again
	const rows = () => [...document.querySelectorAll(".pm-reserve .pm-row")].map((r) => r.textContent);
	expect(rows()).toEqual(["Me-109E-3 10"]);
	await act(() => { fireEvent.click(screen.getByRole("button", { name: "Done" })); });
	expect([store.deploying.value, store.deployment.value]).toEqual([null, null]);
	await act(() => pointer("click", 1, 2));
	expect(store.selected.value).toBe(0);
	expect(store.selection.value!.area.length).toBeGreaterThan(0);
	await act(() => { fireEvent.click(screen.getByRole("button", { name: /Deploy · 1 in reserve/ })); });
	expect([store.deploying.value, store.selected.value, store.selection.value]).toEqual([2, null, null]);
	await act(() => { fireEvent.click(screen.getByRole("radio", { name: /Me-109E-3/ })); });
	await act(() => pointer("click", 1, 2));
	expect(h.sent[1]).toEqual({ type: "deploy", index: 2, to: { row: 1, col: 2 } });
	//the reserve empty: deploying ends, the picker goes
	expect([store.deploying.value, document.querySelector(".pm-reserve")]).toEqual([null, null]);
	await act(() => store.startDeployment());
	expect(store.deploying.value).toBeNull();
	//the host refuses the placement (a message to read first): the unit stays picked, the reason in the status line
	const refusing = createStore({ ...hostOf(deployWorld()).host, command: () => ({ ok: false, refusal: { reason: "read the message first" } }) });
	refusing.refresh();
	refusing.startDeployment();
	refusing.clickHex({ row: 2, col: 1 });
	expect([refusing.deploying.value, refusing.refused.value]).toEqual([1, "Read the message first"]);
	//a side with no deployment hex: the unit picked, nowhere to look at
	const nowhere = deployWorld();
	for (const hex of nowhere.data.hexes) hex.deployment = -1;
	const lost = createStore(hostOf(nowhere).host);
	lost.refresh();
	lost.startDeployment();
	expect([lost.deploying.value, lost.deployment.value!.zone, lost.lookAt.value]).toEqual([1, [], null]);
});

//A map smaller than the screen is centred in it, as the old UI centres it: the pointer finds the hexes there
test("A map smaller than the screen sits in its middle, and a click finds the hex under it", async () => {
	const { store } = await mapOf(handWorld({ rows: 10, cols: 10, units: [{ eqid: 140, owner: 0, row: 4, col: 3 }] }, undefined, { spotSide: 0 }));
	const s = document.querySelector<HTMLElement>(".pm-mapview-scroll")!;
	Object.defineProperty(s, "clientWidth", { value: 2000 });
	Object.defineProperty(s, "clientHeight", { value: 1000 });
	s.scrollLeft = s.scrollTop = 0;
	await act(() => { s.dispatchEvent(new Event("scroll")); });
	await frame();
	const width = 9 * 45 + 15, height = 500, left = (2000 - width) / 2, top = (1000 - height) / 2;
	const c = hexCentre(4, 3);
	await act(() => { s.dispatchEvent(new MouseEvent("click", { clientX: c.x + left, clientY: c.y + top, bubbles: true })); });
	expect(store.selected.value).toBe(0);
	//the tag is placed on the screen where the path ends
	await act(() => { s.dispatchEvent(new MouseEvent("mousemove", { clientX: hexCentre(4, 4).x + left, clientY: hexCentre(4, 4).y + top, bubbles: true })); });
	expect(document.querySelector(".pm-pathtag")).not.toBeNull();
});
