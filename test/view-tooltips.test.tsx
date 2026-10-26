//The new UI's tooltips (src/view/hextip.ts, src/view/maptips.tsx, the rail's, Tooltips, #346) on hand-built worlds: the
//hex tooltip with what the terrain does from the rules, the pins over units low on fuel or out of ammo, the rail's
//tooltip with each button's key; in jsdom, the rest that opens the hex tooltip, the long press on touch, L
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { handWorld, type HandUnit } from "./coreworld";
import type { World } from "../src/core/types";
import { terrainType } from "../src/prototypes";
import { hexTipOf, pinsOf } from "../src/view/hextip";
import { hexCentre } from "../src/view/hexgrid";
import { MapView } from "../src/view/map";
import { Rail } from "../src/view/rail";
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

const rows = (w: World, row: number, col: number, unit: number | null = 0) => Object.fromEntries(hexTipOf(w, { row, col }, unit)!.rows);

test("The hex tooltip names the place, its flag and holder, and what its terrain does from the rules (#346)", () => {
	const w = world(), name = w.equipment[PZ_IIA].name;
	expect(hexTipOf(w, { row: 2, col: 2 }, 0)).toEqual({ at: { row: 2, col: 2 }, name: "Janow", nation: "de", line: "City · held by Germany · objective",
		rows: [["Entrenchment", "3 on arrival"], ["Defence", "+4 defending"], ["Move cost", `1 · ${name}, dry`],
			["Resupply", "full, no enemy next to it"]] });
	//a river without a road: the enemy fights better; with one, nothing
	expect(rows(w, 5, 5).Defence).toBe("the enemy +4 attack and defence");
	expect(rows(w, 5, 6).Defence).toBeUndefined();
	//a mountain stops a tank; the ocean can't be entered: no move cost; none without a unit selected
	expect([rows(w, 6, 6)["Move cost"], rows(w, 9, 3)["Move cost"], rows(w, 3, 3, null)["Move cost"], rows(w, 3, 3, 99)["Move cost"]])
		.toEqual([`stops · ${name}, dry`, undefined, undefined, undefined]);
	expect([rows(w, 7, 7).Resupply, rows(w, 8, 8).Resupply, rows(w, 9, 3).Resupply, rows(w, 3, 3).Resupply]).toEqual([
		"full for Germany aircraft; ÷1.3 on the ground", "full for ships; ÷1.3 on the ground", "none: ships take it in a port", "÷1.3, less next to enemies"]);
	//an airfield without a flag
	Object.assign(w.state.map.hexes[77], { flag: -1 });
	expect(rows(w, 7, 7).Resupply).toBe("full for its country's aircraft; ÷1.3 on the ground");
	expect([rows(w, 3, 3).Entrenchment, rows(w, 1, 1).Deploys, rows(w, 3, 3).Deploys]).toEqual(["none", "units of Poland", undefined]);
	expect(hexTipOf(w, { row: 3, col: 3 }, null)).toMatchObject({ name: "Clear", nation: null, line: "Clear" });
	expect([hexTipOf(w, { row: -1, col: 0 }, null), hexTipOf(w, { row: 10, col: 0 }, null)]).toEqual([null, null]);
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

test("The hex tooltip opens once the pointer rests on a hex, and closes when it moves on; its OK closes it (#346)", async () => {
	vi.useFakeTimers();
	const store = mapOf(world());
	await act(() => pointer("mousemove", 2, 2));
	expect(document.getElementById("gameToolTip")).toBeNull();
	await act(() => { vi.advanceTimersByTime(800); });
	const tip = document.getElementById("gameToolTip")!;
	expect([tip.className, tip.getAttribute("role"), tip.querySelector(".hd")!.textContent]).toEqual(["pm-tip", "tooltip", "Janow"]);
	expect([...tip.querySelectorAll("dt")].map((d) => d.textContent)).toEqual(["Entrenchment", "Defence", "Resupply"]);
	await act(() => pointer("mousemove", 3, 3));
	expect(document.getElementById("gameToolTip")).toBeNull();
	await act(() => { vi.advanceTimersByTime(800); });
	await act(() => { fireEvent.click(screen.getByRole("button", { name: "OK" })); });
	expect([document.getElementById("gameToolTip"), store.hexTip.value]).toEqual([null, null]);
	//none on the strategic map
	await act(() => store.restHex({ row: 2, col: 2 }));
	await act(() => store.shortcut({ menu: "zoom" }));
	expect(store.hexTip.value).toBeNull();
});

test("A finger held on a hex opens its tooltip; lifted or moved first, nothing; a mouse press neither (#346)", async () => {
	vi.useFakeTimers();
	const store = mapOf(world());
	await act(() => pointer("pointerdown", 2, 2, { pointerType: "touch" }));
	await act(() => pointer("pointerup", 2, 2));
	await act(() => pointer("pointerdown", 3, 3, { pointerType: "mouse" }));
	await act(() => { vi.advanceTimersByTime(600); });
	expect(store.hexTip.value).toBeNull();
	await act(() => pointer("pointerdown", 2, 2, { pointerType: "touch" }));
	await act(() => { vi.advanceTimersByTime(600); });
	expect(store.hexTip.value!.name).toBe("Janow");
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
	//enabled buttons have no title of their own (the tooltip says it), disabled ones say why
	expect([document.getElementById("zoom")!.hasAttribute("title"), document.getElementById("options")!.title])
		.toEqual([false, "Options: Not in the new UI yet"]);
});
