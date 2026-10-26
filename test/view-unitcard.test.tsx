//The unit card on the new UI (src/view/unitcard.ts, src/view/unitsheet.tsx, UnitCard, #348 with #37) on hand-built
//worlds: the old unit info window's facts laid out as the card (identity and tags, experience, condition in words,
//attack and defence with what each is for, move, range, spotting and value, leaders), its transport and carrier views,
//an equipment entry shown full and new, and the card in jsdom
import { afterEach, expect, test } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { germanyPoland, handWorld } from "./coreworld";
import { step } from "../src/core/step";
import type { World } from "../src/core/types";
import { leaderDescriptions, leaderType, movMethod, terrainType, unitClass } from "../src/prototypes";
import { createStore } from "../src/view/store";
import { entryCardOf, ordinal, unitCardOf } from "../src/view/unitcard";
import { UnitInfoPanel } from "../src/view/infopanel";
import { UnitCardPanel } from "../src/view/unitsheet";

afterEach(cleanup);

const PZ_IIA = 140, INFANTERIE = 115, LEFH18 = 92, SDKFZ7 = 2403, TP7 = 273, SHIPS = 546;

//The UnitInfo test's world: a Pz IIA of 120 XP with a leader, low on fuel and with one round left, dug in 4 in a city; a
//gun on its tractor; infantry on a transport ship; a Polish tank next to the Pz IIA
function world(): World {
	return handWorld({ rows: 10, cols: 10, terrain: (r, c) => r === 4 && c === 3 ? terrainType.City : terrainType.Clear, units: [
		{ eqid: PZ_IIA, owner: 0, row: 4, col: 3, experience: 120, leader: leaderType.battlefieldIntelligence, fuel: 18, ammo: 1, entrenchment: 4,
			isCore: true, flag: 8 },
		{ eqid: LEFH18, owner: 0, row: 6, col: 3, isMounted: true, transport: { eqid: SDKFZ7, ammo: 0, fuel: 40 }, flag: 8 },
		{ eqid: INFANTERIE, owner: 0, row: 7, col: 3, carrier: SHIPS, flag: 8 },
		{ eqid: TP7, owner: 1, row: 4, col: 4, flag: 16 },
	] }, undefined, { spotSide: 0 });
}

test("The unit card names the unit as the old window did: its ordinal, class and country, tags for what the rules care about (#348)", () => {
	const w = world(), e = w.equipment[PZ_IIA];
	expect(unitCardOf(w, 0, null)).toMatchObject({ unit: 0, name: e.name, nation: "de", sub: "101st Tank · Germany",
		sprite: e.icon, bars: 1, xp: "120 XP, 80 to the next", view: "unit", views: ["unit"], next: true });
	expect(unitCardOf(w, 0, null)!.tags).toEqual([{ text: "Tank", icon: "tank", core: false }, { text: "Hard target", icon: null, core: false },
		{ text: "Tracked", icon: null, core: false }, { text: "Core", icon: null, core: true }]);
	//an enemy seen: Auxiliary, and no Next unit for a unit not the side's own
	expect(unitCardOf(w, 3, null)).toMatchObject({ nation: "pl", next: false, bars: 0, xp: "0 XP, 100 to the next" });
	expect(unitCardOf(w, 3, null)!.tags[3]).toEqual({ text: "Auxiliary", icon: null, core: false });
	expect(unitCardOf(w, 99, null)).toBeNull();
	expect([1, 2, 3, 4, 11, 12, 13, 21, 111, -1].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "111st", ""]);
});

test("Its condition says in words what the fuel and ammo are good for, and whether it is dug in (#37)", () => {
	const w = world(), e = w.equipment[PZ_IIA];
	const [strength, fuel, ammo, dug] = unitCardOf(w, 0, null)!.condition;
	expect(strength).toMatchObject({ label: "Strength", value: "10/10", state: "ok", note: null });
	expect(fuel).toMatchObject({ label: "Fuel", value: `18/${e.fuel}`, note: `enough for ${Math.floor(18 / e.movpoints)} moves` });
	expect(ammo).toMatchObject({ label: "Ammo", value: `1/${e.ammo}`, state: "critical", note: "1 attack left" });
	//(a city entrenches 3 at once, then up to 5 levels more)
	expect(dug).toMatchObject({ label: "Entrenchment", value: "4", fill: 4 / 8, note: "dug in" });
	//walking infantry burns no fuel
	expect(unitCardOf(w, 2, "unit")!.condition[1]).toMatchObject({ value: "–", note: "uses none" });
	expect(unitCardOf(w, 3, null)!.condition[3].note).toBe("not dug in");
});

test("Attack and defence are the old window's stats with what each is for; move, range and spotting say what the leaders add (#37)", () => {
	const w = world(), e = w.equipment[PZ_IIA], card = unitCardOf(w, 0, null)!;
	expect(card.attack.map((s) => [s.name, s.value, s.note])).toEqual([["Soft", e.softatk, "infantry, guns, trucks"],
		["Hard", e.hardatk, "tanks, armoured cars"], ["Air", e.airatk, "aircraft overhead"], ["Naval", e.navalatk, "ships"]]);
	expect(card.defence.map((s) => [s.name, s.value])).toEqual([["Ground", e.grounddef], ["Air", e.airdef], ["Close", e.closedef],
		["Ranged", e.rangedefmod], ["Initiative", e.initiative]]);
	expect(card.attack[0].fill).toBe(e.softatk / 15);
	//the tank's class leader adds a hex to Move
	expect(card.figures).toEqual([
		{ label: "Move", value: e.movpoints + 1, note: `${e.movpoints} + 1 leader`, prestige: false },
		{ label: "Range", value: 1, note: "adjacent only", prestige: false },
		{ label: "Spotting", value: e.spotrange, note: "hexes of sight", prestige: false },
		{ label: "Value", value: e.cost * 12, note: "prestige", prestige: true }]);
	expect(card.leaders.map((l) => [l.name, l.description, l.classLeader])).toEqual([
		["Battlefield Intelligence", leaderDescriptions[leaderType.battlefieldIntelligence][1], false],
		["Aggressive Tank Maneuver", leaderDescriptions[leaderType.aggressiveTankManeuver][1], true]]);
	//a marksman's gun reaches a hex further
	const gun = handWorld({ rows: 6, cols: 6, units: [{ eqid: LEFH18, owner: 0, row: 2, col: 2, leader: leaderType.marksman }] }, undefined, { spotSide: 0 });
	const g = gun.equipment[LEFH18];
	expect(unitCardOf(gun, 0, null)!.figures[1]).toEqual({ label: "Range", value: g.gunrange + 1, note: `${g.gunrange} + 1 leader`, prestige: false });
});

test("A gun on its tractor opens on the tractor, as the old window did, and shows the gun itself in its unit view (#348)", () => {
	const w = world(), gun = w.equipment[LEFH18], tractor = w.equipment[SDKFZ7];
	const card = unitCardOf(w, 1, null)!;
	expect([card.name, card.view, card.views, card.sprite]).toEqual([gun.name, "transport", ["unit", "transport"], tractor.icon]);
	expect(card.condition[1].value).toBe(`40/${tractor.fuel}`);
	expect(card.figures[0].value).toBe(tractor.movpoints);
	expect(card.figures[3].value).toBe((gun.cost + tractor.cost) * 12);
	const own = unitCardOf(w, 1, "unit")!;
	expect([own.view, own.sprite, own.tags[2].text, own.attack[0].value]).toEqual(["unit", gun.icon, "Towed", gun.softatk]);
	//a view the unit doesn't have: the one it opens on
	expect(unitCardOf(w, 1, "carrier")!.view).toBe("transport");
});

test("A unit on a carrier shows the carrier as an entry, full and new, as the old window's carrier button did (#348)", () => {
	const w = world(), ships = w.equipment[SHIPS];
	expect(unitCardOf(w, 2, null)!.views).toEqual(["unit", "carrier"]);
	expect(unitCardOf(w, 2, "carrier")).toMatchObject({ unit: 2, name: ships.name, view: "carrier", views: ["unit", "carrier"], next: false,
		sub: "Naval Transport · Germany" });
});

test("An equipment entry is shown new and full: strength 10, its fuel and ammo, no experience, leader or core tag (#348)", () => {
	const w = world(), e = w.equipment[PZ_IIA];
	const card = entryCardOf(w, PZ_IIA, 7);
	expect(card).toMatchObject({ unit: null, name: e.name, sub: "Tank · Germany", bars: 0, leaders: [], views: [], next: false });
	expect(card.tags.map((t) => t.text)).toEqual(["Tank", "Hard target", "Tracked"]);
	expect(card.condition.map((m) => m.value)).toEqual(["10/10", `${e.fuel}/${e.fuel}`, `${e.ammo}/${e.ammo}`, "0"]);
	expect(card.figures.map((f) => f.value)).toEqual([e.movpoints, 1, e.spotrange, e.cost * 12]);
});

test("The edges the old window had: a train on rails, a fort with no ordinal, five bars at most, no ammo left (#348)", () => {
	const pz = germanyPoland[PZ_IIA];
	const odd = { ...germanyPoland, 9001: { ...pz, movmethod: movMethod.deepnaval }, 9002: { ...pz, uclass: unitClass.fortification, movpoints: 0, gunrange: 0 } };
	const w = handWorld({ rows: 6, cols: 6, units: [{ eqid: 9001, owner: 0, row: 1, col: 1, experience: 520, ammo: 0 },
		{ eqid: 9002, owner: 0, row: 3, col: 3 }] }, odd, { spotSide: 0 });
	const train = unitCardOf(w, 0, null)!;
	expect([train.tags[2].text, train.bars, train.xp, train.condition[2].note]).toEqual(["Rail road", 5, "520 XP", "no attacks left"]);
	const fort = unitCardOf(w, 1, null)!;
	expect([fort.sub, fort.condition[1].note, fort.figures[1].value]).toEqual(["Fortification", null, 1]);
	expect(entryCardOf(w, 9002, 7).figures[1].value).toBe(1);
});

//The panel and the card on a store whose host plays the person's commands on the core
function cardOf(w: World) {
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
	render(<><UnitInfoPanel store={store} /><UnitCardPanel store={store} /></>);
	return store;
}

test("Unit card in the unit info opens the card beside the map; its views, Next unit, the close button and Esc work (#348)", async () => {
	const store = cardOf(world());
	await act(() => { store.selected.value = 1; });
	expect(document.getElementById("unit-card")).toBeNull();
	await act(() => { fireEvent.click(screen.getByRole("button", { name: "Unit card" })); });
	const card = document.getElementById("unit-card")!;
	expect(card.querySelectorAll(".uc-sec .pm-meter").length).toBe(4);
	expect([...card.querySelectorAll(".uc-stat .k")].map((k) => k.textContent)).toEqual(["Soft", "Hard", "Air", "Naval", "Ground", "Air", "Close",
		"Ranged", "Initiative"]);
	expect(card.querySelector(".uc-note")!.textContent).toMatch(/^enough for \d+ moves?$/);
	//the transport view pressed; the unit's own on a click
	expect(screen.getByRole("button", { name: "Transport" }).getAttribute("aria-pressed")).toBe("true");
	await act(() => { fireEvent.click(screen.getByRole("button", { name: "Unit" })); });
	expect(store.card.value!.view).toBe("unit");
	//Next unit selects the next one that hasn't moved, and the card follows it, on the view it opens on
	await act(() => { fireEvent.click(screen.getByRole("button", { name: "Next unit" })); });
	expect([store.selected.value, store.card.value!.unit, store.card.value!.view]).toEqual([2, 2, "unit"]);
	await act(() => { store.selected.value = 0; });
	expect(document.querySelectorAll("#unit-card .uc-ab").length).toBe(2);
	await act(() => { fireEvent.keyDown(document, { key: "Escape" }); });
	expect(document.getElementById("unit-card")).toBeNull();
	await act(() => { store.openCard(); });
	await act(() => { fireEvent.click(screen.getByRole("button", { name: "Close" })); });
	expect(store.card.value).toBeNull();
	//an enemy: no Next unit, no views; nothing selected: no card
	await act(() => { store.openCard(); store.selected.value = 3; });
	expect([screen.queryByRole("button", { name: "Next unit" }), screen.queryByRole("group", { name: "Show" })]).toEqual([null, null]);
	await act(() => { store.selected.value = null; });
	expect(document.getElementById("unit-card")).toBeNull();
	//an entry of the equipment window
	await act(() => { store.openCard({ eqid: PZ_IIA, country: 7 }); });
	expect(document.querySelector("#unit-card .uc-name")!.textContent).toBe(store.world.value!.equipment[PZ_IIA].name);
});
