//The game's names harness/ and the contracts reach for: with ?harness, src/main.ts exposes every
//module's exports as page globals, and the scripts use them, game.* and game.ui.* by name. Renaming
//one breaks npm run verify and npm run record for a reason that isn't a behavior change, so this
//says it in seconds, with the names
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";

const root = path.resolve(__dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
const list = (dir: string) => fs.readdirSync(path.join(root, dir)).filter((f) => f.endsWith(".js")).map((f) => dir + "/" + f);

//The scripts that run in the game's page. Not the Node side (coverage.js, diff-traces.js, difflib.js)
const pageScripts = ["harness/lib/harness.js", "harness/lib/hooks.js", "harness/replay.js", ...list("test/contracts")];

//A script without its comments (a // after a colon is a URL's)
const code = (file: string) => read(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

//The exports of the modules in src/main.ts's list, as ?harness exposes them: by name, without __
async function exposed(): Promise<Map<string, unknown>> {
	const names = new Map<string, unknown>();
	const main = read("src/main.ts");
	const imports = new Map([...main.matchAll(/^import \* as (\w+) from "\.\/(\w+)";/gm)].map((m) => [m[1], m[2]]));
	const listed = /const modules = \[([^\]]*)\]/.exec(main)![1].split(",").map((s) => s.trim());
	for (const ns of listed) {
		const module: Record<string, unknown> = await import(/* @vite-ignore */ path.join(root, "src", imports.get(ns)! + ".ts"));
		for (const name of Object.keys(module))
			if (!name.startsWith("__")) names.set(name, module[name]);
	}
	return names;
}

//The exports the page scripts use, by name: bare (not after a dot) or as a string (constructor.name
//lookups: harness.js ENTITIES, common.js). Kept as a list, so a renamed export shows here
const harnessExports = [
	"AI", "AIScripted", "Campaign", "CombatLog", "Commands", "Equipment", "Game", "GameMap", "GameRules", "GameState",
	"Hex", "Player", "Rng", "Scenario", "Transport", "Unit", "actionType", "game", "leaderType", "playerType", "terrainType", "toData",
	"uiSettings", "unitClass",
];

function usedNames(candidates: Set<string>): Set<string> {
	const used = new Set<string>();
	for (const file of pageScripts)
		for (const m of code(file).matchAll(/(?<![.\w$])[A-Za-z_$][\w$]*/g))
			if (candidates.has(m[0])) used.add(m[0]);
	return used;
}

function members(pattern: RegExp): string[] {
	const names = new Set<string>();
	for (const file of pageScripts)
		for (const m of code(file).matchAll(pattern)) names.add(m[1]);
	return [...names].sort();
}

test("The exports the harness uses are exposed by src/main.ts, under their names", async () => {
	const names = await exposed();
	expect(harnessExports.filter((n) => !names.has(n)), "used by harness/ or test/contracts, not exposed").toEqual([]);
	//A class or function exported under another name than its own would break the constructor.name lookups
	const renamed = harnessExports.filter((n) => typeof names.get(n) === "function" && (names.get(n) as { name: string }).name !== n);
	expect(renamed, "exported under another name than their own").toEqual([]);
});

//A module left out of the list hides its exports from ?harness
test("src/main.ts lists every module for ?harness", () => {
	const main = read("src/main.ts");
	const imports = new Map([...main.matchAll(/^import \* as (\w+) from "\.\/(\w+)";/gm)].map((m) => [m[2], m[1]]));
	const listed = /const modules = \[([^\]]*)\]/.exec(main)![1].split(",").map((s) => s.trim());
	const modules = fs.readdirSync(path.join(root, "src")).filter((f) => f.endsWith(".ts") && f !== "main.ts").map((f) => f.slice(0, -3));
	expect(modules.filter((m) => !listed.includes(imports.get(m) ?? "")), "not in src/main.ts's modules").toEqual([]);
});

test("The list of exports the harness uses is complete", async () => {
	const names = await exposed();
	const used = usedNames(new Set(names.keys()));
	expect([...used].filter((n) => !harnessExports.includes(n)).sort(), "used, add them to harnessExports").toEqual([]);
	expect(harnessExports.filter((n) => names.has(n) && !used.has(n)), "no longer used, remove them from harnessExports").toEqual([]);
});

//What the page scripts reach for only on the original game (reference/), whose Game has it: the end of turn's
//reinforcements the engine contract calls (record.sh), which arrive in the game's session here; its turn
//loop and the flag it held on while the UI showed a step, which the harness reads where the game has no host
//(harness/lib/harness.js: the host's processTurn and showingStep here, #378); its old UI (game.ui), which the
//harness waits for there and the engine contract stands in for (gone here with the old UI, #351)
const referenceOnly = ["deployReinforcements", "loop", "processTurn", "waitUIAnimation", "ui"];

test("The game.* members the harness uses exist", async () => {
	const { game } = await import("../src/game");
	const missing = members(/(?<![\w$])game\.([A-Za-z_$][\w$]*)/g).filter((n) => !(n in game) && !referenceOnly.includes(n));
	expect(missing, "game members used by harness/ or test/contracts").toEqual([]);
});

test("The game.host.* members the harness uses exist", async () => {
	const { game } = await import("../src/game");
	const missing = members(/(?<![\w$])game\.host\.([A-Za-z_$][\w$]*)/g).filter((n) => !(n in game.host));
	expect(missing, "game.host members used by harness/ or test/contracts").toEqual([]);
});
