// Example UI script, the template for harness/ui/<script>.js: a human turn against the AI.
// Steps run in order; each is followed by settle() and a snapshot of state, DOM and canvases.
const steps = [
	["start scenario, human vs AI", async () => { await startScenario("drpzop01.xml", [0, 1, 1, 1]); }],
	["select a unit", async () => {
		const m = game.scenario.map;
		// not the unit selected at turn start: clicking the selected unit deselects it
		window.__u = m.getUnits().find((u) => u.player.id === m.currentPlayer.id && u !== m.currentUnit
			&& GameRules.getMoveRange(m, u).length > 0);
		const p = __u.getPos();
		clickHex(p.row, p.col);
	}],
	["move it", async () => {
		const cells = GameRules.getMoveRange(game.scenario.map, __u).filter((c) => c.canMove);
		const c = cells[cells.length - 1];
		clickHex(c.row, c.col);
	}],
	["open unit info", async () => { click("#inspectunit"); }],
	["close unit info", async () => { click("#inspectunit"); }],
	["open main menu", async () => { click("#mainmenu"); }],
	["close main menu", async () => { click("#mainmenu"); }],
	["end turn, AI plays", async () => { endTurn(); }],
];
