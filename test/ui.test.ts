//The old UI on a running game in jsdom: what its windows and animations leave of the game's state.
//The page's body from index.html, a 2D context that draws nothing (jsdom has no canvas), the game
//started as the contracts start it, then the UI made as Game makes it
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";
import { freshGame, startState } from "./lifecycle";
import type { Game } from "../src/game";
import type { EqUserSelElement, UI } from "../src/ui";

//Any property of it, called or not, is itself; as a number it is 0
const nothing: unknown = new Proxy(function() {}, {
	get: (_t, key) => key === Symbol.toPrimitive ? () => 0 : nothing,
	apply: () => nothing,
	set: () => true
});

async function uiGame(item: string): Promise<{ game: Game; ui: UI }> {
	HTMLCanvasElement.prototype.getContext = (() => nothing) as unknown as HTMLCanvasElement["getContext"];
	const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
	document.body.innerHTML = html.slice(html.indexOf(">", html.indexOf("<body")) + 1, html.lastIndexOf("</body>"));
	//The rules UIBuilder.setEquipmentFlags sets the flags image on (game/css/ui.css)
	const style = document.createElement("style");
	style.textContent = "#eqSelCountry {} .playerCountry {} .uSmallFlag {}";
	document.head.appendChild(style);
	const game = await freshGame();
	await startState(game, item);
	const { UI } = await import("../src/ui");
	//Set before the constructor runs: the map image's load calls back into game.ui
	const ui = Object.create(UI.prototype) as UI;
	game.ui = ui;
	UI.call(ui, game);
	return { game, ui };
}

function ids(units: { id: number }[]) {
	return units.map((u) => u.id);
}

test("Opening the units and purchase windows leaves the unit lists and the equipment lists in their order (#186)", async () => {
	const { game, ui } = await uiGame("campaign:0:1");
	const { Equipment } = await import("../src/equipment");
	const map = game.scenario.map;
	//The UI made already showed the lists once: the order is the one the game started with
	const fresh = await freshGame();
	await startState(fresh, "campaign:0:1");
	expect(ids(map.getUnits())).toEqual(ids(fresh.scenario.map.getUnits()));

	const units = ids(map.getUnits());
	const core = ids(map.currentPlayer.getCoreUnitList());
	const indexes = JSON.stringify(Equipment.equipmentIndexes);
	ui.toggleUnitsAndEquipmentWindow(true);
	for (const sortproperty of ["name", "cost", "movpoints"] as const) {
		document.querySelector<EqUserSelElement>("#eqUserSel")!.sortproperty = sortproperty;
		ui.updateEquipmentWindow(1);
	}
	expect(ids(map.getUnits())).toEqual(units);
	expect(ids(map.currentPlayer.getCoreUnitList())).toEqual(core);
	expect(JSON.stringify(Equipment.equipmentIndexes)).toBe(indexes);
	//The window still shows them sorted: the core units first, by class
	const shown = [...document.querySelectorAll<HTMLElement & { unitid: number }>("#unitlist > div")].map((d) => map.getUnitById(d.unitid));
	expect(shown.length).toBeGreaterThan(1);
	expect(shown.findIndex((u) => !u.isCore)).toBe(shown.filter((u) => u.isCore).length);
}, 60_000);

test("A unit picked in the deployment window is the one deployed, sold or upgraded, the core list in its order (#186)", async () => {
	const { game, ui } = await uiGame("campaign:0:1");
	const { Commands } = await import("../src/commands");
	const { Equipment } = await import("../src/equipment");
	const { touched } = await import("../src/context");
	const map = game.scenario.map;
	const p = map.currentPlayer;
	p.prestige = 100_000;
	touched();
	//A tank bought, then an infantry: the window shows them the other way round (by class)
	const country = p.country + 1, year = game.scenario.date.getFullYear();
	for (const uclass of [2, 1]) {
		const eqid = Equipment.getCountryEquipmentByClass(uclass, country).find((id) => Equipment.equipment[id].yearavailable <= year
			&& Equipment.equipment[id].yearexpired >= year)!;
		expect([eqid, Commands.execute(game.scenario, { type: "buy", eqid, transport: -1 })]).toEqual([eqid, { ok: true, result: true }]);
	}
	const core = p.getCoreUnitList();
	const order = ids(core);
	ui.toggleUnitsAndEquipmentWindow(true);
	expect(ids(p.getCoreUnitList())).toEqual(order);

	const rows = [...document.querySelectorAll<HTMLElement & { unitid: number; uniteqid: number }>("#unitlist > div")];
	expect(rows.map((r) => r.uniteqid)).toEqual([core[core.length - 1].eqid, core[core.length - 2].eqid]);
	const sel = document.querySelector<EqUserSelElement>("#eqUserSel")!;
	//The first row shown is picked by default
	expect(core[sel.deployunit]).toBe(core[core.length - 1]);
	for (const row of rows) {
		row.click();
		expect(core[sel.deployunit].eqid).toBe(row.uniteqid);
	}
	//Sold from the window: the tank, clicked last, goes; the infantry stays
	const infantry = core[core.length - 1];
	ui.equipmentWindowButtons("sell");
	expect(p.getCoreUnitList()).toContain(infantry);
	expect(p.getCoreUnitList().length).toBe(order.length - 1);
}, 60_000);
