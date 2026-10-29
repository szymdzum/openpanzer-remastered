//The new UI's unit card docked at the bottom (src/view/infopanel.tsx, UnitInfo, #346, #348 with #37) on hand-built
//worlds, in jsdom: unfolded on More, its identity, condition and the band of every stat (its line is
//test/view-unitline.test.tsx's); the leaders as the game words them, the views, Next unit, and the unit always read by
//its id, never a copy (#404)
import { act, cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, expect, test } from "vitest";
import { handWorld } from "./coreworld";
import { step } from "../src/core/step";
import type { World } from "../src/core/types";
import { leaderDescriptions, leaderType, terrainType } from "../src/prototypes";
import { UnitInfoPanel } from "../src/view/infopanel";
import { createStore } from "../src/view/store";
import { unitCardOf } from "../src/view/unitcard";
import { supplyState } from "../src/view/unitinfo";

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

test("The card's leaders are its own then its class's, as the game words them; an enemy in the fog has no card", () => {
	const w = world();
	expect(unitCardOf(w, 0, null)!.leaders).toEqual([
		{ name: "Battlefield Intelligence", description: leaderDescriptions[leaderType.battlefieldIntelligence][1], classLeader: false },
		{ name: "Aggressive Tank Maneuver", description: leaderDescriptions[leaderType.aggressiveTankManeuver][1], classLeader: true }]);
	//a unit whose own leader is its class's: one line
	const own = handWorld({ rows: 4, cols: 4, units: [{ eqid: PZ_IIA, owner: 0, row: 1, col: 1, leader: leaderType.aggressiveTankManeuver }] },
		undefined, { spotSide: 0 });
	expect(unitCardOf(own, 0, null)!.leaders.map((l) => [l.name, l.classLeader])).toEqual([["Aggressive Tank Maneuver", true]]);
	//the enemy next to it, seen; the one in the fog isn't
	expect(unitCardOf(w, 3, null)).toMatchObject({ nation: "pl", leaders: [], stars: 0 });
	expect(unitCardOf(w, 4, null)).toBeNull();
	expect([supplyState(5, 10), supplyState(4, 10), supplyState(3, 12), supplyState(2, 10), supplyState(0, 0)])
		.toEqual(["ok", "low", "low", "critical", "ok"]);
});

//The card on a store whose host plays the person's commands on the core
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

//The card unfolded: More on its line
async function unfold(store: ReturnType<typeof panelOf>, id: number) {
	await act(() => { store.pickUnit(id); });
	await act(() => { fireEvent.click(screen.getByRole("button", { name: "More" })); });
}

test("More unfolds the card: identity in stars, condition, the band of every stat, the figures and the leaders; Inspect unit hides it", async () => {
	const store = panelOf(world());
	expect(document.getElementById("unit-info")).toBeNull();
	await unfold(store, 0);
	const panel = screen.getByRole("region", { name: "Selected unit" });
	expect([panel.id, panel.className]).toEqual(["unit-info", "pm-panel pm-uinfo open"]);
	expect(["statsRowTop", "uName", "uSmallFlag", "unit-card"].map((id) => document.getElementById(id) !== null)).toEqual([true, true, true, true]);
	expect(document.getElementById("uName")!.textContent).toBe(store.world.value!.equipment[PZ_IIA].name);
	expect(panel.querySelector(".cls")!.textContent).toBe("101st Tank · Germany");
	expect([...panel.querySelectorAll(".ui-tags .pm-tag")].map((t) => t.textContent)).toEqual(["Hard target", "Tracked", "Core"]);
	expect(panel.querySelector(".pm-sr")!.textContent).toBe("Experience 1 of 5");
	const fuel = store.world.value!.equipment[PZ_IIA].fuel;
	expect([...panel.querySelectorAll(".pm-meter")].map((m) => m.className)).toEqual(["pm-meter ok", "pm-meter " + supplyState(18, fuel),
		"pm-meter critical", "pm-meter"]);
	const band = document.getElementById("unit-card")!;
	expect([...band.querySelectorAll(".ui-stat .k")].map((k) => k.textContent)).toEqual(["Soft", "Hard", "Air", "Naval", "Ground", "Air", "Close",
		"Ranged", "Initiative"]);
	expect([...band.querySelectorAll(".ui-four .pm-label")].map((l) => l.textContent)).toEqual(["Move", "Range", "Spotting", "Value"]);
	expect(band.querySelector(".ui-xp")!.textContent).toBe("120 XP");
	expect(band.querySelectorAll(".ui-ab").length).toBe(2);
	//it stays unfolded on another unit
	await act(() => { store.pickUnit(2); });
	expect(document.getElementById("unit-card")).not.toBeNull();
	await act(() => store.shortcut({ menu: "inspect" }));
	expect(document.getElementById("unit-info")).toBeNull();
});

test("The views of a gun on its tractor, Next unit on the side's own units only", async () => {
	const store = panelOf(world());
	await unfold(store, 1);
	//the transport view pressed, as the old window opened it; the unit's own on a click
	expect(screen.getByRole("button", { name: "Transport" }).getAttribute("aria-pressed")).toBe("true");
	await act(() => { fireEvent.click(screen.getByRole("button", { name: "Unit" })); });
	expect(store.card.value!.view).toBe("unit");
	//Next unit selects the next one that hasn't moved, and the card follows it, on the view it opens on
	await act(() => { fireEvent.click(screen.getByRole("button", { name: "Next unit" })); });
	expect([store.selected.value, store.card.value!.unit, store.card.value!.view]).toEqual([2, 2, "unit"]);
	//an enemy: no Next unit, no views; nothing selected: no card
	await act(() => { store.pickUnit(3); });
	expect([screen.queryByRole("button", { name: "Next unit" }), screen.queryByRole("group", { name: "Show" })]).toEqual([null, null]);
	await act(() => { store.pickUnit(null); });
	expect(document.getElementById("unit-info")).toBeNull();
});

test("The leader's tooltip shows both leaders on hover, focus or a tap; a unit without one says so", async () => {
	const store = panelOf(world());
	await unfold(store, 0);
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
	await act(() => { store.pickUnit(2); });
	expect(document.querySelector("#unit-info .leader")!.textContent).toBe("No leader yet");
	expect(document.getElementById("uSmallFlag")).toBeNull(); //(a unit with no flag of its own: none)
});

test("The card is the selected unit itself, read by its id: after it mounts and moves it is still the unit the commands name (#404)", async () => {
	const w = handWorld({ rows: 10, cols: 10, units: [{ eqid: LEFH18, owner: 0, row: 4, col: 3, transport: { eqid: SDKFZ7, ammo: 0, fuel: 40 } },
		{ eqid: INFANTERIE, owner: 0, row: 7, col: 3 }] }, undefined, { spotSide: 0 });
	const store = panelOf(w);
	await act(() => { store.clickHex({ row: 4, col: 3 }); });
	await act(() => store.shortcut({ unit: "mount" }));
	expect([store.selected.value, store.card.value!.unit, store.card.value!.view, store.card.value!.name])
		.toEqual([0, 0, "transport", w.equipment[LEFH18].name]);
	await act(() => store.shortcut({ menu: "next" }));
	expect(store.card.value!.unit).toBe(1);
	await act(() => store.shortcut({ menu: "previous" }));
	expect([store.selected.value, store.card.value!.unit]).toEqual([0, 0]);
	await act(() => store.shortcut({ unit: "mount" }));
	expect([store.refused.value, store.world.value!.state.units[0].isMounted]).toEqual([null, false]);
});
