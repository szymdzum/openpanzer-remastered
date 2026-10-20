// UIBuilder messages and tooltips in a single scenario: objective tooltips (enemy, own,
// air/naval transport pins), removing one by clicking it, no ammo/fuel tooltips, the end turn
// confirmation tooltips, the AI turn status, the attack info on the status bar, the scenario
// description message, a scenario won by capture (message with its own ok handler), unit info,
// and the scripted tutorial's game tooltips.
function prepareWin() {
	const m = game.scenario.map, side = m.currentPlayer.side;
	for (const u of m.getUnits()) {
		if (u.player.id !== m.currentPlayer.id || u === m.currentUnit || !GameRules.canCapture(u) || GameRules.isAir(u)) continue;
		const c = GameRules.getMoveRange(m, u).find((x) => x.canMove && !m.map[x.row][x.col].unit && m.map[x.row][x.col].victorySide === -1);
		if (!c) continue;
		m.map[c.row][c.col].victorySide = ~side & 1;
		m.map[c.row][c.col].owner = m.getPlayers().find((x) => x.side !== side).id; // held by the enemy
		m.sidesVictoryHexes[side] = [m.map[c.row][c.col].getPos()];
		window.__win = { unit: u, cell: c };
		return;
	}
	throw new Error("no unit can reach a free hex");
}
const ownUnit = () => {
	const m = game.scenario.map;
	return m.getUnits().find((u) => u.player.id === m.currentPlayer.id && u !== m.currentUnit && !GameRules.isAir(u));
};

const steps = [
	["start a scenario with air and naval transports", async () => { await startScenario("cm3bard.xml", [0, 1, 1, 1]); }],
	["close start menu and message", async () => { click("#continuegame"); click("#uiokbut"); }],
	["click an objective tooltip away", async () => { click(document.querySelector("#game .smallToolTip")); }],
	["a unit runs out of ammo and fuel, hex grid toggle redraws the tooltips", async () => {
		const u = ownUnit();
		u.ammo = 0; u.fuel = 0;
		click("#mainmenu"); click("#hex");
	}],
	["hex grid back", async () => { click("#hex"); }],
	["select a unit and inspect it", async () => {
		const p = ownUnit().getPos();
		clickHex(p.row, p.col);
		click("#inspectunit");
	}],
	["close unit info", async () => { click("#inspectunit"); }],
	["scenario description from the combat log", async () => {
		click("#statusbar");
		click(Array.from(document.querySelectorAll("#combatLog .combatLogInfoButton")).find((e) => e.textContent === "g"));
	}],
	["close the description", async () => { click("#uiokbut"); }],
	["end turn once: tap again tooltip, then tap twice when it re-arms", async () => { click("#endturn"); }],
	["tooltip click closes it", async () => { click("#uiToolTip"); }],
	["end turn: AI turn status, attacks shown on the status bar", async () => { endTurn(); }],
	["start Panzer-Verbaende Ostpreussen", async () => { await startScenario("drpzop01.xml", [0, 1, 1, 1]); }],
	["close start menu and message", async () => { click("#continuegame"); click("#uiokbut"); }],
	["select a unit next to the (last) objective", async () => {
		prepareWin();
		const p = __win.unit.getPos();
		clickHex(p.row, p.col);
	}],
	["capture it: scenario won message", async () => {
		clickHex(__win.cell.row, __win.cell.col);
		await runClock(() => isVisible("ui-message"), 20000);
	}],
	["ok opens the main menu", async () => { click("#uiokbut"); }],
	["start the tutorial", async () => { click("#newgame"); click("#tutorial"); await waitFor(() => game.scenario.isLoaded && game.gameStarted, 30000); }],
	// settle confirms the tutorial's game tooltips with their ok button, like the player
	["close the message, the scripted turn plays with its game tooltips", async () => {
		click("#uiokbut");
		await runClock(() => isVisible("gameToolTip"), 200000);
	}],
];
