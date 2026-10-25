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

//Dev server only, with OPENPANZER_CLI set ("npm run play:live"): the command-line player's bridge
//(#279). A call to POST /__cli (cli/play.ts --live) goes to the game's page over the dev server's
//websocket, the page plays it (cli/page.ts, added to index.html) and its answer comes back. Without the
//variable nothing changes: the page and its requests stay as the harness replays them
function cliBridge(): Plugin {
	const on = !!process.env.OPENPANZER_CLI;
	const waiting = new Map<number, (reply: unknown) => void>();
	let next = 0;
	return {
		name: "cli-bridge",
		apply: "serve",
		transformIndexHtml: () => on ? [{ tag: "script", attrs: { type: "module", src: "/cli/page.ts" }, injectTo: "body" }] : [],
		configureServer(server) {
			if (!on) return;
			server.ws.on("cli:response", (data: { id: number }) => {
				waiting.get(data.id)?.(data);
				waiting.delete(data.id);
			});
			server.middlewares.use("/__cli", (req, res) => {
				let body = "";
				req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
				req.on("end", () => {
					const id = next++;
					const reply = (data: unknown) => {
						res.setHeader("Content-Type", "application/json");
						res.end(JSON.stringify(data));
					};
					if (server.ws.clients.size === 0) return reply({ error: "no game page is open: open the dev server's page first" });
					waiting.set(id, reply);
					server.ws.send({ type: "custom", event: "cli:request", data: { id, argv: JSON.parse(body) as string[] } });
				});
			});
		},
	};
}

export default defineConfig({
	//.ts: the types are blanked out by blankTypes. .tsx (the new UI's components, src/view/): Vite's
	//own transform, which compiles Preact's JSX too
	oxc: { include: /\.tsx$/, jsx: { runtime: "automatic", importSource: "preact" } },
	plugins: [blankTypes(), harnessSetters(), copyGameAssets(), cliBridge()],
	optimizeDeps: { noDiscovery: true }, //the game has no dependencies, Preact (src/view/) is ESM as it is (and game/ has pages of its own)
	test: {
		//the game's modules need a DOM; the page is served from /game/ like index.html
		environment: "jsdom",
		environmentOptions: { jsdom: { url: "http://127.0.0.1/game/index.html" } },
		setupFiles: ["test/setup.ts"],
		include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
		testTimeout: 60_000, //a state replays a few thousand rule calls: seconds, more on a loaded machine
		//npm run test:coverage: what the tests run of the engine (coverage/index.html), every module
		//but the UI (ui, uibuilder, uicombatlog, render, animation, dom), the platform glue (osglue)
		//and the entry (main), of the new core (src/core/ and its commands) and of the new UI's
		//components (src/view/)
		coverage: {
			provider: "v8",
			include: ["src/gamerules.ts", "src/unit.ts", "src/map.ts", "src/ai.ts",
				"src/leaders.ts", "src/visibility.ts", "src/board.ts", "src/selection.ts", "src/undo.ts", "src/scenario.ts", "src/scenarioloader.ts", "src/campaign.ts", "src/game.ts",
				"src/gamestate.ts", "src/equipment.ts", "src/combatlog.ts", "src/prototypes.ts", "src/commands.ts", "src/rng.ts",
				"src/context.ts", "src/util.ts", "src/state.ts", "src/savegame.ts", "src/mirror.ts", "src/coresession.ts", "src/coreload.ts", "src/core/*.ts", "src/core/commands/*.ts",
				"src/view/*.tsx"],
			exclude: ["src/core/types.ts", "src/core/events.ts", "src/core/controller.ts"], //types only
			reporter: ["text", "html", "json-summary"],
			//Per file, today's coverage rounded down: a change may raise it, not lower it. When a file's
			//coverage goes up for good, raise its numbers here
			thresholds: {
				"src/ai.ts": { statements: 85, branches: 97, functions: 75, lines: 83 },
				"src/board.ts": { statements: 94, branches: 100, functions: 75, lines: 94 },
				"src/campaign.ts": { statements: 61, branches: 40, functions: 73, lines: 61 },
				"src/combatlog.ts": { statements: 96, branches: 81, functions: 90, lines: 96 },
				"src/commands.ts": { statements: 95, branches: 88, functions: 98, lines: 97 },
				"src/context.ts": { statements: 91, branches: 100, functions: 90, lines: 91 },
				"src/equipment.ts": { statements: 95, branches: 62, functions: 73, lines: 94 },
				"src/game.ts": { statements: 86, branches: 80, functions: 83, lines: 87 },
				"src/gamerules.ts": { statements: 96, branches: 97, functions: 96, lines: 97 },
				"src/gamestate.ts": { statements: 90, branches: 75, functions: 85, lines: 90 },
				"src/leaders.ts": { statements: 87, branches: 50, functions: 50, lines: 88 },
				"src/map.ts": { statements: 95, branches: 84, functions: 96, lines: 94 },
				"src/prototypes.ts": { statements: 85, branches: 0, functions: 42, lines: 85 },
				"src/rng.ts": { statements: 93, branches: 100, functions: 85, lines: 93 },
				"src/scenario.ts": { statements: 92, branches: 77, functions: 90, lines: 92 },
				"src/scenarioloader.ts": { statements: 86, branches: 61, functions: 84, lines: 85 },
				"src/selection.ts": { statements: 97, branches: 100, functions: 88, lines: 97 },
				"src/undo.ts": { statements: 92, branches: 100, functions: 75, lines: 92 },
				"src/unit.ts": { statements: 82, branches: 51, functions: 76, lines: 82 },
				"src/util.ts": { statements: 50, branches: 100, functions: 50, lines: 50 },
				"src/visibility.ts": { statements: 95, branches: 90, functions: 83, lines: 94 },
				"src/state.ts": { statements: 98, branches: 95, functions: 98, lines: 99 },
				"src/core/ai.ts": { statements: 98, branches: 95, functions: 96, lines: 99 },
				"src/core/aiscore.ts": { statements: 97, branches: 98, functions: 95, lines: 96 },
				"src/core/attack.ts": { statements: 96, branches: 97, functions: 90, lines: 97 },
				"src/core/campaign.ts": { statements: 95, branches: 90, functions: 96, lines: 98 },
				"src/core/combat.ts": { statements: 99, branches: 99, functions: 97, lines: 99 },
				"src/core/costs.ts": { statements: 94, branches: 100, functions: 80, lines: 93 },
				"src/core/create.ts": { statements: 75, branches: 100, functions: 50, lines: 75 },
				"src/core/draft.ts": { statements: 97, branches: 90, functions: 96, lines: 99 },
				"src/core/equipment.ts": { statements: 88, branches: 84, functions: 80, lines: 90 },
				"src/core/fight.ts": { statements: 99, branches: 100, functions: 95, lines: 99 },
				"src/core/geometry.ts": { statements: 98, branches: 97, functions: 90, lines: 97 },
				"src/core/movement.ts": { statements: 99, branches: 99, functions: 97, lines: 99 },
				"src/core/moves.ts": { statements: 92, branches: 92, functions: 82, lines: 96 },
				"src/core/newgame.ts": { statements: 97, branches: 87, functions: 96, lines: 99 },
				"src/core/rules.ts": { statements: 80, branches: 100, functions: 50, lines: 80 },
				"src/core/scenariofile.ts": { statements: 90, branches: 75, functions: 91, lines: 94 },
				"src/core/session.ts": { statements: 96, branches: 96, functions: 94, lines: 98 },
				"src/core/sight.ts": { statements: 92, branches: 91, functions: 83, lines: 94 },
				"src/core/step.ts": { statements: 96, branches: 100, functions: 83, lines: 95 },
				"src/core/supply.ts": { statements: 97, branches: 97, functions: 90, lines: 98 },
				"src/core/turn.ts": { statements: 98, branches: 100, functions: 91, lines: 98 },
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
				"src/coresession.ts": { statements: 89, branches: 78, functions: 94, lines: 94 },
				"src/coreload.ts": { statements: 92, branches: 92, functions: 85, lines: 95 },
				"src/mirror.ts": { statements: 93, branches: 89, functions: 98, lines: 96 },
				"src/core/tutorial.ts": { statements: 98, branches: 97, functions: 94, lines: 98 },
				"src/view/button.tsx": { statements: 100, branches: 100, functions: 100, lines: 100 },
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
