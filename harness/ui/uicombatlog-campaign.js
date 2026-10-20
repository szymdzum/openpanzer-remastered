// Combat log in three campaigns (core units, the dossier button, core leaders): every turn the short log the
// game shows at turn start is extended, a line clicked, then the player fights (attacks,
// moves toward the enemy and the objectives), looks at its own combats and ends the turn.

// Scroll positions and what a step did aren't in the DOM snapshot: write them on an
// attribute so the trace shows them
function __probe(tag) {
	const d = document.getElementById("combatLog"), g = document.getElementById("game");
	document.body.setAttribute("data-probe", tag + " logVisible=" + isVisible("combatLog")
		+ " logTop=" + d.scrollTop + " gameScroll=" + g.scrollLeft + "," + g.scrollTop);
}

function __enemiesOf(m, me) {
	return m.getUnits().filter((u) => u.player.side !== me.side && !u.destroyed);
}

// Plays the current player's turn like a simple player: attack whatever is in range,
// otherwise move toward an objective to conquer or the nearest enemy, then attack again
async function __fightTurn(maxActions) {
	const m = game.scenario.map, me = m.currentPlayer;
	const tried = new Set();
	const done = [];
	// units sent to a city stay there a whole turn: only idle units are resupplied
	const resting = window.__resting = window.__resting || new Set();
	for (const id of resting) tried.add("m" + id);
	// Units low on supplies that can reach a city away from the enemy go there, to be
	// resupplied automatically at the next turn start
	// core units first, in a campaign they are the ones that matter
	const candidates = m.getUnits().filter((x) => x.player.id === me.id && !x.destroyed && !x.hasMoved)
		.sort((a, b) => (b.isCore ? 1 : 0) - (a.isCore ? 1 : 0));
	for (const u of candidates) {
		const ud = u.unitData(true);
		// moving uses fuel, so units with fuel qualify too (a few of them, the others fight)
		if (GameRules.isAir(u) || !(u.ammo < ud.ammo || u.fuel < ud.fuel || (ud.fuel > 0 && resting.size < 6))) continue;
		const enemies = __enemiesOf(m, me);
		// ships are resupplied anywhere out of port: they just stay idle
		if (GameRules.isSea(u) && !resting.has(u.id) && u.getHex().terrain !== terrainType.Port) {
			tried.add("m" + u.id);
			resting.add(u.id);
			done.push("s" + u.id);
			continue;
		}
		// already in a city away from the enemy: stay
		if (!resting.has(u.id) && u.getHex().terrain === terrainType.City && (u.ammo < ud.ammo || u.fuel < ud.fuel)
			&& enemies.every((e) => GameRules.distance(u.getPos().row, u.getPos().col, e.getPos().row, e.getPos().col) > 1)) {
			tried.add("m" + u.id);
			resting.add(u.id);
			done.push("c" + u.id);
			continue;
		}
		const city = GameRules.getMoveRange(m, u).filter((c) => c.canMove).find((c) =>
			m.map[c.row][c.col].terrain === terrainType.City && (c.row !== u.getPos().row || c.col !== u.getPos().col)
			&& enemies.every((e) => GameRules.distance(c.row, c.col, e.getPos().row, e.getPos().col) > 1));
		if (!city || resting.has(u.id)) continue;
		tried.add("m" + u.id);
		resting.add(u.id);
		if (m.currentUnit !== u) clickHex(u.getPos().row, u.getPos().col);
		clickHex(city.row, city.col);
		await settle();
		done.push("r" + u.id + ">" + city.row + "," + city.col);
	}
	for (let n = 0; n < maxActions; n++) {
		const mine = m.getUnits().filter((u) => u.player.id === me.id && !u.destroyed);
		const enemies = __enemiesOf(m, me);
		let acted = false;
		for (const u of mine) {
			if (u.hasFired || resting.has(u.id)) continue;
			const t = enemies.find((e) => !tried.has(u.id + ">" + e.id)
				&& m.map[e.getPos().row][e.getPos().col].isSpotted(me.side)
				&& GameRules.canInitiateAttack(u, e) && GameRules.isInAttackRange(u, e));
			if (!t) continue;
			tried.add(u.id + ">" + t.id);
			if (m.currentUnit !== u) clickHex(u.getPos().row, u.getPos().col);
			clickHex(t.getPos().row, t.getPos().col);
			await settle();
			done.push("a" + u.id + ">" + t.id);
			acted = true;
			break;
		}
		if (acted) continue;
		for (const u of mine) {
			if (u.hasMoved || tried.has("m" + u.id)) continue;
			tried.add("m" + u.id);
			const cells = GameRules.getMoveRange(m, u).filter((c) => c.canMove);
			if (!cells.length) continue;
			// half of the units that can capture go for the objectives, the others for the enemy
			const toObjectives = GameRules.canCapture(u) && u.id % 2 === 0 && m.sidesVictoryHexes[me.side].length > 0;
			const goals = toObjectives ? m.sidesVictoryHexes[me.side].slice() : enemies.map((e) => e.getPos());
			if (!goals.length) continue;
			const score = (c) => Math.min(...goals.map((g) => GameRules.distance(c.row, c.col, g.row, g.col)));
			let best = cells[0];
			for (const c of cells) if (score(c) < score(best)) best = c;
			if (score(best) >= score(u.getPos())) continue;
			if (m.currentUnit !== u) clickHex(u.getPos().row, u.getPos().col);
			clickHex(best.row, best.col);
			await settle();
			done.push("m" + u.id + ">" + best.row + "," + best.col);
			acted = true;
			break;
		}
		if (!acted) break;
	}
	__probe("fight " + done.join(" ") + " objectives " + JSON.stringify(m.sidesVictoryHexes[me.side]));
}

// Clicks the "Show Turn Summary" button of the short log, if it is there
function __extend() {
	const b = Array.from(document.querySelectorAll("#combatLog .combatLogHeader"))
		.find((e) => e.textContent.indexOf("Show Turn Summary") === 0);
	if (b) click(b);
	__probe(b ? "extended" : "no short log");
}

function __clickLine(which) {
	const l = document.querySelectorAll("#combatLog .combatLogLine, #combatLog > div[class=''], #combatLog > div:not([class])");
	if (!l.length) { __probe("no line"); return; }
	click(l[which % l.length]);
	__probe("line " + (which % l.length) + "/" + l.length);
}

const steps = [
	["start campaign", async () => { await startCampaign(0, 0); __probe("start"); }],
	["deploy done, open the log", async () => {
		if (!isVisible("combatLog")) click("#combatLogButton");
		__probe("open");
	}],
	["dossier button from the log", async () => {
		const b = Array.from(document.querySelectorAll("#combatLog .combatLogInfoButton")).find((e) => e.textContent === "@");
		if (!b) throw new Error("no dossier button");
		click(b);
		__probe("dossier");
	}],
	["close the dossier", async () => { click("#dossierCloseBut"); __probe("dossier closed"); }],
	["the log button closes the dossier too", async () => {
		click("#combatLogButton");
		__probe("log after dossier");
	}],
];
for (let turn = 1; turn <= 10; turn++) {
	steps.push([`turn ${turn}: fight`, async () => {
		if (isVisible("combatLog")) click("#combatLogButton");
		await __fightTurn(40);
	}]);
	steps.push([`turn ${turn}: open the log with this turn's combats`, async () => { click("#combatLogButton"); __probe("own combats"); }]);
	steps.push([`turn ${turn}: click a line`, async () => { __clickLine(turn); }]);
	steps.push([`turn ${turn}: scroll the log`, async () => {
		const d = document.getElementById("combatLog");
		d.scrollTop = 80 * turn;
		__probe("scrolled");
	}]);
	steps.push([`turn ${turn}: end turn, AI plays`, async () => { endTurn(); __probe("short log"); }]);
	steps.push([`turn ${turn}: extend the summary`, async () => { __extend(); }]);
	steps.push([`turn ${turn}: click a summary line`, async () => { __clickLine(turn * 3); }]);
}
// A second campaign whose core units start next to cities: core units resupplied
steps.push(["start the Lodz - Warta River campaign", async () => {
	window.__resting = new Set();
	await startCampaign(1, 0);
	__probe("start 2");
}]);
for (let turn = 1; turn <= 5; turn++) {
	steps.push([`lodz turn ${turn}: fight`, async () => {
		if (isVisible("combatLog")) click("#combatLogButton");
		await __fightTurn(40);
	}]);
	steps.push([`lodz turn ${turn}: end turn, AI plays`, async () => { endTurn(); __probe("short log"); }]);
	steps.push([`lodz turn ${turn}: extend the summary`, async () => { __extend(); }]);
	steps.push([`lodz turn ${turn}: click a summary line`, async () => { __clickLine(turn * 2); }]);
}
// The Ardennes campaign: core units close to an experience level, they get leaders
steps.push(["start the Ardennes campaign", async () => {
	window.__resting = new Set();
	await startCampaign(5, 0);
	__probe("start 3");
}]);
for (let turn = 1; turn <= 5; turn++) {
	steps.push([`ardennes turn ${turn}: fight`, async () => {
		if (isVisible("combatLog")) click("#combatLogButton");
		await __fightTurn(40);
	}]);
	steps.push([`ardennes turn ${turn}: open the log with this turn's combats`, async () => { click("#combatLogButton"); __probe("own combats"); }]);
	steps.push([`ardennes turn ${turn}: end turn, AI plays`, async () => { endTurn(); __probe("short log"); }]);
	steps.push([`ardennes turn ${turn}: extend the summary`, async () => { __extend(); }]);
}
