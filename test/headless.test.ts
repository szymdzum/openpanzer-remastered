// @vitest-environment node
//The engine without a browser: the core, GameRules, Map, Unit, Scenario, Commands and the game's mirror
//load in Node, with no DOM, and a game drives them through their seams: the random streams
//(src/core/random.ts), the engine context (src/legacy/context.ts). On a small map built by hand (test/smallgame.ts)
import fs from "node:fs";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { Rng } from "../src/core/random";
import { engineContext, setEngineContext } from "../src/legacy/context";
import { GameRules } from "../src/legacy/gamerules";
import { GameMap } from "../src/legacy/map";
import { Unit } from "../src/legacy/unit";
import { Scenario } from "../src/legacy/scenario";
import { Commands } from "../src/legacy/commands";
import { applyData, worldOf } from "../src/legacy/mirror";
import { startSession } from "../src/core/session";
import { smallGame } from "./smallgame";
import { classicRules } from "../src/core/rules";

const root = path.resolve(__dirname, "..");

const realRandom = Math.random, gameState = Rng.game.state, defaultContext = engineContext;
afterEach(() => {
	Math.random = realRandom;
	Rng.game.state = gameState;
	setEngineContext(defaultContext);
});

test("The engine modules load without a DOM", () => {
	expect(typeof window).toBe("undefined");
	expect(typeof document).toBe("undefined");
	for (const m of [GameRules, GameMap, Unit, Scenario, Commands, Rng, applyData, worldOf, startSession])
		expect(m).toBeTruthy();
});

//What modules import, followed through the imports that run (not `import type`)
function reachedFrom(modules: string[]): Set<string> {
	const reached = new Set<string>();
	const visit = (m: string) => {
		if (reached.has(m)) return;
		reached.add(m);
		const src = fs.readFileSync(path.join(root, "src", m + ".ts"), "utf8");
		for (const i of src.matchAll(/^(?:import|export)\s+(type\s+)?[^;]*?from\s+"(\.{1,2}\/[\w/]+)";/gm))
			if (!i[1]) visit(path.posix.join(path.posix.dirname(m), i[2]));
	};
	modules.forEach(visit);
	return reached;
}

//The page's modules (the old UI's went in #351; the UI's own, src/view/, are checked below)
const uiModules = ["app/page", "app/game", "app/storage", "main"];

test("The engine's imports reach no UI module, no game.ts and no dom.ts", () => {
	const reached = reachedFrom(["legacy/gamerules", "legacy/map", "legacy/unit", "legacy/ai", "legacy/scenario", "legacy/commands",
		"legacy/leaders", "legacy/context", "legacy/state", "app/save", "legacy/mirror"]);
	expect([...reached].filter((m) => [...uiModules, "app/driver", "app/start"].includes(m))).toEqual([]);
});

//The game host (src/app/host.ts) plays the game's course on the engine and on the game's glue to the core
//(coresession, coreload): it reaches no UI module, no game.ts and no dom.ts either
test("The game host's imports reach no UI module, no game.ts and no dom.ts", () => {
	const reached = reachedFrom(["app/host"]);
	expect([...reached].filter((m) => uiModules.includes(m))).toEqual([]);
	expect(reached).toContain("app/driver");
});

//The game shows itself through the screen interface (src/app/screen.ts, #374): the host, the session's glue and
//the screen that shows nothing reach no UI module; the page gives the host the UI's screen (src/main.ts, #351)
test("The screen interface and the screen that shows nothing reach no UI module (#374)", () => {
	const reached = reachedFrom(["app/screen", "app/nullscreen", "app/driver", "legacy/commands"]);
	expect([...reached].filter((m) => uiModules.includes(m))).toEqual([]);
});

//The new UI (src/view/, #380) reads the game through the core, the game host and the screen interface: what
//its modules import from outside src/view/ is only those and src/app/settings.ts (the settings), and none of
//it reaches an old UI module or game.ts
test("The new UI's imports reach no old UI module and no game.ts (#380)", () => {
	const view = path.join(root, "src/view"), outside = new Set<string>();
	for (const file of fs.readdirSync(view).filter((f) => /\.tsx?$/.test(f)))
		for (const i of fs.readFileSync(path.join(view, file), "utf8").matchAll(/^import\s+(type\s+)?[^;]*?from\s+"\.\.\/([\w/]+)";/gm))
			if (!i[1]) outside.add(i[2]);
	const engine = [...outside].filter((m) => !m.startsWith("core/"));
	expect(engine.filter((m) => !["app/host", "app/screen", "app/settings", "legacy/prototypes"].includes(m))).toEqual([]);
	expect([...reachedFrom(engine)].filter((m) => uiModules.includes(m))).toEqual([]);
	expect(outside).toContain("core/step");
});

//No turn loop ticks: a program's turn goes on when the screen has shown its last action (#375)
test("game.ts starts no timer and no listener while it loads, main.ts starts the game and no turn loop", () => {
	const top = (file: string) => fs.readFileSync(path.join(root, "src", file), "utf8").split("\n")
		.filter((l) => /^\S/.test(l) && !l.startsWith("//")).join("\n");
	expect(top("app/game.ts")).not.toMatch(/setInterval|addEventListener/);
	const main = fs.readFileSync(path.join(root, "src/main.ts"), "utf8");
	expect(main).not.toMatch(/setInterval/);
	expect(main).toMatch(/^window\.addEventListener\("load", game\.gameStart\);$/m);
});

//The dice draw from the game stream: Math.random at each draw while it isn't seeded (a test that seeds
//Math.random seeds them, as the harness and record.js do), its own numbers once it is (#126)
test("The dice come from the game stream: Math.random until it is seeded", () => {
	Rng.game.state = null;
	const seq = [0.5, 0.25, 0.75];
	Math.random = () => seq.shift();
	expect([GameRules.rollDice(1, 6), GameRules.rollDice(0, 100), GameRules.rollDice(1, 4)]).toEqual([4, 25, 4]);
	Rng.seed(7);
	const seeded = [GameRules.rollDice(1, 6), GameRules.rollDice(0, 100)];
	Rng.seed(7);
	expect([GameRules.rollDice(1, 6), GameRules.rollDice(0, 100)]).toEqual(seeded);
});

//GameRules reads the world the context gives at the call (the game's objects then): what a screen
//wrote into them is in the answer
test("The rules read the game through the context, at the moment they ask", () => {
	expect([defaultContext.scenario(), defaultContext.campaign(), defaultContext.campaignPlayer(), defaultContext.spotSide(),
		defaultContext.host()]).toEqual([null, null, null, -1, null]);
	expect(() => defaultContext.world()).toThrow("no game");
	const { map } = smallGame();
	const tank = map.getUnits().find((u) => u.eqid === 142)!;
	const range = GameRules.getMoveRange(map, tank).filter((c) => c.canMove).length;
	expect(range).toBeGreaterThan(0);
	tank.hasMoved = true;
	expect(GameRules.getMoveRange(map, tank).filter((c) => c.canMove).length).toBe(0);
});

//A save written while an attack's animation ran holds the destroyed unit on its hex (#58): the Soviet
//infantry at 7,7 with strength -2. The load takes it off, and the German tank at 4,4 then moves there
test("A save's unit with no strength left isn't on the map after the load (#290)", async () => {
	const { smallGameData } = await import("./smallgame");
	const { readSaveObject, scenarioFromSave, SAVE_VERSION } = await import("../src/app/save");
	const saved = smallGameData();
	saved.state.units[4].strength = -2;
	const read = readSaveObject({ version: SAVE_VERSION, rules: "classic", ...saved });
	const scenario = scenarioFromSave(read), m = scenario.map;
	setEngineContext({ scenario: () => scenario, campaign: () => null, campaignPlayer: () => null, spotSide: () => 0,
		rules: () => "classic", host: () => null, world: () => worldOf(scenario, null, { spotSide: 0, noFOW: false, rules: classicRules }) });
	expect(m.getUnits().map((u) => u.id)).not.toContain(4);
	expect(m.map[7][7].unit).toBeNull();
	const tank = m.getUnitById(1);
	expect(Commands.check(scenario, { type: "move", unit: 1, to: { row: 7, col: 7 } })).toBeNull();
	Commands.execute(scenario, { type: "move", unit: 1, to: { row: 7, col: 7 } });
	expect(tank.getPos()).toEqual({ row: 7, col: 7 });
});
