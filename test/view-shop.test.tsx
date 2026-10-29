//The unit list and the equipment window on the new UI (src/view/hud/unitlist.ts, src/view/windows/shop.ts, src/view/windows/shopstate.ts,
//src/view/hud/unitstrip.tsx, src/view/windows/shopwindow.tsx; UnitList, Equipment, #348) on hand-built worlds with Germany's
//equipment lists of the game's files: the list's cards and order, the models in service by class with their counts and
//sorts, the transports that carry a model, and Buy new, Upgrade and Sell with the core's prices and refusals
import fs from "node:fs";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import { handWorld, reserveUnit } from "./coreworld";
import { sellCost, unitCost, upgradeCost } from "../src/core/costs";
import { step } from "../src/core/step";
import type { World } from "../src/core/types";
import { playerType, unitClass } from "../src/core/tables";
import { choiceFor, type ShopChoice, shopOf } from "../src/view/windows/shop";
import { createStore } from "../src/view/store/store";
import { unitListOf, NAVAL_ICON } from "../src/view/hud/unitlist";
import { ShopWindow } from "../src/view/windows/shopwindow";
import { UnitStrip } from "../src/view/hud/unitstrip";

afterEach(cleanup);

const PZ_IA = 138, PZ_IIA = 140, PZ_IIIE = 142, PZ_IVD = 148, INFANTERIE = 115, OPEL = 157, SDKFZ251 = 156, TP7 = 273, SHIPS = 546;

//Germany's equipment lists by class, as its country file has them
const indexes = (JSON.parse(fs.readFileSync(path.join(__dirname, "../game/resources/equipment/eqp-adlerkorps/equipment-country-8.json"), "utf8")) as
	{ indexes: World["state"]["equipment"]["indexes"][string] }).indexes;

//1939, player 0's turn with 300 prestige and a deployment hex at 0,0: a core Pz IIA that has moved and is low on
//ammo, a core Infanterie on an Opel Blitz, an auxiliary Pz IA; a Polish 7TP
function world(change: (w: World) => void = () => {}): World {
	const w = handWorld({ rows: 8, cols: 8, units: [
		{ eqid: PZ_IIA, owner: 0, row: 2, col: 2, isCore: true, hasMoved: true, ammo: 1, flag: 8 },
		{ eqid: INFANTERIE, owner: 0, row: 3, col: 3, isCore: true, transport: { eqid: OPEL, ammo: 0, fuel: 20 }, flag: 8 },
		{ eqid: PZ_IA, owner: 0, row: 4, col: 4, flag: 8 },
		{ eqid: TP7, owner: 1, row: 6, col: 6, flag: 16 },
	] }, undefined, { spotSide: 0 });
	w.state.equipment.indexes["8"] = indexes;
	w.state.players[0].prestige = 300;
	w.state.players[0].core = [{ onMap: 0 }, { onMap: 1 }, { reserve: reserveUnit(PZ_IIA) }];
	w.data.hexes[0].deployment = 0;
	change(w);
	return w;
}

const base: ShopChoice = { target: null, uclass: unitClass.tank, country: 0, eqid: -1, transport: -1, sort: "cost", reverse: false };

test("The unit list has the player's units on the map, core first, then by class and name; moved, fired and low supply said (#348)", () => {
	const list = unitListOf(world(), 1);
	expect(list.units.map((u) => [u.id, u.sub, u.selected])).toEqual([[1, "1st", true], [0, "101st · moved", false], [2, "2nd", false]]);
	expect(list.units[1]).toMatchObject({ name: "Pz IIA", strength: 10, moved: true, ammo: "critical", fuel: null });
	//the old list's order: core first, then class, name, id
	const many = handWorld({ rows: 8, cols: 8, units: [{ eqid: PZ_IIA, owner: 0, row: 1, col: 1 }, { eqid: PZ_IA, owner: 0, row: 1, col: 2 },
		{ eqid: INFANTERIE, owner: 0, row: 1, col: 3 }, { eqid: PZ_IA, owner: 0, row: 1, col: 4 }, { eqid: PZ_IIIE, owner: 0, row: 1, col: 5, isCore: true },
		{ eqid: PZ_IA, owner: 0, row: 1, col: 6, isCore: true }] }, undefined, { spotSide: 0 });
	expect(unitListOf(many, null).units.map((u) => u.id)).toEqual([5, 4, 2, 1, 3, 0]);
	//a fired unit, a ship's generic sprite
	const w = world((x) => { x.state.units[2].hasFired = true; });
	expect(unitListOf(w, null).units[2].sub).toBe("2nd · fired");
	const sea = handWorld({ rows: 4, cols: 4, units: [{ eqid: SHIPS, owner: 0, row: 1, col: 1 }] }, undefined, { spotSide: 0 });
	expect(unitListOf(sea, null).units[0].sprite).toBe(NAVAL_ICON);
	//a program's turn: none
	expect(unitListOf(world((x) => { x.state.players[0].type = playerType.aiLocal; }), null).units).toEqual([]);
});

test("The window lists the class's models in service this year by cost, its tabs without counts as the old window's; a sort and its reverse (#348)", () => {
	const shop = shopOf(world(), base)!;
	expect(shop.title).toBe("Germany · September 1939");
	expect(shop.prestige).toBe("300");
	expect(shop.tabs.map((t) => t.label)).toEqual(["Infantry", "Tank", "Recon", "Anti-tank", "Artillery", "Anti-air", "Fighter", "Bomber"]);
	expect(shop.tabs[1]).toEqual({ uclass: unitClass.tank, label: "Tank", icon: "tank" });
	expect(shop.models.map((m) => m.name)).toEqual(["Pz IA", "Pz IB", "Pz IIA", "Pz IID", "Pz 35(t)", "Pz 38(t)A", "Pz IIIE", "Pz IVC", "Pz IVD"]);
	expect(shop.models[0]).toMatchObject({ eqid: PZ_IA, year: 1934, cost: 180, stat: null, current: false });
	const hard = shopOf(world(), { ...base, sort: "hardatk" })!;
	expect(hard.models.slice(-2).map((m) => [m.name, m.stat])).toEqual([["Pz 38(t)A", "Hard atk 7"], ["Pz IIIE", "Hard atk 7"]]);
	expect(shopOf(world(), { ...base, sort: "hardatk", reverse: true })!.models[0].name).toBe("Pz IIIE");
	//nothing picked: Buy new waits for a model, nothing to sell or upgrade
	expect([shop.picked, shop.buy.refusal, shop.sell, shop.upgrade, shop.target]).toEqual([null, "Pick a model", null, null, null]);
	expect(shopOf(world((x) => { x.state.players[0].type = playerType.aiLocal; }), base)).toBeNull();
});

test("Opened on a unit it shows its class with its model current; a better one priced as the core prices the upgrade (#348)", () => {
	const w = world(), choice = choiceFor(w, { unit: 0 });
	expect(choice).toMatchObject({ uclass: unitClass.tank, eqid: PZ_IIA, target: { unit: 0 } });
	const own = shopOf(w, choice)!;
	expect([own.target, own.models.find((m) => m.current)!.name, own.upgrade]).toEqual(["101st Pz IIA", "Pz IIA",
		{ cost: 0, refusal: "Nothing to upgrade", command: null }]);
	//the sell price, a unit on the map disbanded
	expect(own.sell).toEqual({ cost: sellCost(w, w.state.units[0]), refusal: null, command: { type: "disband", unit: 0 } });
	const better = shopOf(w, { ...choice, eqid: PZ_IIIE })!;
	const cost = upgradeCost(w, w.state.units[0], PZ_IIIE, -1);
	expect(better.upgrade).toEqual({ cost, refusal: null, command: { type: "upgrade", unit: 0, eqid: PZ_IIIE, transport: -1 } });
	expect(better.picked).toMatchObject({ name: "Pz IIIE", line: "Tank · Hard target · Tracked · in service from 1939" });
	//its stats as the old window showed an entry's, no difference to the unit's (#441); a tank rides nothing (#513)
	const e = w.equipment;
	expect(better.picked!.compare.find((c) => c.name === "Hard attack")).toEqual({ name: "Hard attack", value: String(e[PZ_IIIE].hardatk),
		mounted: null, change: null });
	expect([better.picked!.rides, better.picked!.rule, better.split]).toEqual([null, null, null]);
	//too dear: the old window's words
	const poor = world((x) => { x.state.players[0].prestige = 50; });
	expect(shopOf(poor, { ...choice, eqid: PZ_IVD })!.upgrade!.refusal).toBe(`Need ${upgradeCost(w, w.state.units[0], PZ_IVD, -1) - 50} more prestige to upgrade`);
	//a model of another class can't be the unit's upgrade
	expect(shopOf(w, { ...choice, uclass: unitClass.infantry, eqid: INFANTERIE })!.upgrade!.refusal).toBe("Not the same class");
	//a downgrade has a negative price: not offered
	expect(shopOf(w, { ...choice, eqid: PZ_IA })!.upgrade!.refusal).toBe("Nothing to upgrade");
});

test("Buy new: the model and its transport at the core's price; refused for prestige, or with no free deployment hex (#348)", () => {
	const w = world();
	const buy = shopOf(w, { ...base, eqid: PZ_IIIE })!.buy;
	expect(buy).toEqual({ cost: unitCost(w, PZ_IIIE, -1), refusal: null, command: { type: "buy", eqid: PZ_IIIE, transport: -1 } });
	expect(shopOf(w, { ...base, eqid: PZ_IVD })!.buy.refusal).toBe(`Need ${unitCost(w, PZ_IVD) - 300} more prestige to buy`);
	const full = world((x) => { x.data.hexes[0].deployment = -1; });
	expect(shopOf(full, { ...base, eqid: PZ_IA })!.buy.refusal).toBe("No free deployment hex");
	//an infantry model with a truck: both priced
	const inf = shopOf(w, { ...base, uclass: unitClass.infantry, eqid: INFANTERIE, transport: OPEL })!;
	expect(inf.buy).toMatchObject({ cost: unitCost(w, INFANTERIE, OPEL), command: { type: "buy", eqid: INFANTERIE, transport: OPEL } });
});

test("The transports that carry the model, with None; the unit's own is picked until another is, pressed again none (#348)", () => {
	const w = world(), choice = choiceFor(w, { unit: 1 });
	const shop = shopOf(w, choice)!;
	expect(shop.uclass).toBe(unitClass.infantry);
	expect(shop.transports[0]).toEqual({ eqid: -2, name: "None", on: false, sprite: null, ground: "On foot", gives: null });
	expect(shop.transports.find((t) => t.on)!.eqid).toBe(OPEL);
	//every one carries an Infanterie's weight; a tank has none to pick
	expect(shop.transports.slice(1).every((t) => (w.equipment[t.eqid].groundweight & w.equipment[INFANTERIE].groundweight) !== 0)).toBe(true);
	expect(shopOf(w, { ...base, eqid: PZ_IIA })!.transports).toEqual([]);
	//another transport: the upgrade is the transport's change
	const truck = shopOf(w, { ...choice, transport: SDKFZ251 })!;
	expect(truck.upgrade).toMatchObject({ cost: upgradeCost(w, w.state.units[1], INFANTERIE, SDKFZ251), command: { transport: SDKFZ251 } });
	expect(shopOf(w, { ...choice, transport: -2 })!.transports[0].on).toBe(true);
});

test("Each transport says what it gives, and the model's stats show it on foot and mounted (#513)", () => {
	const w = world(), e = w.equipment, opel = e[OPEL], choice = { ...base, uclass: unitClass.infantry, eqid: INFANTERIE, transport: OPEL };
	const shop = shopOf(w, choice)!;
	//the truck's row: its price, moves, fuel and defence, ground · air · close, and how it moves
	expect(shop.transports.find((t) => t.eqid === OPEL)).toEqual({ eqid: OPEL, name: opel.name, on: true, sprite: opel.icon, ground: "Wheeled",
		gives: { cost: unitCost(w, OPEL), moves: opel.movpoints, fuel: opel.fuel, def: `${opel.grounddef}·${opel.airdef}·${opel.closedef}` } });
	//mounted, the infantry moves and defends as its truck and can't attack; fuel has no better or worse
	const stat = (name: string) => shop.picked!.compare.find((c) => c.name === name)!;
	expect(stat("Movement")).toEqual({ name: "Movement", value: String(e[INFANTERIE].movpoints), mounted: String(opel.movpoints), change: "up" });
	expect(stat("Ground def")).toEqual({ name: "Ground def", value: String(e[INFANTERIE].grounddef), mounted: String(opel.grounddef), change: "down" });
	expect(stat("Soft attack")).toMatchObject({ mounted: "–", change: null });
	expect(stat("Fuel")).toEqual({ name: "Fuel", value: "—", mounted: String(opel.fuel), change: null });
	expect(shop.picked!.rides).toEqual({ name: opel.name, sprite: opel.icon });
	expect(shop.picked!.rule).toBe("Mounted, it moves and defends as its transport and can't attack; attacked, it fights on foot unless surprised. Def: ground · air · close.");
	//the price in two, the unit's and the truck's, as Buy new adds them
	expect(shop.split).toEqual({ unit: unitCost(w, INFANTERIE), transport: opel.name, cost: unitCost(w, OPEL) });
	expect(shop.split!.unit + shop.split!.cost).toBe(shop.buy.cost);
	//a horse-drawn wagon uses no fuel: "—" mounted too
	const horse = shop.transports.find((t) => t.gives !== null && t.gives.fuel === 0)!;
	expect(shopOf(w, { ...choice, transport: horse.eqid })!.picked!.compare.find((c) => c.name === "Fuel")!.mounted).toBe("—");
	//on foot: no Mounted column, no split, the rule still said
	const foot = shopOf(w, { ...choice, transport: -2 })!;
	expect([foot.picked!.rides, foot.split, foot.picked!.compare.every((c) => c.mounted === null), foot.picked!.rule !== null]).toEqual([null, null, true, true]);
});

test("A reserve unit is upgraded and sold off the map by its core list place; in a campaign only core units sell, and only its country buys (#348)", () => {
	const w = world(), choice = choiceFor(w, { index: 2 });
	const shop = shopOf(w, { ...choice, eqid: PZ_IIIE })!;
	expect([shop.target, shop.upgrade!.command, shop.sell!.command]).toEqual(["Pz IIA",
		{ type: "upgradeUndeployed", index: 2, eqid: PZ_IIIE, transport: -1 }, { type: "sell", index: 2 }]);
	const campaign = world((x) => { x.state.campaign = { country: 7 } as never; });
	expect(shopOf(campaign, choiceFor(campaign, { unit: 2 }))!.sell).toBeNull();
	expect(shopOf(campaign, { ...base, eqid: PZ_IIIE })!.buy.refusal).toBeNull();
	const other = world((x) => { x.state.campaign = { country: 3 } as never; });
	expect(shopOf(other, { ...base, eqid: PZ_IIIE })!.buy).toEqual({ cost: 0, refusal: "Not your country's", command: null });
	//an enemy unit, or one gone: nothing to work on
	expect(shopOf(w, { ...base, target: { unit: 3 } })!.target).toBeNull();
	expect(shopOf(w, { ...base, target: { index: 9 } })!.target).toBeNull();
	expect(choiceFor(w, { unit: 3 })).toEqual(base);
});

//The strip and the window on a store whose host plays the person's commands on the core
function shopStore(w: World) {
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
	render(<><UnitStrip store={store} /><ShopWindow store={store} /></>);
	return store;
}

test("The unit list opens from the status bar's button; a card pressed selects its unit and looks at it; Esc closes it (#348)", async () => {
	const store = shopStore(world());
	await act(() => store.toggleList());
	const list = screen.getByRole("region", { name: "Your units" });
	expect(list.id).toBe("container-unitlist");
	expect(["hscroll-unitlist", "unitlist"].map((id) => list.querySelector("#" + id) !== null)).toEqual([true, true]);
	//(no counts in its header: the old list had none)
	expect(list.textContent).not.toContain("low on supply");
	const card = within(list).getByRole("button", { name: "Pz IIA 101st · moved, strength 10, low ammo" });
	expect(card.className).toBe("pm-ucard is-done");
	await act(() => { fireEvent.click(card); });
	expect([store.selected.value, store.lookAt.value]).toEqual([0, { row: 2, col: 2 }]);
	expect(card.getAttribute("aria-pressed")).toBe("true");
	await act(() => { fireEvent.keyDown(document, { key: "Escape" }); });
	expect(screen.queryByRole("region", { name: "Your units" })).toBeNull();
});

test("B opens the window on the selected unit; a model picked, Upgrade and Buy new play on the core; Sell disbands; Esc closes (#348)", async () => {
	const store = shopStore(world((x) => { x.state.players[0].prestige = 600; }));
	await act(() => { store.pickUnit(0); store.shortcut({ menu: "buy" }); });
	const win = document.getElementById("equipment")!;
	expect(["eqSelClass", "eqUnitList", "eqActionsContainer", "eqSelCountryButton", "currentPrestige", "eqCloseBut", "eqSellBut", "eqUpgradeBut",
		"eqNewBut", "eqSortOrderBut"].filter((id) => win.querySelector("#" + id) === null)).toEqual([]);
	expect(within(win).getByRole("tab", { name: "Tank" }).getAttribute("aria-selected")).toBe("true");
	await act(() => { fireEvent.click(within(win).getByRole("button", { name: /^Pz IIIE,/ })); });
	expect(store.shop.value!.picked!.name).toBe("Pz IIIE");
	const cost = store.shop.value!.upgrade!.cost;
	await act(() => { fireEvent.click(win.querySelector("#eqUpgradeBut")!); });
	expect([store.world.value!.state.units[0].eqid, store.world.value!.state.players[0].prestige]).toEqual([PZ_IIIE, 600 - cost]);
	//Buy new: the cheapest tank, into the reserve
	await act(() => { fireEvent.click(within(win).getByRole("button", { name: /^Pz IA,/ })); });
	await act(() => { fireEvent.click(win.querySelector("#eqNewBut")!); });
	expect(store.reserve.value.map((r) => r.name)).toEqual(["Pz IIA", "Pz IA"]);
	//Sell the upgraded tank: off the map, nothing left to work on
	await act(() => { fireEvent.click(within(win).getByRole("button", { name: /^Pz IIIE,/ })); });
	await act(() => { fireEvent.click(win.querySelector("#eqSellBut")!); });
	expect([store.world.value!.state.units.some((u) => u.id === 0), store.shop.value!.target]).toEqual([false, null]);
	//a class tab, the sort and its order, the country (one country: its button is off)
	await act(() => { fireEvent.click(within(win).getByRole("tab", { name: /^Infantry/ })); });
	expect(store.shop.value!.uclass).toBe(unitClass.infantry);
	await act(() => { fireEvent.click(within(win).getByRole("button", { name: "Hard atk" })); });
	await act(() => { fireEvent.click(within(win).getByRole("button", { name: "Sort descending" })); });
	expect([store.shop.value!.sort, store.shop.value!.reverse]).toEqual(["hardatk", true]);
	await act(() => { fireEvent.change(within(win).getByRole("combobox", { name: "Sort by another stat" }), { target: { value: "ammo" } }); });
	expect(store.shop.value!.sort).toBe("ammo");
	expect((win.querySelector("#eqSelCountryButton") as HTMLButtonElement).disabled).toBe(true);
	await act(() => { fireEvent.keyDown(document, { key: "Escape" }); });
	expect(document.getElementById("equipment")).toBeNull();
});

test("An Infanterie's transport is picked in the window; pressed again, none; the side's other country by its button (#348)", async () => {
	const store = shopStore(world((x) => { x.state.players[0].supportCountries = [15 + 1]; }));
	await act(() => { store.pickUnit(1); store.shortcut({ menu: "buy" }); });
	const win = document.getElementById("equipment")!, transport = within(win).getByRole("group", { name: "Transport" });
	//a row says what the transport gives, in words for a screen reader
	const halftrack = () => within(transport).getByRole("button", { name: new RegExp(`^${store.world.value!.equipment[SDKFZ251].name}, Half Tracked, \\d+ prestige, \\d+ moves`) });
	await act(() => { fireEvent.click(halftrack()); });
	expect(store.shop.value!.transports.find((t) => t.on)!.eqid).toBe(SDKFZ251);
	expect(within(win).getAllByRole("columnheader", { name: "Mounted" })).toHaveLength(2);
	expect(win.querySelector("#eqActionsContainer")!.textContent).toContain(`+ ${store.world.value!.equipment[SDKFZ251].name}`);
	await act(() => { fireEvent.click(halftrack()); });
	expect(store.shop.value!.transports.find((t) => t.on)!.eqid).toBe(-2);
	await act(() => { fireEvent.click(win.querySelector("#eqSelCountryButton")!); });
	expect([store.shop.value!.country.name, store.shop.value!.target]).toEqual(["Poland", null]);
	await act(() => { store.closeShop(); });
	//B again with no unit of the player's selected: new units only; a second B closes it
	await act(() => { store.pickUnit(3); store.shortcut({ menu: "buy" }); });
	expect(store.shop.value!.target).toBeNull();
	await act(() => store.shortcut({ menu: "buy" }));
	expect(store.shop.value).toBeNull();
});

test("Opened on nothing, a unit picked in the window's list is the one to upgrade, on its class and model; another picked instead (#512)", async () => {
	const store = shopStore(world((x) => { x.state.players[0].prestige = 600; }));
	await act(() => store.shortcut({ menu: "buy" }));
	const win = document.getElementById("equipment")!, actions = win.querySelector("#eqActionsContainer")!;
	expect(actions.textContent).toContain("Buying new units");
	const list = within(win).getByRole("region", { name: "Your units" });
	expect(within(list).getAllByRole("button").map((b) => b.getAttribute("aria-pressed"))).toEqual(["false", "false", "false"]);
	//(the sort the person chose stays, as the old window kept it)
	await act(() => { fireEvent.click(within(win).getByRole("button", { name: "Hard atk" })); });
	await act(() => { fireEvent.click(within(list).getByRole("button", { name: /^Pz IIA 101st/ })); });
	expect(actions.textContent).toContain("Upgrading 101st Pz IIA");
	expect(within(win).getByRole("tab", { name: "Tank" }).getAttribute("aria-selected")).toBe("true");
	expect(within(win).getByRole("button", { name: /^Pz IIA, current,/ }).getAttribute("aria-pressed")).toBe("true");
	expect(within(list).getByRole("button", { name: /^Pz IIA 101st/ }).getAttribute("aria-pressed")).toBe("true");
	expect([store.selected.value, store.lookAt.value, store.shop.value!.sort]).toEqual([0, { row: 2, col: 2 }, "hardatk"]);
	await act(() => { fireEvent.click(within(win).getByRole("button", { name: /^Pz IIIE,/ })); });
	const w = store.world.value!, cost = upgradeCost(w, w.state.units[0], PZ_IIIE, -1);
	expect(win.querySelector("#eqUpgradeBut")!.querySelector(".cost")!.textContent).toBe(String(cost));
	await act(() => { fireEvent.click(win.querySelector("#eqUpgradeBut")!); });
	expect([store.world.value!.state.units[0].eqid, store.world.value!.state.players[0].prestige]).toEqual([PZ_IIIE, 600 - cost]);
	//another unit picked: the window on it, its class, model and transport
	await act(() => { fireEvent.click(within(list).getByRole("button", { name: /^Infanterie 1st/ })); });
	expect(actions.textContent).toContain("Upgrading 1st Infanterie");
	expect(within(win).getByRole("tab", { name: "Infantry" }).getAttribute("aria-selected")).toBe("true");
	expect(within(win).getByRole("button", { name: /^Infanterie, current,/ }).getAttribute("aria-pressed")).toBe("true");
	expect([store.shop.value!.transports.find((t) => t.on)!.eqid, store.selected.value]).toEqual([OPEL, 1]);
});

test("The window opens with the unit list and closes it, as the old window did with the list over it (#512)", async () => {
	const store = shopStore(world((x) => { x.state.players[0].side = 1; }));
	await act(() => store.toggleList());
	await act(() => store.shortcut({ menu: "buy" }));
	//one list, the window's, its badges the side's
	const lists = screen.getAllByRole("region", { name: "Your units" });
	expect(lists.map((r) => r.closest("#equipment") !== null)).toEqual([true]);
	expect(lists[0].querySelector(".pm-badge")!.className).toBe("pm-badge allied");
	await act(() => { fireEvent.click(document.getElementById("eqCloseBut")!); });
	expect([document.getElementById("equipment"), screen.queryByRole("region", { name: "Your units" }), store.listOpen.value]).toEqual([null, null, false]);
});
