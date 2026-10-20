// Combat log over a few turns of human vs AI: open it empty, fight, open it with the
// human's combats, click a line, the short log after the AI turn, extend it, scroll it,
// the scenario info button, close it.
function __attackOnce() {
	const m = game.scenario.map;
	const me = m.currentPlayer;
	const mine = m.getUnits().filter((u) => u.player.id === me.id && !u.hasFired && !u.hasAttacked);
	const enemies = m.getUnits().filter((u) => u.player.side !== me.side
		&& m.map[u.getPos().row][u.getPos().col].isSpotted(me.side));
	for (const u of mine)
		for (const t of enemies)
			if (GameRules.canInitiateAttack(u, t) && GameRules.isInAttackRange(u, t)) {
				const before = t.strength;
				if (m.currentUnit !== u) clickHex(u.getPos().row, u.getPos().col);
				const sel = m.currentUnit && m.currentUnit.id;
				clickHex(t.getPos().row, t.getPos().col);
				__probe("attack " + u.id + "->" + t.id + " sel=" + sel + " fired=" + u.hasFired);
				return;
			}
	throw new Error("no attack possible, " + mine.length + " units, " + enemies.length + " enemies");
}
// Scroll positions aren't in the DOM snapshot: write them (and what a step did) on an
// attribute so the trace shows them
function __probe(tag) {
	const d = document.getElementById("combatLog"), g = document.getElementById("game");
	document.body.setAttribute("data-probe", tag + " logTop=" + d.scrollTop + " gameScroll=" + g.scrollLeft + "," + g.scrollTop);
}
function __scrollLog(y) {
	const d = document.getElementById("combatLog");
	d.scrollTop = y;
	d.dispatchEvent(new Event("scroll"));
	__probe("scroll " + y);
}

// Clicks the "Show Turn Summary" button of the short log
function __extend() {
	const b = Array.from(document.querySelectorAll("#combatLog .combatLogHeader"))
		.find((e) => e.textContent.indexOf("Show Turn Summary") === 0);
	if (!b) throw new Error("no Show Turn Summary button");
	click(b);
}

const steps = [
	["start scenario, human vs AI", async () => { await startScenario("drpzop01.xml", [0, 1, 1, 1]); }],
	["open the empty combat log", async () => { click("#combatLogButton"); __probe("open empty"); }],
	["close the combat log", async () => { click("#combatLogButton"); __probe("close"); }],
	["attack the only enemy in sight", async () => { __attackOnce(); }],
	["open the combat log with this turn's combats", async () => { click("#combatLogButton"); __probe("open combats"); }],
	["click the first combat line, centers the map", async () => {
		click(document.querySelector("#combatLog .combatLogLine"));
		__probe("first line");
	}],
	["click the last combat line", async () => {
		const l = document.querySelectorAll("#combatLog .combatLogLine");
		click(l[l.length - 1]);
		__probe("last line");
	}],
	["scroll the combat log down", async () => { __scrollLog(10000); }],
	["close it with the button", async () => { click("#combatLogButton"); __probe("close"); }],
	["end turn, AI plays, short log shows", async () => { endTurn(); }],
	["scroll the short log", async () => { __probe("short"); __scrollLog(60); }],
	["extend to the turn summary", async () => { __extend(); }],
	["scroll the extended log", async () => { __scrollLog(10000); }],
	["scroll back to the top", async () => { __scrollLog(0); }],
	["scenario info button hides the log and shows the description", async () => {
		click(document.querySelector("#combatLog .combatLogInfoButton"));
		__probe("info");
	}],
	["close the message", async () => { click("#uiokbut"); }],
	["reopen the log from the status bar", async () => { click("#statusbar"); __probe("statusbar"); }],
	["attack again", async () => { __attackOnce(); }],
	["attack again 2", async () => { __attackOnce(); }],
	["refresh the log by toggling twice", async () => { click("#combatLogButton"); click("#combatLogButton"); __probe("refresh"); }],
	["end turn 2", async () => { endTurn(); __probe("turn 3"); }],
	["extend turn 3 summary", async () => { __extend(); }],
	["end turn 3", async () => { endTurn(); __probe("turn 4"); }],
	["end turn 4", async () => { endTurn(); __probe("turn 5"); }],
	["open turn 5 summary", async () => { __extend(); }],
	["close with the button", async () => { click("#combatLogButton"); __probe("closed"); }],
];
