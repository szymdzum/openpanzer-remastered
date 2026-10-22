// UI replay: runs a script of user steps (harness/ui/<name>.js) and records, after each step
// has settled, the game state, the DOM and the canvas pixels. Two runs (pure bundle vs
// bundle + src modules) must produce identical traces; harness/ui-diff.js compares them.
// Runs inside index.html?harness as the body of an async function, after harness/lib/harness.js
// (harness/ui-replay.sh wraps both, with the step script in between).
//
// A step script defines `steps`, a list of [name, async function]. Helpers on top of the
// harness.js ones (click, clickHex, hoverHex, key, settle):
//   await startScenario(file, isAI)   load a scenario, isAI per player id (0 human, 1 AI, 2 scripted)
//   await startCampaign(index, difficulty)
//   unitAt(row, col)                  the unit on a hex (ground first), for picking targets
//   endTurn()                         presses the end turn button twice (it asks to confirm)
// Every step is followed by settle(): the virtual clock runs until animations and AI turns are
// done. Math.random and the game's other random streams (Rng.seed) are seeded once at the start.

async function startScenario(file, isAI) {
	uiSettings.isAI = isAI || [0, 1, 1, 1];
	game.campaign = null;
	const old = game.scenario;
	const s = scenariolist.find((x) => x[0] === file);
	game.newScenario(file, s ? s[2] : "");
	const ok = await waitFor(() => game.scenario !== old && game.scenario.isLoaded && game.gameStarted
		&& game.scenario.map.getUnits().length > 0, 30000);
	if (!ok) throw new Error("startScenario: " + file + " didn't load");
}

async function startCampaign(index, difficulty) {
	const old = game.scenario;
	game.newCampaign(index, difficulty || 0);
	const ok = await waitFor(() => game.scenario !== old && game.scenario.isLoaded && game.gameStarted, 30000);
	if (!ok) throw new Error("startCampaign: " + index + " didn't load");
}

function unitAt(row, col) {
	const h = game.scenario.map.map[row][col];
	return h.unit || h.airunit;
}

function endTurn() {
	click("#endturn");
	click("#endturn");
}

const __ui = { steps: [], errors: [] };
// With no save the game loads the tutorial at start, let that finish first
await waitFor(() => game.ui && game.scenario && game.scenario.isLoaded && game.gameStarted, 30000);
Math.random = mulberry32(window.__uiReplay.seed || 1);
// The game's streams (src/rng.ts: the dice, the AI's, the UI's sprite and sound picks) from the same
// seed, where the game has them (the original draws all from Math.random): the game stream draws
// what this Math.random would
if (typeof Rng !== "undefined" && Rng.seed) Rng.seed(window.__uiReplay.seed || 1);

// RENDER_LOG=1: records the renderer's render(...) calls per step, to find a redraw difference
if (window.__uiReplay.renderLog && window.__harnessRender) {
	const r = window.__harnessRender, real = r.render;
	window.__renderLog = [];
	r.render = function() { window.__renderLog.push(JSON.stringify(Array.from(arguments)) + " @" + clock.now); return real.apply(this, arguments); };
}

for (const [name, run] of steps) {
	const errorsBefore = window.__replayErrors.length;
	if (window.__renderLog) window.__renderLog = [];
	let threw = null;
	const started = Date.now();
	try { await run(); } catch (e) { threw = e.message; }
	await settle();
	const pending = await waitImages();
	// real time the step took (run, settle, loads) and what a timed out wait was waiting for
	__ui.steps.push({ name, threw, ms: Date.now() - started, pending: pending || undefined, state: snapshot(), dom: domSnapshot(), canvas: canvasHashes(),
		errors: window.__replayErrors.slice(errorsBefore),
		renderLog: window.__renderLog ? window.__renderLog.slice() : undefined,
		// DUMP_STEP=<n> keeps that step's canvases as PNG data URLs, to look at a pixel difference
		images: window.__uiReplay.dumpStep === __ui.steps.length
			? Array.from(document.querySelectorAll("canvas")).map((c) => [c.id, c.toDataURL()]) : undefined });
}
window.__uiResult = __ui;
return { steps: __ui.steps.length, threw: __ui.steps.filter((s) => s.threw).map((s) => s.name + ": " + s.threw) };
