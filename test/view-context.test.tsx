//The new UI's unit context menu (src/view/context.ts, src/view/contextmenu.tsx, UnitContext and SupplyRules, #346) on
//hand-built worlds whose host plays the person's commands on the core: what Supply and Reinforce will give and cost,
//computed by the core's functions; every action that can't be taken in place, with why, the undo's included (#316);
//the arithmetic in the tooltip; the menu in jsdom
import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { handWorld, type HandUnit } from "./coreworld";
import { costPerStrength } from "../src/core/costs";
import { step } from "../src/core/step";
import type { World } from "../src/core/types";
import { unitById } from "../src/core/world";
import type { Command } from "../src/commands";
import { OVERSTRENGTH_PENALTY, playerType, terrainType } from "../src/prototypes";
import { type ContextAction, contextOf, type UndoLoss, undoLoss } from "../src/view/context";
import { UnitContextMenu } from "../src/view/contextmenu";
import { createStore } from "../src/view/store";

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

//The menu's actions by label: [line, cost, refusal]
function menu(w: World, id = 0, lost: UndoLoss | null = null) {
	const m = contextOf(w, id, lost)!;
	return Object.fromEntries(m.actions.map((a) => [a.label, [a.line, a.cost, a.refusal]]));
}
const action = (w: World, label: string, id = 0) => contextOf(w, id, null)!.actions.find((a) => a.label === label)!;

test("In a city with no enemy next to it Supply and Reinforce give everything missing, at the price of its points (#346)", () => {
	const w = tankAt([], true), e = w.equipment[PZ_IIA], per = costPerStrength(w, unitById(w, 0));
	expect(menu(w)).toEqual({
		"Supply": [`+${e.ammo - 2} ammo · +${e.fuel - 20} fuel`, undefined, null],
		"Reinforce": ["+4", 4 * per, null],
		"Undo move": ["", undefined, "not moved"],
	});
	//no division applies: no best case to point at
	expect(action(w, "Reinforce").tip).toEqual({ title: "Reinforce " + e.name, alt: null, warn: "Ends this unit's turn: no move or attack after.",
		rows: [{ label: "Missing", value: "4" }, { label: "Gets", value: "+4 → 10/10", tone: "tot" },
			{ label: `Cost, ${per} a point`, value: String(4 * per), tone: "prestige" },
			{ label: "Also refills", value: `+${e.ammo - 2} ammo, +${e.fuel - 20} fuel` }] });
	expect(contextOf(w, 0, null)!.at).toEqual({ row: 4, col: 4 });
});

test("Outside a city and next to an enemy, each division is a line of the tooltip, with the best case (#346)", () => {
	const w = tankAt([[3, 4]], false), e = w.equipment[PZ_IIA], per = costPerStrength(w, unitById(w, 0));
	const supply = action(w, "Supply"), reinforce = action(w, "Reinforce");
	const ammo = Math.round((e.ammo - 2) / 1.3 / 1.5), fuel = Math.round((e.fuel - 20) / 1.3 / 1.5);
	expect([supply.line, reinforce.line, reinforce.cost]).toEqual([`+${ammo} ammo · +${fuel} fuel`, "+2", 2 * per]);
	expect(supply.tip!.rows).toEqual([{ label: "Missing", value: `${e.ammo - 2} ammo, ${e.fuel - 20} fuel` },
		{ label: "Outside a city", value: "÷1.3" }, { label: "Next to 1 enemy", value: "÷1.5" }, { label: "Gets", value: `+${ammo} ammo, +${fuel} fuel`, tone: "tot" }]);
	expect(supply.tip!.alt).toBe(`In a city with no enemy next to it: +${e.ammo - 2} ammo, +${e.fuel - 20} fuel.`);
	expect(reinforce.tip!.alt).toBe(`In a city with no enemy next to it: +4 for ${4 * per}.`);
	expect(action(tankAt([[3, 4], [5, 4], [4, 5]], false), "Supply").tip!.rows[2]).toEqual({ label: "Next to 3 enemies", value: "÷3" });
});

test("Reinforce says what the prestige buys: part of it in low, or what one point needs (#346)", () => {
	const per = costPerStrength(tankAt([], true), unitById(tankAt([], true), 0));
	const part = action(tankAt([], true, per + 1), "Reinforce");
	expect([part.line, part.cost, part.partial, part.refusal]).toEqual(["+1 of 4", per, true, null]);
	expect(action(tankAt([], true, per - 1), "Reinforce").refusal).toBe("needs " + per);
	//three enemies round a unit one point short: the point is divided away to nothing
	expect(action(tankAt([[3, 4], [5, 4], [4, 5]], false, 1000, { strength: 9 }), "Reinforce").refusal).toBe("none here");
});

test("Overstrength shows on a full unit with experience, up to 10 and a point a bar, at its penalty; a full unit's Supply says full (#346)", () => {
	const w = tankAt([], true, 1000, { strength: 10, experience: 200, ammo: 100, fuel: 100 });
	(w.state.units[0] as { ammo: number; fuel: number }).ammo = w.equipment[PZ_IIA].ammo;
	(w.state.units[0] as { ammo: number; fuel: number }).fuel = w.equipment[PZ_IIA].fuel;
	const per = Math.round(costPerStrength(w, unitById(w, 0)) * OVERSTRENGTH_PENALTY);
	expect(menu(w)).toEqual({ "Supply": ["", undefined, "full"], "Reinforce": ["", undefined, "full"], "Overstrength": ["+2", 2 * per, null],
		"Undo move": ["", undefined, "not moved"] });
	expect(action(w, "Overstrength").tip!.rows.find((r) => r.tone === "prestige")!.label).toBe(`Cost, ${per} a point (×1.2)`);
	expect(Object.keys(menu(tankAt([], true, 1000, { strength: 10 })))).not.toContain("Overstrength"); //(no experience bar)
	expect(menu(tankAt([], true, 1000, { strength: 12, experience: 200 })).Overstrength).toEqual(["", undefined, "full"]);
});

test("After moving, Supply and Reinforce say moved and Undo says where the unit goes back to; after supplying, why (#346)", () => {
	const moved = step(tankAt([], false), { type: "move", unit: 0, to: { row: 4, col: 6 } });
	expect(moved.ok).toBe(true);
	const w = moved.ok ? moved.world : null;
	expect(menu(w!)).toEqual({ "Supply": ["", undefined, "moved"], "Reinforce": ["", undefined, "moved"], "Undo move": ["to 4,4", undefined, null] });
	const supplied = step(tankAt([], true), { type: "resupply", unit: 0 });
	expect(supplied.ok && menu(supplied.world)).toEqual({ "Supply": ["", undefined, "moved"], "Reinforce": ["", undefined, "moved"],
		"Undo move": ["", undefined, "after supply"] });
	//a reinforcement after a resupply: supplied
	const fresh = tankAt([], true);
	(fresh.state.units[0] as { hasResupplied: boolean }).hasResupplied = true;
	expect(menu(fresh).Reinforce).toEqual(["", undefined, "supplied"]);
	expect(menu(fresh).Supply).toEqual(["", undefined, "supplied"]);
});

test("Why a move can't be undone: it revealed units, it was ambushed, an attack or another unit's move came after (#316)", () => {
	//the tank moves next to a Polish tank it didn't see: revealed, its undo gone
	const w = handWorld({ rows: 12, cols: 12, units: [{ eqid: PZ_IIA, owner: 0, row: 4, col: 1 }, { eqid: PZ_IIA, owner: 0, row: 8, col: 1 },
		{ eqid: TP7, owner: 1, row: 4, col: 6 }] }, undefined, { spotSide: 0 });
	const cmd: Command = { type: "move", unit: 0, to: { row: 4, col: 4 } };
	const r = step(w, cmd);
	expect(r.ok && r.world.state.turn.undoable).toBeNull();
	const after = r.ok ? r.world : w;
	const lost = undoLoss(w, cmd, after);
	expect(lost).toEqual({ unit: 0, reason: "revealed units" });
	expect(menu(after, 0, lost)["Undo move"]).toEqual(["", undefined, "revealed units"]);
	//the other tank moves where it reveals nothing: the first one's move isn't the last any more
	const second: Command = { type: "move", unit: 1, to: { row: 8, col: 2 } };
	const r2 = step(after, second);
	const w2 = r2.ok ? r2.world : after;
	expect([undoLoss(after, second, w2), menu(w2, 0, null)["Undo move"][2], menu(w2, 1, null)["Undo move"][2]])
		.toEqual([null, "not the last move", null]);
	//an attack takes the slot: the move before it says so
	expect(undoLoss(w2, { type: "attack", unit: 1, target: 2 }, after)).toEqual({ unit: 1, reason: "after an attack" });
	expect(undoLoss(w2, { type: "upgrade", unit: 1, eqid: 1, transport: 0 }, after)).toEqual({ unit: 1, reason: "after an upgrade" });
	expect(undoLoss(w2, { type: "endTurn" }, after)).toEqual({ unit: 1, reason: "another order since" });
	//a step that leaves the slot as it was: nothing lost
	expect(undoLoss(w2, { type: "mount", unit: 0 }, w2)).toBeNull();
	//nothing kept: the unit's state says what it can
	const surprised = tankAt([], false, 0, { hasMoved: true, isSurprised: true }), fired = tankAt([], false, 0, { hasMoved: true, hasFired: true });
	expect([menu(surprised)["Undo move"][2], menu(fired)["Undo move"][2], menu(tankAt([], false, 0, { hasMoved: true }))["Undo move"][2]])
		.toEqual(["ambushed", "after an attack", "not the last move"]);
	//a move that ran into a hidden enemy
	expect(undoLoss(w, cmd, surprised)).toEqual({ unit: 0, reason: "ambushed" });
	expect(undoLoss(w, { type: "move", unit: 9, to: { row: 1, col: 1 } }, w)).toBeNull();
});

test("Mount names the transport, Unmount when mounted; an aircraft away from an airfield, a ship at sea say why not (#346)", () => {
	const w = handWorld({ rows: 10, cols: 10, terrain: (r) => r > 7 ? terrainType.Ocean : terrainType.Clear, units: [
		{ eqid: LEFH18, owner: 0, row: 4, col: 3, transport: { eqid: SDKFZ7, ammo: 0, fuel: 40 } },
		{ eqid: LEFH18, owner: 0, row: 5, col: 3, isMounted: true, transport: { eqid: SDKFZ7, ammo: 0, fuel: 40 } },
		{ eqid: ME_109, owner: 0, row: 2, col: 2, strength: 6, ammo: 1 },
		{ eqid: ZERSTORER, owner: 0, row: 9, col: 5, strength: 6, ammo: 3 },
		{ eqid: INFANTERIE, owner: 0, row: 9, col: 1, carrier: NAVAL },
		{ eqid: LEFH18, owner: 0, row: 3, col: 7, hasMoved: true, transport: { eqid: SDKFZ7, ammo: 0, fuel: 40 } },
	] }, undefined, { spotSide: 0 });
	const tractor = w.equipment[SDKFZ7].name;
	expect(action(w, "Mount", 0)).toMatchObject({ line: tractor, refusal: null, command: { type: "mount", unit: 0 } });
	expect(action(w, "Unmount", 1)).toMatchObject({ line: tractor, refusal: null, command: { type: "unmount", unit: 1 } });
	expect(action(w, "Mount", 5).refusal).toBe("moved");
	expect([action(w, "Supply", 2).refusal, action(w, "Reinforce", 2).refusal]).toEqual(["no airfield", "no airfield"]);
	expect([action(w, "Supply", 3).refusal, action(w, "Reinforce", 3).refusal]).toEqual(["not in port", "not in port"]);
	//aboard a ship far out at sea: Disembark, nowhere to land
	expect(action(w, "Disembark", 4)).toMatchObject({ line: "naval", refusal: "nowhere to land", command: { type: "disembark", unit: 4 } });
	//no Mount or Embark where they don't apply
	expect(contextOf(w, 2, null)!.actions.map((a) => a.label)).toEqual(["Supply", "Reinforce", "Undo move"]);
});

test("Embark names the transport the unit gets at a port or an airfield; aboard an aircraft, Disembark says air (#346)", () => {
	const w = handWorld({ rows: 8, cols: 8, terrain: (r, c) => r === 2 && c === 2 ? terrainType.Port : r === 5 && c === 5 ? terrainType.Airfield
		: terrainType.Clear, units: [{ eqid: INFANTERIE, owner: 0, row: 2, col: 2 }, { eqid: INFANTERIE, owner: 0, row: 5, col: 5 },
		{ eqid: INFANTERIE, owner: 0, row: 1, col: 6, carrier: AIR }] }, undefined, { spotSide: 0 });
	Object.assign(w.state.players[0], { navalTransports: 1, airTransports: 1 });
	(w.state.equipment as { indexes: object }).indexes = { 8: { unitclass: { 18: [NAVAL], 13: [AIR] } } };
	expect(action(w, "Embark", 0)).toMatchObject({ line: "naval", refusal: null, command: { type: "embark", unit: 0 } });
	expect(action(w, "Embark", 1)).toMatchObject({ line: "air", refusal: null });
	expect(action(w, "Disembark", 2)).toMatchObject({ line: "air", refusal: null });
	//no transport of the class in the country's list: none to get
	(w.state.equipment as { indexes: object }).indexes = {};
	expect(action(w, "Embark", 0).refusal).toBe("no transport");
});

test("No menu for an enemy unit, on a program's turn, or for a unit off the map", () => {
	const w = tankAt([[3, 4]], true);
	expect([contextOf(w, 1, null), contextOf(w, 99, null)]).toEqual([null, null]);
	(w.state.players[0] as { type: number }).type = playerType.aiLocal;
	expect(contextOf(w, 0, null)).toBeNull();
});

//The menu on a store whose host plays the person's commands on the core, the tank selected
function menuOf(w: World) {
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
	store.selected.value = 0;
	render(<UnitContextMenu store={store} at={{ x: 200, y: 200 }} gap={30} clear={[]} />);
	return { store, sent };
}

const buttons = () => [...document.querySelectorAll<HTMLButtonElement>("#unit-context button")];

test("The menu is a toolbar of the card's buttons: the caption, then what it does or why not; a click plays it (#346)", async () => {
	const w = tankAt([[3, 4]], false, 1000);
	const { store, sent } = menuOf(w);
	expect(screen.getByRole("toolbar", { name: "Unit actions" }).id).toBe("unit-context");
	const e = w.equipment[PZ_IIA], per = costPerStrength(w, unitById(w, 0));
	expect(buttons().map((b) => [b.textContent, b.disabled])).toEqual([
		[`Supply +${Math.round((e.ammo - 2) / 1.95)} ammo · +${Math.round((e.fuel - 20) / 1.95)} fuel`, false],
		[`Reinforce +2 · ${2 * per}`, false], ["Undo move not moved", true]]);
	expect(document.querySelectorAll("#unit-context .pm-sep").length).toBe(1);
	await act(() => { fireEvent.click(buttons()[1]); });
	expect(sent).toEqual([{ type: "reinforce", unit: 0 }]);
	expect(buttons()[1].textContent).toBe("Reinforce moved");
	//the key does what the button does, and says why when it can't
	await act(() => store.shortcut({ unit: "resupply" }));
	expect([sent.length, store.refused.value]).toEqual([1, "Supply: moved"]);
	//none while deploying or on the strategic map, nor with no unit selected
	await act(() => store.shortcut({ menu: "zoom" }));
	expect(document.getElementById("unit-context")).toBeNull();
	await act(() => store.shortcut({ menu: "zoom" }));
	await act(() => { store.selected.value = null; });
	expect(document.getElementById("unit-context")).toBeNull();
});

test("Hover or focus shows the arithmetic beside the menu; a long press does on touch; Undo has none (#346)", async () => {
	menuOf(tankAt([[3, 4]], false, 1000));
	const act0 = document.querySelectorAll<HTMLElement>("#unit-context .act");
	const tip = () => document.querySelector(".pm-ctxtip");
	await act(() => { fireEvent.mouseEnter(act0[1]); });
	expect(tip()!.querySelector(".hd")!.textContent).toMatch(/^Reinforce /);
	expect([...tip()!.querySelectorAll(".rows > span")].map((s) => s.textContent).slice(0, 6))
		.toEqual(["Missing", "4", "Outside a city", "÷1.3", "Next to 1 enemy", "÷1.5"]);
	expect(tip()!.querySelector(".warn")!.textContent).toBe("Ends this unit's turn: no move or attack after.");
	//(leaving another action keeps it)
	await act(() => { fireEvent.mouseLeave(act0[0]); });
	expect(tip()).not.toBeNull();
	await act(() => { fireEvent.mouseLeave(act0[1]); });
	expect(tip()).toBeNull();
	await act(() => { fireEvent.focusIn(act0[0]); });
	expect(tip()!.querySelector(".hd")!.textContent).toMatch(/^Supply /);
	await act(() => { fireEvent.focusOut(act0[0]); });
	await act(() => { fireEvent.mouseEnter(act0[2]); });
	expect(tip()).toBeNull();
	vi.useFakeTimers();
	fireEvent.pointerDown(act0[1], { pointerType: "touch" });
	await act(() => { vi.advanceTimersByTime(600); });
	expect(tip()!.querySelector(".hd")!.textContent).toMatch(/^Reinforce /);
	fireEvent.pointerUp(act0[1]);
	//a mouse press, or a touch let go early: none
	fireEvent.pointerDown(act0[0], { pointerType: "mouse" });
	fireEvent.pointerDown(act0[0], { pointerType: "touch" });
	fireEvent.pointerCancel(act0[0]);
	await act(() => { vi.advanceTimersByTime(600); });
	vi.useRealTimers();
	expect(tip()!.querySelector(".hd")!.textContent).toMatch(/^Reinforce /);
});

test("The tooltip's actions are the menu's own: each line comes with the command it plays", () => {
	const actions: ContextAction[] = contextOf(tankAt([], true), 0, null)!.actions;
	expect(actions.map((a) => [a.key, a.command.type, a.icon])).toEqual([["resupply", "resupply", "resupply"], ["reinforce", "reinforce", "reinforce"],
		["undo", "undo", "undo"]]);
});
