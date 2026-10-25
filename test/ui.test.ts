//The old UI on a running game in jsdom: what its windows and animations leave of the game's state.
//The page's body from index.html, a 2D context that draws nothing (jsdom has no canvas), the game
//started as the contracts start it, then the UI made as Game makes it
import fs from "node:fs";
import path from "node:path";
import { expect, test, vi } from "vitest";
import { freshGame, startState, until } from "./lifecycle";
import type { Game } from "../src/game";
import type { EqUserSelElement, UI } from "../src/ui";
import type { AttackResult, Executed, ExecuteOptions } from "../src/commands";
import type { Unit } from "../src/unit";

//Any property of it, called or not, is itself; as a number it is 0
const nothing: unknown = new Proxy(function() {}, {
	get: (_t, key) => key === Symbol.toPrimitive ? () => 0 : nothing,
	apply: () => nothing,
	set: () => true
});

async function uiGame(item: string, isAI?: number[]): Promise<{ game: Game; ui: UI }> {
	HTMLCanvasElement.prototype.getContext = (() => nothing) as unknown as HTMLCanvasElement["getContext"];
	const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
	document.body.innerHTML = html.slice(html.indexOf(">", html.indexOf("<body")) + 1, html.lastIndexOf("</body>"));
	//The rules UIBuilder.setEquipmentFlags sets the flags image on (game/css/ui.css)
	const style = document.createElement("style");
	style.textContent = "#eqSelCountry {} .playerCountry {} .uSmallFlag {}";
	document.head.appendChild(style);
	const game = await freshGame();
	await startState(game, item, isAI);
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

//The attack command played whole, its result changed by more as the UI then shows it (a retreat, a victory)
async function attacksWith(more: (result: AttackResult) => void) {
	const { Commands } = await import("../src/commands");
	const execute = Commands.execute.bind(Commands);
	vi.spyOn(Commands, "execute").mockImplementation(((scenario: never, cmd: { type: string }, options?: ExecuteOptions) => {
		const r = execute(scenario, cmd as never, options) as Executed<"attack">;
		if (cmd.type === "attack" && r.ok) more(r.result);
		return r;
	}) as unknown as typeof Commands.execute);
}

//The AI waits for every animation its action starts: a defender that retreats moves after the attack's
//own animation, and the AI's next action came during that move while the turn loop ticked once a second
//(#248). The attack's retreat put in by hand: the first attack of campaign:0:1 has none
test("The AI's next action waits for the retreat its attack caused to end (#248)", async () => {
	const { game, ui } = await uiGame("campaign:0:1");
	const { GameRules } = await import("../src/gamerules");
	const { movementResults, uiSettings } = await import("../src/prototypes");
	uiSettings.quickAnimation = true;
	const map = game.scenario.map;
	const units = map.getUnits();
	let pair: [Unit, Unit] | undefined;
	for (const a of units.filter((u) => u.player.id === map.currentPlayer.id))
		for (const d of units.filter((u) => GameRules.isEnemy(a, u)))
			if (pair === undefined && GameRules.canInitiateAttack(a, d) && GameRules.isInAttackRange(a, d)) pair = [a, d];
	const [attacker, defender] = pair!;
	await attacksWith((result) => {
		const mr = new movementResults(), at = defender.getPos();
		mr.passedCells = [at, at];
		Object.assign(result, { retreat: at, retreatMove: mr });
	});
	//What the defender was doing when the AI's wait ended (the game's shown, src/oldscreen.ts)
	const shown: boolean[] = [];
	ui.whenShown(() => { shown.push(defender.hasAnimation); });
	expect(ui.uiUnitAttack(attacker, defender)).toBe(true);
	await until(() => !game.waitUIAnimation && !defender.hasAnimation, "the attack and the retreat");
	expect(shown).toEqual([false]);
}, 60_000);

//An AI move the side shown can't see isn't animated, but the surprise attack it runs into is: the old screen
//called the AI's shown at once for a move the UI didn't animate, so its next action came while the surprise
//attack still played (#396, the visible moves' race #248 closed). Every other unit off the map, an AI unit's
//path through the hex of a person's unit that sees only its own hex: the AI doesn't see it coming, and the
//person's side sees none of the move
test("The AI's next action waits for the surprise attack of a move the player didn't see (#396)", async () => {
	const { game } = await uiGame("drpzop01.xml", [0, 1, 1, 1]);
	const { GameRules } = await import("../src/gamerules");
	const { Equipment } = await import("../src/equipment");
	const { touched } = await import("../src/context");
	const { terrainType, uiSettings } = await import("../src/prototypes");
	uiSettings.quickAnimation = true;
	const map = game.scenario.map;
	const ground = (u: Unit) => !GameRules.isAir(u) && !GameRules.isSea(u) && u.getPos() !== null;
	const mover = map.getUnits().filter((u) => u.player.side === 1 && ground(u))
		.sort((a, b) => b.unitData().movpoints - a.unitData().movpoints)[0];
	const hidden = map.getUnits().find((u) => u.player.side === 0 && ground(u))!;
	for (const u of map.getUnits()) if (u !== mover && u !== hidden) u.destroyed = true;
	touched();
	map.updateUnitList();
	Equipment.equipment[hidden.eqid].spotrange = 0;
	touched();
	//A hex the mover can reach, out of its sight and on clear ground, for the hidden unit: the mover is
	//sent there and runs into it
	const from = mover.getPos(), seen = GameRules.getUnitSpotRange(mover);
	const at = GameRules.getMoveRange(map, mover).find((c) => c.canMove && GameRules.distance(from.row, from.col, c.row, c.col) > seen + 1
		&& map.map[c.row][c.col].terrain === terrainType.Clear && !map.map[c.row][c.col].unit)!;
	const p = hidden.getPos();
	map.map[p.row][p.col].delUnit(hidden);
	map.map[at.row][at.col].setUnit(hidden);
	hidden.tempSpotted = false;
	touched();
	expect(map.map[at.row][at.col].isSpotted(1), "the AI doesn't see the hidden unit").toBe(false);
	//The AI's move as the host asks the screen for it (src/host.ts processAction)
	map.currentPlayer = mover.player;
	touched();
	map.setMoveRange(mover);
	const shown: boolean[] = [];
	game.host.screen.move(mover, at, map.getCurrentMoveRange(), () => { shown.push(game.waitUIAnimation); });
	const stopped = mover.getPos();
	expect([GameRules.distance(stopped.row, stopped.col, at.row, at.col), hidden.hits > 0 || hidden.strength < 10],
		"stopped next to the hidden unit, which it attacked").toEqual([1, true]);
	expect(map.map[stopped.row][stopped.col].isSpotted(0), "the person's side didn't see it").toBe(false);
	await until(() => !game.waitUIAnimation, "the surprise attack");
	expect(shown, "shown once the surprise attack has been shown").toEqual([false]);
}, 60_000);

//A unit the player's attack destroys leaves the map when the attack's animation ends. The end turn
//button clicked twice before then ended the turn and saved the unit, strength 0 or less, on its hex: a
//reload put it back there, where it blocks moves and captures for the rest of the game (#58)
test("The player's end of turn waits for the attack's animation: no destroyed unit is saved on its hex (#58)", async () => {
	const { game, ui } = await uiGame("campaign:0:1");
	const { GameRules } = await import("../src/gamerules");
	const { touched } = await import("../src/context");
	const { MAJOR_VERSION, uiSettings } = await import("../src/prototypes");
	uiSettings.quickAnimation = true;
	const map = game.scenario.map;
	const human = map.currentPlayer, turn = map.turn;
	let pair: [Unit, Unit] | undefined;
	for (const a of map.getUnits().filter((u) => u.player.id === human.id))
		for (const d of map.getUnits().filter((u) => GameRules.isEnemy(a, u)))
			if (pair === undefined && GameRules.canInitiateAttack(a, d) && GameRules.isInAttackRange(a, d)) pair = [a, d];
	const [attacker, defender] = pair!;
	defender.strength = 1;
	touched();
	const at = defender.getPos();
	const endTurn = () => {
		ui.mainMenuButton("endturn");
		ui.mainMenuButton("endturn"); //the second click confirms
	};
	expect(ui.uiUnitAttack(attacker, defender)).toBe(true);
	endTurn();
	expect([map.currentPlayer, map.turn]).toEqual([human, turn]);
	await until(() => !game.waitUIAnimation, "the attack animation");
	expect(map.getUnits()).not.toContain(defender);
	endTurn();
	expect(map.currentPlayer).not.toBe(human);
	const saved = JSON.parse(localStorage.getItem("openpanzer-game-" + MAJOR_VERSION)!) as import("../src/savegame").SaveFile;
	expect(saved.state.units.filter((u) => u.strength <= 0)).toEqual([]);
	expect(saved.state.map.hexes[at.row * saved.state.map.cols + at.col].unit).not.toBe(defender.id);
}, 60_000);

//The current player's attacks, each ending the game with the next of winners winning (the attack's
//victory as the elimination's): the title and the text of the message each told
async function victoriesTold(game: Game, ui: UI, winners: number[]): Promise<string[][]> {
	const { GameRules } = await import("../src/gamerules");
	const { UIBuilder } = await import("../src/uibuilder");
	const { uiSettings } = await import("../src/prototypes");
	uiSettings.quickAnimation = true;
	const map = game.scenario.map, attacker = map.currentPlayer;
	await attacksWith((result) => { result.victorySides.push(winners.shift()!); });
	const message = vi.spyOn(UIBuilder, "message").mockImplementation(() => {});
	const told: string[][] = [];
	while (winners.length > 0) {
		let pair: [Unit, Unit] | undefined;
		for (const a of map.getUnits().filter((u) => u.player.id === attacker.id && !u.hasFired))
			for (const d of map.getUnits().filter((u) => GameRules.isEnemy(a, u)))
				if (pair === undefined && GameRules.canInitiateAttack(a, d) && GameRules.isInAttackRange(a, d)) pair = [a, d];
		expect(ui.uiUnitAttack(pair![0], pair![1])).toBe(true);
		await until(() => !game.waitUIAnimation, "the attack");
		const [title, text] = message.mock.calls[message.mock.calls.length - 1];
		told.push([title, text.replace(/<[^>]*>/g, "")]);
		game.gameEnded = false;
	}
	return told;
}

const countryOf = (game: Game, side: number) => game.scenario.map.getPlayers().find((p) => p.side === side)!.getCountryName();

//The human's attack ends with a side left without units: the message names the side that won and why.
//The old game asked whose turn it was, so the person whose last unit fell attacking was told they won,
//by capturing all the victory hexes (#76)
test("An elimination is told to the person as a defeat or a win by its side, by destroying all the units (#76)", async () => {
	const { game, ui } = await uiGame("drpzop01.xml", [0, 1, 1, 1]);
	expect(game.scenario.map.currentPlayer.side).toBe(0);
	const told = await victoriesTold(game, ui, [1, 0]);
	expect(told[0][0]).toBe("DEFEAT");
	expect(told[0][1]).toContain("You have lost ! Your enemy " + countryOf(game, 1) + " on Allies side wins by destroying all the enemy units");
	expect(told[1][0]).not.toBe("DEFEAT");
	expect(told[1][1]).toContain("You have won this scenario ! " + countryOf(game, 0) + " on Axis side wins by destroying all the enemy units");
}, 60_000);

//The victory is told by the sides the person plays now, not the ones the session started with: past the
//tutorial's hand-over the person plays the Axis and the AI the Allies (the session started with both
//sides scripted, so an Allied victory was told as the person's win); in a game of AIs only nobody is
//told they won or lost (#366)
test("A victory is told as a defeat to the person by the side they play now: the tutorial after its hand-over, a game of AIs (#366)", async () => {
	const { game, ui } = await uiGame("scripted:tutorial.xml");
	const { playerType } = await import("../src/prototypes");
	const { touched } = await import("../src/context");
	//The hand-over (src/core/tutorial.ts handOver): the Axis to the person, the Allies to the AI
	for (const p of game.scenario.map.getPlayers()) p.type = p.side === 0 ? playerType.humanLocal : playerType.aiLocal;
	touched();
	expect(game.scenario.map.currentPlayer.side).toBe(0);
	//(an Axis unit moved next to an Allied one, to attack it)
	const { Commands } = await import("../src/commands");
	expect(Commands.execute(game.scenario, { type: "move", unit: 3, to: { row: 8, col: 14 } }).ok).toBe(true);
	const told = await victoriesTold(game, ui, [1]);
	expect(told[0][0]).toBe("DEFEAT");
	expect(told[0][1]).toContain("You have lost ! Your enemy " + countryOf(game, 1) + " on Allies side wins");

	vi.restoreAllMocks();
	const ais = await uiGame("drpzop01.xml", [1, 1, 1, 1]);
	const byAI = await victoriesTold(ais.game, ais.ui, [1, 0]);
	expect(byAI.map((t) => t[0]), "a game of AIs").not.toContain("DEFEAT");
	expect(byAI[0][1]).not.toContain("You have");
	expect(byAI[0][1]).toContain(countryOf(ais.game, 1) + " on Allies side wins by destroying all the enemy units");
	expect(byAI[1][1]).not.toContain("You have");
}, 60_000);

//The game host (src/host.ts) decides and the old UI shows: each of the host's screen calls is the old UI's
//window or message, and what follows it is the host's (the OK, the dossier's close)
test("The old UI shows what the game host asks: its messages, the dossier, the prototype, a failed load, the main menu (#373)", async () => {
	const game = await freshGame();
	const { UIBuilder } = await import("../src/uibuilder");
	const { OSGlue } = await import("../src/osglue");
	const shown: unknown[][] = [];
	const note = (name: string) => (...args: unknown[]) => { shown.push([name, ...args.filter((a) => typeof a !== "function")]); };
	const message = vi.spyOn(UIBuilder, "message").mockImplementation(note("message"));
	vi.spyOn(UIBuilder, "messageDynamic").mockImplementation(note("messageDynamic"));
	const dossier = vi.spyOn(UIBuilder, "showCampaignEnd").mockImplementation((...args) => { note("showCampaignEnd")(...args); return true; });
	vi.spyOn(UIBuilder, "showPrototypeAwardMessage").mockImplementation(note("showPrototypeAwardMessage"));
	vi.spyOn(OSGlue, "reportScore").mockImplementation(note("reportScore"));
	vi.spyOn(OSGlue, "reportAchievement").mockImplementation(note("reportAchievement"));
	Object.assign(game.ui, { mainMenuButton: note("mainMenuButton"), setNewScenario: note("setNewScenario") });
	const then = () => {};
	const screen = game.host.screen;
	screen.message("Victory", "won", then);
	screen.campaignEnd("lose", "lost", then);
	screen.showPrototype(142);
	screen.loadFailed("x.xml");
	screen.mainMenu();
	screen.showScenario();
	screen.reportScore(7);
	screen.reportAchievement("c.json");
	expect(shown).toEqual([["message", "Victory", "won"], ["showCampaignEnd", "lose", "lost"], ["showPrototypeAwardMessage", 142],
		["messageDynamic", "Error", "Error Loading scenario x.xml"], ["mainMenuButton", "options"], ["setNewScenario"], ["reportScore", 7],
		["reportAchievement", "c.json"]]);
	expect([message.mock.calls[0][2], dossier.mock.calls[0][2]], "what follows is the host's").toEqual([then, then]);
	vi.restoreAllMocks();
});

//The selected attacker's attack makes its defender surrender: the move hexes shown, which the next move
//goes along, are made again without the surrendered unit, as after a unit destroyed. The old game
//refreshed them before the surrender, so they kept the unit's hex out of reach and its zone of control
//(#89). The harness's surrender drill (harness/ui/ui-attack.js) with the game's objects
test("After a surrender the attacker's move hexes no longer count the surrendered unit (#89)", async () => {
	const { game, ui } = await uiGame("drpzop01.xml", [0, 1, 1, 1]);
	const { GameRules } = await import("../src/gamerules");
	const { touched } = await import("../src/context");
	const { terrainType, uiSettings } = await import("../src/prototypes");
	uiSettings.quickAnimation = true;
	const map = game.scenario.map;
	const free = (row: number, col: number) => GameRules.getAdjacent(row, col).filter((c) => c.row > 0 && c.col > 0
		&& c.row < map.rows - 1 && c.col < map.cols - 1 && !map.map[c.row][c.col].unit && !map.map[c.row][c.col].airunit
		&& map.map[c.row][c.col].terrain !== terrainType.Ocean && map.map[c.row][c.col].terrain !== terrainType.River);
	const atk = map.getUnitById(40), def = map.getUnitById(72);
	const d = def.getPos(), f = free(d.row, d.col)[0], from = atk.getPos();
	map.map[from.row][from.col].delUnit(atk);
	map.map[f.row][f.col].setUnit(atk);
	def.tempSpotted = true;
	def.strength = 12; def.entrenchment = 0; atk.strength = 15; atk.experience = 500;
	for (const c of free(d.row, d.col)) map.map[c.row][c.col].terrain = terrainType.Ocean;
	touched();
	map.selectUnit(atk);
	const { Commands } = await import("../src/commands");
	const execute = vi.spyOn(Commands, "execute");
	game.waitUIAnimation = true;
	expect(ui.uiUnitAttack(atk, def)).toBe(true);
	await until(() => !game.waitUIAnimation, "the attack");
	const r = execute.mock.results[0].value as { result: AttackResult };
	expect([r.result.surrender, def.destroyed, map.currentUnit, atk.hasMoved]).toEqual([true, true, atk, false]);
	const cells = (list: { row: number; col: number }[]) => list.map((c) => c.row + "," + c.col).sort();
	expect(cells(map.getCurrentMoveRange())).toContain(d.row + "," + d.col);
	expect(cells(map.getCurrentMoveRange())).toEqual(cells(GameRules.getMoveRange(map, atk)));
}, 60_000);

test("The scenario info button of the combat log shows the description, and closing it brings the log back (#24)", async () => {
	const { game } = await uiGame("drpzop01.xml");
	const shown = (id: string) => !["", "none"].includes(document.getElementById(id)!.style.display);
	document.getElementById("statusbar")!.click();
	expect(shown("combatLog")).toBe(true);
	const info = Array.from(document.querySelectorAll<HTMLElement>("#combatLog .combatLogInfoButton")).find((e) => e.textContent === "g")!;
	info.click();
	//The message box is drawn under the log: the log steps aside while the description shows
	expect([shown("ui-message"), shown("combatLog")]).toEqual([true, false]);
	expect(document.getElementById("message")!.innerHTML).toBe(game.scenario.getDescription());
	document.getElementById("uiokbut")!.click();
	expect([shown("ui-message"), shown("combatLog")]).toEqual([false, true]);
	expect(document.getElementById("combatLogButton")!.getAttribute("selected")).toBe("on");
}, 60_000);

//In a campaign the log's header has two buttons of the class, the dossier's (@) and the scenario info's
//(g): the info's handler is its own, whatever their order. It closes a dossier left open, as the toggle
//of the log it no longer runs closed it (#368)
test("The combat log's scenario info button shows the description and closes an open dossier (#368)", async () => {
	const { game } = await uiGame("campaign:0:1");
	const { UIBuilder } = await import("../src/uibuilder");
	const { UICombatLog } = await import("../src/uicombatlog");
	const shown = (id: string) => !["", "none"].includes(document.getElementById(id)!.style.display);
	const button = (text: string) => Array.from(document.querySelectorAll<HTMLElement>("#combatLog .combatLogInfoButton")).find((e) => e.textContent === text)!;
	UICombatLog.toggleCombatLog(true, false);
	UIBuilder.showDossier(true);
	expect([shown("combatLog"), shown("dossier")]).toEqual([true, true]);
	button("g").click();
	expect([shown("ui-message"), shown("combatLog"), shown("dossier")]).toEqual([true, false, false]);
	expect(document.getElementById("message")!.innerHTML).toBe(game.scenario.getDescription());
	document.getElementById("uiokbut")!.click();
	expect([shown("ui-message"), shown("combatLog")]).toEqual([false, true]);
	expect(button("@").onclick, "the dossier's button keeps its own (inline) handler").not.toBe(button("g").onclick);
}, 60_000);

//The person's attack with its attacker selected (click the unit, then the enemy), both units at one
//strength point with a leader that kills one more: the exchange destroys both. The selection refresh
//cleared the destroyed attacker, then read the cleared selection's hasMoved: the TypeError skipped the
//rest of the attack's finish, and the game waited for its end for good. With last, every other unit
//of both sides taken off first
async function bothDestroyed(last: boolean) {
	const { game, ui } = await uiGame("drpzop01.xml", [0, 1, 1, 1]);
	const { GameRules } = await import("../src/gamerules");
	const { touched } = await import("../src/context");
	const { leaderType, terrainType, uiSettings } = await import("../src/prototypes");
	uiSettings.quickAnimation = true;
	const map = game.scenario.map;
	const free = (row: number, col: number) => GameRules.getAdjacent(row, col).filter((c) => c.row > 0 && c.col > 0
		&& c.row < map.rows - 1 && c.col < map.cols - 1 && !map.map[c.row][c.col].unit && !map.map[c.row][c.col].airunit
		&& map.map[c.row][c.col].terrain !== terrainType.Ocean && map.map[c.row][c.col].terrain !== terrainType.River);
	const atk = map.getUnitById(40), def = map.getUnitById(72);
	const d = def.getPos(), f = free(d.row, d.col)[0], from = atk.getPos();
	map.map[from.row][from.col].delUnit(atk);
	map.map[f.row][f.col].setUnit(atk);
	def.tempSpotted = true;
	for (const u of [atk, def]) {
		u.strength = 1;
		u.leader = leaderType.overwhelmingAttack;
	}
	if (last) {
		for (const u of map.getUnits()) if (u !== atk && u !== def) u.destroyed = true;
		map.updateUnitList();
	}
	touched();
	map.selectUnit(atk);
	game.waitUIAnimation = true;
	expect(ui.uiUnitAttack(atk, def)).toBe(true);
	await until(() => !game.waitUIAnimation, "the attack", 5000);
	expect([atk.destroyed, def.destroyed]).toEqual([true, true]);
	return { game, ui, map };
}

test("An attack that destroys both the selected attacker and its defender ends: the selection is cleared and the turn goes on (#326)", async () => {
	const { ui, map } = await bothDestroyed(false);
	expect(map.currentUnit).toBe(null);
	const human = map.currentPlayer;
	ui.mainMenuButton("endturn");
	ui.mainMenuButton("endturn"); //the second click confirms
	expect(map.currentPlayer).not.toBe(human);
}, 60_000);

test("An attack that destroys both units, the last of their sides, still ends the game (#29)", async () => {
	const { game } = await bothDestroyed(true);
	expect(game.gameEnded).toBe(true);
	expect(document.getElementById("message")!.textContent).toContain("wins by destroying all the enemy units");
}, 60_000);

//The old UI shows a unit the AI picked and a look at a hex a moment before the AI's next action, and the
//next player's turn after the AI's: the turn loop's tick until #375 (#8). A message nothing waits for
//closes
test("The old screen shows a unit the AI picked, a look at a hex and its turn's end a moment before it goes on (#375)", async () => {
	const { game, ui } = await uiGame("drpzop01.xml", [0, 1, 1, 1]);
	const map = game.scenario.map;
	const info = vi.spyOn(ui, "uiEndTurnInfo");
	vi.useFakeTimers();
	try {
		const went: string[] = [];
		const unit = map.getUnits().find((u) => u.player === map.currentPlayer && u.getPos() !== null)!;
		game.host.screen.view({ type: "select", unit: unit.id }, () => { went.push("select"); });
		game.host.screen.view({ type: "viewport", at: unit.getPos() }, () => { went.push("viewport"); });
		game.host.screen.turnChanged(() => { went.push("next"); });
		expect([went, map.currentUnit]).toEqual([[], unit]);
		vi.advanceTimersByTime(250);
		expect(went).toEqual(["select", "viewport", "next"]);
		expect(info).not.toHaveBeenCalled();
		vi.advanceTimersByTime(2250);
		expect(info).toHaveBeenCalledTimes(1);
		//A message the session shows at a turn's start, which nothing waits for: its OK only closes it
		game.host.screen.view({ type: "message", text: "Look here", at: unit.getPos() });
		document.getElementById("gameToolTipOk")!.click();
		expect(went).toEqual(["select", "viewport", "next"]);
	} finally {
		vi.useRealTimers();
	}
}, 60_000);

test("Opening the dossier window shows a dossier not set up yet as empty and leaves the player's as the game has it (#403)", async () => {
	const { game } = await uiGame("campaign:0:1");
	const { UIBuilder } = await import("../src/uibuilder");
	const { touched } = await import("../src/context");
	const { worldOf, gameInputs } = await import("../src/mirror");
	//A campaign saved before the dossier: the player has none
	const player = game.getCampaignPlayer()!;
	player.dossier = {};
	touched();
	const world = () => worldOf(game.scenario, game, gameInputs(game));
	expect(world().state.players[player.id].dossier).toEqual({});
	expect(UIBuilder.showDossier(true)).toBe(true);
	const shown = [...document.querySelectorAll("#dossierDestroyed td")].map((td) => td.textContent);
	expect(shown.length).toBeGreaterThan(0);
	expect(shown.every((t) => t === "0")).toBe(true);
	expect(player.dossier).toEqual({});
	expect(world().state.players[player.id].dossier).toEqual({});
}, 60_000);
