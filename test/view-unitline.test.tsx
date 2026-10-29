//The unit card's line (src/view/unitline.ts, src/view/infopanel.tsx; UnitInfo, #37), the card hidden, its default size,
//on hand-built worlds: the four gauges with what each means, the This turn chips, and their names for screen readers.
//Every phrase is a core query's (test/unitfacts.test.ts checks those against the step and the attack)
import { act, cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, expect, test } from "vitest";
import { handWorld } from "./coreworld";
import { step } from "../src/core/step";
import type { World } from "../src/core/types";
import { leaderType, terrainType } from "../src/core/tables";
import { UnitInfoPanel } from "../src/view/infopanel";
import { createStore } from "../src/view/store";
import { unitCardOf } from "../src/view/unitcard";
import type { CardLine, LineGauge } from "../src/view/unitline";

afterEach(cleanup);

const PZ_IIA = 140, INFANTERIE = 115, OPEL_BLITZ = 157, ME_109 = 159, TP7 = 273, PAK36 = 66;

//A Pz IIA of 120 XP with a leader on a hill, dug in 4, low on fuel with one round left; infantry on its truck; a Pz IIA
//over strength; a Messerschmitt low on fuel; a Pz IIA out of fuel; a PaK 36; a Polish tank seen
function world(): World {
	return handWorld({ rows: 12, cols: 12, terrain: (r, c) => r === 2 && c === 2 ? terrainType.Hill : terrainType.Clear, units: [
		{ eqid: PZ_IIA, owner: 0, row: 2, col: 2, experience: 120, leader: leaderType.battlefieldIntelligence, fuel: 18, ammo: 1, entrenchment: 4,
			flag: 8 },
		{ eqid: INFANTERIE, owner: 0, row: 6, col: 2, strength: 7, experience: 240, ammo: 5, isMounted: true,
			transport: { eqid: OPEL_BLITZ, ammo: 4, fuel: 26 }, flag: 8 },
		{ eqid: PZ_IIA, owner: 0, row: 9, col: 2, strength: 12, experience: 220, flag: 8 },
		{ eqid: ME_109, owner: 0, row: 2, col: 6, fuel: 18, flag: 8 },
		{ eqid: PZ_IIA, owner: 0, row: 9, col: 6, fuel: 0, strength: 3, flag: 8 },
		{ eqid: PAK36, owner: 0, row: 6, col: 9, flag: 8 },
		{ eqid: TP7, owner: 1, row: 4, col: 9, flag: 16 },
	] }, undefined, { spotSide: 0 });
}

const lineOf = (w: World, id: number): CardLine => unitCardOf(w, id)!.line;
//a gauge as it reads: label, what it means, value, maximum, state
const read = (g: LineGauge) => [g.label, g.say, g.value + (g.of ?? ""), g.state];
const chips = (line: CardLine) => line.chips.map((c) => [c.icon, c.count, c.words, c.tone]);

test("A tank ready to act: full strength, the full moves its fuel is enough for, one round left, dug in on a hill; it can move and fire (#37)", () => {
	const w = world(), line = lineOf(w, 0);
	expect([line.sprite, line.rides, line.formation]).toEqual([w.equipment[PZ_IIA].icon, null, "101st Tank"]);
	expect(line.gauges.map(read)).toEqual([["Strength", null, "10", "ok"], ["Fuel", "3 full moves", "18/50", "low"],
		["Ammo", null, "1/8", "critical"], ["Entrenched", null, "+4", "dug"]]);
	//a segment a point and a round; a level the hill allows (its 1 and 5 more), its own lighter
	const [strength, fuel, ammo, dug] = line.gauges;
	expect(strength.segs).toEqual(Array(10).fill("on"));
	expect([fuel.segs, fuel.fill]).toEqual([null, 18 / 50]);
	expect(ammo.segs).toEqual(["on", "off", "off", "off", "off", "off", "off", "off"]);
	expect(dug.segs).toEqual(["base-on", "on", "on", "on", "off", "off"]);
	//(its class leader's hex is a move: 5 and 1)
	expect(chips(line)).toEqual([["arrow-right", 6, "6 moves left", "ok"], ["target", null, "Can fire", "ok"]]);
	//(the map's readiness marks, an arrow and a crosshair; the number says what it counts)
	expect(line.chips.map((c) => c.unit)).toEqual(["moves", null]);
});

test("Mounted infantry after its move: the truck's fuel and moves, its own rounds, no entrenchment; riding, moved, can't fire (#37)", () => {
	const r = step(world(), { type: "move", unit: 1, to: { row: 6, col: 4 } });
	if ("refusal" in r) throw new Error(r.refusal.reason);
	const w = r.world, line = lineOf(w, 1);
	expect([line.sprite, line.rides, line.formation]).toEqual([w.equipment[INFANTERIE].icon,
		{ sprite: w.equipment[OPEL_BLITZ].icon, name: w.equipment[OPEL_BLITZ].name }, "1st Infantry"]);
	//(wheels pay 2 a clear hex: 26 - 4 = 22 of the truck's 55, two moves of its 10 points)
	expect(line.gauges.map(read)).toEqual([["Strength", null, "7", "ok"], ["Fuel", "2 full moves", "22/55", "low"],
		["Ammo", null, "5/6", "ok"], ["Entrenched", null, "0", "dug"]]);
	expect(line.gauges[3].segs).toEqual(Array(5).fill("off"));
	expect(chips(line)).toEqual([["mount", null, "Riding", null], ["arrow-right", 0, "Moved", "off"], ["target", null, "Can't fire", "off"]]);
});

test("Over strength: the points past ten in brass, the number with no words beside it; strength 3 is critical (#37)", () => {
	const w = world(), [strength] = lineOf(w, 2).gauges;
	expect(read(strength)).toEqual(["Strength", null, "12", "ok"]);
	expect(strength.segs).toEqual([...Array(10).fill("on"), "over", "over"]);
	expect(read(lineOf(w, 4).gauges[0])).toEqual(["Strength", null, "3", "critical"]);
});

test("An aircraft shows its fuel alone, with no moves; it can't dig in (#37)", () => {
	const line = lineOf(world(), 3);
	expect(line.gauges.map(read)).toEqual([["Strength", null, "10", "ok"], ["Fuel", null, "18/115", "critical"],
		["Ammo", null, "11/11", "ok"], ["Entrenched", null, "–", null]]);
	expect(chips(line)[1]).toEqual(["target", null, "Can fire", "ok"]);
});

test("A unit with no fuel: no full moves, and it can't move; a gun with more rounds than segments has a bar; the enemy has no chips (#37)", () => {
	const w = world(), line = lineOf(w, 4);
	expect(read(line.gauges[1])).toEqual(["Fuel", "0 full moves", "0/50", "critical"]);
	expect(chips(line)[0]).toEqual(["arrow-right", 0, "Can't move", "off"]);
	//(a towed gun burns no fuel: "–"; its 24 rounds as a bar)
	const gun = lineOf(w, 5);
	expect([read(gun.gauges[1]), gun.gauges[2].segs, gun.gauges[2].value]).toEqual([["Fuel", null, "–", null], null, "24"]);
	expect(lineOf(w, 6).chips).toEqual([]);
});

//The card on a store whose host plays the commands on the core
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

test("The line: sprite, flag, name, stars and formation, the gauges (the fuel with its meaning), the chips by name, More and Next unit (#37)", async () => {
	const store = panelOf(world());
	await act(() => { store.pickUnit(0); });
	const panel = screen.getByRole("region", { name: "Selected unit" });
	expect([panel.id, panel.className]).toEqual(["unit-info", "pm-panel pm-uinfo line"]);
	expect(document.getElementById("uName")!.textContent).toBe(store.world.value!.equipment[PZ_IIA].name);
	expect(document.getElementById("uSmallFlag")).not.toBeNull();
	expect(panel.querySelector(".ui-sub")!.textContent).toBe("Experience 1 of 5101st Tank");
	expect([...panel.querySelectorAll(".ui-g")].map((g) => [g.className, g.textContent])).toEqual([["ui-g ok", "Strength10"],
		["ui-g low", "Fuel3 full moves18/50"], ["ui-g critical", "Ammo1/8"], ["ui-g dug", "Entrenched+4"]]);
	expect([...panel.querySelectorAll(".ui-g.dug .ui-segs i")].map((i) => i.className)).toEqual(["base-on", "on", "on", "on", "off", "off"]);
	//each chip: its icon and number, the words in its tooltip and its name for screen readers
	const chipsShown = [...panel.querySelectorAll(".ui-chip")];
	expect(chipsShown.map((c) => [c.className, c.getAttribute("title"), c.querySelector(".pm-sr")!.textContent])).toEqual([
		["ui-chip ok", "6 moves left", "6 moves left"], ["ui-chip ok", "Can fire", "Can fire"]]);
	expect(chipsShown.map((c) => c.querySelector(".n")?.textContent ?? null)).toEqual(["6", null]);
	for (const name of ["More", "Next unit"]) expect(screen.getByRole("button", { name }).getAttribute("title")).toBe(name);
	//nothing of the open card, and no Hide: the line is the card hidden
	expect([document.querySelector("#unit-info .ui-vs"), screen.queryByRole("button", { name: "Hide" })]).toEqual([null, null]);
	//Next unit selects the side's next unit that hasn't moved, on its line
	await act(() => { fireEvent.click(screen.getByRole("button", { name: "Next unit" })); });
	expect([store.selected.value, document.getElementById("unit-info")!.className]).toEqual([1, "pm-panel pm-uinfo line"]);
});

test("Riding, the transport's sprite under the unit's, named; More opens the card, Less, Esc and a click on the map fold it back to the line (#37)", async () => {
	const store = panelOf(world());
	await act(() => { store.pickUnit(1); });
	const ride = document.querySelector("#unit-info .ui-ride")!;
	expect([ride.getAttribute("title"), ride.textContent]).toEqual(["On its Opel Blitz", "On its Opel Blitz"]);
	expect(screen.getByTitle("Riding").textContent).toBe("Riding");
	await act(() => { fireEvent.click(screen.getByRole("button", { name: "More" })); });
	expect([document.getElementById("unit-info")!.className, store.cardSize.value]).toEqual(["pm-panel pm-uinfo open", "open"]);
	expect(document.querySelector("#unit-info .ui-ribbon")).not.toBeNull();
	await act(() => { fireEvent.click(screen.getByRole("button", { name: "Less" })); });
	expect([document.getElementById("unit-info")!.className, store.cardSize.value]).toEqual(["pm-panel pm-uinfo line", "line"]);
	await act(() => { fireEvent.click(screen.getByRole("button", { name: "More" })); });
	await act(() => { fireEvent.keyDown(document, { key: "Escape" }); });
	expect(store.cardSize.value).toBe("line");
	await act(() => { fireEvent.click(screen.getByRole("button", { name: "More" })); });
	await act(() => { store.clickHex({ row: 6, col: 2 }); });
	expect([store.cardSize.value, document.getElementById("unit-info")!.className]).toEqual(["line", "pm-panel pm-uinfo line"]);
	await act(() => { store.pickUnit(1); });
	//an enemy: no chips, no Next unit
	await act(() => { store.pickUnit(6); });
	expect([document.querySelector("#unit-info .ui-chip"), screen.queryByRole("button", { name: "Next unit" })]).toEqual([null, null]);
});
