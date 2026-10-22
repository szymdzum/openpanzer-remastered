// Records a contract on the reference: runs inside index.html?harness of the reference (reference/) as the
// body of an async function, after harness/lib/harness.js and the contract file (record.sh
// pastes them together, after common.js). Input window.__record = { file, turns, fuzzRounds };
// runContract is the contract's run function, contractCapture an optional one of the contract.
// Loads the scenario, lets the AI play `turns` turns, exports the game state and restores it
// with the game's own loader into the game (without building the UI: setupGameState does
// nothing, except for a campaign), then runs the contract on it. The test restores the same export the same way, so
// both start from the same objects.
// args.file is a state of record.sh: a scenario file (its players human at turn 0, AI after),
// "scripted:<file>" (every player the scripted AI, AIScripted: the tutorial) or
// "campaign:<index>:<difficulty>" (the campaign's first scenario, Game.newCampaign, turn 0 only:
// the campaign player is human).
const args = window.__record;

await waitFor(() => game.ui && game.scenario && game.scenario.isLoaded && game.gameStarted, 30000);
Math.random = mulberry32(1);
const old = game.scenario;
if (args.file.startsWith("campaign:")) {
	if (args.turns) throw new Error(args.file + ": a campaign is recorded at turn 0, its player is human");
	const [, index, difficulty] = args.file.split(":");
	game.newCampaign(+index, +difficulty);
} else {
	const scripted = args.file.startsWith("scripted:");
	const file = scripted ? args.file.slice("scripted:".length) : args.file;
	uiSettings.isAI = scripted ? [2, 2, 2, 2] : args.turns ? [1, 1, 1, 1] : [0, 0, 0, 0];
	game.campaign = null;
	const s = scenariolist.find((x) => x[0] === file);
	game.newScenario(file, s ? s[2] : "");
}
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
// The game's setupGameState builds the UI again; a campaign game also links its campaign player
// there (Game.getCampaignPlayer, which the engine and the save read), so a campaign gets it
const setupGameState = game.setupGameState;
game.setupGameState = () => {
	if (game.campaign) setupGameState.call(game);
	restored = true;
};
new GameState(game).restoreFromString(state);
if (!await waitFor(() => restored, 30000)) throw new Error(args.file + ": the export didn't restore");

// Every contract gets the same environment, the test builds it from this repo's modules
// Actions (src/actions.ts) and Commands (src/commands.ts) only where the game has them: the
// reference doesn't, the engine contract then runs its copy of the combat and move sequence
const env = { GameRules, Equipment, Unit, AI, AIScripted, GameState, CombatLog, game, terrainType, leaderType, actionType,
	playerType, unitClass, scenario: game.scenario, map: game.scenario.map, fuzzRounds: args.fuzzRounds,
	Actions: typeof Actions !== "undefined" ? Actions : undefined,
	Commands: typeof Commands !== "undefined" ? Commands : undefined };
const setup = typeof contractCapture === "function" ? contractCapture(env) : null;
// game.spotSide (the side whose view is shown, Unit.unitEndTurn reads it) isn't in the export
const spotSide = game.spotSide;
const results = runContract(env);
window.__recordResult = { file: args.file, turns: args.turns, fuzzRounds: args.fuzzRounds, state, setup, spotSide, results };
return { calls: results.length };
