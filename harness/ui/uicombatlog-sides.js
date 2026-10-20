// Combat log seen from both sides of drstu02 (the Allied side has ships and objectives within
// reach): playing the Allies, its own captures and naval combats and the German reinforcements
// filtered out; then playing the Germans against the AI, the objectives the AI takes are
// reported as lost.

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
	["start drstu02 as the Allies (player 1) vs the AI", async () => {
		window.__resting = new Set();
		await startScenario("drstu02.xml", [1, 0, 1, 1]);
		__probe("start spotSide=" + game.spotSide);
	}],
];
function __turnSteps(label, turns) {
	for (let turn = 1; turn <= turns; turn++) {
		steps.push([`${label} turn ${turn}: extend the summary`, async () => { __extend(); }]);
		steps.push([`${label} turn ${turn}: click a summary line`, async () => { __clickLine(turn * 2 + 1); }]);
		steps.push([`${label} turn ${turn}: fight`, async () => {
			if (isVisible("combatLog")) click("#combatLogButton");
			await __fightTurn(40);
		}]);
		steps.push([`${label} turn ${turn}: open the log with this turn's combats`, async () => { click("#combatLogButton"); __probe("own combats"); }]);
		steps.push([`${label} turn ${turn}: click a line`, async () => { __clickLine(turn); }]);
		steps.push([`${label} turn ${turn}: end turn, AI plays`, async () => { endTurn(); __probe("short log"); }]);
	}
}
__turnSteps("allies", 6);
steps.push(["start drstu02 as the Germans (player 0) vs the AI", async () => {
	window.__resting = new Set();
	await startScenario("drstu02.xml", [0, 1, 1, 1]);
	__probe("start spotSide=" + game.spotSide);
}]);
steps.push(["open the log at the first turn", async () => { click("#combatLogButton"); __probe("first"); }]);
steps.push(["end the first turn", async () => { endTurn(); __probe("short log"); }]);
__turnSteps("germans", 3);
