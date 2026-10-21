// @vitest-environment node
//The engine without a browser: GameRules, Map, Unit, the AI, Scenario and Actions load in Node, with
//no DOM, and a game can drive them through their seams: the random numbers (src/rng.ts, the AI's
//rng), the engine context (src/context.ts), the turn driver (GameMap.onPlayerTurn) and the AI split
//into startTurn, planTurn and its evaluator. A small map built by hand, no scenario file: the
//scenario loader and the save need the DOM's XML parser and storage
import fs from "node:fs";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { Rng } from "../src/rng";
import { type EngineContext, engineContext, setEngineContext } from "../src/context";
import { GameRules } from "../src/gamerules";
import { GameMap, Player } from "../src/map";
import { Unit } from "../src/unit";
import { AI, type AIAction, type AIOptions, type AIPlan, aiDefaultConfig, createAIEvaluator } from "../src/ai";
import { Scenario } from "../src/scenario";
import { Actions } from "../src/actions";
import { Equipment, type EquipmentCountryFile } from "../src/equipment";
import { playerType, unitClass } from "../src/prototypes";

const root = path.resolve(__dirname, "..");
const GAME_DIR = process.env.OPENPANZER_GAME_DIR || path.join(root, "game");

function mulberry32(seed: number): () => number
{
	return () => {
		seed |= 0; seed = seed + 0x6D2B79F5 | 0;
		let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
		t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
		return ((t ^ t >>> 14) >>> 0) / 4294967296;
	};
}

const realRandom = Math.random, defaultContext = engineContext, defaultTurnDriver = GameMap.onPlayerTurn;
afterEach(() => {
	Math.random = realRandom;
	Rng.source = null;
	setEngineContext(defaultContext);
	GameMap.onPlayerTurn = defaultTurnDriver;
});

//Germany (8) and the Soviet Union (20), the files the game loads for them (country + 1)
for (const file of [8, 20])
	Equipment.parseCountryEquipment(file, JSON.parse(fs.readFileSync(path.join(GAME_DIR,
		"resources/equipment/eqp-adlerkorps/equipment-country-" + file + ".json"), "utf8")) as EquipmentCountryFile);

//A 12 x 12 clear map, a German side 0 against a Soviet side 1 (the AI), a victory hex for each
function smallGame(): { map: GameMap; players: Player[] }
{
	const map = new GameMap();
	map.rows = map.cols = 12;
	map.allocMap();
	const players = [[0, 0, 7], [1, 1, 19]].map(([id, side, country]) => {
		const p = new Player();
		p.id = id; p.side = side; p.country = country;
		p.type = id == 1 ? playerType.aiLocal : playerType.humanLocal;
		map.addPlayer(p);
		return p;
	});
	const units: [number, number, number, number][] = [ //eqid, owner, row, col
		[115, 0, 3, 3], [142, 0, 4, 4], [115, 0, 5, 3], [148, 0, 3, 5],
		[504, 1, 7, 7], [511, 1, 8, 6], [504, 1, 7, 8], [498, 1, 9, 9],
	];
	for (const [eqid, owner, row, col] of units)
	{
		const u = new Unit(eqid);
		u.owner = owner;
		u.player = players[owner]; //addUnit sets it too, but a unit added earlier may spot this one
		map.map[row][col].setUnit(u);
	}
	map.map[2][2].victorySide = 1; map.map[2][2].owner = 0;
	map.map[10][10].victorySide = 0; map.map[10][10].owner = 1;
	for (let r = 0; r < map.rows; r++)
		for (let c = 0; c < map.cols; c++)
			map.setHex(r, c);
	return { map, players };
}

const describeActions = (actions: AIAction[]) => actions.map((a) => a.type + ":" + a.param.map((x) =>
	x instanceof Unit ? "unit#" + x.id : x && typeof x === "object" ? x.row + "," + x.col : String(x)).join(" "));

//Plans the AI player's turn on a fresh small game, its actions as strings
function planAI(options?: AIOptions): string[]
{
	const { map, players } = smallGame();
	const ai = new AI(players[1], map, options);
	ai.buildActions();
	const actions: AIAction[] = [];
	for (let a = ai.getAction(); a !== null; a = ai.getAction()) actions.push(a);
	return describeActions(actions);
}

test("The engine modules load without a DOM", () => {
	expect(typeof window).toBe("undefined");
	expect(typeof document).toBe("undefined");
	for (const m of [GameRules, GameMap, Unit, AI, Scenario, Actions, Rng])
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
	for (const m of ["gamerules", "map", "unit", "ai", "scenario", "actions", "leaders", "rng", "context"]) visit(m);
	const ui = ["dom", "game", "gamestate", "ui", "uibuilder", "uicombatlog", "render", "animation", "aiscripted", "osglue", "main"];
	expect([...reached].filter((m) => ui.includes(m))).toEqual([]);
});

test("game.ts starts no timer and no listener while it loads, main.ts does", () => {
	const top = (file: string) => fs.readFileSync(path.join(root, "src", file), "utf8").split("\n")
		.filter((l) => /^\S/.test(l) && !l.startsWith("//")).join("\n");
	expect(top("game.ts")).not.toMatch(/setInterval|addEventListener/);
	const main = fs.readFileSync(path.join(root, "src/main.ts"), "utf8");
	expect(main).toMatch(/^game\.game\.loop = window\.setInterval\(game\.game\.processTurn, 1000\);$/m);
	expect(main).toMatch(/^window\.addEventListener\("load", game\.gameStart\);$/m);
});

//Rng reads Math.random at each draw when no source is set: seeding Math.random (the harness,
//record.js, the contracts) seeds the dice, the leaders and the AI, as before the seam
test("The engine's random numbers come from Rng: Math.random at the call, or the source set", () => {
	Math.random = mulberry32(7);
	const fromMath = [GameRules.rollDice(1, 6), GameRules.rollDice(0, 100), Rng.random()];
	Math.random = realRandom;
	Rng.source = mulberry32(7);
	expect([GameRules.rollDice(1, 6), GameRules.rollDice(0, 100), Rng.random()]).toEqual(fromMath);
});

test("The AI plans the same turn with the same random numbers, whichever way they come", () => {
	const seeded = planAI({ rng: mulberry32(3) });
	expect(seeded.length).toBeGreaterThan(0);
	expect(planAI({ rng: mulberry32(3) })).toEqual(seeded);
	Math.random = mulberry32(3);
	expect(planAI()).toEqual(seeded);
	Math.random = realRandom;
	Rng.source = mulberry32(3);
	expect(planAI()).toEqual(seeded);
	//The draws are the AI's own: Math.random untouched with an rng given
	let draws = 0;
	const rng = mulberry32(3);
	Math.random = () => { throw new Error("Math.random drawn"); };
	expect(planAI({ rng: () => { draws++; return rng(); } })).toEqual(seeded);
	expect(draws).toBeGreaterThan(100);
});

test("The AI takes its settings: aiDefaultConfig is the bundle's AI", () => {
	const seeded = planAI({ rng: mulberry32(3) });
	expect(planAI({ rng: mulberry32(3), config: aiDefaultConfig })).toEqual(seeded);
	//Never attacking: no attack in the plan
	const timid = planAI({ rng: mulberry32(3), config: { ...aiDefaultConfig, attackLossesThreshold: -1e9 } });
	expect(timid.filter((a) => a.startsWith("1:"))).toEqual([]);
});

test("buildActions is startTurn then planTurn; the evaluator scores on the AI's plan", () => {
	const { map, players } = smallGame();
	const ai = new AI(players[1], map, { rng: mulberry32(3) });
	ai.startTurn();
	ai.planTurn();
	const actions: AIAction[] = [];
	for (let a = ai.getAction(); a !== null; a = ai.getAction()) actions.push(a);
	expect(describeActions(actions)).toEqual(planAI({ rng: mulberry32(3) }));

	//A score draws once from rng: with a constant rng (factor randomFactor[4], 1) it is the plain score
	const unit = map.getUnits().find((u) => u.owner == 1 && u.unitData().uclass == unitClass.infantry)!;
	const plan: AIPlan = { enemyUnits: {}, takenPositions: [], freedPositions: [], defendObjectives: [], objectives: [] };
	let draws = 0;
	const evaluator = createAIEvaluator(players[1], map, plan, aiDefaultConfig, () => { draws++; return 0.5; });
	const cell = { ...unit.getPos(), canMove: true };
	const score = evaluator.getCellScore(unit, cell);
	expect(draws).toBe(1);
	expect(evaluator.getCellScore(unit, cell)).toBe(score);
	expect(ai.getEvaluator().getObjectiveScore(cell).cell).toEqual(map.sidesVictoryHexes[1][0]);
});

test("Map.endTurn hands the next player's turn to the turn driver", () => {
	const { map, players } = smallGame();
	const calls: [GameMap, Player][] = [];
	GameMap.onPlayerTurn = (m, p) => { calls.push([m, p]); };
	map.endTurn();
	expect(calls).toEqual([[map, players[1]]]);

	//The default plans an AI player's turn there
	GameMap.onPlayerTurn = defaultTurnDriver;
	const { map: map2, players: players2 } = smallGame();
	const ai = new AI(players2[1], map2, { rng: mulberry32(3) });
	players2[1].handler = ai;
	map2.endTurn();
	expect(ai.getAction()).not.toBeNull();
});

test("The engine reads the game through the context, at the moment it needs it", () => {
	const { map, players } = smallGame();
	let spotSide = 0;
	let campaignReads = 0;
	const context: EngineContext = {
		scenario: () => ({ map } as unknown as Scenario),
		campaign: () => { campaignReads++; return null; },
		campaignPlayer: () => null,
		spotSide: () => spotSide,
	};
	setEngineContext(context);

	//Unit.copy takes the player from the context's scenario map, by owner, as a detached copy (#68)
	const unit = map.getUnits().find((u) => u.owner == 1)!;
	const copy = new Unit(unit.eqid);
	copy.copy(unit);
	expect(copy.player).not.toBe(players[1]);
	expect(copy.player.id).toBe(1);

	//unitEndTurn hides a unit whose hex the side shown doesn't spot, read at the call
	const enemy = map.getUnits().find((u) => u.owner == 1 && !u.getHex()!.isSpotted(0))!;
	enemy.tempSpotted = true;
	spotSide = 1;
	enemy.unitEndTurn();
	expect(enemy.tempSpotted).toBe(true);
	spotSide = 0;
	enemy.unitEndTurn();
	expect(enemy.tempSpotted).toBe(false);

	//The score coefficient asks for the campaign
	players[0].updateScore(10);
	expect(campaignReads).toBe(1);
});
