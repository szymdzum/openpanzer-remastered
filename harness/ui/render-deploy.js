// Render: reinforcement deployment (deployment hexes with their Z glyph, deploying a bought
// unit), a map smaller than the window (game area sized to the map), a campaign (core and
// non core strength boxes) and touch screen attack markers drawn on the map.
const myUnits = () => { const m = game.scenario.map; return m.getUnits().filter((u) => u.player.id === m.currentPlayer.id); };
const attackCells = (u) => { const m = game.scenario.map; return GameRules.getUnitAttackCells(m.map, u, m.rows, m.cols); };
const freeDeployHex = () => {
	const m = game.scenario.map;
	for (let r = 0; r < m.rows; r++)
		for (let c = 0; c < m.cols; c++) {
			const h = m.map[r][c];
			if (h.isDeployment === m.currentPlayer.id && h.unit === null && h.airunit === null) return { row: r, col: c };
		}
	return null;
};
const steps = [
	["start scenario, human vs AI", async () => { await startScenario("drpzop01.xml", [0, 1, 1, 1]); }],
	["open the equipment window", async () => { click("#buy"); }],
	["pick the first unit to buy", async () => { click(document.querySelector("#eqUnitList .eqUnitBox")); }],
	["buy it: deploy mode shows the deployment hexes", async () => { click("#eqNewBut"); }],
	["select the bought unit in the deploy list", async () => { click(document.querySelector("#unitlist .eqUnitBox")); }],
	["deploy it on a free deployment hex (closes the window)", async () => { window.__c = freeDeployHex(); clickHex(__c.row, __c.col); }],
	["select the deployed unit", async () => { clickHex(__c.row, __c.col); }],
	["deselect it (click it again)", async () => { clickHex(__c.row, __c.col); }],
	["touch screen: attack estimates drawn on the map", async () => {
		uiSettings.hasTouch = true;
		const u = myUnits().find((x) => attackCells(x).length > 0);
		const p = u.getPos();
		clickHex(p.row, p.col);
	}],
	["touch screen off, deselect", async () => { uiSettings.hasTouch = false; key("Escape", 27); }],
	["start a small map scenario: game area sized to the map", async () => { await startScenario("dragrom00.xml", [0, 1, 1, 1]); }],
	["select a unit on the small map", async () => {
		const u = myUnits().find((x) => x !== game.scenario.map.currentUnit);
		const p = u.getPos();
		clickHex(p.row, p.col);
	}],
	["end turn on the small map, AI plays", async () => { endTurn(); }],
	["start a campaign", async () => { await startCampaign(0, 0); }],
	["end turn in the campaign, AI plays", async () => { endTurn(); }],
];
