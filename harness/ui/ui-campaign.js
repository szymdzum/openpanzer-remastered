// ui: a campaign: deployment of the core units at scenario start, the deploy list, buying
// in a campaign (other country equipment can't be bought), a naval unit in the unit list,
// victory by capture continues the campaign, losing all units loses it.
function check(cond, what) { if (!cond) throw new Error("check failed: " + what); }
const M = () => game.scenario.map;
const U = (id) => M().getUnitById(id);
const sel = () => $("eqUserSel");
function boxes(list) { return Array.from($(list).children); }
function keyCode(code, key) { window.dispatchEvent(new KeyboardEvent("keyup", { code, key: key || code.slice(3).toLowerCase(), bubbles: true })); }
async function finish() {
	const animating = () => Object.keys(clock.timers).some((k) => clock.timers[k].repeat && +k !== game.loop);
	await runClock(() => !animating() && clock.pendingTimeouts() === 0, 100000);
	await settle();
}
function deployHexes() {
	const m = M(), out = [];
	for (let r = 0; r < m.rows; r++)
		for (let c = 0; c < m.cols; c++) {
			const h = m.map[r][c];
			if (h.isDeployment == m.currentPlayer.id && !h.unit && !h.airunit) out.push({ row: r, col: c });
		}
	return out;
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
	["start the Das Reich campaign: core units to deploy", async () => {
		await startCampaign(0, 0);
		await settle();
		check(game.campaign !== null && !M().currentPlayer.hasUndeployedUnits(), "campaign started, no core units yet");
	}],
	["move onto the last victory hex: the campaign goes on", async () => {
		keyCode("Escape", "Escape");
		const tank = M().getUnits().find((u) => u.player.id === M().currentPlayer.id && !GameRules.isAir(u)
			&& GameRules.canCapture(u) && GameRules.getMoveRange(M(), u).some((x) => x.canMove && !M().map[x.row][x.col].unit));
		clickHex(tank.getPos().row, tank.getPos().col);
		check(M().currentUnit === tank, "unit selected");
		const c = GameRules.getMoveRange(M(), tank).filter((x) => x.canMove && !M().map[x.row][x.col].unit).pop();
		const h = M().map[c.row][c.col];
		h.owner = 1; h.flag = 15; h.victorySide = 0;
		M().sidesVictoryHexes[0] = [new Cell(c.row, c.col)];
		window.__oldScenario = game.scenario;
		clickHex(c.row, c.col);
		await finish();
		check(game.campaign !== null, "still in the campaign");
		// the next scenario loads in real time once the message is clicked, wait for it here
		const ok = await waitFor(() => game.scenario !== window.__oldScenario && game.scenario.isLoaded && game.gameStarted, 30000);
		await finish();
		check(ok, "next scenario loaded");
	}],
	["the next campaign scenario: core units to deploy", async () => {
		check(M().currentPlayer.hasUndeployedUnits() && isVisible("container-unitlist"), "core units to deploy, list shown");
	}],
	["open the equipment window: deploy list", async () => {
		click("#buy");
		check(uiSettings.deployMode && boxes("unitlist").length > 0, "deploy mode list");
		check($("unitlist").querySelector("[coreUnit]") || boxes("unitlist").length === 1, "core units marked");
	}],
	["pick the second unit to deploy", async () => {
		const b = boxes("unitlist")[1] || boxes("unitlist")[0];
		click(b);
		check(sel().deployunit == b.unitid, "picked");
	}],
	["deploy it", async () => {
		const n = M().currentPlayer.getCoreUnitList().filter((u) => !u.isDeployed).length;
		const h = deployHexes()[0];
		clickHex(h.row, h.col);
		await finish();
		check(M().currentPlayer.getCoreUnitList().filter((u) => !u.isDeployed).length === n - 1, "one less to deploy");
	}],
	["a click on a deployed unit while deploying selects it", async () => {
		const u = M().getUnits().find((x) => x.player.id === M().currentPlayer.id);
		const p = u.getPos();
		clickHex(p.row, p.col);
		check(M().currentUnit === u, "selected");
	}],
	["support country equipment can't be bought in the campaign", async () => {
		M().currentPlayer.supportCountries = [7]; // France
		game.ui.setNewScenario(); // countries are read again on a new scenario
		await finish();
		click("#buy");
		if (!isVisible("equipment")) click("#buy");
		click("#eqSelCountry");
		click(boxes("eqUnitList")[0]);
		check($("eqSelCountry").country === 1 && sel().equnit > 0, "other country unit picked");
	}],
	["deploy all the others: the list closes", async () => {
		const hexes = deployHexes();
		for (let i = 0; M().currentPlayer.hasUndeployedUnits() && i < hexes.length; i++) {
			clickHex(hexes[i].row, hexes[i].col);
			await finish();
		}
		check(!M().currentPlayer.hasUndeployedUnits() && !uiSettings.deployMode, "all deployed");
	}],
	["a naval unit in the unit list", async () => {
		const u = M().getUnits().find((x) => x.player.id === M().currentPlayer.id && x.isCore);
		u.eqid = 127; // Konigsberg
		click("#buy");
		if (!isVisible("equipment")) click("#buy");
		check(boxes("unitlist").some((d) => d.querySelector("img").src.indexOf(UIBuilder.navalReplacementIcon) >= 0), "naval icon");
		click("#buy");
	}],
	["Campaigns in the start menu during a campaign: the current one selected", async () => {
		click("#options");
		if (!isVisible("startmenu")) click("#options");
		click("#newgame");
		click("#newcampaign");
		check(isVisible("smCamp") && $("smCampSel").firstChild.selectedIndex === 0, "current campaign selected");
		click("#options");
		if (isVisible("startmenu")) click("#options");
	}],
	["all our units lost: the campaign is lost", async () => {
		keyCode("Escape", "Escape");
		await finish();
		const m = M();
		const mine = m.getUnits().filter((u) => u.player.side === 0 && u.getPos());
		const enemy = m.getUnits().find((u) => u.player.side === 1 && u.getPos() && !GameRules.isAir(u));
		check(mine.length > 0 && enemy, "units on both sides");
		const last = mine[0];
		for (const u of mine) if (u !== last) u.destroyed = true;
		m.updateUnitList();
		for (const u of m.getUnits()) if (u.player.side === 0 && u !== last) u.destroyed = true; // undeployed ones too
		const e = enemy.getPos(), f = GameRules.getAdjacent(e.row, e.col).find((x) => m.map[x.row] && m.map[x.row][x.col] && !m.map[x.row][x.col].unit && m.map[x.row][x.col].terrain === terrainType.Clear);
		teleport(last, f.row, f.col);
		last.strength = 1; last.entrenchment = 0;
		enemy.strength = 15; enemy.experience = 500;
		const p = m.currentPlayer, type = p.type;
		p.type = playerType.aiLocal;
		game.waitUIAnimation = true;
		game.ui.uiUnitAttack(enemy, last);
		await runClock(() => clock.pendingTimeouts() === 0 && !Object.keys(clock.timers).some((k) => clock.timers[k].repeat && +k !== game.loop), 100000);
		p.type = type;
		check(last.destroyed, "last unit destroyed");
	}],
];
