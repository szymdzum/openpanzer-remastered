// Replay test: plays scenarios AI vs AI with a seeded Math.random (and Rng.seed) and a virtual clock,
// recording a hash of the game state at every AI action, the full state at every turn's start, and a
// save/restore round trip. Two runs (the base and this change) must produce identical traces;
// harness/diff-traces.js compares them. The page's DOM and canvases aren't compared since the UI that
// draws them changed (#351): the UI has its own end-to-end test (test/e2e/game.ts).
//
// Everything is recorded where the game asks the AI for its next action (getAction), never between the
// clock's steps: how many steps a turn takes depends on the screen (how long it shows a unit picked, the
// next player's turn, when its images load), so a turn's state read between steps could be one action
// later on another screen. The turns' snapshots are taken at their first action, the replay ends at the
// first action of the last turn, and the save of the save/restore round trip is made there too. Runs inside index.html?harness as the body of an async function, after
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

// The game's saved games in localStorage, to put back what a save made
const saves = () => Object.fromEntries(Object.keys(localStorage).filter((k) => k.startsWith("openpanzer-game"))
	.map((k) => [k, localStorage.getItem(k)]));

// at: the turn recorded last, the turn the replay ends at, done once it has, the save made then
function makeAllAI(trace, at) {
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
			if (at.done || game.scenario.map !== m) return action;
			if (m.turn !== at.turn) {
				at.turn = m.turn;
				trace.turns.push({ turn: m.turn, state: snapshot() });
				if (m.turn >= at.endTurn) {
					at.done = true;
					if (args.saveRestore !== false) {
						game.state.save();
						at.saved = { state: snapshot(), storage: saves() };
					}
					return action;
				}
			}
			const state = snapshot();
			const entry = { i: trace.actions.length, turn: m.turn, player: p.id, action: describeAction(action), hash: cyrb53(state) };
			if (args.fullFrom !== undefined && entry.i >= args.fullFrom) entry.state = state;
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
	const at = { turn: m.turn, endTurn: m.turn + (args.turns || 3), done: false, saved: null };
	makeAllAI(trace, at);
	await waitImages();
	trace.turns.push({ turn: m.turn, state: snapshot() });

	// Runs until the last turn's first action, the game's end or the campaign's next scenario
	trace.timedOut = !await runClock(() => {
		makeAllAI(trace, at);
		return at.done || game.gameEnded || game.scenario.map !== m;
	}, args.maxSteps || 200000);
	trace.ended = { turn: m.turn, gameEnded: game.gameEnded };

	if (args.saveRestore !== false && game.scenario.map === m) {
		// The save made at the last turn's first action, put back (the game may have saved since), or one made
		// now, the game ended before
		if (at.saved === null) {
			await runClock(allShown, 20000);
			game.state.save();
			at.saved = { state: snapshot(), storage: saves() };
		}
		for (const [k, v] of Object.entries(at.saved.storage)) localStorage.setItem(k, v);
		const before = at.saved.state;
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

// With no save the game loads the tutorial at start, let that finish before the first item: its screen
// shown, the old UI built (game.ui) or the start menu open over its briefing
await waitFor(() => (game.ui || document.querySelector(".pm-screen #startmenu")) && game.scenario && game.scenario.isLoaded
	&& game.gameStarted, 30000);

const results = [];
for (const item of args.items) results.push(await play(item));
window.__replayResult = results;
return results.map((r) => ({ item: r.item, loaded: r.loaded, actions: r.actions.length, turns: r.turns.length,
	timedOut: r.timedOut, ended: r.ended, restore: r.restore && r.restore.ok, errors: r.errors.length }));
