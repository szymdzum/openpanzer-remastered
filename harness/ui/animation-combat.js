// Combat animations: attacks by units of different classes (gun, small gun, artillery, air),
// each played frame by frame on the virtual clock. After every timer the canvases' pixels and
// the floating loss numbers (bounceText) are recorded on a body attribute, so the trace compares
// every animation frame, not only the canvases once the animation is over. Then the slow
// animations (quick animations off) and a UI scale other than 1 (bounceText scales its numbers).

// Own unit that can attack a spotted enemy now, preferring an attacker class not used yet
function __pickAttack(prefer) {
	const m = game.scenario.map;
	const me = m.currentPlayer;
	const mine = m.getUnits().filter((u) => u.player.id === me.id && !u.hasFired && !u.hasAttacked);
	const enemies = m.getUnits().filter((u) => u.player.side !== me.side
		&& m.map[u.getPos().row][u.getPos().col].isSpotted(me.side));
	const pairs = [];
	for (const u of mine)
		for (const t of enemies)
			if (GameRules.canInitiateAttack(u, t) && GameRules.isInAttackRange(u, t)) pairs.push([u, t]);
	if (!pairs.length) throw new Error("no attack possible, " + mine.length + " units, " + enemies.length + " enemies");
	const cls = (u) => u.unitData().uclass;
	// "weakest": the pair with the weakest target, to destroy it (explosion animation)
	if (prefer === "weakest") pairs.sort((a, b) => a[1].strength - b[1].strength);
	const p = pairs.find(([u]) => typeof prefer === "function" && prefer(u)) || (prefer !== "weakest" && pairs.find(([u]) => !__used[cls(u)])) || pairs[0];
	__used[cls(p[0])] = 1;
	return p;
}
const __used = {};

// Attacks and runs the clock one timer at a time until the attack is over, recording frames
async function __attack(prefer) {
	const m = game.scenario.map;
	const [u, t] = __pickAttack(prefer);
	// a hex with an air and a ground unit selects one of them per click
	for (let k = 0; k < 3 && m.currentUnit !== u; k++) clickHex(u.getPos().row, u.getPos().col);
	const before = [u.strength, t.strength];
	const frames = [];
	const sel = m.currentUnit && m.currentUnit.id;
	clickHex(t.getPos().row, t.getPos().col);
	// an air unit over a ground unit: the first click on its hex can pick the other one
	let clicks = 1;
	if (!game.waitUIAnimation && clock.pendingTimeouts() === 0 && !u.hasFired) { clickHex(t.getPos().row, t.getPos().col); clicks++; }
	for (let n = 0; n < 3000 && (game.waitUIAnimation || clock.pendingTimeouts() > 0); n++) {
		if (!clock.step()) break;
		const texts = Array.from(document.querySelectorAll("#game .textBounceRed, #game .textBounceGreen"))
			.map((e) => e.className + ":" + e.textContent + "@" + e.parentNode.style.cssText);
		frames.push(clock.now + " " + cyrb53(canvasHashes().join("|")) + " " + texts.join(","));
		// hashing every canvas per frame takes seconds per attack with coverage on, more on a
		// slow runner: let the shell's polling in
		await yieldToPage();
	}
	document.body.setAttribute("data-attack", "class " + u.unitData().uclass + " unit " + u.id + " -> " + t.id + " selected " + sel + " clicks " + clicks
		+ " strength " + before + " -> " + [u.strength, t.strength] + " destroyed " + [!!u.destroyed, !!t.destroyed] + " frames " + frames.length
		+ " distinct canvases " + new Set(frames.map((f) => f.split(" ")[1])).size);
	document.body.setAttribute("data-frames", frames.join("\n"));
}

const isArtillery = (u) => u.unitData().uclass == unitClass.artillery;
const isAirUnit = (u) => GameRules.isAir(u);

const steps = [
	["start scenario Vyazma, human vs AI", async () => { await startScenario("drvyaz13.xml", [0, 1, 1, 1]); }],
	["attack 1, frame by frame", async () => { await __attack(); }],
	["attack 2, frame by frame", async () => { await __attack(); }],
	["attack 3, frame by frame", async () => { await __attack(); }],
	["attack with artillery", async () => { await __attack(isArtillery); }],
	["attack the weakest target", async () => { await __attack("weakest"); }],
	["attack the weakest target again", async () => { await __attack("weakest"); }],
	["attack the weakest target a third time", async () => { await __attack("weakest"); }],
	["quick animations off", async () => { uiSettings.quickAnimation = false; document.body.setAttribute("data-attack", "quick off"); }],
	["slow attack, frame by frame", async () => { await __attack(); }],
	["ui scale 1.5", async () => { uiSettings.uiScale = 1.5; document.body.setAttribute("data-attack", "scale 1.5"); }],
	["scaled loss numbers, frame by frame", async () => { await __attack(); }],
	["scaled loss numbers, second attack", async () => { await __attack(); }],
	["scaled loss numbers, third attack", async () => { await __attack(); }],
	["ui scale back to 1, quick animations on", async () => { uiSettings.uiScale = 1; uiSettings.quickAnimation = true; document.body.setAttribute("data-attack", "reset"); }],
	["end turn, AI attacks with animations", async () => { endTurn(); }],
	["attack in the second turn", async () => { await __attack(); }],
	["start scenario Stalingrad, air units", async () => { await startScenario("drstu02.xml", [0, 1, 1, 1]); }],
	["air attack 1", async () => { await __attack(isAirUnit); }],
	["air attack 2", async () => { await __attack(isAirUnit); }],
	["air attack 3", async () => { await __attack(isAirUnit); }],
	["start scenario Lake Ladoga, ships", async () => { await startScenario("drlila18.xml", [0, 1, 1, 1]); }],
	["ship attack 1", async () => { await __attack(GameRules.isSea); }],
	["ship attack 2", async () => { await __attack(GameRules.isSea); }],
	["ship attack 3", async () => { await __attack(GameRules.isSea); }],
	["infantry attack", async () => { await __attack((u) => u.unitData().uclass == unitClass.infantry); }],
	["finish the weakest target 1", async () => { await __attack("weakest"); }],
	["end turn", async () => { endTurn(); }],
	["finish the weakest target 2", async () => { await __attack("weakest"); }],
	["finish the weakest target 3", async () => { await __attack("weakest"); }],
];
