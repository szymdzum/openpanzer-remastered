// UIBuilder campaign windows: the in game dossier (no medals, medals), scenario wins with the
// outcome message and the prototype award dialog, the campaign victory and defeat end screens
// with their close button.
// To win a scenario quickly the last objective is set next to one of the player's units
// (one victory hex left for the side), then the unit is moved there like a player would.
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
// The move animation runs on the virtual clock, its end checks the victory
async function capture() {
	clickHex(__win.cell.row, __win.cell.col);
	await runClock(() => isVisible("ui-message") || isVisible("dossier"), 20000);
}
// The turn loop loads the next scenario once the outcome message is clicked
async function nextScenario() {
	const old = game.scenario;
	click("#uiokbut");
	await runClock(() => game.scenario !== old, 20000);
	await waitFor(() => game.scenario.isLoaded && game.gameStarted, 30000);
}
const dossierButton = () => document.querySelector("#combatLog .combatLogInfoButton");

const steps = [
	["start Fall Weiss campaign", async () => { await startCampaign(1, 0); }],
	["close start menu and message", async () => { click("#continuegame"); click("#uiokbut"); }],
	["open the combat log", async () => { click("#statusbar"); }],
	["open the dossier, no medals yet", async () => { click(dossierButton()); }],
	["select a unit next to the (last) objective", async () => {
		prepareWin();
		const p = __win.unit.getPos();
		clickHex(p.row, p.col);
	}],
	["capture it: brilliant victory message", async () => { await capture(); }],
	["continue: next scenario, prototype awarded", async () => { await nextScenario(); }],
	["close the prototype award", async () => { click("#uiMessageBoxDynamic .uiMessageBoxButton"); }],
	["close the scenario message", async () => { click("#uiokbut"); }],
	["dossier with a brilliant medal", async () => { click("#statusbar"); click(dossierButton()); }],
	["debug: simulated dossier", async () => {
		UIBuilder.simulateDossier();
		click("#statusbar"); click(dossierButton());
	}],
	// in deploy mode the weather icon opens the combat log instead of the status bar
	["combat log toggle closes the dossier", async () => { click($("statusbar").onclick ? "#statusbar" : "#weathermsg"); }],
	["close the combat log", async () => { click($("statusbar").onclick ? "#statusbar" : "#weathermsg"); }],
	["win the 2nd scenario", async () => {
		prepareWin();
		const p = __win.unit.getPos();
		clickHex(p.row, p.col);
		await capture();
	}],
	["continue to the 3rd", async () => { await nextScenario(); click("#uiMessageBoxDynamic .uiMessageBoxButton"); click("#uiokbut"); }],
	["win the 3rd scenario", async () => {
		prepareWin();
		const p = __win.unit.getPos();
		clickHex(p.row, p.col);
		await capture();
	}],
	["continue to the last", async () => { await nextScenario(); click("#uiMessageBoxDynamic .uiMessageBoxButton"); click("#uiokbut"); }],
	["win the last scenario: campaign victory screen", async () => {
		prepareWin();
		const p = __win.unit.getPos();
		clickHex(p.row, p.col);
		await capture();
	}],
	["close the campaign end: start menu", async () => { click("#dossierCloseBut"); }],
	["start Fall Weiss again", async () => {
		click("#newgame"); click("#newcampaign");
		const sel = document.querySelector("#smCampSel select");
		sel.selectedIndex = 1; sel.dispatchEvent(new Event("change"));
		const old = game.scenario;
		click("#smCPlayBut");
		await waitFor(() => game.scenario !== old && game.scenario.isLoaded && game.gameStarted, 30000);
	}],
	["close the message, fast forward to the last turn", async () => {
		click("#uiokbut");
		game.scenario.map.turn = game.scenario.map.maxTurns;
	}],
	["end the last turn: campaign defeat screen", async () => { endTurn(); }],
	["close the campaign end", async () => { click("#dossierCloseBut"); }],
];
