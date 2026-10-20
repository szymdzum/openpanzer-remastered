// ui: main menu and start menu buttons, end turn confirmation and its tips, end turn
// defeat, defeat and victory by elimination, small tooltips, the tutorial, clicks while
// it's not the human's turn, odd inputs (map edge, old style mouse button, stale shortcuts).
function check(cond, what) { if (!cond) throw new Error("check failed: " + what); }
const M = () => game.scenario.map;
const U = (id) => M().getUnitById(id);
function keyCode(code, key) { window.dispatchEvent(new KeyboardEvent("keyup", { code, key: key || code.slice(3).toLowerCase(), bubbles: true })); }
async function finish() {
	const animating = () => Object.keys(clock.timers).some((k) => clock.timers[k].repeat && +k !== game.loop);
	await runClock(() => !animating(), 100000);
	await settle();
}
function destroyAllBut(side, keep) {
	for (const u of M().getUnits()) if (u.player.side === side && u !== keep) u.destroyed = true;
	M().updateUnitList();
}
function teleport(u, row, col) {
	const m = M(), p = u.getPos();
	GameRules.setZOCRange(m.map, u, false, m.rows, m.cols);
	GameRules.setSpotRange(m.map, u, false, m.rows, m.cols);
	m.map[p.row][p.col].delUnit(u);
	m.map[row][col].setUnit(u);
	GameRules.setZOCRange(m.map, u, true, m.rows, m.cols);
	GameRules.setSpotRange(m.map, u, true, m.rows, m.cols);
}
const steps = [
	["start scenario, human vs AI", async () => {
		await startScenario("drpzop01.xml", [0, 1, 1, 1]);
	}],
	["main menu button opens the slide menu", async () => {
		const before = isVisible("slidemenu");
		click("#mainmenu");
		check(isVisible("slidemenu") !== before, "slide menu toggled");
	}],
	["main menu button again", async () => {
		const before = isVisible("slidemenu");
		click("#mainmenu");
		check(isVisible("slidemenu") !== before, "slide menu toggled back");
	}],
	["options button toggles the start menu", async () => {
		const before = isVisible("startmenu");
		click("#options");
		check(isVisible("startmenu") !== before, "start menu toggled");
		if (!isVisible("startmenu")) click("#options");
		check(isVisible("startmenu") && isVisible("smMain"), "start menu open");
	}],
	["New Game", async () => {
		click("#newgame");
		check(isVisible("smNewGame"), "new game panel");
	}],
	["Scenarios", async () => {
		click("#newscenario");
		check(isVisible("smScen") && !isVisible("smMain"), "scenario selection");
	}],
	["back to the start menu (options twice)", async () => {
		click("#options"); click("#options");
		check(isVisible("smMain") && !isVisible("smScen"), "start menu");
	}],
	["Campaigns", async () => {
		click("#newgame");
		click("#newcampaign");
		check(isVisible("smCamp"), "campaign selection");
	}],
	["Save / Load", async () => {
		click("#options"); click("#options");
		click("#saveload");
		check(isVisible("smState"), "save/load panel");
	}],
	["Settings with the scenario message open: message hidden", async () => {
		click("#options"); click("#options");
		makeVisible("ui-message");
		click("#settings");
		check(isVisible("smSettings") && !isVisible("ui-message") && $("smSettings").messageHidden, "settings, message hidden");
	}],
	["Settings without a message", async () => {
		click("#options"); click("#options");
		$("smSettings").messageHidden = false;
		makeHidden("ui-message");
		click("#settings");
		check(isVisible("smSettings") && !$("smSettings").messageHidden, "settings");
	}],
	["Continue Game", async () => {
		click("#options"); click("#options");
		click("#continuegame");
		check(!isVisible("startmenu"), "back to the game");
	}],
	["Objective tooltips: hex grid with an unnamed objective", async () => {
		M().map[2][20].name = null;
		uiSettings.showDetailInfoToolTips = true;
		click("#hex"); click("#hex");
		uiSettings.showDetailInfoToolTips = false;
		check(UIBuilder.smallToolTipList.length > 0, "tooltips");
	}],
	["end turn once: asks to confirm, with the tip", async () => {
		click("#endturn");
		check($("endturn").getAttribute("confirmation") === "on" && $("endturn").innerHTML === "1", "confirmation asked");
	}],
	["the confirmation times out with the button animation", async () => {
		await finish();
		check($("endturn").getAttribute("confirmation") === null && $("endturn").innerHTML === "t", "confirmation reset");
	}],
	["units low on ammo and fuel, equipment and unit info open: end turn", async () => {
		U(53).ammo = 0; U(53).fuel = 0;
		click("#buy");
		click("#inspectunit");
		if (!isVisible("unit-info")) click("#inspectunit");
		check(isVisible("equipment") && isVisible("unit-info"), "windows open");
		endTurn();
		await finish();
		check(M().turn === 2 && !isVisible("equipment") && uiSettings.shownEndTurnTip, "turn 2, windows closed");
		check(UIBuilder.smallToolTipList.indexOf("gsttu53") >= 0, "low supply tooltip on the unit");
	}],
	["select the low supply unit: its tooltip goes", async () => {
		// No Ammo and No Fuel share the id gsttu53, only the first one found is removed
		const n = document.querySelectorAll("#gsttu53").length;
		clickHex(U(53).getPos().row, U(53).getPos().col);
		check(M().currentUnit === U(53) && document.querySelectorAll("#gsttu53").length === n - 1, "one tooltip removed");
	}],
	["end turn with the confirmation tip already shown", async () => {
		click("#endturn");
		await finish();
		check($("endturn").innerHTML === "t", "reset without tips");
		endTurn();
		await finish();
		check(M().turn === 3, "turn 3");
	}],
	["Escape deselects but keeps the context shortcuts: M throws", async () => {
		const u = U(3);
		clickHex(u.getPos().row, u.getPos().col);
		check(M().currentUnit === u, "selected");
		keyCode("Escape", "Escape");
		check(M().currentUnit === null, "deselected");
		keyCode("KeyM"); // the mount shortcut is still registered for a null unit
	}],
	["mouse on the map edge left of the first column: no hex", async () => {
		const cursor = window.__harnessRender.getCursorCanvas(), g = $("game");
		g.scrollLeft = 0; g.scrollTop = 0;
		const r = cursor.getBoundingClientRect();
		const init = eventCoords(cursor, r.left - 40 + window.scrollX, r.top + 200 + window.scrollY);
		cursor.dispatchEvent(new MouseEvent("mousemove", init));
		cursor.dispatchEvent(new MouseEvent("mousedown", init));
		window.dispatchEvent(new MouseEvent("mouseup", init));
	}],
	["old style right click (no which, button 2)", async () => {
		const cursor = window.__harnessRender.getCursorCanvas();
		const p = hexPageCoords(12, 4);
		const ev = new MouseEvent("mousedown", Object.assign(eventCoords(cursor, p.x, p.y), { button: 2 }));
		Object.defineProperty(ev, "which", { value: 0 });
		cursor.dispatchEvent(ev);
		window.dispatchEvent(new MouseEvent("mouseup", eventCoords(cursor, p.x, p.y)));
		check(isVisible("unit-info") && M().currentUnit === null, "right click: info only");
	}],
	["not the human's turn: clicks don't select, no equipment window", async () => {
		const p = M().currentPlayer, type = p.type;
		p.type = playerType.aiLocal;
		clickHex(12, 4);
		game.ui.toggleUnitsAndEquipmentWindow(true);
		p.type = type;
		check(M().currentUnit === null && !isVisible("equipment"), "nothing");
	}],
	["the unit list isn't shown for the other side", async () => {
		click("#buy");
		const side = game.spotSide;
		game.spotSide = 1;
		game.ui.updateEquipmentWindow(unitClass.tank);
		game.spotSide = side;
		click("#buy");
	}],
	["end turn confirmed while it's not the human's turn: nothing", async () => {
		const p = M().currentPlayer, type = p.type, turn = M().turn;
		p.type = playerType.aiLocal;
		click("#endturn"); click("#endturn");
		p.type = type;
		check(M().turn === turn, "no end turn");
	}],
	["a fortification unit selected: equipment can't be bought for it", async () => {
		click("#buy");
		const b = Array.from($("unitlist").children).find((d) => d.unitid == 2); // Pontoon Bridge
		click(b);
		check($("eqUserSel").equnit == U(2).eqid, "bridge equipment selected");
		click("#buy");
	}],
	["the AI destroys the last German unit: defeat", async () => {
		const p = M().currentPlayer, type = p.type;
		const last = U(54), enemy = U(55);
		keyCode("Escape", "Escape");
		check(M().currentUnit === null, "nothing selected");
		destroyAllBut(0, last);
		last.strength = 1; last.entrenchment = 0;
		enemy.strength = 15; enemy.experience = 500;
		const e = enemy.getPos(), f = GameRules.getAdjacent(e.row, e.col).find((c) => !M().map[c.row][c.col].unit && M().map[c.row][c.col].terrain === terrainType.Clear);
		teleport(last, f.row, f.col);
		// the AI player has no handler here: hold the turn loop until the attack is over
		p.type = playerType.aiLocal;
		game.waitUIAnimation = true;
		game.ui.uiUnitAttack(enemy, last);
		await runClock(() => clock.pendingTimeouts() === 0 && !Object.keys(clock.timers).some((k) => clock.timers[k].repeat && +k !== game.loop), 100000);
		p.type = type;
		check(last.destroyed && game.gameEnded, "defeat: " + JSON.stringify([last.strength, last.destroyed, game.gameEnded, M().hasAliveUnits(0)]));
		check(document.body.textContent.indexOf("You have lost") >= 0, "defeat message");
	}],
	["new scenario: the last Polish unit destroyed, victory", async () => {
		await startScenario("drpzop01.xml", [0, 1, 1, 1]);
		await settle();
		const atk = U(0), last = U(55); // tank against infantry
		destroyAllBut(1, last);
		last.strength = 1; last.tempSpotted = true; last.entrenchment = 0;
		atk.strength = 15; atk.experience = 500;
		const e = last.getPos(), f = GameRules.getAdjacent(e.row, e.col).find((c) => !M().map[c.row][c.col].unit && M().map[c.row][c.col].terrain === terrainType.Clear);
		teleport(atk, f.row, f.col);
		keyCode("Escape", "Escape"); // the tank is selected at turn start
		clickHex(atk.getPos().row, atk.getPos().col);
		clickHex(last.getPos().row, last.getPos().col);
		await finish();
		check(last.destroyed && game.gameEnded, "victory: " + JSON.stringify([last.strength, last.destroyed, game.gameEnded, M().hasAliveUnits(1), atk.hasFired, M().currentUnit && M().currentUnit.id]));
		check(document.body.textContent.indexOf("You have won") >= 0, "victory message");
	}],
	["new scenario, end turns until time runs out: defeat", async () => {
		await startScenario("drpzop01.xml", [0, 1, 1, 1]);
		await settle();
		M().turn = M().maxTurns;
		endTurn();
		await finish();
		check(game.gameEnded, "game over");
		check(document.body.textContent.indexOf("You didn't capture the objectives in time") >= 0, "defeat message");
	}],
	["Tutorial from the start menu, with the broken clearRect workaround", async () => {
		const real = hasBrokenClearRect;
		hasBrokenClearRect = () => true;
		const old = game.scenario;
		click("#options");
		if (!isVisible("startmenu")) click("#options");
		click("#tutorial");
		const ok = await waitFor(() => game.scenario !== old && game.scenario.isLoaded && game.gameStarted, 30000);
		hasBrokenClearRect = real;
		check(ok && game.scenario.name.indexOf("Tutorial") >= 0, "tutorial loaded");
	}],
	["the tutorial plays its first turns with game tooltips", async () => {
		await runClock(() => M().turn >= 2, 200000);
		await finish();
		check(M().turn >= 2, "tutorial turns played");
	}],
];
