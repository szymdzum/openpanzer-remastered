// @vitest-environment node
//The engine without a browser: the core, GameRules, Map, Unit, Scenario, Commands and the game's mirror
//load in Node, with no DOM, and a game drives them through their seams: the random streams
//(src/rng.ts), the engine context (src/context.ts). On a small map built by hand (test/smallgame.ts)
import fs from "node:fs";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { Rng } from "../src/rng";
import { engineContext, setEngineContext } from "../src/context";
import { GameRules } from "../src/gamerules";
import { GameMap } from "../src/map";
import { Unit } from "../src/unit";
import { Scenario } from "../src/scenario";
import { Commands } from "../src/commands";
import { applyData, worldOf } from "../src/mirror";
import { startSession } from "../src/core/session";
import { smallGame } from "./smallgame";

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

//What an engine module imports, followed through the imports that run (not `import type`)
test("The engine's imports reach no UI module, no game.ts and no dom.ts", () => {
	const reached = new Set<string>();
	const visit = (m: string) => {
		if (reached.has(m)) return;
		reached.add(m);
		const src = fs.readFileSync(path.join(root, "src", m + ".ts"), "utf8");
		for (const i of src.matchAll(/^(?:import|export)\s+(type\s+)?[^;]*?from\s+"\.\/(\w+)";/gm))
			if (!i[1]) visit(i[2]);
	};
	for (const m of ["gamerules", "map", "unit", "ai", "scenario", "commands", "leaders", "rng", "context", "state", "savegame", "mirror"]) visit(m);
	const ui = ["dom", "game", "gamestate", "ui", "uibuilder", "uicombatlog", "render", "animation", "aiscripted", "osglue", "main",
		"coresession", "coreload"];
	expect([...reached].filter((m) => ui.includes(m))).toEqual([]);
});

test("game.ts starts no timer and no listener while it loads, main.ts does", () => {
	const top = (file: string) => fs.readFileSync(path.join(root, "src", file), "utf8").split("\n")
		.filter((l) => /^\S/.test(l) && !l.startsWith("//")).join("\n");
	expect(top("game.ts")).not.toMatch(/setInterval|addEventListener/);
	const main = fs.readFileSync(path.join(root, "src/main.ts"), "utf8");
	expect(main).toMatch(/^game\.game\.loop = window\.setInterval\(game\.game\.processTurn, 250\);$/m);
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
