// In game DOM helpers: toggleButton on the menu buttons (main menu, hex grid, air mode, zoom),
// the unit info and equipment windows (makeVisible/makeHidden), the combat log (getPosition of
// the unit info), the end turn tooltip shown at the button (getCoordinates), and in a campaign
// the dossier (insertTemplate). The end turn button re-arms on its animationend, which the
// harness fires 1s later, so the first tap's step leaves it unconfirmed again.
function __pickUnit() {
	const m = game.scenario.map;
	return m.getUnits().find((u) => u.player.id === m.currentPlayer.id && u !== m.currentUnit);
}

const steps = [
	["start scenario, human vs AI", async () => { await startScenario("drvyaz13.xml", [0, 1, 1, 1]); }],
	["open main menu", async () => { click("#mainmenu"); }],
	["hex grid on", async () => { click("#hex"); }],
	["hex grid off", async () => { click("#hex"); }],
	["air mode on", async () => { click("#air"); }],
	["air mode off", async () => { click("#air"); }],
	["zoom out", async () => { click("#zoom"); }],
	["zoom back", async () => { click("#zoom"); }],
	["close main menu", async () => { click("#mainmenu"); }],
	["select a unit", async () => { const u = __pickUnit(); clickHex(u.getPos().row, u.getPos().col); }],
	["open unit info", async () => { click("#mainmenu"); click("#inspectunit"); }],
	["open the combat log with unit info shown", async () => { click("#combatLogButton"); }],
	["close the combat log", async () => { click("#combatLogButton"); }],
	["close unit info", async () => { click("#inspectunit"); }],
	["open the equipment window", async () => { click("#buy"); }],
	["close the equipment window", async () => { click("#buy"); }],
	["open the combat log with unit info hidden", async () => { click("#combatLogButton"); }],
	["close the combat log again", async () => { click("#combatLogButton"); }],
	["end turn first tap, tooltip at the button", async () => { click("#endturn"); }],
	["end turn, AI plays", async () => { endTurn(); }],
	["start a campaign", async () => { await startCampaign(1, 0); }],
	["open the combat log in the campaign", async () => { click("#combatLogButton"); }],
	["open the dossier from the combat log", async () => { click(document.querySelector("#combatLog .combatLogInfoButton")); }],
	["combat log button closes the dossier, reopens the log", async () => { click("#combatLogButton"); }],
	["close the combat log", async () => { click("#combatLogButton"); }],
];
