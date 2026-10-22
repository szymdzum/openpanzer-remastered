// Replay test: plays scenarios AI vs AI with a seeded Math.random (and Rng.seed) and a virtual clock,
// recording hashes of the game state and the DOM before every AI action, the full state,
// DOM and canvas pixels at every turn end, and a save/restore round trip. Two runs (pure
// bundle vs bundle + src modules) must produce identical traces; harness/diff-traces.js
// compares them. Runs inside index.html?harness as the body of an async function, after
// harness/lib/harness.js (harness/replay.sh wraps both).
// Input window.__replay = { items: ["drpzop01.xml", "campaign:3", "scripted:tutorial.xml"], turns, seed,
//   saveRestore, fullFrom }  (fullFrom: also keep full states from that action index on)

const args = window.__replay;

function describeAction(a) {
	if (!a) return null;
	return { type: a.type, param: (a.param || []).map((p) => {
		if (p && typeof p === "object" && typeof p.unitData === "function") return "unit#" + p.id;
		if (p && typeof p === "object" && "row" in p) return p.row + "," + p.col;
		return typeof p === "object" ? "obj" : p;
	}) };
}

function makeAllAI(trace) {
	const m = game.scenario.map;
	for (const p of m.getPlayers()) {
		if (p.type !== playerType.aiLocal && p.type !== playerType.aiScripted) {
			p.type = playerType.aiLocal;
			p.handler = new AI(p, m);
		}
		if (p.handler.__traced) continue;
		const getAction = p.handler.getAction.bind(p.handler);
		p.handler.getAction = function() {
			const action = getAction();
			const state = snapshot(), dom = domSnapshot();
			const entry = { i: trace.actions.length, turn: m.turn, player: p.id, action: describeAction(action),
				hash: cyrb53(state), domHash: cyrb53(dom) };
			if (args.fullFrom !== undefined && entry.i >= args.fullFrom) { entry.state = state; entry.dom = dom; }
			trace.actions.push(entry);
			return action;
		};
		p.handler.__traced = true;
	}
}

async function play(item) {
	const trace = { item, loaded: false, actions: [], turns: [], restore: null, errors: [] };
	const errorsBefore = window.__replayErrors.length;
	const seed = (args.seed || 1) ^ parseInt(cyrb53(item).slice(0, 6), 36);
	Math.random = mulberry32(seed);
	// The game's streams (src/rng.ts: the dice, the AI's, the UI's sprite and sound picks) from the
	// same seed, where the game has them (the original draws all from Math.random): the game stream
	// draws what this Math.random would
	if (typeof Rng !== "undefined" && Rng.seed) Rng.seed(seed);
	// "scripted:<file>" keeps the scenario's scripted players (AIScripted), others become AI
	const scripted = item.startsWith("scripted:");
	const file = scripted ? item.slice(9) : item;
	uiSettings.isAI = scripted ? [2, 2, 2, 2] : [1, 1, 1, 1];
	const oldScenario = game.scenario;

	if (item.startsWith("campaign:")) {
		game.newCampaign(+item.split(":")[1], 0);
	} else {
		game.campaign = null;
		const s = scenariolist.find((x) => x[0] === file);
		game.newScenario(file, s ? s[2] : "");
	}
	trace.loaded = await waitFor(() => game.scenario !== oldScenario && game.scenario.isLoaded
		&& game.gameStarted && game.scenario.map.getUnits().length > 0, 30000);
	if (!trace.loaded) { trace.errors = window.__replayErrors.slice(errorsBefore); return trace; }

	const m = game.scenario.map;
	const startTurn = m.turn, endTurn = startTurn + (args.turns || 3);
	let lastTurn = m.turn;
	makeAllAI(trace);
	const turnEnd = async () => {
		await waitImages();
		trace.turns.push({ turn: m.turn, state: snapshot(), dom: domSnapshot(), canvas: canvasHashes() });
	};
	await turnEnd();

	// Runs until the turn changes, records the turn end (canvases need a real wait for images)
	let steps = args.maxSteps || 200000, finished = false;
	trace.timedOut = false;
	while (!finished) {
		const ok = await runClock(() => {
			makeAllAI(trace);
			finished = m.turn >= endTurn || game.gameEnded || game.scenario.map !== m;
			return finished || m.turn !== lastTurn;
		}, steps);
		if (!ok) { trace.timedOut = true; break; }
		if (m.turn !== lastTurn && game.scenario.map === m) { lastTurn = m.turn; await turnEnd(); }
	}
	trace.ended = { turn: m.turn, gameEnded: game.gameEnded };

	if (args.saveRestore !== false && game.scenario.map === m) {
		await runClock(() => !game.waitUIAnimation, 20000);
		game.state.save();
		const before = snapshot();
		const scen = game.scenario;
		let failed = false;
		// A fresh GameState, like reopening the game: restore() is meant to run once per instance
		game.state = new GameState(game);
		game.state.restore(game.onScenarioLoadFinished.bind(game, null, true), () => { failed = true; });
		const ok = await waitFor(() => failed || (game.scenario !== scen && game.scenario.isLoaded && game.gameStarted), 30000);
		const after = ok && !failed ? snapshot() : null;
		trace.restore = { ok: ok && !failed, sameAsBeforeSave: after === before, state: after };
	}
	trace.errors = window.__replayErrors.slice(errorsBefore);
	return trace;
}

// With no save the game loads the tutorial at start, let that finish before the first item
await waitFor(() => game.ui && game.scenario && game.scenario.isLoaded && game.gameStarted, 30000);

const results = [];
for (const item of args.items) results.push(await play(item));
window.__replayResult = results;
return results.map((r) => ({ item: r.item, loaded: r.loaded, actions: r.actions.length, turns: r.turns.length,
	timedOut: r.timedOut, ended: r.ended, restore: r.restore && r.restore.ok, errors: r.errors.length }));
