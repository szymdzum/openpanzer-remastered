//The old UI on a running game in jsdom: what its windows and animations leave of the game's state.
//The page's body from index.html, a 2D context that draws nothing (jsdom has no canvas), the game
//started as the contracts start it, then the UI made as Game makes it
import fs from "node:fs";
import path from "node:path";
import { expect, test, vi } from "vitest";
import { freshGame, startState, until } from "./lifecycle";
import type { Game } from "../src/game";
import type { EqUserSelElement, UI } from "../src/ui";
import type { AttackResult } from "../src/commands";
import type { Unit } from "../src/unit";

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

test("After a move along a turning path the unit faces the way the engine set, not its path's last step (#187)", async () => {
	const { game, ui } = await uiGame("campaign:0:1");
	const { GameRules } = await import("../src/gamerules");
	const { uiSettings } = await import("../src/prototypes");
	uiSettings.quickAnimation = true;
	const map = game.scenario.map;
	//A unit of the side playing, to a hex whose path ends turned away from the straight line to it:
	//the animation draws the unit along that last step. A hex it can stop on: not one its side holds (#74)
	const straight = (a: { row: number; col: number }, b: { row: number; col: number }) =>
		GameRules.getDirection(a.row, a.col, b.row, b.col);
	let move: { unit: Unit; to: { row: number; col: number } } | undefined;
	for (const unit of map.getUnits().filter((u) => u.player.id === map.currentPlayer.id)) {
		const range = GameRules.getMoveRange(map, unit);
		const to = range.find((c) => {
			if (!c.canMove) return false;
			const cells = GameRules.getShortestPath(unit.getPos(), c, range);
			return cells.length > 2 && Math.abs(straight(cells[cells.length - 2], c) - straight(unit.getPos(), c)) > 1;
		});
		if (to !== undefined) {
			move = { unit, to };
			break;
		}
	}
	const { unit, to } = move!;
	const from = unit.getPos();
	ui.uiUnitSelect(unit);
	expect(ui.uiUnitMove(unit, to.row, to.col)).toBe(true);
	await until(() => !unit.hasAnimation, "the move animation");
	expect(unit.getPos()).toEqual({ row: to.row, col: to.col });
	expect(unit.facing).toBe(straight(from, to));
}, 60_000);

test("Selling the last unit of the core list from the deployment window picks another undeployed unit (#208)", async () => {
	const { game, ui } = await uiGame("campaign:0:1");
	const { Commands } = await import("../src/commands");
	const { Equipment } = await import("../src/equipment");
	const { touched } = await import("../src/context");
	const map = game.scenario.map;
	const p = map.currentPlayer;
	p.prestige = 100_000;
	touched();
	//A tank bought, then an infantry: the infantry is the last of the core list
	const country = p.country + 1, year = game.scenario.date.getFullYear();
	for (const uclass of [2, 1]) {
		const eqid = Equipment.getCountryEquipmentByClass(uclass, country).find((id) => Equipment.equipment[id].yearavailable <= year
			&& Equipment.equipment[id].yearexpired >= year)!;
		expect(Commands.execute(game.scenario, { type: "buy", eqid, transport: -1 })).toEqual({ ok: true, result: true });
	}
	const core = p.getCoreUnitList();
	const tank = core[core.length - 2], infantry = core[core.length - 1];
	ui.toggleUnitsAndEquipmentWindow(true);
	const row = [...document.querySelectorAll<HTMLElement & { unitid: number }>("#unitlist > div")]
		.find((r) => r.unitid === core.length - 1)!;
	row.click();
	const sel = document.querySelector<EqUserSelElement>("#eqUserSel")!;
	expect(sel.deployunit).toBe(core.length - 1);
	ui.equipmentWindowButtons("sell");
	expect(p.getCoreUnitList()).not.toContain(infantry);
	//The window is built again, the tank left to deploy and picked
	const shown = [...document.querySelectorAll<HTMLElement & { unitid: number }>("#unitlist > div")];
	expect(shown.map((r) => p.getCoreUnitList()[r.unitid])).toEqual([tank]);
	expect(p.getCoreUnitList()[sel.deployunit]).toBe(tank);
}, 60_000);

//An attack in the UI on a fresh campaign:0:1, its attacker the first unit of the side playing with an
//enemy in range, animated or with every attack animation gone (a carrier's, class "none"): what it ends with
async function uiAttack(animated: boolean) {
	const { game, ui } = await uiGame("campaign:0:1");
	const { GameRules } = await import("../src/gamerules");
	const { Commands } = await import("../src/commands");
	const { attackAnimationByClass } = await import("../src/animation");
	const { uiSettings } = await import("../src/prototypes");
	uiSettings.quickAnimation = true;
	const map = game.scenario.map;
	const units = map.getUnits();
	let pair: [Unit, Unit] | undefined;
	for (const a of units.filter((u) => u.player.id === map.currentPlayer.id))
		for (const d of units.filter((u) => GameRules.isEnemy(a, u)))
			if (pair === undefined && GameRules.canInitiateAttack(a, d) && GameRules.isInAttackRange(a, d)) pair = [a, d];
	const [attacker, defender] = pair!;
	if (!animated) attackAnimationByClass.fill("none");
	const execute = vi.spyOn(Commands, "execute");
	game.waitUIAnimation = true;
	expect(ui.uiUnitAttack(attacker, defender)).toBe(true);
	await until(() => !game.waitUIAnimation, "the attack animation");
	const executed = execute.mock.results.map((r) => r.value as { ok: boolean; result: unknown });
	const result = executed.find((r, i) => execute.mock.calls[i][1].type === "attack" && r.ok)!.result as AttackResult;
	return { destroyed: ids(result.destroyed), retreat: result.retreat, surrender: result.surrender,
		units: [attacker, defender].map((u) => [u.id, u.strength, u.destroyed, u.getPos()]) };
}

test("An attack with nothing to animate ends as the same attack animated, its units not destroyed (#111)", async () => {
	const animated = await uiAttack(true);
	const still = await uiAttack(false);
	expect(animated.units.every((u) => u[1] as number > 0)).toBe(true);
	expect(still).toEqual(animated);
}, 60_000);

test("A human's end turn keeps the combat log entries of the next turn's start (#86)", async () => {
	const { game, ui } = await uiGame("drpzop01.xml");
	const { CombatLog } = await import("../src/combatlog");
	const { touched } = await import("../src/context");
	const { GameRules } = await import("../src/gamerules");
	const { terrainType } = await import("../src/prototypes");
	const map = game.scenario.map;
	const endTurn = () => {
		ui.mainMenuButton("endturn");
		ui.mainMenuButton("endturn"); //the second click confirms
	};
	//Every player a person: the last one's end of turn starts a new round, which resupplies a unit out
	//of ammo in a city with no enemy around
	const players = map.getPlayers();
	for (let i = 1; i < players.length; i++) endTurn();
	expect(map.currentPlayer.id).toBe(players[players.length - 1].id);
	const unit = map.getUnits().find((u) => u.player.id === players[0].id && u.unitData().ammo > 0
		&& map.map[u.getPos().row][u.getPos().col].terrain === terrainType.City
		&& GameRules.getAdjacent(u.getPos().row, u.getPos().col).every((c) => !GameRules.isEnemy(u, map.map[c.row]?.[c.col]?.unit ?? null)))!;
	unit.ammo = 0;
	touched();
	endTurn();
	expect(map.currentPlayer.id).toBe(players[0].id);
	expect(unit.ammo).toBeGreaterThan(0);
	expect(CombatLog.log.resupply[unit.id]).toMatchObject({ eqid: unit.eqid, ammo: unit.ammo });
}, 60_000);

test("The unit info shows a gun range of 0 as 1 and leaves the equipment's 0 (#26)", async () => {
	const { game, ui } = await uiGame("campaign:0:1");
	const { Equipment } = await import("../src/equipment");
	const map = game.scenario.map;
	//A unit of an equipment with a gun range of 0, as 46 infantry entries have, inspected
	const unit = map.getUnits().find((u) => u.player === map.currentPlayer && u.getPos() !== null)!;
	Equipment.equipment[unit.eqid].gunrange = 0;
	ui.uiUnitSelect(unit);
	document.getElementById("unit-info")!.style.display = "none";
	ui.mainMenuButton("inspectunit");
	expect(document.getElementById("uName")!.textContent).toContain(unit.unitData().name);
	expect(document.getElementById("uGunRange")!.textContent).toBe("1");
	expect(Equipment.equipment[unit.eqid].gunrange).toBe(0);
}, 60_000);

test("A unit out of ammo and fuel shows both map tooltips with their own ids, and removing its tooltips removes both (#25)", async () => {
	const { game, ui } = await uiGame("campaign:0:1");
	const { GameRules } = await import("../src/gamerules");
	const { touched } = await import("../src/context");
	const map = game.scenario.map;
	const unit = map.getUnits().find((u) => u.player === map.currentPlayer && u.getPos() !== null
		&& u.unitData().fuel > 0 && u.unitData().ammo > 0)!;
	Object.assign(unit, { ammo: 0, fuel: 0 });
	touched();
	expect(GameRules.unitLowAmmo(unit, 1) && GameRules.unitLowFuel(unit, 1)).toBe(true);
	ui.removeAllSmallToolTips();
	ui.addSmallToolTips(true);
	const shown = () => [...document.querySelectorAll<HTMLElement>(".smallToolTip")]
		.filter((t) => /^gsttu(\d+)/.exec(t.id)?.[1] === String(unit.id));
	expect(shown().map((t) => t.textContent)).toEqual(["No Ammo", "No Fuel"]);
	expect(new Set(shown().map((t) => t.id)).size).toBe(2);
	ui.removeUnitToolTip(unit.id);
	expect(shown()).toEqual([]);
}, 60_000);
