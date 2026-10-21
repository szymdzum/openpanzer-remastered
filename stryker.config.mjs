// npm run test:mutation: Stryker mutates the engine (one small change at a time: > to >=, + to -,
// a condition to true...) and runs the contract tests on every mutant. A mutant the tests don't
// notice is a gap in them, dead code or a change that changes nothing. Report in reports/mutation/.
// The incremental file keeps the results: a later run only tests the mutants of changed code.
// MUTATE=map (or gamerules, unit, ai, leaders, scenario) mutates one module, with its own report
// and incremental file in reports/mutation/map/: CI runs each module on its own runner.
const engine = ["gamerules", "unit", "map", "ai", "leaders", "scenario"];
// GameMap's parts are mutated with the map
const parts = { map: ["map", "visibility", "board", "selection", "undo"] };
const only = process.env.MUTATE;
if (only && !engine.includes(only)) throw new Error("MUTATE: one of " + engine.join(", "));
const out = "reports/mutation/" + (only || "all");

export default {
	testRunner: "vitest",
	vitest: {
		configFile: "vite.config.mts",
		// The tests import the game's modules dynamically (after vi.resetModules): for Vitest no
		// test is related to a mutated file, and with related on none would run
		related: false,
	},
	mutate: (only ? [only] : engine).flatMap((m) => parts[m] || [m]).map((m) => "src/" + m + ".ts"),
	// game/ (300 MB) stays out of the sandbox: test/setup.ts reads it from OPENPANZER_GAME_DIR
	ignorePatterns: ["game", "public", "harness/out", "docs", "coverage", "reports", "dist", "dist-*"],
	coverageAnalysis: "perTest",
	ignoreStatic: true,
	// Gentle by default (the whole engine is about 5000 mutants, hours on 6 cores): 3 workers, and
	// a mutant stuck in a loop is given up after 15 s. One module: MUTATE=map npm run test:mutation
	concurrency: 3,
	timeoutMS: 15000,
	incremental: true,
	incrementalFile: out + "/incremental.json",
	reporters: ["html", "json", "clear-text", "progress"],
	htmlReporter: { fileName: out + "/index.html" },
	jsonReporter: { fileName: out + "/mutation.json" },
	tempDirName: ".stryker-tmp",
	// Stryker rewrites tsconfig.json with the TypeScript API, which TypeScript 7 doesn't have
	// (and Vite only blanks the types out): point it at no file
	tsconfigFile: "stryker-no-tsconfig.json",
};
