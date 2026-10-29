//The new UI's unit card docked at the bottom (src/view/infopanel.tsx, UnitInfo, #346, #348 with #37) on hand-built
//worlds, in jsdom: open on More, who the unit is, its condition with what each gauge means, this turn, what it hits and
//holds with every name's tooltip, the bonuses, the riding band (its line is test/view-unitline.test.tsx's); the
//leaders as the game words them, Next unit, and the unit always read by its id, never a copy (#404)
import { act, cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, expect, test } from "vitest";
import { handWorld } from "./coreworld";
import { step } from "../src/core/step";
import type { World } from "../src/core/types";
import { leaderDescriptions } from "../src/legacy/prototypes";
import { leaderType, terrainType } from "../src/core/tables";
import { UnitInfoPanel } from "../src/view/infopanel";
import { createStore } from "../src/view/store";
import { unitCardOf } from "../src/view/unitcard";
import { supplyState } from "../src/view/unitinfo";

afterEach(cleanup);

const PZ_IIA = 140, INFANTERIE = 115, LEFH18 = 92, SDKFZ7 = 2403, TP7 = 273;

//A Pz IIA of 120 XP with a leader, low on fuel and with one round left, dug in 4 in a city; a gun on its tractor;
//infantry; a Polish tank next to the Pz IIA and another far in the fog
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
	expect(unitCardOf(w, 0)!.leaders).toEqual([
		{ name: "Battlefield Intelligence", description: leaderDescriptions[leaderType.battlefieldIntelligence][1], classLeader: false },
		{ name: "Aggressive Tank Maneuver", description: leaderDescriptions[leaderType.aggressiveTankManeuver][1], classLeader: true }]);
	//a unit whose own leader is its class's: one line
	const own = handWorld({ rows: 4, cols: 4, units: [{ eqid: PZ_IIA, owner: 0, row: 1, col: 1, leader: leaderType.aggressiveTankManeuver }] },
		undefined, { spotSide: 0 });
	expect(unitCardOf(own, 0)!.leaders.map((l) => [l.name, l.classLeader])).toEqual([["Aggressive Tank Maneuver", true]]);
	//the enemy next to it, seen; the one in the fog isn't
	expect(unitCardOf(w, 3)).toMatchObject({ nation: "pl", leaders: [], stars: 0 });
	expect(unitCardOf(w, 4)).toBeNull();
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

//The card open: More on its line
async function open(store: ReturnType<typeof panelOf>, id: number) {
	await act(() => { store.pickUnit(id); });
	await act(() => { fireEvent.click(screen.getByRole("button", { name: "More" })); });
}

const texts = (all: NodeListOf<Element>) => [...all].map((e) => e.textContent);

test("More opens the card: who it is, its condition with what each gauge means, this turn, what it hits and holds, the bonuses (#37)", async () => {
	const store = panelOf(world());
	expect(document.getElementById("unit-info")).toBeNull();
	await open(store, 0);
	const panel = screen.getByRole("region", { name: "Selected unit" }), e = store.world.value!.equipment[PZ_IIA];
	expect([panel.id, panel.className]).toEqual(["unit-info", "pm-panel pm-uinfo open"]);
	expect(["uName", "uSmallFlag"].map((id) => document.getElementById(id) !== null)).toEqual([true, true]);
	expect(document.getElementById("uName")!.textContent).toBe(e.name);
	expect([panel.querySelector(".cls")!.textContent, panel.querySelector(".ui-tags")!.textContent])
		.toEqual(["101st Tank · Germany", "Hard target · Tracked · Core"]);
	expect(panel.querySelector(".ui-xp")!.textContent).toBe("Experience 1 of 5120 XP");
	expect(texts(panel.querySelectorAll(".ui-lead b"))).toEqual(["Battlefield Intelligence", "Aggressive Tank Maneuver"]);
	//the gauges with their value and meaning; the stamp, as it can resupply with one round left
	expect([...panel.querySelectorAll(".ui-c")].map((g) => [g.className, g.textContent])).toEqual([["ui-c ok", "Strength10/10full"],
		["ui-c low", "Fuel18/503 full moves"], ["ui-c critical", "Ammo1/81 shot left"], ["ui-c dug", "Entrenched+4+4 defence"]]);
	expect(panel.querySelector(".ui-c.dug .k")!.getAttribute("title")).toBe("Entrenchment: up to 8 here, the city's own 3 at once");
	expect(panel.querySelector(".pm-stamp")!.textContent).toBe("Resupply");
	expect(texts(panel.querySelectorAll(".ui-cond .ui-chip"))).toEqual(["6 moves left", "Can fire"]);
	//what it hits and holds, each name's meaning in its tooltip; the weak defence in critical
	const hits = screen.getByRole("region", { name: "It hits" }), holds = screen.getByRole("region", { name: "It holds" });
	expect([...hits.querySelectorAll(".ui-m")].map((m) => [m.className, m.textContent])).toEqual([["ui-m", "Soft" + e.softatk],
		["ui-m", "Hard" + e.hardatk], ["ui-m none", "Aircraftcan't"], ["ui-m", "Ships" + e.navalatk]]);
	expect([...holds.querySelectorAll(".ui-m")].map((m) => [m.className, m.textContent])).toEqual([["ui-m", "Ground fire" + e.grounddef],
		["ui-m", "Air attack" + e.airdef], ["ui-m weak", "Close assault" + e.closedef], ["ui-m plus", "From range+" + e.rangedefmod]]);
	expect([...panel.querySelectorAll(".ui-m")].every((m) => (m.getAttribute("title") ?? "") !== "")).toBe(true);
	expect(texts(panel.querySelectorAll(".ui-foot > span"))).toEqual([`Initiative ${e.initiative}`, "Fires 1 hex", `Sees ${e.spotrange} hexes`,
		"+1 veteran attack and defence+4 entrenched defence"]);
	expect(panel.querySelector(".ui-val")!.textContent).toBe("Value " + e.cost * 12);
	expect(panel.querySelector(".ui-ribbon")).toBeNull();
	//the buttons: their names are their tooltips
	for (const name of ["Less", "Next unit"]) expect(screen.getByRole("button", { name }).getAttribute("title")).toBe(name);
	//it stays open on another unit; Inspect unit hides it
	await act(() => { store.pickUnit(2); });
	expect(document.getElementById("unit-info")!.className).toBe("pm-panel pm-uinfo open");
	await act(() => store.shortcut({ menu: "inspect" }));
	expect(document.getElementById("unit-info")).toBeNull();
});

test("A gun on its tractor: the riding band over the card, in critical what it defends with; Next unit on the side's own units only (#37)", async () => {
	const store = panelOf(world());
	await open(store, 1);
	const band = document.querySelector("#unit-info .ui-ribbon")!, tractor = store.world.value!.equipment[SDKFZ7];
	expect(band.querySelector("b")!.textContent).toBe("On " + tractor.name);
	expect([...band.querySelectorAll("span")].map((s) => [s.className, s.textContent])).toEqual([["", `moves ${tractor.movpoints}, on the `
		+ `${tractor.name}'s fuel`], ["", "can't fire the turn it rides"], ["warn", "attacked or ambushed, it defends " + tractor.grounddef]]);
	//the gun itself in the card, its tractor's sprite under its own
	expect(document.getElementById("uName")!.textContent).toBe(store.world.value!.equipment[LEFH18].name);
	expect(document.querySelector("#unit-info .ui-id .ui-ride")!.getAttribute("title")).toBe("On its " + tractor.name);
	//Next unit selects the next one that hasn't moved, and the card follows it, open
	await act(() => { fireEvent.click(screen.getByRole("button", { name: "Next unit" })); });
	expect([store.selected.value, store.card.value!.unit, store.cardSize.value]).toEqual([2, 2, "open"]);
	expect(document.querySelector("#unit-info .ui-lead")!.textContent).toBe("No leader yet");
	expect(document.getElementById("uSmallFlag")).toBeNull(); //(a unit with no flag of its own: none)
	//an enemy: no Next unit, no This turn; nothing selected: no card
	await act(() => { store.pickUnit(3); });
	expect([screen.queryByRole("button", { name: "Next unit" }), document.querySelector("#unit-info .ui-cond .ui-chip")]).toEqual([null, null]);
	await act(() => { store.pickUnit(null); });
	expect(document.getElementById("unit-info")).toBeNull();
});

test("Less, Esc and a click on the map fold the open card to its line; it never opens by itself (#37)", async () => {
	const store = panelOf(world());
	await act(() => { store.pickUnit(0); });
	expect(store.cardSize.value).toBe("line");
	await act(() => { fireEvent.click(screen.getByRole("button", { name: "More" })); });
	await act(() => { fireEvent.click(screen.getByRole("button", { name: "Less" })); });
	expect(document.getElementById("unit-info")!.className).toBe("pm-panel pm-uinfo line");
	await act(() => { fireEvent.click(screen.getByRole("button", { name: "More" })); });
	await act(() => { fireEvent.keyDown(document, { key: "Escape" }); });
	expect(store.cardSize.value).toBe("line");
	await act(() => { fireEvent.click(screen.getByRole("button", { name: "More" })); });
	await act(() => { store.clickHex({ row: 7, col: 3 }); });
	expect([store.selected.value, store.cardSize.value]).toEqual([2, "line"]);
	//selecting other units, moving one: still its line
	await act(() => store.shortcut({ menu: "next" }));
	expect(store.cardSize.value).toBe("line");
});

test("The card is the selected unit itself, read by its id: after it mounts and moves it is still the unit the commands name (#404)", async () => {
	const w = handWorld({ rows: 10, cols: 10, units: [{ eqid: LEFH18, owner: 0, row: 4, col: 3, transport: { eqid: SDKFZ7, ammo: 0, fuel: 40 } },
		{ eqid: INFANTERIE, owner: 0, row: 7, col: 3 }] }, undefined, { spotSide: 0 });
	const store = panelOf(w);
	await act(() => { store.clickHex({ row: 4, col: 3 }); });
	await act(() => store.shortcut({ unit: "mount" }));
	expect([store.selected.value, store.card.value!.unit, store.card.value!.name, store.card.value!.band!.on])
		.toEqual([0, 0, w.equipment[LEFH18].name, "On " + w.equipment[SDKFZ7].name]);
	await act(() => store.shortcut({ menu: "next" }));
	expect(store.card.value!.unit).toBe(1);
	await act(() => store.shortcut({ menu: "previous" }));
	expect([store.selected.value, store.card.value!.unit]).toEqual([0, 0]);
	await act(() => store.shortcut({ unit: "mount" }));
	expect([store.refused.value, store.world.value!.state.units[0].isMounted]).toEqual([null, false]);
});
