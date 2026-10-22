import fs from "node:fs";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";
import tsBlankSpace from "ts-blank-space";

//src/*.ts with the types blanked out, nothing else changed: same lines and columns as the
//source (the harness maps the coverage back to src/ by line). tsc checks the types (npm run check).
function blankTypes(): Plugin {
	return {
		name: "ts-blank-space",
		enforce: "pre",
		transform(code, id) {
			if (!id.split("?")[0].endsWith(".ts")) return null;
			return { code: tsBlankSpace(code), map: null };
		},
	};
}

//Dev server only: each module gets a setter for its own top-level names, appended after the
//last line (the lines above stay the source's). With ?harness, src/main.ts routes assignments
//to its globals through it, so a harness script can still replace a function or a flag
//(bounceText = ..., NATIVE_PLATFORM = "ios") the way it could when they were globals.
function harnessSetters(): Plugin {
	return {
		name: "harness-setters",
		apply: "serve",
		enforce: "pre",
		transform(code, id) {
			const file = id.split("?")[0];
			if (!file.endsWith(".ts") || !file.includes("/src/") || file.endsWith("/main.ts")) return null;
			return { code: code + "\nexport function __harnessSet(name, value) { eval(name + \" = value\"); }\n", map: null };
		},
	};
}

//The game's assets come from game/ (index.html has <base href="/game/">): the dev server serves
//them as they are, the build copies the ones the page uses next to the bundle
function copyGameAssets(): Plugin {
	return {
		name: "copy-game-assets",
		apply: "build",
		writeBundle(options) {
			for (const dir of ["css", "resources"])
				fs.cpSync("game/" + dir, options.dir + "/game/" + dir, { recursive: true });
		},
	};
}

export default defineConfig({
	oxc: false, //types are blanked out by blankTypes
	plugins: [blankTypes(), harnessSetters(), copyGameAssets()],
	optimizeDeps: { noDiscovery: true }, //no dependencies (and game/ has pages of its own)
	test: {
		//the game's modules need a DOM; the page is served from /game/ like index.html
		environment: "jsdom",
		environmentOptions: { jsdom: { url: "http://127.0.0.1/game/index.html" } },
		setupFiles: ["test/setup.ts"],
		include: ["test/**/*.test.ts"],
		testTimeout: 60_000, //a state replays a few thousand rule calls: seconds, more on a loaded machine
		//npm run test:coverage: what the tests run of the engine (coverage/index.html), every module
		//but the UI (ui, uibuilder, uicombatlog, render, animation, dom), the platform glue (osglue)
		//and the entry (main), and of the new core (src/core/ and its commands)
		coverage: {
			provider: "v8",
			include: ["src/gamerules.ts", "src/unit.ts", "src/map.ts", "src/ai.ts", "src/aiscripted.ts",
				"src/leaders.ts", "src/visibility.ts", "src/board.ts", "src/selection.ts", "src/undo.ts", "src/scenario.ts", "src/scenarioloader.ts", "src/campaign.ts", "src/game.ts",
				"src/gamestate.ts", "src/equipment.ts", "src/combatlog.ts", "src/prototypes.ts", "src/actions.ts", "src/commands.ts", "src/rng.ts",
				"src/context.ts", "src/util.ts", "src/state.ts", "src/savegame.ts", "src/mirror.ts", "src/coreplay.ts", "src/core/*.ts", "src/core/commands/*.ts"],
			exclude: ["src/core/types.ts", "src/core/events.ts", "src/core/controller.ts"], //types only
			reporter: ["text", "html", "json-summary"],
			//Per file, today's coverage rounded down: a change may raise it, not lower it. When a file's
			//coverage goes up for good, raise its numbers here
			thresholds: {
				"src/actions.ts": { statements: 89, branches: 84, functions: 85, lines: 96 },
				"src/ai.ts": { statements: 99, branches: 97, functions: 95, lines: 99 },
				"src/aiscripted.ts": { statements: 99, branches: 95, functions: 83, lines: 99 },
				"src/board.ts": { statements: 96, branches: 100, functions: 83, lines: 96 },
				"src/campaign.ts": { statements: 49, branches: 30, functions: 43, lines: 49 },
				"src/combatlog.ts": { statements: 96, branches: 81, functions: 90, lines: 96 },
				"src/commands.ts": { statements: 97, branches: 92, functions: 98, lines: 97 },
				"src/context.ts": { statements: 87, branches: 100, functions: 85, lines: 87 },
				"src/equipment.ts": { statements: 84, branches: 71, functions: 68, lines: 85 },
				"src/game.ts": { statements: 75, branches: 61, functions: 75, lines: 77 },
				"src/gamerules.ts": { statements: 98, branches: 97, functions: 98, lines: 98 },
				"src/gamestate.ts": { statements: 90, branches: 75, functions: 85, lines: 90 },
				"src/leaders.ts": { statements: 90, branches: 81, functions: 71, lines: 91 },
				"src/map.ts": { statements: 96, branches: 89, functions: 96, lines: 96 },
				"src/prototypes.ts": { statements: 93, branches: 100, functions: 72, lines: 93 },
				"src/rng.ts": { statements: 93, branches: 100, functions: 85, lines: 93 },
				"src/scenario.ts": { statements: 95, branches: 87, functions: 95, lines: 95 },
				"src/scenarioloader.ts": { statements: 94, branches: 84, functions: 85, lines: 94 },
				"src/selection.ts": { statements: 94, branches: 90, functions: 88, lines: 93 },
				"src/undo.ts": { statements: 94, branches: 100, functions: 80, lines: 94 },
				"src/unit.ts": { statements: 97, branches: 93, functions: 93, lines: 98 },
				"src/util.ts": { statements: 50, branches: 100, functions: 50, lines: 50 },
				"src/visibility.ts": { statements: 95, branches: 90, functions: 87, lines: 95 },
				"src/state.ts": { statements: 98, branches: 91, functions: 96, lines: 98 },
				"src/core/ai.ts": { statements: 98, branches: 95, functions: 96, lines: 99 },
				"src/core/aiscore.ts": { statements: 97, branches: 98, functions: 95, lines: 96 },
				"src/core/attack.ts": { statements: 96, branches: 97, functions: 90, lines: 97 },
				"src/core/campaign.ts": { statements: 94, branches: 89, functions: 94, lines: 98 },
				"src/core/combat.ts": { statements: 99, branches: 99, functions: 97, lines: 99 },
				"src/core/costs.ts": { statements: 94, branches: 100, functions: 80, lines: 93 },
				"src/core/create.ts": { statements: 75, branches: 100, functions: 50, lines: 75 },
				"src/core/draft.ts": { statements: 97, branches: 91, functions: 96, lines: 99 },
				"src/core/equipment.ts": { statements: 88, branches: 84, functions: 80, lines: 90 },
				"src/core/fight.ts": { statements: 99, branches: 100, functions: 95, lines: 99 },
				"src/core/geometry.ts": { statements: 98, branches: 97, functions: 90, lines: 97 },
				"src/core/movement.ts": { statements: 99, branches: 99, functions: 97, lines: 99 },
				"src/core/moves.ts": { statements: 92, branches: 92, functions: 82, lines: 96 },
				"src/core/newgame.ts": { statements: 97, branches: 87, functions: 96, lines: 99 },
				"src/core/rules.ts": { statements: 80, branches: 100, functions: 50, lines: 80 },
				"src/core/scenariofile.ts": { statements: 90, branches: 75, functions: 91, lines: 94 },
				"src/core/session.ts": { statements: 96, branches: 96, functions: 94, lines: 98 },
				"src/core/sight.ts": { statements: 94, branches: 94, functions: 85, lines: 96 },
				"src/core/step.ts": { statements: 96, branches: 100, functions: 83, lines: 95 },
				"src/core/supply.ts": { statements: 97, branches: 97, functions: 90, lines: 98 },
				"src/core/turn.ts": { statements: 98, branches: 100, functions: 92, lines: 98 },
				"src/core/units.ts": { statements: 96, branches: 100, functions: 94, lines: 96 },
				"src/core/world.ts": { statements: 97, branches: 98, functions: 94, lines: 96 },
				"src/core/commands/common.ts": { statements: 87, branches: 85, functions: 85, lines: 92 },
				"src/core/commands/move.ts": { statements: 91, branches: 88, functions: 80, lines: 96 },
				"src/core/commands/supply.ts": { statements: 97, branches: 100, functions: 83, lines: 97 },
				"src/core/commands/transport.ts": { statements: 97, branches: 85, functions: 93, lines: 97 },
				"src/core/commands/undo.ts": { statements: 88, branches: 90, functions: 80, lines: 85 },
				"src/core/commands/turn.ts": { statements: 97, branches: 100, functions: 85, lines: 97 },
				"src/core/commands/units.ts": { statements: 88, branches: 77, functions: 95, lines: 96 },
				"src/savegame.ts": { statements: 95, branches: 79, functions: 95, lines: 95 },
				"src/coreplay.ts": { statements: 90, branches: 68, functions: 96, lines: 93 },
				"src/mirror.ts": { statements: 90, branches: 78, functions: 97, lines: 93 },
				"src/core/tutorial.ts": { statements: 98, branches: 97, functions: 94, lines: 98 },
			},
		},
	},
	server: {
		host: "127.0.0.1",
		port: 8644,
		strictPort: true,
		watch: { ignored: ["**/game/**", "**/harness/out/**", "**/dist/**"] },
	},
});
