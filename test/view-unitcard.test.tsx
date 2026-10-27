//The unit card's view model on the new UI (src/view/unitcard.ts, UnitInfo, #348 with #37) on hand-built worlds: the
//old unit info window's facts laid out as the card (identity and tags, experience, condition, the folded sheet, attack
//and defence, move, range, spotting and value, leaders), its transport and carrier views, an entry shown full and new,
//and the dock's height the screen keeps
import { act, cleanup, render } from "@testing-library/preact";
import { afterEach, expect, test, vi } from "vitest";
import { germanyPoland, handWorld } from "./coreworld";
import type { World } from "../src/core/types";
import { leaderDescriptions, leaderType, movMethod, terrainType, unitClass } from "../src/prototypes";
import { createStore } from "../src/view/store";
import { entryCardOf, ordinal, unitCardOf } from "../src/view/unitcard";
import { App } from "../src/view/app";

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
		sprite: e.icon, stars: 1, xp: "120 XP", view: "unit", views: ["unit"], next: true });
	expect(unitCardOf(w, 0, null)!.tags).toEqual([{ text: "Tank", icon: "tank", core: false }, { text: "Hard target", icon: null, core: false },
		{ text: "Tracked", icon: null, core: false }, { text: "Core", icon: null, core: true }]);
	//an enemy seen: Auxiliary, and no Next unit for a unit not the side's own
	expect(unitCardOf(w, 3, null)).toMatchObject({ nation: "pl", next: false, stars: 0, xp: "0 XP" });
	expect(unitCardOf(w, 3, null)!.tags[3]).toEqual({ text: "Auxiliary", icon: null, core: false });
	expect(unitCardOf(w, 99, null)).toBeNull();
	expect([1, 2, 3, 4, 11, 12, 13, 21, 111, -1].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "111st", ""]);
});

test("Its condition is the old window's: strength, fuel, ammo and entrenchment, with no notes beyond it (#441)", () => {
	const w = world(), e = w.equipment[PZ_IIA];
	const [strength, fuel, ammo, dug] = unitCardOf(w, 0, null)!.condition;
	expect(strength).toEqual({ icon: "strength", label: "Strength", value: "10/10", fill: 1, state: "ok" });
	expect(fuel).toMatchObject({ label: "Fuel", value: `18/${e.fuel}` });
	expect(ammo).toMatchObject({ label: "Ammo", value: `1/${e.ammo}`, state: "critical" });
	//(a city entrenches 3 at once, then up to 5 levels more)
	expect(dug).toMatchObject({ label: "Entrenchment", value: "4", fill: 4 / 8 });
	//walking infantry burns no fuel
	expect(unitCardOf(w, 2, "unit")!.condition[1]).toEqual({ icon: "fuel", label: "Fuel", value: "–", fill: 0 });
});

test("Attack and defence are the old window's stats; move, range and spotting count the leaders in, as the rules do (#37, #441)", () => {
	const w = world(), e = w.equipment[PZ_IIA], card = unitCardOf(w, 0, null)!;
	expect(card.attack.map((s) => [s.name, s.value])).toEqual([["Soft", e.softatk], ["Hard", e.hardatk], ["Air", e.airatk], ["Naval", e.navalatk]]);
	expect(card.defence.map((s) => [s.name, s.value])).toEqual([["Ground", e.grounddef], ["Air", e.airdef], ["Close", e.closedef],
		["Ranged", e.rangedefmod], ["Initiative", e.initiative]]);
	expect(card.attack[0].fill).toBe(e.softatk / 15);
	//the tank's class leader adds a hex to Move
	expect(card.figures).toEqual([
		{ label: "Move", value: e.movpoints + 1, prestige: false },
		{ label: "Range", value: 1, prestige: false },
		{ label: "Spotting", value: e.spotrange, prestige: false },
		{ label: "Value", value: e.cost * 12, prestige: true }]);
	expect(card.leaders.map((l) => [l.name, l.description, l.classLeader])).toEqual([
		["Battlefield Intelligence", leaderDescriptions[leaderType.battlefieldIntelligence][1], false],
		["Aggressive Tank Maneuver", leaderDescriptions[leaderType.aggressiveTankManeuver][1], true]]);
	//a marksman's gun reaches a hex further
	const gun = handWorld({ rows: 6, cols: 6, units: [{ eqid: LEFH18, owner: 0, row: 2, col: 2, leader: leaderType.marksman }] }, undefined, { spotSide: 0 });
	const g = gun.equipment[LEFH18];
	expect(unitCardOf(gun, 0, null)!.figures[1]).toEqual({ label: "Range", value: g.gunrange + 1, prestige: false });
});

test("The folded sheet is every attack and defence stat by its short name, then range, spotting and move as the rules count them", () => {
	const w = world(), e = w.equipment[PZ_IIA];
	expect(unitCardOf(w, 0, null)!.sheet).toEqual([
		{ name: "Soft atk", value: e.softatk }, { name: "Hard atk", value: e.hardatk }, { name: "Air atk", value: e.airatk },
		{ name: "Naval atk", value: e.navalatk }, { name: "Gnd def", value: e.grounddef }, { name: "Air def", value: e.airdef },
		{ name: "Close def", value: e.closedef }, { name: "Ranged def", value: e.rangedefmod }, { name: "Initiative", value: e.initiative },
		{ name: "Range", value: 1 }, { name: "Spotting", value: e.spotrange }, { name: "Move", value: e.movpoints + 1 },
	]);
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
	expect(card).toMatchObject({ unit: null, name: e.name, sub: "Tank · Germany", stars: 0, leaders: [], views: [], next: false });
	expect(card.tags.map((t) => t.text)).toEqual(["Tank", "Hard target", "Tracked"]);
	expect(card.condition.map((m) => m.value)).toEqual(["10/10", `${e.fuel}/${e.fuel}`, `${e.ammo}/${e.ammo}`, "0"]);
	expect(card.figures.map((f) => f.value)).toEqual([e.movpoints, 1, e.spotrange, e.cost * 12]);
});

test("The edges the old window had: a train on rails, a fort with no ordinal, five stars at most, no ammo left (#348)", () => {
	const pz = germanyPoland[PZ_IIA];
	const odd = { ...germanyPoland, 9001: { ...pz, movmethod: movMethod.deepnaval }, 9002: { ...pz, uclass: unitClass.fortification, movpoints: 0, gunrange: 0 } };
	const w = handWorld({ rows: 6, cols: 6, units: [{ eqid: 9001, owner: 0, row: 1, col: 1, experience: 520, ammo: 0 },
		{ eqid: 9002, owner: 0, row: 3, col: 3 }] }, odd, { spotSide: 0 });
	const train = unitCardOf(w, 0, null)!;
	expect([train.tags[2].text, train.stars, train.xp, train.condition[2].value]).toEqual(["Rail road", 5, "520 XP", `0/${pz.ammo}`]);
	const fort = unitCardOf(w, 1, null)!;
	expect([fort.sub, fort.figures[1].value]).toEqual(["Fortification", 1]);
	expect(entryCardOf(w, 9002, 7).figures[1].value).toBe(1);
});

test("The screen keeps the dock's height in the store, for the map to scroll past (#441, #453)", async () => {
	//(jsdom lays nothing out and has no ResizeObserver: one that reports at once, a dock 180px tall)
	let watching = 0;
	vi.stubGlobal("ResizeObserver", class {
		declare report: () => void;
		constructor(report: () => void) { this.report = report; }
		observe() { watching++; this.report(); }
		disconnect() { watching--; }
	});
	vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(180);
	const store = createStore({ world: () => null, command: () => ({ ok: true, result: null }), won: () => {} });
	const { unmount } = render(<App store={store} />);
	expect([store.dockHeight.value, watching]).toEqual([180, 1]);
	await act(() => unmount());
	expect(watching).toBe(0);
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

test("An enemy that fired from hiding shows its card, as the map shows it and the old unit info did (#483)", () => {
	const hidden = (tempSpotted: boolean) => handWorld({ rows: 10, cols: 10, units: [{ eqid: PZ_IIA, owner: 0, row: 1, col: 1 },
		{ eqid: TP7, owner: 1, row: 9, col: 9, tempSpotted }] }, undefined, { spotSide: 0 });
	//(far from the side's tank, on a hex it doesn't spot: no card while it hides)
	expect(unitCardOf(hidden(false), 1, null)).toBeNull();
	expect(unitCardOf(hidden(true), 1, null)).toMatchObject({ unit: 1, name: hidden(true).equipment[TP7].name });
});
