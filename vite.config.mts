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
	//Baseline widely available (iPad Safari 17 and up, docs/ui/handoff.md, CSS); Lightning CSS lowers what the
	//target lacks, the new UI's nesting included (test/css-build.test.ts checks it)
	build: { target: "baseline-widely-available", cssMinify: "lightningcss" },
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
		//components, view model and screen (src/view/)
		coverage: {
			provider: "v8",
			include: ["src/gamerules.ts", "src/unit.ts", "src/map.ts", "src/ai.ts",
				"src/leaders.ts", "src/visibility.ts", "src/board.ts", "src/selection.ts", "src/undo.ts", "src/scenario.ts", "src/scenarioloader.ts", "src/campaign.ts", "src/game.ts",
				"src/gamestate.ts", "src/equipment.ts", "src/combatlog.ts", "src/prototypes.ts", "src/commands.ts", "src/rng.ts",
				"src/context.ts", "src/util.ts", "src/state.ts", "src/savegame.ts", "src/mirror.ts", "src/coresession.ts", "src/coreload.ts", "src/host.ts", "src/oldscreen.ts", "src/nullscreen.ts",
				"src/core/*.ts", "src/core/commands/*.ts",
				"src/view/*.tsx", "src/view/model.ts", "src/view/store.ts", "src/view/hexgrid.ts", "src/view/mapview.ts",
				"src/view/mapdraw.ts", "src/view/mapinfo.ts", "src/view/canvas.ts", "src/view/overlays.ts", "src/view/strategic.ts",
				"src/view/strategicdraw.ts", "src/view/deploy.ts", "src/view/shortcuts.ts", "src/view/unitinfo.ts", "src/view/context.ts", "src/view/hextip.ts", "src/view/turn.ts",
				"src/view/odds.ts", "src/view/attackdraw.ts", "src/view/results.ts",
				"src/view/beats.ts", "src/view/player.ts", "src/view/motiondraw.ts", "src/view/unitcard.ts", "src/view/unitlist.ts", "src/view/shop.ts", "src/view/shopstate.ts", "src/view/log.ts", "src/view/dossier.ts"],
			exclude: ["src/core/types.ts", "src/core/events.ts", "src/core/controller.ts", "src/screen.ts"], //types only
			reporter: ["text", "html", "json-summary"],
			//Per file, today's coverage rounded down: a change may raise it, not lower it. When a file's
			//coverage goes up for good, raise its numbers here
			thresholds: {
				"src/ai.ts": { statements: 85, branches: 97, functions: 75, lines: 83 },
				"src/board.ts": { statements: 94, branches: 100, functions: 75, lines: 94 },
				"src/campaign.ts": { statements: 61, branches: 40, functions: 73, lines: 61 },
				"src/combatlog.ts": { statements: 96, branches: 81, functions: 90, lines: 96 },
				//(the selection's part, covered, went to src/selection.ts in #377: the functions left are fewer, the
				//harness's setter one of them, not less covered)
				"src/commands.ts": { statements: 95, branches: 88, functions: 97, lines: 97 },
				"src/context.ts": { statements: 91, branches: 100, functions: 90, lines: 91 },
				"src/equipment.ts": { statements: 95, branches: 62, functions: 73, lines: 94 },
				//(its turn loop, covered, went to the host in #374: the functions left are fewer, not less covered)
				"src/game.ts": { statements: 86, branches: 80, functions: 78, lines: 87 },
				"src/gamerules.ts": { statements: 96, branches: 97, functions: 96, lines: 97 },
				"src/gamestate.ts": { statements: 90, branches: 75, functions: 85, lines: 90 },
				"src/leaders.ts": { statements: 76, branches: 50, functions: 50, lines: 78 },
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
				"src/core/estimate.ts": { statements: 90, branches: 73, functions: 87, lines: 96 },
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
				"src/core/commands/supply.ts": { statements: 97, branches: 100, functions: 83, lines: 96 },
				"src/core/commands/transport.ts": { statements: 97, branches: 85, functions: 93, lines: 97 },
				"src/core/commands/undo.ts": { statements: 88, branches: 90, functions: 80, lines: 85 },
				"src/core/commands/turn.ts": { statements: 97, branches: 100, functions: 85, lines: 97 },
				"src/core/commands/units.ts": { statements: 88, branches: 77, functions: 95, lines: 96 },
				"src/savegame.ts": { statements: 95, branches: 79, functions: 95, lines: 95 },
				"src/coresession.ts": { statements: 89, branches: 78, functions: 94, lines: 94 },
				"src/coreload.ts": { statements: 92, branches: 92, functions: 85, lines: 95 },
				"src/host.ts": { statements: 96, branches: 90, functions: 97, lines: 96 },
				"src/oldscreen.ts": { statements: 87, branches: 63, functions: 92, lines: 89 },
				"src/nullscreen.ts": { statements: 94, branches: 87, functions: 88, lines: 92 },
				"src/mirror.ts": { statements: 93, branches: 89, functions: 98, lines: 96 },
				"src/core/tutorial.ts": { statements: 98, branches: 97, functions: 94, lines: 98 },
				"src/view/app.tsx": { statements: 94, branches: 87, functions: 90, lines: 100 },
				"src/view/model.ts": { statements: 97, branches: 92, functions: 95, lines: 97 },
				"src/view/screen.tsx": { statements: 100, branches: 75, functions: 100, lines: 100 },
				"src/view/store.ts": { statements: 97, branches: 99, functions: 92, lines: 96 },
				"src/view/hexgrid.ts": { statements: 94, branches: 100, functions: 80, lines: 93 },
				"src/view/map.tsx": { statements: 97, branches: 90, functions: 97, lines: 100 },
				//(functions: its shared helpers went to canvas.ts and overlays.ts, the dev server's __harnessSet stays a
				//larger share of what is left)
				"src/view/mapdraw.ts": { statements: 98, branches: 90, functions: 94, lines: 99 },
				"src/view/canvas.ts": { statements: 98, branches: 100, functions: 90, lines: 97 },
				"src/view/mapinfo.ts": { statements: 97, branches: 100, functions: 85, lines: 95 },
				"src/view/overlays.ts": { statements: 97, branches: 85, functions: 95, lines: 99 },
				"src/view/strategic.ts": { statements: 90, branches: 100, functions: 80, lines: 87 },
				"src/view/deploy.ts": { statements: 96, branches: 96, functions: 90, lines: 95 },
				"src/view/strategicdraw.ts": { statements: 98, branches: 90, functions: 83, lines: 97 },
				"src/view/mapview.ts": { statements: 96, branches: 96, functions: 93, lines: 98 },
				"src/view/anchored.tsx": { statements: 100, branches: 78, functions: 100, lines: 100 },
				"src/view/button.tsx": { statements: 100, branches: 100, functions: 100, lines: 100 },
				"src/view/controls.tsx": { statements: 100, branches: 100, functions: 100, lines: 100 },
				"src/view/facts.tsx": { statements: 100, branches: 100, functions: 100, lines: 100 },
				"src/view/gallery.tsx": { statements: 96, branches: 100, functions: 88, lines: 96 },
				"src/view/icon.tsx": { statements: 100, branches: 100, functions: 100, lines: 100 },
				"src/view/list.tsx": { statements: 100, branches: 100, functions: 100, lines: 100 },
				"src/view/meter.tsx": { statements: 100, branches: 100, functions: 100, lines: 100 },
				"src/view/panel.tsx": { statements: 100, branches: 100, functions: 100, lines: 100 },
				"src/view/sheet.tsx": { statements: 100, branches: 100, functions: 100, lines: 100 },
				"src/view/strength.tsx": { statements: 100, branches: 100, functions: 100, lines: 100 },
				"src/view/tabs.tsx": { statements: 100, branches: 100, functions: 100, lines: 100 },
				"src/view/tooltip.tsx": { statements: 100, branches: 100, functions: 100, lines: 100 },
				//the HUD (#346)
				"src/view/statusbar.tsx": { statements: 100, branches: 100, functions: 100, lines: 100 },
				"src/view/rail.tsx": { statements: 100, branches: 100, functions: 100, lines: 100 },
				"src/view/shortcuts.ts": { statements: 87, branches: 100, functions: 50, lines: 83 },
				"src/view/infopanel.tsx": { statements: 100, branches: 100, functions: 100, lines: 100 },
				"src/view/unitinfo.ts": { statements: 95, branches: 100, functions: 83, lines: 93 },
				"src/view/context.ts": { statements: 97, branches: 100, functions: 88, lines: 96 },
				"src/view/contextmenu.tsx": { statements: 100, branches: 100, functions: 100, lines: 100 },
				"src/view/hextip.ts": { statements: 95, branches: 100, functions: 75, lines: 93 },
				"src/view/maptips.tsx": { statements: 100, branches: 100, functions: 100, lines: 100 },
				"src/view/turn.ts": { statements: 97, branches: 100, functions: 90, lines: 96 },
				"src/view/turnbanner.tsx": { statements: 100, branches: 100, functions: 100, lines: 100 },
				//(a small file: the dev server's __harnessSet is a quarter of its functions)
				"src/view/odds.ts": { statements: 83, branches: 88, functions: 75, lines: 85 },
				"src/view/attackdraw.ts": { statements: 97, branches: 100, functions: 83, lines: 97 },
				"src/view/results.ts": { statements: 93, branches: 82, functions: 96, lines: 93 },
				"src/view/resultmarks.tsx": { statements: 100, branches: 92, functions: 100, lines: 100 },
				"src/view/beats.ts": { statements: 92, branches: 75, functions: 92, lines: 97 },
				"src/view/player.ts": { statements: 98, branches: 100, functions: 94, lines: 98 },
				"src/view/motiondraw.ts": { statements: 92, branches: 75, functions: 66, lines: 95 },
				"src/view/unitcard.ts": { statements: 98, branches: 98, functions: 94, lines: 97 },
				"src/view/unitsheet.tsx": { statements: 100, branches: 100, functions: 100, lines: 100 },
				"src/view/unitlist.ts": { statements: 96, branches: 93, functions: 90, lines: 94 },
				"src/view/shop.ts": { statements: 96, branches: 92, functions: 97, lines: 98 },
				"src/view/shopstate.ts": { statements: 90, branches: 84, functions: 94, lines: 97 },
				"src/view/unitstrip.tsx": { statements: 100, branches: 82, functions: 100, lines: 100 },
				"src/view/log.ts": { statements: 96, branches: 91, functions: 92, lines: 98 },
				"src/view/logwindow.tsx": { statements: 100, branches: 78, functions: 100, lines: 100 },
				"src/view/message.tsx": { statements: 100, branches: 100, functions: 100, lines: 100 },
				"src/view/dossier.ts": { statements: 93, branches: 78, functions: 91, lines: 95 },
				"src/view/dossierwindow.tsx": { statements: 100, branches: 95, functions: 100, lines: 100 },
				"src/view/tray.tsx": { statements: 100, branches: 87, functions: 100, lines: 100 },
				"src/view/shopwindow.tsx": { statements: 100, branches: 98, functions: 100, lines: 100 },
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
