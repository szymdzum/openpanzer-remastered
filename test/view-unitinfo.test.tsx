//The new UI's unit info (src/view/unitinfo.ts, src/view/infopanel.tsx, UnitInfo, #346) on hand-built worlds: the
//identity, the leaders as the game words them, the meters and their states, the stat sheet with what the leaders add,
//the panel in jsdom, and the unit always read by its id, never a copy (#404)
import { afterEach, expect, test } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { handWorld } from "./coreworld";
import { step } from "../src/core/step";
import type { World } from "../src/core/types";
import { leaderDescriptions, leaderType, terrainType } from "../src/prototypes";
import { UnitInfoPanel } from "../src/view/infopanel";
import { createStore } from "../src/view/store";
import { supplyState, unitInfoOf } from "../src/view/unitinfo";

afterEach(cleanup);

const PZ_IIA = 140, INFANTERIE = 115, LEFH18 = 92, SDKFZ7 = 2403, TP7 = 273;

//A Pz IIA of 120 XP with a leader, low on fuel and with one round left, in a city; a gun on its tractor; infantry;
//a Polish tank next to the Pz IIA and another far in the fog
function world(): World {
	return handWorld({ rows: 10, cols: 10, terrain: (r, c) => r === 4 && c === 3 ? terrainType.City : terrainType.Clear, units: [
		{ eqid: PZ_IIA, owner: 0, row: 4, col: 3, experience: 120, leader: leaderType.battlefieldIntelligence, fuel: 18, ammo: 1, entrenchment: 4,
			isCore: true, flag: 8 },
		{ eqid: LEFH18, owner: 0, row: 6, col: 3, isMounted: true, transport: { eqid: SDKFZ7, ammo: 0, fuel: 40 } },
		{ eqid: INFANTERIE, owner: 0, row: 7, col: 3 },
		{ eqid: TP7, owner: 1, row: 4, col: 4, flag: 16 },
		{ eqid: TP7, owner: 1, row: 9, col: 9 },
	] }, undefined, { spotSide: 0 });
}

test("The unit info names the unit, its class, core or auxiliary, its experience in stars and its leaders as the game words them", () => {
	const w = world(), e = w.equipment[PZ_IIA];
	const info = unitInfoOf(w, 0)!;
	expect(info).toMatchObject({ id: 0, name: e.name, nation: "de", side: 0, line: "Tank · Core", stars: 1 });
	//its own leader, then the tank's class leader, which every tank with a leader has
	expect(info.leaders).toEqual([
		{ name: "Battlefield Intelligence", description: leaderDescriptions[leaderType.battlefieldIntelligence][1], classLeader: false },
		{ name: "Aggressive Tank Maneuver", description: leaderDescriptions[leaderType.aggressiveTankManeuver][1], classLeader: true }]);
	//a unit whose own leader is its class's: one line
	const own = handWorld({ rows: 4, cols: 4, units: [{ eqid: PZ_IIA, owner: 0, row: 1, col: 1, leader: leaderType.aggressiveTankManeuver }] },
		undefined, { spotSide: 0 });
	expect(unitInfoOf(own, 0)!.leaders.map((l) => [l.name, l.classLeader])).toEqual([["Aggressive Tank Maneuver", true]]);
	//the enemy next to it, seen; the one in the fog isn't; none off the map
	expect(unitInfoOf(w, 3)).toMatchObject({ nation: "pl", side: 1, leaders: [], stars: 0, line: "Tank · Auxiliary" });
	expect([unitInfoOf(w, 4), unitInfoOf(w, 99)]).toEqual([null, null]);
});

test("The meters: strength, fuel and ammo of what the unit has, low below half, critical below a quarter; entrenchment to its terrain's top", () => {
	const w = world(), e = w.equipment[PZ_IIA];
	expect(unitInfoOf(w, 0)!.meters).toEqual([
		{ icon: "strength", label: "Strength", value: "10/10", fill: 1, state: "ok" },
		{ icon: "fuel", label: "Fuel", value: `18/${e.fuel}`, fill: 18 / e.fuel, state: supplyState(18, e.fuel) },
		{ icon: "ammo", label: "Ammo", value: `1/${e.ammo}`, fill: 1 / e.ammo, state: "critical" },
		//(a city entrenches 3 at once, then up to 5 levels more)
		{ icon: "entrench", label: "Entrench", value: "4", fill: 4 / 8 },
	]);
	expect([supplyState(5, 10), supplyState(4, 10), supplyState(3, 12), supplyState(2, 10), supplyState(0, 0)])
		.toEqual(["ok", "low", "low", "critical", "ok"]);
	//Infantry walks: no fuel meter, a dash
	expect(unitInfoOf(w, 2)!.meters[1]).toEqual({ icon: "fuel", label: "Fuel", value: "–", fill: 0 });
});

test("A gun on its tractor keeps its own name, says what carries it, and shows the tractor's fuel and moves", () => {
	const w = world(), gun = w.equipment[LEFH18], tractor = w.equipment[SDKFZ7];
	const info = unitInfoOf(w, 1)!;
	expect([info.name, info.line]).toEqual([gun.name, "Artillery · Auxiliary · in " + tractor.name]);
	expect(info.meters[1]).toMatchObject({ value: `40/${tractor.fuel}` });
	expect(info.stats.find((s) => s.name === "Move")!.value).toBe(tractor.movpoints);
});

test("The stat sheet is the card's twelve, with what the leaders add: the class leader's hex in Move", () => {
	const w = world(), e = w.equipment[PZ_IIA];
	expect(unitInfoOf(w, 0)!.stats).toEqual([
		{ name: "Soft atk", value: e.softatk }, { name: "Hard atk", value: e.hardatk }, { name: "Air atk", value: e.airatk },
		{ name: "Naval atk", value: e.navalatk }, { name: "Gnd def", value: e.grounddef }, { name: "Air def", value: e.airdef },
		{ name: "Close def", value: e.closedef }, { name: "Initiative", value: e.initiative }, { name: "Range", value: Math.max(1, e.gunrange) },
		{ name: "Spotting", value: e.spotrange }, { name: "Move", value: e.movpoints + 1 }, { name: "Exp", value: 120 },
	]);
});

//The panel on a store whose host plays the person's commands on the core
function panelOf(w: World) {
	let now = w;
	const store = createStore({
		world: () => now,
		command: (cmd) => {
			const r = step(now, cmd);
			if ("refusal" in r) return { ok: false, refusal: r.refusal };
			now = r.world;
			return { ok: true, result: null };
		},
		won: () => {},
	});
	store.refresh();
	render(<UnitInfoPanel store={store} />);
	return store;
}

test("The panel has the card's three columns and ids; Inspect unit hides it; none without a unit selected", async () => {
	const store = panelOf(world());
	expect(document.getElementById("unit-info")).toBeNull();
	await act(() => { store.selected.value = 0; });
	const panel = screen.getByRole("region", { name: "Selected unit" });
	expect(panel.id).toBe("unit-info");
	expect(["statsRowTop", "uName", "uSmallFlag", "statsRowContainer", "statsRow"].map((id) => document.getElementById(id) !== null))
		.toEqual([true, true, true, true, true]);
	expect(document.getElementById("uName")!.textContent).toBe(store.world.value!.equipment[PZ_IIA].name);
	const fuel = store.world.value!.equipment[PZ_IIA].fuel;
	expect([...panel.querySelectorAll(".pm-meter")].map((m) => m.className)).toEqual(["pm-meter ok", "pm-meter " + supplyState(18, fuel),
		"pm-meter critical", "pm-meter"]);
	expect(panel.querySelectorAll(".pm-stats > div").length).toBe(12);
	await act(() => store.shortcut({ menu: "inspect" }));
	expect(document.getElementById("unit-info")).toBeNull();
});

test("The leader's tooltip shows both leaders on hover, focus or a tap; a unit without one says so", async () => {
	const store = panelOf(world());
	await act(() => { store.selected.value = 0; });
	const leader = document.querySelector<HTMLButtonElement>("#unit-info .leader")!;
	const tip = () => document.getElementById("uLeaderTip")!;
	expect([leader.textContent, tip().hidden]).toEqual(["Battlefield Intelligence", true]);
	await act(() => { fireEvent.mouseEnter(leader); });
	expect(tip().hidden).toBe(false);
	expect([...tip().querySelectorAll(".hd")].map((h) => h.textContent)).toEqual(["Battlefield Intelligence", "Aggressive Tank Maneuver · class leader"]);
	await act(() => { fireEvent.mouseLeave(leader); });
	await act(() => { fireEvent.focus(leader); });
	expect(tip().hidden).toBe(false);
	await act(() => { fireEvent.blur(leader); });
	await act(() => { fireEvent.click(leader); });
	expect([tip().hidden, leader.getAttribute("aria-expanded")]).toEqual([false, "true"]);
	await act(() => { store.selected.value = 2; });
	expect(document.querySelector("#unit-info .leader")!.textContent).toBe("No leader yet");
	expect(document.getElementById("uSmallFlag")).toBeNull(); //(a unit with no flag of its own: none)
});

test("Stats opens the stat sheet where the screen is narrow, and says whether it is open", async () => {
	const store = panelOf(world());
	await act(() => { store.selected.value = 0; });
	const toggle = screen.getByRole("button", { name: "Stats" });
	expect([toggle.getAttribute("aria-pressed"), toggle.getAttribute("aria-controls")]).toEqual(["false", "statsRowContainer"]);
	await act(() => { fireEvent.click(toggle); });
	expect(toggle.getAttribute("aria-pressed")).toBe("true");
});

test("The unit info is the selected unit itself, read by its id: after it mounts and moves it is still the unit the commands name (#404)", async () => {
	const w = handWorld({ rows: 10, cols: 10, units: [{ eqid: LEFH18, owner: 0, row: 4, col: 3, transport: { eqid: SDKFZ7, ammo: 0, fuel: 40 } },
		{ eqid: INFANTERIE, owner: 0, row: 7, col: 3 }] }, undefined, { spotSide: 0 });
	const store = panelOf(w);
	await act(() => { store.clickHex({ row: 4, col: 3 }); });
	await act(() => store.shortcut({ unit: "mount" }));
	expect([store.selected.value, store.info.value!.id, store.info.value!.line]).toEqual([0, 0, "Artillery · Auxiliary · in "
		+ w.equipment[SDKFZ7].name]);
	await act(() => store.shortcut({ menu: "next" }));
	expect(store.info.value!.id).toBe(1);
	await act(() => store.shortcut({ menu: "previous" }));
	expect([store.selected.value, store.info.value!.id, store.unit.value!.id]).toEqual([0, 0, 0]);
	await act(() => store.shortcut({ unit: "mount" }));
	expect([store.refused.value, store.world.value!.state.units[0].isMounted]).toEqual([null, false]);
});
