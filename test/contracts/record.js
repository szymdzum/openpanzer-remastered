// Records a contract on the reference: runs inside index.html?harness of openpanzer-src as the
// body of an async function, after harness/lib/harness.js and the contract file (record.sh
// pastes them together, after common.js). Input window.__record = { file, turns, fuzzRounds };
// runContract is the contract's run function, contractCapture an optional one of the contract.
// Loads the scenario, lets the AI play `turns` turns, exports the game state and restores it
// with the game's own loader into the game (without building the UI: setupGameState does
// nothing), then runs the contract on it. The test restores the same export the same way, so
// both start from the same objects.
const args = window.__record;

await waitFor(() => game.ui && game.scenario && game.scenario.isLoaded && game.gameStarted, 30000);
Math.random = mulberry32(1);
uiSettings.isAI = args.turns ? [1, 1, 1, 1] : [0, 0, 0, 0];
game.campaign = null;
const old = game.scenario;
const s = scenariolist.find((x) => x[0] === args.file);
game.newScenario(args.file, s ? s[2] : "");
if (!await waitFor(() => game.scenario !== old && game.scenario.isLoaded && game.gameStarted
	&& game.scenario.map.getUnits().length > 0, 30000)) throw new Error(args.file + " didn't load");
if (args.turns) {
	const m = game.scenario.map, end = m.turn + args.turns;
	await runClock(() => m.turn >= end || game.gameEnded, 200000);
	await settle();
}

const state = game.state.exportGameState();
let restored = false;
game.cleanup = () => {};
game.setupGameState = () => { restored = true; };
new GameState(game).restoreFromString(state);
if (!await waitFor(() => restored, 30000)) throw new Error(args.file + ": the export didn't restore");

// Every contract gets the same environment, the test builds it from this repo's modules
const env = { GameRules, Equipment, Unit, AI, game, terrainType, leaderType, actionType,
	map: game.scenario.map, fuzzRounds: args.fuzzRounds };
const setup = typeof contractCapture === "function" ? contractCapture(env) : null;
const results = runContract(env);
// game.spotSide (the side whose view is shown, Unit.unitEndTurn reads it) isn't in the export
window.__recordResult = { file: args.file, turns: args.turns, fuzzRounds: args.fuzzRounds, state, setup,
	spotSide: game.spotSide, results };
return { calls: results.length };
