// ui: attacks and their animations: ranged attack, overrun, support fire, attack stopped,
// destroyed attacker, rugged defense, retreat, surrender, new leaders, surprise on move,
// flag capture, victory by capture and by elimination.
// Units are placed next to their targets (teleport) and strengths set so each outcome happens.
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
// free land hexes next to a hex, partial hexes excluded
function freeAround(row, col) {
	const m = M();
	return GameRules.getAdjacent(row, col).filter((c) => c.row > 0 && c.col > 0 && c.row < m.rows - 1 && c.col < m.cols - 1
		&& !m.map[c.row][c.col].unit && !m.map[c.row][c.col].airunit
		&& m.map[c.row][c.col].terrain !== terrainType.Ocean && m.map[c.row][c.col].terrain !== terrainType.River);
}
// the floating texts remove themselves when their animation ends, keep a log of them
if (!window.__bounceLog) {
	window.__bounceLog = [];
	const realBounce = bounceText;
	bounceText = function(x, y, text, positive) { window.__bounceLog.push(String(text)); return realBounce(x, y, text, positive); };
}
// move and attack animations run on intervals, which settle() doesn't wait for
async function finish() {
	const animating = () => Object.keys(clock.timers).some((k) => clock.timers[k].repeat && +k !== game.loop);
	await runClock(() => !animating(), 100000);
	await settle();
}
function alerts() { const s = window.__bounceLog.join("|"); window.__bounceLog = []; return s; }
// places attacker next to defender, selects attacker and clicks the defender
function setupDuel(atk, def) {
	const d = def.getPos(), f = freeAround(d.row, d.col)[0];
	teleport(atk, f.row, f.col);
	def.tempSpotted = true;
}
function attackClick(atk, def) {
	const a = atk.getPos(), d = def.getPos();
	// deselect first: a stale move range could turn the click into a move
	if (M().currentUnit) window.dispatchEvent(new KeyboardEvent("keyup", { code: "Escape", key: "Escape", bubbles: true }));
	clickHex(a.row, a.col);
	check(M().currentUnit === atk, "attacker selected");
	check(M().map[d.row][d.col].isAttackSel, "target attackable");
	clickHex(d.row, d.col);
}
const steps = [
	["start scenario, human vs AI", async () => {
		await startScenario("drpzop01.xml", [0, 1, 1, 1]);
	}],
	["artillery attacks the fortification from range", async () => {
		const art = U(48), fort = U(58);
		fort.tempSpotted = true;
		attackClick(art, fort);
		check(art.hasFired, "artillery fired");
	}],
	["after the ranged attack: losses shown", async () => {
		await finish();
		check(U(58).strength < 8, "fortification lost strength");
	}],
	["tank overruns a weak infantry", async () => {
		const tank = U(0), inf = U(55);
		inf.strength = 1;
		setupDuel(tank, inf);
		attackClick(tank, inf);
		await finish();
		check(inf.destroyed, "infantry destroyed");
		{ const al = alerts(); check(al.indexOf("OverRun") >= 0, "OverRun alert in " + al); }
	}],
	["the tank can still move after the overrun", async () => {
		check(M().currentUnit === U(0) && !U(0).hasMoved, "tank still selected and can move");
	}],
	["infantry attacks next to an enemy artillery: support fire stops the attack", async () => {
		const inf = U(54), def = U(63), art = U(57);
		setupDuel(inf, def);
		const p = inf.getPos(), f = freeAround(p.row, p.col).find((c) => GameRules.distance(c.row, c.col, def.getPos().row, def.getPos().col) > 1);
		teleport(art, f.row, f.col);
		// a veteran artillery: with less experience its shot misses on this seed and the attack goes on
		inf.strength = 3; art.experience = 350;
		attackClick(inf, def);
		await finish();
		{ const al = alerts(); check(al.indexOf("Attack Stopped") >= 0, "Attack Stopped alert in " + al); }
		check(inf.hasFired, "attacker counts as fired");
	}],
	["weak infantry is destroyed by support fire", async () => {
		const inf = U(52), def = U(63), art = U(57);
		const ap = art.getPos(), f = freeAround(def.getPos().row, def.getPos().col).find((c) => GameRules.distance(c.row, c.col, ap.row, ap.col) <= 3);
		teleport(inf, f.row, f.col);
		inf.strength = 1;
		attackClick(inf, def);
		await finish();
		check(inf.destroyed && M().currentUnit === null, "attacker destroyed and deselected");
		window.__dead = inf;
	}],
	["an attack on a dead unit does nothing", async () => {
		check(game.ui.uiUnitAttack(U(49), window.__dead) === false, "no attack on a unit not on map");
	}],
	["attacker destroyed by return fire", async () => {
		const inf = U(49), def = U(60);
		setupDuel(inf, def);
		inf.strength = 1;
		attackClick(inf, def);
		await finish();
		check(inf.destroyed, "attacker destroyed");
	}],
	["tank against entrenched infantry: rugged defense", async () => {
		const tank = U(11), def = U(61);
		setupDuel(tank, def);
		def.entrenchment = 10;
		attackClick(tank, def);
		await finish();
		{ const al = alerts(); check(al.indexOf("Rugged Defense") >= 0, "Rugged Defense alert in " + al); }
	}],
	["strong infantry attacks weak infantry with room behind: retreat", async () => {
		const atk = U(8), def = U(68);
		setupDuel(atk, def);
		def.strength = 8; def.entrenchment = 0; atk.strength = 15; atk.experience = 500;
		const before = def.getPos();
		attackClick(atk, def);
		await finish();
		{ const al = alerts(); check(al.indexOf("Retreat") >= 0, "Retreat alert in " + al); }
		check(def.getPos().row !== before.row || def.getPos().col !== before.col, "defender moved");
	}],
	["attack a weak infantry with nowhere to go: surrender", async () => {
		const atk = U(40), def = U(72);
		setupDuel(atk, def);
		def.strength = 8; def.entrenchment = 0; atk.strength = 15; atk.experience = 500;
		const d = def.getPos(), blocked = freeAround(d.row, d.col);
		const terrains = blocked.map((c) => M().map[c.row][c.col].terrain);
		blocked.forEach((c) => { M().map[c.row][c.col].terrain = terrainType.Ocean; });
		attackClick(atk, def);
		await finish();
		blocked.forEach((c, i) => { M().map[c.row][c.col].terrain = terrains[i]; });
		{ const al = alerts(); check(al.indexOf("Surrender") >= 0, "Surrender alert in " + al); }
		check(def.destroyed, "defender gone");
	}],
	["attack with a new leader for the attacker", async () => {
		const real = Leaders.generateLeaderWithChance;
		Leaders.generateLeaderWithChance = () => 9;
		const inf = U(43), def = U(70);
		setupDuel(inf, def);
		attackClick(inf, def);
		await finish();
		Leaders.generateLeaderWithChance = real;
		{ const al = alerts(); check(al.indexOf("New Leader") >= 0, "New Leader alert in " + al); }
	}],
	["move onto a hidden enemy: surprised and attacked", async () => {
		const tank = U(53), enemy = U(64);
		const p = tank.getPos(), f = freeAround(p.row, p.col)[0];
		teleport(enemy, f.row, f.col);
		const h = M().map[f.row][f.col];
		for (let n = 0; n < 20 && h.isSpotted(0); n++) h.setSpotted(0, false);
		enemy.tempSpotted = false;
		clickHex(p.row, p.col);
		check(M().currentUnit === tank && h.isMoveSel, "hidden hex looks free");
		clickHex(f.row, f.col);
		await finish();
		{ const al = alerts(); check(al.indexOf("Surprised") >= 0, "Surprised alert in " + al); }
	}],
	["unit without ammo surprised by a hidden enemy: can't attack back", async () => {
		const u = U(45), enemy = U(73);
		const p = u.getPos(), f = freeAround(p.row, p.col)[0];
		teleport(enemy, f.row, f.col);
		const h = M().map[f.row][f.col];
		for (let n = 0; n < 20 && h.isSpotted(0); n++) h.setSpotted(0, false);
		enemy.tempSpotted = false;
		u.ammo = 0;
		if (M().currentUnit) window.dispatchEvent(new KeyboardEvent("keyup", { code: "Escape", key: "Escape", bubbles: true }));
		clickHex(p.row, p.col);
		check(M().currentUnit === u && h.isMoveSel, "hidden hex looks free");
		const str = enemy.strength;
		clickHex(f.row, f.col);
		await finish();
		{ const al = alerts(); check(al.indexOf("Surprised") >= 0, "Surprised alert in " + al); }
		check(enemy.strength === str, "no attack");
	}],
	["move onto an enemy flag: captured", async () => {
		const inf = U(44), p = inf.getPos();
		clickHex(p.row, p.col);
		const c = GameRules.getMoveRange(M(), inf).filter((x) => x.canMove && !M().map[x.row][x.col].unit).pop();
		const h = M().map[c.row][c.col];
		h.owner = 1; h.flag = 15;
		clickHex(c.row, c.col);
		await finish();
		{ const al = alerts(); check(al.indexOf("Captured") >= 0, "Captured alert in " + al); }
		check(h.owner === 0, "hex captured");
	}],
	["deselect, end turn: the AI attacks with leaders for both sides", async () => {
		clickHex(20, 30);
		window.__realLeader = Leaders.generateLeaderWithChance;
		Leaders.generateLeaderWithChance = () => 10;
		endTurn();
		await finish();
		Leaders.generateLeaderWithChance = window.__realLeader;
		check(M().currentPlayer.id === 0 && M().turn === 2, "back to the human on turn 2");
	}],
	["move onto the last victory hex: victory", async () => {
		const tank = M().getUnits().find((u) => u.player.id === 0 && !GameRules.isAir(u) && GameRules.getMoveRange(M(), u).some((x) => x.canMove));
		const p = tank.getPos();
		if (M().currentUnit) window.dispatchEvent(new KeyboardEvent("keyup", { code: "Escape", key: "Escape", bubbles: true }));
		clickHex(p.row, p.col);
		check(M().currentUnit === tank, "unit selected");
		const c = GameRules.getMoveRange(M(), tank).filter((x) => x.canMove && !M().map[x.row][x.col].unit).pop();
		const h = M().map[c.row][c.col];
		h.owner = 1; h.flag = 15; h.victorySide = 0;
		M().sidesVictoryHexes[0] = [new Cell(c.row, c.col)];
		clickHex(c.row, c.col);
		await finish();
		check(game.gameEnded, "game ended");
		check($("ui-message").textContent.indexOf("You have won") >= 0 || document.body.textContent.indexOf("You have won") >= 0, "victory message");
	}],
	["victory message OK: main menu", async () => {
		click("#uiokbut");
	}],
];
