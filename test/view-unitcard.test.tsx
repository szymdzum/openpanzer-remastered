//The unit card's view model (src/view/hud/unitcard.ts, UnitInfo, #348 with #37) on hand-built worlds, the card open: who the
//unit is, its condition with what each gauge means, what it can still do this turn, what it hits and holds against each
//kind of enemy with the bonuses in force, and the band of what riding means. Every phrase is a core query's
//(test/unitfacts.test.ts checks those against the step and the attack); and the dock's height the screen keeps
import { act, cleanup, render } from "@testing-library/preact";
import { afterEach, expect, test, vi } from "vitest";
import { germanyPoland, handWorld, type HandUnit } from "./coreworld";
import { INITIATIVE_DEFENCE, INITIATIVE_MAX_ATTACK, rangeDefence } from "../src/core/combat";
import { weakDefences } from "../src/core/equipment";
import { remasterRules } from "../src/core/rules";
import { step } from "../src/core/step";
import type { World } from "../src/core/types";
import { leaderDescriptions } from "../src/legacy/prototypes";
import { leaderType, movMethod, terrainType, unitClass } from "../src/core/tables";
import { createStore } from "../src/view/store/store";
import { type CardStat, ordinal, type UnitCard, unitCardOf } from "../src/view/hud/unitcard";
import { App } from "../src/view/app";

afterEach(cleanup);

const PZ_IIA = 140, INFANTERIE = 115, OPEL_BLITZ = 157, ME_109 = 159, TP7 = 273, PAK36 = 66, A_WZ13 = 262, SHIPS = 546;

//A Pz IIA of 120 XP with a leader on a hill, dug in 4, low on fuel with one round left; infantry on its truck; a Pz IIA
//over strength; a Messerschmitt; a PaK 36 on its truck; a Polish tank seen; infantry on a transport ship
function world(): World {
	return handWorld({ rows: 12, cols: 12, terrain: (r, c) => r === 2 && c === 2 ? terrainType.Hill : terrainType.Clear, units: [
		{ eqid: PZ_IIA, owner: 0, row: 2, col: 2, experience: 120, leader: leaderType.battlefieldIntelligence, fuel: 18, ammo: 1, entrenchment: 4,
			isCore: true, flag: 8 },
		{ eqid: INFANTERIE, owner: 0, row: 6, col: 2, strength: 7, experience: 240, ammo: 5, isMounted: true,
			transport: { eqid: OPEL_BLITZ, ammo: 4, fuel: 26 }, flag: 8 },
		{ eqid: PZ_IIA, owner: 0, row: 9, col: 2, strength: 12, experience: 220, flag: 8 },
		{ eqid: ME_109, owner: 0, row: 2, col: 6, fuel: 18, flag: 8 },
		{ eqid: PAK36, owner: 0, row: 6, col: 9, isMounted: true, transport: { eqid: OPEL_BLITZ, ammo: 4, fuel: 26 }, flag: 8 },
		{ eqid: TP7, owner: 1, row: 2, col: 8, flag: 16 },
		{ eqid: INFANTERIE, owner: 0, row: 10, col: 9, carrier: SHIPS, flag: 8 },
	] }, undefined, { spotSide: 0 });
}

const cardOf = (w: World, id: number): UnitCard => unitCardOf(w, id)!;
//a gauge, a stat as it reads
const gauge = (c: UnitCard, i: number) => { const g = c.condition[i]; return [g.label, g.value + (g.of ?? ""), g.say, g.state]; };
const read = (s: CardStat) => [s.name, s.value, s.tone];

test("A tank ready to act on a hill with a leader: who it is, its condition and its turn, what it hits and holds (#37)", () => {
	const w = world(), e = w.equipment[PZ_IIA], card = cardOf(w, 0);
	expect(card).toMatchObject({ unit: 0, name: e.name, nation: "de", sub: "101st Tank · Germany", stars: 1, xp: "120 XP", toNextStar: 0.2,
		next: true, band: null, value: e.cost * 12, fires: 1, sees: e.spotrange });
	expect(card.tags).toEqual([{ text: "Hard target", icon: null, core: false }, { text: "Tracked", icon: null, core: false },
		{ text: "Core", icon: null, core: true }]);
	expect(card.leaders.map((l) => [l.name, l.description, l.classLeader])).toEqual([
		["Battlefield Intelligence", leaderDescriptions[leaderType.battlefieldIntelligence][1], false],
		["Aggressive Tank Maneuver", leaderDescriptions[leaderType.aggressiveTankManeuver][1], true]]);
	expect([0, 1, 2, 3].map((i) => gauge(card, i))).toEqual([["Strength", "10/10", null, "ok"], ["Fuel", "18/50", "3 full moves", "low"],
		["Ammo", "1/8", null, "critical"], ["Entrenched", "+4", "+4 defence", "dug"]]);
	//the hill's limit and its own level, what entrenchment does as entrenchmentFacts has it
	expect(card.condition[3].tip).toBe("Entrenchment: up to 6 here, the hill's own 1 at once");
	expect(card.condition[3].sayTip).toBe("Each level adds a point to its defence; not against units that ignore entrenchment, nor Infiltration "
		+ "Tactics anywhere; attacking, it adds 4 to its defence too, but not in close combat");
	//one round left and it can resupply here: the stamp
	expect(card.resupply).toBe(true);
	expect(card.chips.map((c) => c.words)).toEqual(["6 moves left", "Can fire"]);
	expect(card.hits.map(read)).toEqual([["Soft", String(e.softatk), null], ["Hard", String(e.hardatk), null], ["Aircraft", "can't", "none"],
		["Ships", String(e.navalatk), null]]);
	expect(card.hits[0].fill).toBe(e.softatk / 15);
	expect(card.holds.map(read)).toEqual([["Ground fire", String(e.grounddef), null], ["Air attack", String(e.airdef), null],
		["Close assault", String(e.closedef), "weak"], ["From range", "+" + e.rangedefmod, "plus"]]);
	expect(card.initiative.value).toBe(e.initiative);
	//the bonuses in force and what they add to
	expect(card.bonuses.map((b) => [b.text, b.to])).toEqual([["+1 veteran", "attack and defence"], ["+4 entrenched", "defence"]]);
});

test("Mounted infantry after its move: the band says it rides and gets off when attacked, never that it is ambushed (#37)", () => {
	const r = step(world(), { type: "move", unit: 1, to: { row: 6, col: 4 } });
	if ("refusal" in r) throw new Error(r.refusal.reason);
	const w = r.world, card = cardOf(w, 1), truck = w.equipment[OPEL_BLITZ];
	expect(card.band).toEqual({ on: "On Opel Blitz", items: [
		{ text: `moves ${truck.movpoints}, on the Opel Blitz's fuel`, tip: null, warn: false },
		{ text: "can't fire the turn it rides", tip: null, warn: false },
		{ text: "attacked, it gets off and fights on foot", tip: null, warn: false }] });
	expect(JSON.stringify(card)).not.toContain("ambushed");
	//its own values, the ones it fights with on foot; the truck's fuel; no entrenchment, as it moved
	expect([card.tags[0].text, card.tags[1].text, card.holds[0].value]).toEqual(["Soft target", "Leg", String(w.equipment[INFANTERIE].grounddef)]);
	expect([gauge(card, 1), gauge(card, 3), card.condition[3].sayTip]).toEqual([["Fuel", "22/55", "2 full moves", "low"],
		["Entrenched", "0", "it moved", "dug"], "A move leaves no entrenchment"]);
	expect(card.chips.map((c) => [c.words, c.tone])).toEqual([["Riding", null], ["Moved", "off"], ["Can't fire", "off"]]);
	expect(card.bonuses.map((b) => b.text)).toEqual(["+2 veteran"]);
});

test("A towed gun riding defends as its truck: the band says so in critical (#37)", () => {
	const w = world(), card = cardOf(w, 4), truck = w.equipment[OPEL_BLITZ];
	expect(card.band!.items[2]).toEqual({ text: "attacked or ambushed, it defends " + truck.grounddef, warn: true,
		tip: `As its Opel Blitz: ground defence ${truck.grounddef}, air defence ${truck.airdef}` });
	//its own values beside it: what it holds once off the truck
	expect(card.holds[0].value).toBe(String(w.equipment[PAK36].grounddef));
});

test("A unit on a transport ship: the same band, the ship's moves and what it defends with (#37)", () => {
	const w = world(), ship = w.equipment[SHIPS];
	expect(cardOf(w, 6).band).toEqual({ on: "On " + ship.name, items: [{ text: "moves " + ship.movpoints, tip: null, warn: false },
		{ text: "attacked, it defends " + ship.grounddef, tip: `As its ${ship.name}: ground defence ${ship.grounddef}, air defence ${ship.airdef}`,
			warn: false }] });
});

test("Over strength: the points past ten, out of ten, and the veteran's bonus (#37)", () => {
	const card = cardOf(world(), 2);
	expect([gauge(card, 0), card.condition[0].segs]).toEqual([["Strength", "12/10", null, "ok"], [...Array(10).fill("on"), "over", "over"]]);
	expect([card.stars, card.toNextStar, card.bonuses.map((b) => b.text)]).toEqual([2, 0.2, ["+2 veteran"]]);
	expect(card.resupply).toBe(false); //full
});

test("An aircraft: its fuel alone, no entrenchment, it hits aircraft; no close assault or range defence in the air (#37)", () => {
	const w = world(), e = w.equipment[ME_109], card = cardOf(w, 3);
	expect([gauge(card, 1), gauge(card, 3)]).toEqual([["Fuel", "18/115", null, "critical"], ["Entrenched", "–", null, null]]);
	expect(card.hits[2]).toMatchObject({ name: "Aircraft", value: String(e.airatk), tone: null });
	expect(card.holds.slice(2).map(read)).toEqual([["Close assault", "–", "none"], ["From range", "–", "none"]]);
	//(an aircraft can't resupply in the field: no stamp, however low its fuel)
	expect(card.resupply).toBe(false);
});

test("The weak defence is weakDefences': the lowest of ground, air and close, at most half the highest, in critical (#37)", () => {
	const pz = germanyPoland[PZ_IIA];
	const odd = { ...germanyPoland, 9001: { ...pz, grounddef: 7, airdef: 8, closedef: 5 }, 9002: { ...pz, grounddef: 9, airdef: 3, closedef: 6 } };
	const w = handWorld({ rows: 6, cols: 6, units: [{ eqid: 9001, owner: 0, row: 1, col: 1 }, { eqid: 9002, owner: 0, row: 3, col: 3 }] }, odd,
		{ spotSide: 0 });
	const tones = (id: number) => cardOf(w, id).holds.slice(0, 3).map((s) => s.tone);
	expect([weakDefences(odd[9001]), tones(0)]).toEqual([[], [null, null, null]]);
	expect([weakDefences(odd[9002]), tones(1)]).toEqual([["airdef"], [null, "weak", null]]);
});

test("What entrenchment does and the rules' tooltips are the core's: street fighters, twice in close terrain, ferocious defense, initiative, range, close combat (#37)", () => {
	const dug = (unit: Partial<HandUnit> & Pick<HandUnit, "eqid">, terrain = terrainType.City) => {
		const w = handWorld({ rows: 6, cols: 6, terrain: () => terrain, units: [{ owner: 0, row: 2, col: 2, entrenchment: 2, ...unit }] },
			undefined, { spotSide: 0 });
		return cardOf(w, 0);
	};
	const city = dug({ eqid: INFANTERIE });
	expect(city.condition[3].sayTip).toBe("Each level adds a point to its defence; not against units that ignore entrenchment, nor Infiltration "
		+ "Tactics anywhere, nor Street Fighter in a city, port or rough; twice here against tank, recon, anti tank, flak or fortification; "
		+ "attacking, it adds 2 to its defence too, but not in close combat");
	expect(dug({ eqid: INFANTERIE, leader: leaderType.ferociousDefense }).condition[3].sayTip).toContain("Ferocious Defense: nothing ignores it");
	expect(city.bonuses).toEqual([{ text: "+2 entrenched", to: "defence", tip: city.condition[3].sayTip }]);
	expect(city.initiative.tip).toBe(`In a fight the side with more initiative, the attacker on a tie, gets +${INITIATIVE_DEFENCE} defence and its `
		+ `lead in attack, up to +${INITIATIVE_MAX_ATTACK}`);
	const remaster = cardOf(handWorld({ rows: 6, cols: 6, units: [{ eqid: INFANTERIE, owner: 0, row: 2, col: 2 }] }, undefined,
		{ spotSide: 0, rules: remasterRules }), 0);
	expect(remaster.initiative.tip).toBe(city.initiative.tip + "; the defender's terrain caps both sides' initiative"
		+ ". Each experience level adds 1, a random 0 to 2 is added for each side, and an attacker that is surprised or meets a rugged defense has none");
	expect(city.holds[2].tip).toBe("Its defence when infantry attacks it in a city, forest, mountain or fortification hex");
	//a gun that reaches past its neighbours gets all of its range defence from there to its range
	const gun = dug({ eqid: A_WZ13 }, terrainType.Clear), g = germanyPoland[A_WZ13];
	expect(gun.holds[3].tip).toBe(`Added to its defence when ground units fire on it, not in close combat: +${rangeDefence(g.rangedefmod, 2, g.gunrange)}`
		+ ` from 2 to ${g.gunrange} hexes off, +${rangeDefence(g.rangedefmod, 1, g.gunrange)} next to it or from further`);
	expect(city.holds[3].tip).toBe(`Added to its defence when ground units fire on it, not in close combat: +${germanyPoland[INFANTERIE].rangedefmod >> 1}, `
		+ "half, as it fires only at its neighbours");
});

test("An enemy seen has its card, no chips and no Next unit; none for a unit gone or hidden (#37, #483)", () => {
	const w = world();
	expect(cardOf(w, 5)).toMatchObject({ nation: "pl", next: false, chips: [], stars: 0, xp: "0 XP" });
	expect(cardOf(w, 5).tags[2]).toEqual({ text: "Auxiliary", icon: null, core: false });
	expect(unitCardOf(w, 99)).toBeNull();
	const hidden = (tempSpotted: boolean) => handWorld({ rows: 10, cols: 10, units: [{ eqid: PZ_IIA, owner: 0, row: 1, col: 1 },
		{ eqid: TP7, owner: 1, row: 9, col: 9, tempSpotted }] }, undefined, { spotSide: 0 });
	//(far from the side's tank, on a hex it doesn't spot: no card while it hides; one after it fired from hiding)
	expect(unitCardOf(hidden(false), 1)).toBeNull();
	expect(unitCardOf(hidden(true), 1)).toMatchObject({ unit: 1, name: hidden(true).equipment[TP7].name });
	expect([1, 2, 3, 4, 11, 12, 13, 21, 111, -1].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "111st", ""]);
});

test("The edges the old window had: a train on rails, a fort with no ordinal that holds anywhere at close quarters, five stars at most (#348)", () => {
	const pz = germanyPoland[PZ_IIA];
	const odd = { ...germanyPoland, 9001: { ...pz, movmethod: movMethod.deepnaval }, 9002: { ...pz, uclass: unitClass.fortification, movpoints: 0, gunrange: 0 } };
	const w = handWorld({ rows: 6, cols: 6, units: [{ eqid: 9001, owner: 0, row: 1, col: 1, experience: 520, ammo: 0 },
		{ eqid: 9002, owner: 0, row: 3, col: 3 }] }, odd, { spotSide: 0 });
	const train = cardOf(w, 0);
	expect([train.tags[1].text, train.stars, train.toNextStar, train.xp, gauge(train, 2)]).toEqual(["Rail road", 5, 1, "520 XP",
		["Ammo", `0/${pz.ammo}`, null, "critical"]]);
	const fort = cardOf(w, 1);
	expect([fort.sub, fort.fires, fort.holds[2].tip]).toEqual(["Fortification", 1, "Its defence when infantry attacks it, anywhere: it is a fortification"]);
});

test("A deep naval ground unit at sea reads as naval, on land as a rail road (#359)", () => {
	const pz = germanyPoland[PZ_IIA], odd = { ...germanyPoland, 9001: { ...pz, movmethod: movMethod.deepnaval } };
	const on = (terrain: number) => handWorld({ rows: 6, cols: 6, terrain: () => terrain, units: [{ eqid: 9001, owner: 0, row: 1, col: 1 }] }, odd,
		{ spotSide: 0 });
	expect(cardOf(on(terrainType.Ocean), 0).tags[1].text).toBe("Deep Naval");
	expect(cardOf(on(terrainType.Port), 0).tags[1].text).toBe("Rail road");
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
