// Render: a few turns of real fighting, the player advancing on the enemy and focusing fire on
// the weakest target in range, so units get destroyed (explosion animations), the AI attacks
// back, units run low on ammo and gain leaders, on both sides. Also a scenario with an owned victory hex without a flag.
const myUnits = () => { const m = game.scenario.map; return m.getUnits().filter((u) => u.player.id === m.currentPlayer.id && !u.destroyed); };
const attackCells = (u) => { const m = game.scenario.map; return GameRules.getUnitAttackCells(m.map, u, m.rows, m.cols); };
const targetStrength = (u, c) => {
	const t = game.scenario.map.map[c.row][c.col].getAttackableUnit(u, GameRules.isAir(u));
	return t ? t.strength : 99;
};
// settle() doesn't wait for the move animation (an interval), run the clock until it ends
const waitMove = (u) => runClock(() => !u.hasAnimation, 20000);
const select = async (u) => {
	const m = game.scenario.map;
	if (m.currentUnit !== u) { const p = u.getPos(); clickHex(p.row, p.col); await settle(); }
	return m.currentUnit === u;
};
async function attackAll() {
	for (const u of myUnits()) {
		if (u.destroyed || u.hasFired) continue;
		const cells = attackCells(u).sort((a, b) => targetStrength(u, a) - targetStrength(u, b));
		if (!cells.length || !(await select(u))) continue;
		for (const c of cells) hoverHex(c.row, c.col); //attack cursors, also over air targets of ground units
		clickHex(cells[0].row, cells[0].col);
		await settle();
		await waitMove(u);
	}
}
async function advance() {
	const m = game.scenario.map;
	const enemies = m.getUnits().filter((x) => x.player.side !== m.currentPlayer.side && !x.destroyed);
	if (!enemies.length) return;
	for (const u of myUnits()) {
		if (u.destroyed || u.hasMoved || GameRules.isAir(u) || attackCells(u).length) continue;
		const cells = GameRules.getMoveRange(m, u).filter((c) => c.canMove);
		if (!cells.length) continue;
		const dist = (c) => Math.min(...enemies.map((e) => { const p = e.getPos(); return GameRules.distance(c.row, c.col, p.row, p.col); }));
		cells.sort((a, b) => dist(a) - dist(b));
		if (!(await select(u))) continue;
		clickHex(cells[0].row, cells[0].col);
		await settle();
		await waitMove(u);
	}
}
async function playTurn() {
	await attackAll();
	await advance();
	await attackAll();
	if (game.scenario.map.currentUnit) key("Escape", 27);
	await settle();
	endTurn();
}
const steps = [
	["start scenario, human vs AI", async () => { await startScenario("drpzop01.xml", [0, 1, 1, 1]); }],
];
for (let t = 1; t <= 8; t++) steps.push(["turn " + t + ": attack, advance, attack, end turn", playTurn]);
steps.push(["start the scenario again, playing the Allied side", async () => { await startScenario("drpzop01.xml", [1, 0, 1, 1]); }]);
for (let t = 1; t <= 8; t++) steps.push(["Allied turn " + t + ": attack, advance, attack, end turn", playTurn]);
steps.push(["start a scenario with an owned victory hex without flag", async () => { await startScenario("sb6ait1.xml", [0, 1, 1, 1]); }]);
