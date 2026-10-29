//The new UI's tooltips (src/view/hextip.ts, src/view/maptips.tsx, the rail's, Tooltips, #346) on hand-built worlds: the
//hex under the pointer told in the status line as the old #locmsg (#441), the pins over units low on fuel or out of
//ammo, the rail's tooltip with each button's key; in jsdom, no tooltip over the map however long the pointer rests, L
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/preact";
import { handWorld, type HandUnit } from "./coreworld";
import type { World } from "../src/core/types";
import { terrainType } from "../src/core/tables";
import { locationOf, pinsOf } from "../src/view/hextip";
import { hexCentre } from "../src/view/hexgrid";
import { MapView } from "../src/view/map";
import { Rail } from "../src/view/rail";
import { StatusBar } from "../src/view/statusbar";
import { createStore } from "../src/view/store";

beforeEach(() => {
	vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(new Proxy({}, { get: (_t, name) =>
		name === "measureText" ? () => ({ width: 10 }) : () => {}, set: () => true }) as unknown as CanvasRenderingContext2D);
});
afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.useRealTimers();
});

const PZ_IIA = 140, TP7 = 273;

//A 10 x 10 map: a city at 2,2 named Janow, held by Germany with its flag, an objective; a river at 5,5, one with a road
//at 5,6; a mountain at 6,6; an airfield at 7,7 with the German flag; a port at 8,8; the ocean on row 9; a Polish
//deployment hex at 1,1. units: the Pz IIA's state and the others
function world(units: HandUnit[] = [{ eqid: PZ_IIA, owner: 0, row: 4, col: 4 }]): World {
	const places: Record<string, number> = { "2,2": terrainType.City, "5,5": terrainType.River, "5,6": terrainType.River, "6,6": terrainType.Mountain,
		"7,7": terrainType.Airfield, "8,8": terrainType.Port };
	const terrain = (r: number, c: number) => places[r + "," + c] ?? (r === 9 ? terrainType.Ocean : terrainType.Clear);
	const w = handWorld({ rows: 10, cols: 10, terrain, road: (r, c) => r === 5 && c === 6 ? 1 : 0, units }, undefined, { spotSide: 0 });
	Object.assign(w.data.hexes[22], { name: "Janow" });
	Object.assign(w.state.map.hexes[22], { owner: 0, flag: 7, victorySide: 1 });
	Object.assign(w.state.map.hexes[77], { flag: 7 });
	Object.assign(w.data.hexes[11], { deployment: 1 });
	return w;
}

test("The status line tells the hex under the pointer as the old #locmsg: the unit the side sees, the place, the transports, the terrain and road (#441)", () => {
	const w = world([{ eqid: PZ_IIA, owner: 0, row: 2, col: 2 }, { eqid: TP7, owner: 1, row: 8, col: 1 }]), name = w.equipment[PZ_IIA].name;
	expect(locationOf(w, { row: 2, col: 2 }, false)).toEqual({ unit: name, text: "Janow · City (2,2)" });
	expect(locationOf(w, { row: 5, col: 6 }, false)).toEqual({ unit: null, text: "River/Road (5,6)" });
	//the current player's transports where they board
	Object.assign(w.state.players[0], { airTransports: 2, navalTransports: 1 });
	expect([locationOf(w, { row: 7, col: 7 }, false)!.text, locationOf(w, { row: 8, col: 8 }, false)!.text])
		.toEqual(["Air transports: 2 · Airfield (7,7)", "Naval transports: 1 · Port (8,8)"]);
	//the enemy in the fog isn't named; off the map, nothing
	expect(locationOf(w, { row: 8, col: 1 }, false)!.unit).toBeNull();
	expect([locationOf(w, { row: -1, col: 0 }, false), locationOf(w, { row: 10, col: 0 }, false)]).toEqual([null, null]);
});

test("Pins: Low fuel below a quarter of the tank, No ammo with none left, over the side playing's units only (#346)", () => {
	const w = world([{ eqid: PZ_IIA, owner: 0, row: 4, col: 4, fuel: 12, ammo: 0 }, { eqid: PZ_IIA, owner: 0, row: 4, col: 6, fuel: 13 },
		{ eqid: TP7, owner: 1, row: 1, col: 9, fuel: 0, ammo: 0 }]);
	const fuel = w.equipment[PZ_IIA].fuel;
	expect(fuel / 4).toBeGreaterThan(12);
	expect(pinsOf(w)).toEqual([{ unit: 0, row: 4, col: 4, icon: "fuel", word: "Low fuel", tone: "low" },
		{ unit: 0, row: 4, col: 4, icon: "ammo", word: "No ammo", tone: "critical" }].concat(fuel / 4 > 13
		? [{ unit: 1, row: 4, col: 6, icon: "fuel", word: "Low fuel", tone: "low" }] : []));
	//on the other side's turn, none
	(w.state.turn as { currentPlayer: number }).currentPlayer = 1;
	expect(pinsOf(w)).toEqual([]);
});

//The map over the world, at the page's top left, the scroller unscrolled
function mapOf(w: World) {
	const store = createStore({ world: () => w, command: () => ({ ok: true, result: null }), won: () => {} });
	store.refresh();
	render(<MapView store={store} />);
	return store;
}

function pointer(type: string, row: number, col: number, more: object = {}) {
	const c = hexCentre(row, col), s = document.querySelector<HTMLElement>(".pm-mapview-scroll")!;
	const Make = (type.startsWith("pointer") ? PointerEvent : MouseEvent) as typeof MouseEvent;
	s.dispatchEvent(new Make(type, { clientX: c.x - s.scrollLeft, clientY: c.y - s.scrollTop, bubbles: true, ...more }));
}

test("No tooltip opens over the map, however long the pointer rests or a finger holds; the status line tells the hex (#441)", async () => {
	vi.useFakeTimers();
	const store = mapOf(world());
	render(<StatusBar store={store} />);
	await act(() => pointer("mousemove", 2, 2));
	await act(() => pointer("pointerdown", 2, 2, { pointerType: "touch" }));
	await act(() => { vi.advanceTimersByTime(2000); });
	expect(document.getElementById("gameToolTip")).toBeNull();
	expect(document.querySelector(".pm-status .msg")!.textContent).toBe("Janow · City (2,2)");
	await act(() => pointer("mousemove", 4, 4));
	expect(document.querySelector(".pm-status .msg b")!.textContent).toBe(store.world.value!.equipment[PZ_IIA].name);
	//on the strategic map, how to leave it instead
	await act(() => store.shortcut({ menu: "zoom" }));
	expect(store.located.value).toBeNull();
});

test("The pins stand over their units on the map, a second over the first; L clears them until the next turn (#346)", async () => {
	const store = mapOf(world([{ eqid: PZ_IIA, owner: 0, row: 4, col: 4, fuel: 1, ammo: 0 }]));
	const pins = () => [...document.querySelectorAll(".pm-mapview > .pm-pin")].map((p) => [p.className, p.textContent]);
	expect(pins()).toEqual([["pm-pin low", "Low fuel"], ["pm-pin critical second", "No ammo"]]);
	const c = hexCentre(4, 4), first = document.querySelector<HTMLElement>(".pm-pin")!;
	expect([first.style.left, first.style.top]).toEqual([c.x + "px", c.y - 25 + "px"]);
	await act(() => store.shortcut({ menu: "labels" }));
	expect(pins()).toEqual([]);
});

test("The rail's tooltip shows a button's label and key beside it on hover or focus, none for a key-less one (#346)", async () => {
	const store = createStore({ world: () => world(), command: () => ({ ok: true, result: null }), won: () => {} });
	store.refresh();
	render(<Rail store={store} />);
	const tip = () => document.getElementById("uiToolTip");
	await act(() => { fireEvent.mouseEnter(document.getElementById("zoom")!); });
	expect([tip()!.textContent, tip()!.className, tip()!.getAttribute("role")]).toEqual(["Strategic map Z", "pm-tip right pm-railtip", "tooltip"]);
	await act(() => { fireEvent.mouseLeave(document.getElementById("zoom")!); });
	expect(tip()).toBeNull();
	await act(() => { fireEvent.focus(document.getElementById("mainmenu")!); });
	expect(tip()!.textContent).toBe("Hide menu");
	await act(() => { fireEvent.blur(document.getElementById("mainmenu")!); });
	//enabled buttons have no title of their own: the tooltip says it
	expect([document.getElementById("zoom")!.hasAttribute("title"), document.getElementById("options")!.hasAttribute("title")])
		.toEqual([false, false]);
});
