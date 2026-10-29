//The new UI's unit context menu (src/view/store/context.ts, src/view/components/contextmenu.tsx, UnitContext, #437) on hand-built worlds
//whose host plays the person's commands on the core: the actions the old UI's #unit-context showed, by its rules and in
//its order, and only those; what each gives in its tooltip; the menu in jsdom, docked at the bottom over the unit info
import { afterEach, expect, test } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { handWorld, type HandUnit } from "./coreworld";
import { costPerStrength } from "../src/core/costs";
import { step } from "../src/core/step";
import type { World } from "../src/core/types";
import { unitById } from "../src/core/world";
import type { Command } from "../src/core/command";
import { OVERSTRENGTH_PENALTY, playerType, terrainType } from "../src/core/tables";
import { App } from "../src/view/app";
import { contextOf } from "../src/view/store/context";
import { createStore } from "../src/view/store/store";

afterEach(cleanup);

const PZ_IIA = 140, TP7 = 273, ME_109 = 159, LEFH18 = 92, SDKFZ7 = 2403, INFANTERIE = 115, NAVAL = 546, AIR = 176, ZERSTORER = 129;

//A Pz IIA at 6 strength, 2 ammo and 20 fuel at 4,4 (in a city when city), Polish tanks on the hexes given, the
//German player's prestige
function tankAt(enemies: [number, number][], city: boolean, prestige = 1000, tank: Partial<HandUnit> = {}): World {
	const w = handWorld({ rows: 10, cols: 10, terrain: (r, c) => city && r === 4 && c === 4 ? terrainType.City : terrainType.Clear,
		units: [{ eqid: PZ_IIA, owner: 0, row: 4, col: 4, strength: 6, ammo: 2, fuel: 20, ...tank },
			...enemies.map(([row, col]) => ({ eqid: TP7, owner: 1, row, col }))] }, undefined, { spotSide: 0 });
	(w.state.players[0] as { prestige: number }).prestige = prestige;
	return w;
}

//The menu's actions: [label, tooltip]
const menu = (w: World, id = 0) => contextOf(w, id)!.actions.map((a) => [a.label, a.tip]);
const labels = (w: World, id = 0) => contextOf(w, id)!.actions.map((a) => a.label);

test("The menu holds only the actions the unit can take now, what each gives in its tooltip (#437)", () => {
	const w = tankAt([], true), e = w.equipment[PZ_IIA], per = costPerStrength(w, unitById(w, 0));
	expect(menu(w)).toEqual([["Supply", `Supply: +${e.ammo - 2} ammo, +${e.fuel - 20} fuel`],
		["Reinforce", `Reinforce: +4 for ${4 * per} prestige`]]);
	//outside a city, next to an enemy: what the divisions leave
	const ammo = Math.round((e.ammo - 2) / 1.3 / 1.5), fuel = Math.round((e.fuel - 20) / 1.3 / 1.5);
	expect(menu(tankAt([[3, 4]], false))).toEqual([["Supply", `Supply: +${ammo} ammo, +${fuel} fuel`],
		["Reinforce", `Reinforce: +2 for ${2 * per} prestige`]]);
});

test("Reinforce shows with the prestige for one point, as the old menu asked, and says when it pays for part (#437)", () => {
	const per = costPerStrength(tankAt([], true), unitById(tankAt([], true), 0));
	expect(menu(tankAt([], true, per + 1))[1]).toEqual(["Reinforce", `Reinforce: +1 of 4 for ${per} prestige`]);
	expect(labels(tankAt([], true, per - 1))).toEqual(["Supply"]);
	//three enemies round a unit one point short: the point is divided away, the button stays with nothing to promise
	expect(menu(tankAt([[3, 4], [5, 4], [4, 5]], false, 1000, { strength: 9 }))[1]).toEqual(["Reinforce", "Reinforce"]);
});

test("A full unit with experience shows Overstrength, at its penalty; full of supply, no Supply (#437)", () => {
	const w = tankAt([], true, 1000, { strength: 10, experience: 200 });
	(w.state.units[0] as { ammo: number; fuel: number }).ammo = w.equipment[PZ_IIA].ammo;
	(w.state.units[0] as { ammo: number; fuel: number }).fuel = w.equipment[PZ_IIA].fuel;
	const per = Math.round(costPerStrength(w, unitById(w, 0)) * OVERSTRENGTH_PENALTY);
	expect(menu(w)).toEqual([["Overstrength", `Overstrength: +2 for ${2 * per} prestige`]]);
	expect(labels(tankAt([], true, 1000, { strength: 10 }))).toEqual(["Supply"]); //(no experience bar)
	expect(labels(tankAt([], true, 1000, { strength: 12, experience: 200 }))).toEqual(["Supply"]);
});

test("After a move the menu has only Undo, naming the hex it goes back to (#437)", () => {
	const moved = step(tankAt([], false), { type: "move", unit: 0, to: { row: 4, col: 6 } });
	expect(moved.ok).toBe(true);
	const w = moved.ok ? moved.world : null;
	expect(menu(w!)).toEqual([["Undo move", "Undo move: back to 4,4"]]);
	//after a resupply: nothing left
	const supplied = step(tankAt([], true), { type: "resupply", unit: 0 });
	expect(supplied.ok && labels(supplied.world)).toEqual([]);
	//another unit's move is the last one: no Undo
	expect(labels(tankAt([], false, 1000, { hasMoved: true, hasOverstrength: true }))).toEqual([]);
});

test("Mount or Unmount names the transport, before a move only; an aircraft away from an airfield, a ship at sea get nothing (#437)", () => {
	const w = handWorld({ rows: 10, cols: 10, terrain: (r) => r > 7 ? terrainType.Ocean : terrainType.Clear, units: [
		{ eqid: LEFH18, owner: 0, row: 4, col: 3, transport: { eqid: SDKFZ7, ammo: 0, fuel: 40 } },
		{ eqid: LEFH18, owner: 0, row: 5, col: 3, isMounted: true, transport: { eqid: SDKFZ7, ammo: 0, fuel: 40 } },
		{ eqid: ME_109, owner: 0, row: 2, col: 2, strength: 6, ammo: 1 },
		{ eqid: ZERSTORER, owner: 0, row: 9, col: 5, strength: 6, ammo: 3 },
		{ eqid: INFANTERIE, owner: 0, row: 9, col: 1, carrier: NAVAL },
		{ eqid: LEFH18, owner: 0, row: 3, col: 7, hasMoved: true, transport: { eqid: SDKFZ7, ammo: 0, fuel: 40 } },
	] }, undefined, { spotSide: 0 });
	const tractor = w.equipment[SDKFZ7].name;
	expect(contextOf(w, 0)!.actions[0]).toMatchObject({ label: "Mount", tip: "Mount: on " + tractor, command: { type: "mount", unit: 0 } });
	expect(contextOf(w, 1)!.actions[0]).toMatchObject({ label: "Unmount", tip: "Unmount: from " + tractor, command: { type: "unmount", unit: 1 } });
	expect(labels(w, 5)).not.toContain("Mount");
	expect([labels(w, 2), labels(w, 3)]).toEqual([[], []]);
	//aboard a ship far out at sea: nowhere to land, no Disembark
	expect(labels(w, 4)).toEqual([]);
});

test("Embark names the kind of transport the unit gets at a port or an airfield; aboard an aircraft, Disembark (#437)", () => {
	const w = handWorld({ rows: 8, cols: 8, terrain: (r, c) => r === 2 && c === 2 ? terrainType.Port : r === 5 && c === 5 ? terrainType.Airfield
		: terrainType.Clear, units: [{ eqid: INFANTERIE, owner: 0, row: 2, col: 2 }, { eqid: INFANTERIE, owner: 0, row: 5, col: 5 },
		{ eqid: INFANTERIE, owner: 0, row: 1, col: 6, carrier: AIR }] }, undefined, { spotSide: 0 });
	Object.assign(w.state.players[0], { navalTransports: 1, airTransports: 1 });
	(w.state.equipment as { indexes: object }).indexes = { 8: { unitclass: { 18: [NAVAL], 13: [AIR] } } };
	expect(contextOf(w, 0)!.actions[0]).toMatchObject({ label: "Embark", tip: "Embark: naval transport", command: { type: "embark", unit: 0 } });
	expect(contextOf(w, 1)!.actions[0].tip).toBe("Embark: air transport");
	expect(contextOf(w, 2)!.actions[0]).toMatchObject({ label: "Disembark", tip: "Disembark: air transport", command: { type: "disembark", unit: 2 } });
});

test("No menu for an enemy unit, on a program's turn, or for a unit off the map", () => {
	const w = tankAt([[3, 4]], true);
	expect([contextOf(w, 1), contextOf(w, 99)]).toEqual([null, null]);
	(w.state.players[0] as { type: number }).type = playerType.aiLocal;
	expect(contextOf(w, 0)).toBeNull();
});

//The screen on a store whose host plays the person's commands on the core, the tank selected
function screenOf(w: World) {
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
	store.pickUnit(0);
	render(<App store={store} />);
	return { store, sent };
}

const buttons = () => [...document.querySelectorAll<HTMLButtonElement>("#unit-context button")];

test("The menu is docked over the unit info, a row of icon buttons named by their tooltips; a click plays it (#437)", async () => {
	const w = tankAt([[3, 4]], false, 1000);
	const { sent } = screenOf(w);
	const bar = screen.getByRole("toolbar", { name: "Unit actions" });
	expect([bar.id, bar.parentElement!.className, bar.nextElementSibling!.id]).toEqual(["unit-context", "pm-dock", "unit-info"]);
	const per = costPerStrength(w, unitById(w, 0));
	expect(buttons().map((b) => [b.textContent, b.title === b.getAttribute("aria-label"), b.getAttribute("aria-keyshortcuts")]))
		.toEqual([["", true, "S"], ["", true, "R"]]);
	expect(buttons()[1].title).toBe(`Reinforce: +2 for ${2 * per} prestige`);
	await act(() => { fireEvent.click(buttons()[1]); });
	expect(sent).toEqual([{ type: "reinforce", unit: 0 }]);
	//reinforced: nothing left to do, no menu
	expect(document.getElementById("unit-context")).toBeNull();
});

test("A unit key plays its action when the menu shows it, and does nothing when it doesn't, as the old keys did (#437)", async () => {
	const { store, sent } = screenOf(tankAt([], true, 1000));
	await act(() => store.shortcut({ unit: "undo" }));
	expect([sent, store.refused.value]).toEqual([[], null]);
	await act(() => store.shortcut({ unit: "resupply" }));
	expect(sent).toEqual([{ type: "resupply", unit: 0 }]);
	//none on the strategic map, nor with no unit selected
	await act(() => store.shortcut({ menu: "zoom" }));
	expect(document.getElementById("unit-context")).toBeNull();
	await act(() => store.shortcut({ menu: "zoom" }));
	await act(() => { store.pickUnit(null); });
	expect(document.getElementById("unit-context")).toBeNull();
});

test("The tooltip's actions are the menu's own: each comes with the command it plays", () => {
	expect(contextOf(tankAt([], true), 0)!.actions.map((a) => [a.key, a.command.type, a.icon]))
		.toEqual([["resupply", "resupply", "resupply"], ["reinforce", "reinforce", "reinforce"]]);
});
