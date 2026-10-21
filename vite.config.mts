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
		//and the entry (main)
		coverage: {
			provider: "v8",
			include: ["src/gamerules.ts", "src/unit.ts", "src/map.ts", "src/ai.ts", "src/aiscripted.ts",
				"src/leaders.ts", "src/scenario.ts", "src/scenarioloader.ts", "src/campaign.ts", "src/game.ts",
				"src/gamestate.ts", "src/equipment.ts", "src/combatlog.ts", "src/prototypes.ts"],
			reporter: ["text", "html", "json-summary"],
		},
	},
	server: {
		host: "127.0.0.1",
		port: 8644,
		strictPort: true,
		watch: { ignored: ["**/game/**", "**/harness/out/**", "**/dist/**"] },
	},
});
