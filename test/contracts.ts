//Runs a contract (test/contracts/<module>.contract.js) on this repo's modules, on a game state
//recorded on the reference, and compares every result with the recorded one
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { vi } from "vitest";
import { coreEngine } from "./coreengine";

export interface ContractFixture {
	file: string;
	turns: number;
	fuzzRounds: number;
	state: string; //GameState.exportGameState() of the reference
	setup: string | null; //what the contract's contractCapture took on the reference, for contractApply
	spotSide?: number; //game.spotSide on the reference: not in the export, Unit.unitEndTurn reads it
	results: [string, string, string][]; //[call name, context, serialized result]
}

export const contractDir = (module: string) => path.join(__dirname, "contracts", module);

export function fixtures(module: string): string[] {
	return fs.readdirSync(contractDir(module)).filter((f) => f.endsWith(".json.gz")).sort();
}

export function readFixture(module: string, name: string): ContractFixture {
	return JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(contractDir(module), name))).toString("utf8"));
}

export type ContractEnv = Record<string, unknown>;
export interface Contract {
	run: (env: ContractEnv) => ContractFixture["results"];
	apply: ((env: ContractEnv, setup: string) => void) | null;
}

//The contract's functions: the file is a plain script shared with the recorder, after common.js
export function contract(module: string, run: string): Contract {
	const read = (f: string) => fs.readFileSync(path.join(__dirname, "contracts", f), "utf8");
	return new Function(read("common.js") + "\n" + read(module + ".contract.js") + "\nreturn { run: " + run
		+ ", apply: typeof contractApply === 'function' ? contractApply : null };")() as Contract;
}

//common.js's serializer (sorted keys, entities as ids) and hash (FNV-1a), for a test that writes
//what a contract writes
export interface ContractCommon {
	contractSerialize: (v: unknown) => string;
	contractHash: (s: string) => string;
}
export function contractCommon(): ContractCommon {
	return new Function(fs.readFileSync(path.join(__dirname, "contracts", "common.js"), "utf8")
		+ "\nreturn { contractSerialize, contractHash };")() as ContractCommon;
}

//Restores the fixture's state, builds the environment record.js builds on the reference from
//this repo's modules (and extra, what a test adds), applies the contract's setup and runs it
//extra: more of the env, or what to add to it given the env (the modules of the restored state)
export async function runFixture(module: string, run: string, name: string, extra?: ContractEnv | ((env: ContractEnv) => ContractEnv)) {
	const c = contract(module, run);
	const fixture = readFixture(module, name);
	const scenario = await restoreState(fixture.state);
	const { GameRules } = await import("../src/gamerules");
	const { Equipment } = await import("../src/equipment");
	const { Unit } = await import("../src/unit");
	const { GameState } = await import("../src/gamestate");
	const { CombatLog } = await import("../src/combatlog");
	const { game } = await import("../src/game");
	const { Commands } = await import("../src/commands");
	const { toData } = await import("../src/state");
	const { Rng } = await import("../src/rng");
	const { terrainType, leaderType, actionType, playerType, unitClass } = await import("../src/prototypes");
	//(the contract's script writes into the game's objects anywhere, as the harness's do: no world kept)
	(await import("../src/mirror")).mirrorOptions.cache = false;
	if (fixture.spotSide !== undefined)
		game.spotSide = fixture.spotSide;
	//(the engine's players, end of turn and outcome on the game's session)
	const engine = module === "engine" ? await coreEngine() : {};
	const env: ContractEnv = { GameRules, Equipment, Unit, GameState, CombatLog, game, terrainType,
		leaderType, actionType, playerType, unitClass, scenario, map: scenario.map, fuzzRounds: fixture.fuzzRounds, Commands,
		toData, Rng, ...engine, ...(typeof extra === "function" ? {} : extra) };
	if (typeof extra === "function")
		Object.assign(env, extra(env));
	if (c.apply && fixture.setup !== undefined && fixture.setup !== null)
		c.apply(env, fixture.setup);
	const actual = c.run(env);
	return { expected: recorded(module, name, fixture, actual), actual };
}

//The results a contract run is compared with: the fixture's, or with UPDATE_CONTRACTS=1 the run's,
//written into the fixture
export function recorded(module: string, name: string, fixture: ContractFixture, actual: ContractFixture["results"]) {
	if (process.env.UPDATE_CONTRACTS && process.env.CI)
		throw new Error("UPDATE_CONTRACTS in CI: the contracts would pass by construction");
	if (!process.env.UPDATE_CONTRACTS) return fixture.results;
	writeFixture(module, name, { ...fixture, results: actual });
	return actual;
}

//UPDATE_CONTRACTS=1 npm test: the fixture keeps the reference's state, setup and spotSide and
//takes this repo's results instead, for a deliberate change record.sh can't record (the reference
//still has the old behavior). Only a fixture whose results changed is written, the others keep
//their bytes
export function writeFixture(module: string, name: string, fixture: ContractFixture) {
	const file = path.join(contractDir(module), name);
	const json = JSON.stringify(fixture);
	if (fs.existsSync(file) && zlib.gunzipSync(fs.readFileSync(file)).toString("utf8") === json)
		return;
	fs.writeFileSync(file, zlib.gzipSync(json, { level: 9 }));
}

//Fresh modules (Equipment keeps what it loaded), then the state restored the way the recorder
//restored it: GameState.restoreFromString into the game, which builds no UI (setupGameState).
//A campaign runs the game's setupGameState, as record.js does: it links the campaign player
//(Game.getCampaignPlayer). Its UI calls go to a stub, its saves to jsdom's localStorage
export async function restoreState(state: string) {
	vi.resetModules();
	const { GameState } = await import("../src/gamestate");
	const { game } = await import("../src/game");
	clearInterval(game.loop); //the turn loop, record.js runs no clock while the contract plays
	const setupGameState = game.setupGameState;
	const loaded = new Promise<void>((resolve) => {
		game.setupGameState = () => {
			if (game.campaign) {
				game.state = new GameState(game);
				game.ui = { setNewScenario() {} } as unknown as typeof game.ui;
				setupGameState.call(game);
			}
			resolve();
		};
	});
	game.cleanup = () => {};
	new GameState(game).restoreFromString(state);
	await loaded;
	return game.scenario;
}

//Mismatches, grouped by call name, the first few of each in full
export function compareResults(expected: ContractFixture["results"], actual: ContractFixture["results"]): string | null {
	if (expected.length !== actual.length)
		return `${actual.length} calls instead of ${expected.length}` + firstDifference(expected, actual);
	const byName = new Map<string, number>();
	const examples: string[] = [];
	for (let i = 0; i < expected.length; i++) {
		const [name, context, want] = expected[i], got = actual[i][2];
		if (want === got) continue;
		byName.set(name, (byName.get(name) || 0) + 1);
		if (examples.length < 5)
			examples.push(`#${i} ${name} (${context})\n` + around(want, got));
	}
	if (!byName.size) return null;
	return [...byName].map(([n, c]) => `${n}: ${c} different`).join(", ") + "\n" + examples.join("\n");
}

//The two serialized results around their first different character
function around(want: string, got: string): string {
	let d = 0;
	while (d < want.length && want[d] === got[d]) d++;
	const from = Math.max(0, d - 150);
	const cut = (t: string) => (from > 0 ? "…" : "") + t.slice(from, d + 150) + (t.length > d + 150 ? "…" : "");
	return `    expected ${cut(want)}\n    actual   ${cut(got)}`;
}

function firstDifference(expected: ContractFixture["results"], actual: ContractFixture["results"]): string {
	for (let i = 0; i < Math.min(expected.length, actual.length); i++)
		if (expected[i][0] !== actual[i][0] || expected[i][1] !== actual[i][1])
			return `, first different call #${i}: expected ${expected[i][0]} (${expected[i][1]}), actual ${actual[i][0]} (${actual[i][1]})`;
	return "";
}
