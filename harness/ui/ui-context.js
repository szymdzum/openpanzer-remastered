// ui: the unit context buttons and their keyboard shortcuts: mount/unmount, embark/disembark,
// resupply, reinforce, overstrength, undo move, and their "can't" results; trains.
function check(cond, what) { if (!cond) throw new Error("check failed: " + what); }
const M = () => game.scenario.map;
const U = (id) => M().getUnitById(id);
function teleport(u, row, col) {
	const m = M(), p = u.getPos();
	GameRules.setZOCRange(m.map, u, false, m.rows, m.cols);
	GameRules.setSpotRange(m.map, u, false, m.rows, m.cols);
	m.map[p.row][p.col].delUnit(u);
	m.map[row][col].setUnit(u);
	GameRules.setZOCRange(m.map, u, true, m.rows, m.cols);
	GameRules.setSpotRange(m.map, u, true, m.rows, m.cols);
}
function freeAround(row, col) {
	const m = M();
	return GameRules.getAdjacent(row, col).filter((c) => c.row > 0 && c.col > 0 && c.row < m.rows - 1 && c.col < m.cols - 1
		&& !m.map[c.row][c.col].unit && !m.map[c.row][c.col].airunit
		&& m.map[c.row][c.col].terrain !== terrainType.Ocean && m.map[c.row][c.col].terrain !== terrainType.River);
}
if (!window.__bounceLog) {
	window.__bounceLog = [];
	const realBounce = bounceText;
	bounceText = function(x, y, text, positive) { window.__bounceLog.push(String(text)); return realBounce(x, y, text, positive); };
}
function alerts() { const s = window.__bounceLog.join("|"); window.__bounceLog = []; return s; }
function contextButton(name) {
	return Array.from($("unit-context").children).find((d) => d.innerHTML === UIBuilder.unitContextButtons[name]);
}
function select(u) {
	if (M().currentUnit) window.dispatchEvent(new KeyboardEvent("keyup", { code: "Escape", key: "Escape", bubbles: true }));
	const p = u.getPos();
	clickHex(p.row, p.col);
	check(M().currentUnit === u, "unit " + u.id + " selected");
}
function keyCode(code) { window.dispatchEvent(new KeyboardEvent("keyup", { code, key: code.slice(3).toLowerCase(), bubbles: true })); }
async function finish() {
	const animating = () => Object.keys(clock.timers).some((k) => clock.timers[k].repeat && +k !== game.loop);
	await runClock(() => !animating(), 100000);
	await settle();
}
const steps = [
	["start scenario, human vs AI", async () => {
		await startScenario("drpzop01.xml", [0, 1, 1, 1]);
	}],
	["select infantry with a transport: mount button", async () => {
		select(U(3));
		check(contextButton("mount") && isVisible("unit-context"), "mount button shown");
	}],
	["mount button", async () => {
		click(contextButton("mount"));
		check(U(3).isMounted, "mounted");
	}],
	["M key: unmount", async () => {
		keyCode("KeyM");
		check(!U(3).isMounted, "unmounted");
	}],
	["damaged unit low on ammo: resupply and reinforce buttons", async () => {
		const u = U(12);
		u.strength = 6; u.ammo = 1;
		select(u);
		check(contextButton("resupply") && contextButton("reinforce"), "resupply and reinforce shown");
	}],
	["resupply button", async () => {
		click(contextButton("resupply"));
		const al = alerts();
		check(al.indexOf("ammo") >= 0 && U(12).ammo > 1, "resupplied: " + al);
		check(!contextButton("reinforce"), "can't reinforce after resupply");
	}],
	["R key: reinforce", async () => {
		const u = U(13);
		u.strength = 5; u.ammo = 2; u.fuel = 0;
		select(u);
		keyCode("KeyR");
		const al = alerts();
		check(u.strength > 5 && al.indexOf("units") >= 0, "reinforced: " + al);
	}],
	["reinforce button for a unit with fuel", async () => {
		const u = U(53); // Kfz 13
		u.strength = 7; u.fuel = 3; u.ammo = 1;
		select(u);
		click(contextButton("reinforce"));
		const al = alerts();
		check(u.strength > 7 && al.indexOf("fuel") >= 0, "reinforced and refueled: " + al);
	}],
	["S key: resupply", async () => {
		const u = U(1); // Psw 231
		u.fuel = 5;
		select(u);
		keyCode("KeyS");
		const al = alerts();
		check(al.indexOf("fuel") >= 0 && u.fuel > 5, "refueled: " + al);
	}],
	["veteran unit: overstrength button", async () => {
		const u = U(35);
		u.experience = 250;
		select(u);
		check(contextButton("overstrength"), "overstrength shown");
		click(contextButton("overstrength"));
		const al = alerts();
		check(u.strength > 10, "overstrength: " + al);
	}],
	["O key: overstrength", async () => {
		const u = U(34);
		u.experience = 150;
		select(u);
		keyCode("KeyO");
		check(u.strength > 10, "overstrength by key");
	}],
	["resupply button after the unit can't resupply anymore: can't resupply", async () => {
		alerts();
		const u = U(32), p = u.getPos();
		const around = freeAround(p.row, p.col);
		[U(29), U(30), U(15)].forEach((e, i) => teleport(e, around[i].row, around[i].col));
		u.ammo = u.unitData(true).ammo - 1;
		select(u);
		u.hasResupplied = true; // the button is already there
		click(contextButton("resupply"));
		const al = alerts();
		check(al.indexOf("Can't resupply") >= 0, "can't resupply: " + al);
	}],
	["unit surrounded by 3 enemies: can't reinforce", async () => {
		const u = U(32);
		u.strength = 9; u.hasResupplied = false;
		select(u);
		click(contextButton("reinforce"));
		const al = alerts();
		check(al.indexOf("Can't reinforce") >= 0, "can't reinforce: " + al);
	}],
	["surrounded veteran: no overstrength", async () => {
		const u = U(32);
		u.strength = 10; u.experience = 100; u.hasResupplied = false;
		select(u);
		click(contextButton("overstrength"));
		const al = alerts();
		check(al.indexOf("No overstrength") >= 0, "no overstrength: " + al);
	}],
	["move a unit: undo button", async () => {
		const u = U(44);
		select(u);
		const p = u.getPos();
		const c = GameRules.getMoveRange(M(), u).filter((x) => x.canMove && !M().map[x.row][x.col].unit).pop();
		clickHex(c.row, c.col);
		await finish();
		check(u.getPos().row === c.row && u.getPos().col === c.col, "moved");
		check(contextButton("undo"), "undo shown");
		click(contextButton("undo"));
		check(u.getPos().row === p.row && u.getPos().col === p.col && !u.hasMoved, "move undone");
	}],
	["move again: U key undoes", async () => {
		const u = U(44), p = u.getPos();
		select(u);
		const c = GameRules.getMoveRange(M(), u).filter((x) => x.canMove && !M().map[x.row][x.col].unit).pop();
		clickHex(c.row, c.col);
		await finish();
		keyCode("KeyU");
		check(u.getPos().row === p.row && u.getPos().col === p.col, "move undone by key");
	}],
	["infantry in a port with naval transports: embark button", async () => {
		const u = U(40), p = u.getPos();
		M().map[p.row][p.col].terrain = terrainType.Port;
		M().currentPlayer.navalTransports = 2;
		select(u);
		check(contextButton("embark"), "embark shown");
		click(contextButton("embark"));
		check(u.carrier > 0, "embarked");
	}],
	["E key: disembark", async () => {
		keyCode("KeyE");
		check(U(40).carrier < 0, "disembarking");
	}],
	["E key again: back on the ship", async () => {
		keyCode("KeyE");
		check(U(40).carrier > 0, "embarked again");
	}],
	["embark button with no transports left: nothing", async () => {
		const u = U(43), p = u.getPos();
		M().map[p.row][p.col].terrain = terrainType.Port;
		M().currentPlayer.navalTransports = 1;
		select(u);
		M().currentPlayer.navalTransports = 0; // gone after the buttons were made
		click(contextButton("embark"));
		check(u.carrier === 0, "not embarked");
	}],
	["unit without context actions: shortcut keys do nothing", async () => {
		const u = U(45);
		select(u);
		check(!isVisible("unit-context"), "no context buttons");
		["KeyM", "KeyE", "KeyS", "KeyR", "KeyO", "KeyU"].forEach(keyCode);
		check(M().currentUnit === u, "still selected");
	}],
	["a train: rail road in unit info, move without animation", async () => {
		const u = U(31);
		u.eqid = 2815; // Panzerzug
		select(u);
		click("#inspectunit");
		check($("uMoveType").textContent === "Rail Road", "rail road");
		check(game.ui.uiUnitMove(u, 20, 30) === false, "no path, no animation");
	}],
	["end turn with the context window open", async () => {
		endTurn();
		await finish();
		check(M().turn === 2 && M().currentPlayer.id === 0, "turn 2");
	}],
];
