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
			fs.cpSync("game/resources", options.dir + "/game/resources", { recursive: true });
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
		//but the page's (dom) and the entry (main), of the new core (src/core/ and its folders) and of
		//the UI's components, view model and screen (src/view/)
		coverage: {
			provider: "v8",
			include: ["src/legacy/gamerules.ts", "src/legacy/unit.ts", "src/legacy/map.ts", "src/legacy/ai.ts",
				"src/legacy/leaders.ts", "src/legacy/visibility.ts", "src/legacy/board.ts", "src/legacy/selection.ts", "src/legacy/undo.ts", "src/legacy/scenario.ts", "src/app/loader.ts", "src/legacy/campaign.ts", "src/app/game.ts",
				"src/app/storage.ts", "src/legacy/equipment.ts", "src/legacy/combatlog.ts", "src/legacy/prototypes.ts", "src/app/settings.ts", "src/legacy/commands.ts",
				"src/legacy/context.ts", "src/legacy/util.ts", "src/legacy/state.ts", "src/app/save.ts", "src/legacy/mirror.ts", "src/app/driver.ts", "src/app/start.ts", "src/app/host.ts", "src/app/nullscreen.ts",
				"src/core/*.ts", "src/core/commands/*.ts", "src/core/remastered/*.ts",
				"src/view/**/*.tsx", "src/view/store/model.ts", "src/view/store/store.ts", "src/view/store/storecore.ts", "src/view/store/storestep.ts", "src/view/store/storemap.ts",
				"src/view/store/storecard.ts", "src/view/store/storeturn.ts", "src/view/store/storenotes.ts", "src/view/map/hexgrid.ts", "src/view/map/mapview.ts",
				"src/view/map/mapdraw.ts", "src/view/map/mapinfo.ts", "src/view/map/canvas.ts", "src/view/map/overlays.ts", "src/view/map/strategic.ts",
				"src/view/map/strategicdraw.ts", "src/view/map/deploy.ts", "src/view/shortcuts.ts", "src/view/hud/unitinfo.ts", "src/view/store/context.ts", "src/view/map/hextip.ts", "src/view/turn.ts",
				"src/view/hud/odds.ts", "src/view/map/attackdraw.ts", "src/view/hud/results.ts",
				"src/view/beats.ts", "src/view/player.ts", "src/view/map/motiondraw.ts", "src/view/hud/unitcard.ts", "src/view/hud/unitlist.ts", "src/view/windows/shop.ts", "src/view/windows/shopstate.ts", "src/view/windows/log.ts", "src/view/windows/dossier.ts",
				"src/view/windows/menus.ts", "src/view/windows/newgame.ts", "src/view/windows/newgamestate.ts",
				"src/view/windows/settings.ts", "src/view/windows/settingsstate.ts", "src/view/windows/saveload.ts", "src/view/windows/saveloadstate.ts", "src/view/theme.ts", "src/view/html.ts", "src/view/uisettings.ts", "src/view/stable.ts", "src/view/map/layers.ts", "src/view/map/aidebug.ts", "src/view/map/aidebugdraw.ts"],
			exclude: ["src/core/types.ts", "src/core/state.ts", "src/core/command.ts", "src/core/events.ts", "src/core/controller.ts", "src/app/screen.ts"], //types only
			reporter: ["text", "html", "json-summary"],
			//Per file, today's coverage rounded down: a change may raise it, not lower it. When a file's
			//coverage goes up for good, raise its numbers here
			thresholds: {
				"src/legacy/ai.ts": { statements: 85, branches: 97, functions: 75, lines: 83 },
				"src/legacy/board.ts": { statements: 94, branches: 100, functions: 75, lines: 94 },
				"src/legacy/campaign.ts": { statements: 83, branches: 63, functions: 86, lines: 83 },
				"src/legacy/combatlog.ts": { statements: 96, branches: 87, functions: 90, lines: 96 },
				//(the selection's part, covered, went to src/legacy/selection.ts in #377: the functions left are fewer, the
				//harness's setter one of them, not less covered)
				"src/legacy/commands.ts": { statements: 95, branches: 88, functions: 97, lines: 97 },
				"src/legacy/context.ts": { statements: 91, branches: 100, functions: 90, lines: 91 },
				"src/legacy/equipment.ts": { statements: 95, branches: 78, functions: 83, lines: 94 },
				//(its turn loop, covered, went to the host in #374: the functions left are fewer, not less covered)
				"src/app/game.ts": { statements: 93, branches: 100, functions: 86, lines: 94 },
				"src/legacy/gamerules.ts": { statements: 96, branches: 97, functions: 96, lines: 97 },
				"src/app/storage.ts": { statements: 90, branches: 75, functions: 85, lines: 90 },
				"src/legacy/leaders.ts": { statements: 76, branches: 50, functions: 50, lines: 78 },
				"src/legacy/map.ts": { statements: 95, branches: 84, functions: 96, lines: 94 },
				//(its tables, covered, went to src/core/tables.ts in #523: the share left is lower, not less covered)
				"src/legacy/prototypes.ts": { statements: 90, branches: 0, functions: 50, lines: 90 },
				"src/legacy/scenario.ts": { statements: 92, branches: 83, functions: 90, lines: 92 },
				"src/app/loader.ts": { statements: 91, branches: 61, functions: 93, lines: 90 },
				"src/legacy/selection.ts": { statements: 97, branches: 100, functions: 96, lines: 97 },
				"src/legacy/undo.ts": { statements: 92, branches: 100, functions: 75, lines: 92 },
				"src/legacy/unit.ts": { statements: 95, branches: 89, functions: 92, lines: 96 },
				"src/legacy/util.ts": { statements: 50, branches: 100, functions: 50, lines: 50 },
				"src/legacy/visibility.ts": { statements: 95, branches: 90, functions: 83, lines: 94 },
				"src/legacy/state.ts": { statements: 98, branches: 95, functions: 98, lines: 99 },
				"src/core/ai.ts": { statements: 98, branches: 95, functions: 96, lines: 99 },
				"src/core/aiscore.ts": { statements: 97, branches: 98, functions: 95, lines: 96 },
				"src/core/attack.ts": { statements: 96, branches: 97, functions: 90, lines: 97 },
				"src/core/campaign.ts": { statements: 95, branches: 90, functions: 96, lines: 98 },
				"src/core/combat.ts": { statements: 99, branches: 99, functions: 97, lines: 99 },
				"src/core/costs.ts": { statements: 94, branches: 100, functions: 80, lines: 93 },
				"src/core/create.ts": { statements: 75, branches: 100, functions: 50, lines: 75 },
				"src/core/draft.ts": { statements: 97, branches: 90, functions: 96, lines: 99 },
				"src/core/equipment.ts": { statements: 88, branches: 96, functions: 80, lines: 95 },
				"src/core/fight.ts": { statements: 99, branches: 100, functions: 95, lines: 99 },
				"src/core/estimate.ts": { statements: 90, branches: 73, functions: 87, lines: 96 },
				"src/core/geometry.ts": { statements: 98, branches: 97, functions: 90, lines: 97 },
				"src/core/movement.ts": { statements: 99, branches: 99, functions: 97, lines: 99 },
				"src/core/moves.ts": { statements: 97, branches: 97, functions: 95, lines: 96 },
				"src/core/newgame.ts": { statements: 97, branches: 87, functions: 96, lines: 99 },
				"src/core/random.ts": { statements: 93, branches: 100, functions: 85, lines: 93 },
				"src/core/tables.ts": { statements: 97, branches: 100, functions: 0, lines: 97 },
				"src/core/rules.ts": { statements: 90, branches: 100, functions: 75, lines: 88 },
				"src/core/scenariofile.ts": { statements: 90, branches: 75, functions: 91, lines: 94 },
				"src/core/session.ts": { statements: 96, branches: 96, functions: 94, lines: 98 },
				"src/core/sight.ts": { statements: 92, branches: 91, functions: 83, lines: 94 },
				"src/core/step.ts": { statements: 96, branches: 100, functions: 83, lines: 95 },
				"src/core/supply.ts": { statements: 97, branches: 97, functions: 90, lines: 98 },
				"src/core/turn.ts": { statements: 98, branches: 100, functions: 91, lines: 98 },
				"src/core/units.ts": { statements: 96, branches: 100, functions: 94, lines: 96 },
				"src/core/world.ts": { statements: 97, branches: 98, functions: 94, lines: 96 },
				"src/core/commands/common.ts": { statements: 87, branches: 85, functions: 85, lines: 92 },
				"src/core/commands/move.ts": { statements: 97, branches: 100, functions: 90, lines: 96 },
				"src/core/commands/supply.ts": { statements: 97, branches: 100, functions: 88, lines: 96 },
				"src/core/commands/transport.ts": { statements: 97, branches: 85, functions: 93, lines: 97 },
				"src/core/commands/undo.ts": { statements: 96, branches: 90, functions: 80, lines: 95 },
				"src/core/commands/turn.ts": { statements: 97, branches: 100, functions: 85, lines: 97 },
				"src/core/commands/units.ts": { statements: 98, branches: 94, functions: 95, lines: 96 },
				"src/app/settings.ts": { statements: 90, branches: 100, functions: 66, lines: 88 }, //(split from prototypes.ts: it had 91/33/66/91, the one uncovered function is the harness setter)
				"src/app/save.ts": { statements: 95, branches: 85, functions: 95, lines: 95 },
				"src/app/driver.ts": { statements: 89, branches: 87, functions: 94, lines: 94 },
				"src/app/start.ts": { statements: 92, branches: 92, functions: 85, lines: 95 },
				"src/app/host.ts": { statements: 96, branches: 90, functions: 98, lines: 97 },
				"src/app/nullscreen.ts": { statements: 90, branches: 87, functions: 87, lines: 88 }, //(smaller since the host plays a program's step: the one uncovered is the harness setter)
				"src/legacy/mirror.ts": { statements: 93, branches: 89, functions: 98, lines: 96 },
				"src/core/tutorial.ts": { statements: 98, branches: 97, functions: 94, lines: 98 },
				"src/view/app.tsx": { statements: 100, branches: 100, functions: 100, lines: 100 },
				"src/view/store/model.ts": { statements: 97, branches: 98, functions: 95, lines: 97 },
				"src/view/screen.tsx": { statements: 100, branches: 86, functions: 100, lines: 100 },
				//(the store split into its parts, proposal 3: in each the one uncovered is the harness setter every module gets)
				"src/view/store/store.ts": { statements: 98, branches: 99, functions: 96, lines: 98 },
				"src/view/store/storecore.ts": { statements: 96, branches: 100, functions: 80, lines: 96 },
				"src/view/store/storestep.ts": { statements: 96, branches: 100, functions: 90, lines: 96 }, //(letGo's first value runs only if a blast came with no step playing)
				"src/view/store/storemap.ts": { statements: 98, branches: 100, functions: 95, lines: 98 },
				"src/view/store/storecard.ts": { statements: 94, branches: 95, functions: 85, lines: 92 },
				"src/view/store/storeturn.ts": { statements: 99, branches: 98, functions: 97, lines: 98 },
				"src/view/store/storenotes.ts": { statements: 90, branches: 100, functions: 80, lines: 88 },
				"src/view/map/hexgrid.ts": { statements: 94, branches: 100, functions: 80, lines: 93 },
				"src/view/map/map.tsx": { statements: 97, branches: 90, functions: 97, lines: 100 },
				"src/view/map/layers.ts": { statements: 96, branches: 93, functions: 90, lines: 97 }, //(the one uncovered: the harness setter)
				//(functions: its shared helpers went to canvas.ts and overlays.ts, the dev server's __harnessSet stays a
				//larger share of what is left)
				"src/view/map/mapdraw.ts": { statements: 98, branches: 95, functions: 94, lines: 99 },
				"src/view/map/canvas.ts": { statements: 98, branches: 100, functions: 90, lines: 97 },
				"src/view/map/mapinfo.ts": { statements: 97, branches: 100, functions: 85, lines: 95 },
				"src/view/map/overlays.ts": { statements: 97, branches: 90, functions: 95, lines: 99 },
				"src/view/map/strategic.ts": { statements: 88, branches: 100, functions: 75, lines: 85 }, //(its flag strip went to mapinfo.ts, #504: the uncovered harness setter is a larger share)
				"src/view/map/deploy.ts": { statements: 96, branches: 96, functions: 90, lines: 95 },
				"src/view/map/strategicdraw.ts": { statements: 98, branches: 88, functions: 80, lines: 97 },
				"src/view/map/mapview.ts": { statements: 96, branches: 96, functions: 93, lines: 98 },
				"src/view/components/anchored.tsx": { statements: 100, branches: 83, functions: 100, lines: 100 },
				"src/view/components/button.tsx": { statements: 100, branches: 100, functions: 100, lines: 100 },
				"src/view/components/controls.tsx": { statements: 100, branches: 100, functions: 100, lines: 100 },
				"src/view/components/facts.tsx": { statements: 100, branches: 100, functions: 100, lines: 100 },
				"src/view/components/icon.tsx": { statements: 100, branches: 100, functions: 100, lines: 100 },
				"src/view/components/list.tsx": { statements: 100, branches: 100, functions: 100, lines: 100 },
				"src/view/components/meter.tsx": { statements: 100, branches: 100, functions: 100, lines: 100 },
				"src/view/components/panel.tsx": { statements: 100, branches: 100, functions: 100, lines: 100 },
				"src/view/components/tabs.tsx": { statements: 100, branches: 100, functions: 100, lines: 100 },
				"src/view/components/tooltip.tsx": { statements: 100, branches: 100, functions: 100, lines: 100 },
				//the HUD (#346)
				"src/view/hud/statusbar.tsx": { statements: 100, branches: 100, functions: 100, lines: 100 },
				"src/view/hud/rail.tsx": { statements: 100, branches: 100, functions: 100, lines: 100 },
				"src/view/shortcuts.ts": { statements: 87, branches: 100, functions: 50, lines: 83 },
				"src/view/hud/infopanel.tsx": { statements: 100, branches: 100, functions: 100, lines: 100 },
				"src/view/hud/unitinfo.ts": { statements: 88, branches: 100, functions: 75, lines: 85 }, //(the one uncovered: the harness setter every module gets)
				"src/view/store/context.ts": { statements: 97, branches: 100, functions: 88, lines: 96 },
				"src/view/components/contextmenu.tsx": { statements: 100, branches: 100, functions: 100, lines: 100 },
				"src/view/map/hextip.ts": { statements: 95, branches: 100, functions: 75, lines: 93 },
				"src/view/map/maptips.tsx": { statements: 100, branches: 100, functions: 100, lines: 100 },
				"src/view/turn.ts": { statements: 97, branches: 100, functions: 95, lines: 96 },
				"src/view/hud/turnbanner.tsx": { statements: 100, branches: 100, functions: 100, lines: 100 },
				//(a small file: the dev server's __harnessSet is a quarter of its functions)
				"src/view/hud/odds.ts": { statements: 83, branches: 88, functions: 66, lines: 83 },
				"src/view/map/attackdraw.ts": { statements: 97, branches: 100, functions: 83, lines: 97 },
				"src/view/hud/results.ts": { statements: 93, branches: 82, functions: 96, lines: 93 },
				"src/view/hud/resultmarks.tsx": { statements: 100, branches: 92, functions: 100, lines: 100 },
				"src/view/beats.ts": { statements: 92, branches: 75, functions: 92, lines: 97 },
				"src/view/player.ts": { statements: 98, branches: 100, functions: 94, lines: 98 },
				"src/view/map/motiondraw.ts": { statements: 92, branches: 83, functions: 66, lines: 95 },
				"src/view/hud/unitcard.ts": { statements: 98, branches: 98, functions: 92, lines: 97 }, //(the one uncovered: the harness setter every module gets)
				"src/view/hud/unitlist.ts": { statements: 96, branches: 92, functions: 88, lines: 94 },
				"src/view/windows/shop.ts": { statements: 96, branches: 91, functions: 96, lines: 98 },
				"src/view/windows/shopstate.ts": { statements: 90, branches: 84, functions: 94, lines: 97 },
				"src/view/hud/unitstrip.tsx": { statements: 100, branches: 82, functions: 100, lines: 100 },
				"src/view/windows/log.ts": { statements: 95, branches: 91, functions: 91, lines: 98 },
				"src/view/windows/logwindow.tsx": { statements: 100, branches: 94, functions: 100, lines: 100 },
				"src/view/hud/message.tsx": { statements: 100, branches: 100, functions: 100, lines: 100 },
				"src/view/html.ts": { statements: 97, branches: 95, functions: 90, lines: 96 }, //(the one uncovered: the harness setter every module gets)
				"src/view/stable.ts": { statements: 95, branches: 100, functions: 85, lines: 93 }, //(the one uncovered: the harness setter)
				"src/view/windows/dossier.ts": { statements: 93, branches: 78, functions: 91, lines: 95 },
				"src/view/windows/dossierwindow.tsx": { statements: 100, branches: 95, functions: 100, lines: 100 },
				"src/view/hud/tray.tsx": { statements: 100, branches: 87, functions: 100, lines: 100 },
				"src/view/windows/shopwindow.tsx": { statements: 100, branches: 98, functions: 100, lines: 100 },
				"src/view/windows/menus.ts": { statements: 92, branches: 100, functions: 75, lines: 92 }, //(the one uncovered: the harness setter every module gets)
				"src/view/windows/startmenu.tsx": { statements: 100, branches: 100, functions: 100, lines: 100 },
				"src/view/windows/newgame.ts": { statements: 97, branches: 100, functions: 92, lines: 96 }, //(the one uncovered: the harness setter every module gets)
				"src/view/windows/newgamestate.ts": { statements: 98, branches: 100, functions: 92, lines: 97 }, //(the harness setter)
				"src/view/windows/newgamewindows.tsx": { statements: 100, branches: 100, functions: 100, lines: 100 },
				"src/view/windows/settings.ts": { statements: 94, branches: 100, functions: 83, lines: 93 }, //(the harness setter)
				//(the harness setter; and a page without devicePixelRatio)
				"src/view/windows/settingsstate.ts": { statements: 96, branches: 95, functions: 88, lines: 95 }, //(smaller since its counters went: the one uncovered is the harness setter every module gets)
				"src/view/uisettings.ts": { statements: 93, branches: 100, functions: 80, lines: 92 }, //(the one uncovered: the harness setter)
				"src/view/windows/settingswindow.tsx": { statements: 100, branches: 100, functions: 100, lines: 100 },
				"src/view/windows/saveload.ts": { statements: 90, branches: 100, functions: 87, lines: 85 }, //(the harness setter)
				//(the harness setter; the field's other attributes, which the game's state doesn't set, and no save of the settings)
				"src/view/windows/saveloadstate.ts": { statements: 95, branches: 91, functions: 92, lines: 94 }, //(functions: the field's stand-in went, a report came: the uncovered one is still the harness setter)
				"src/view/windows/saveloadwindow.tsx": { statements: 100, branches: 100, functions: 100, lines: 100 },
				"src/core/deployment.ts": { statements: 96, branches: 100, functions: 91, lines: 95 },
				"src/view/theme.ts": { statements: 90, branches: 100, functions: 80, lines: 88 }, //(the harness setter)
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
