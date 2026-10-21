//Runs a contract (test/contracts/<module>.contract.js) on this repo's modules, on a game state
//recorded on the reference, and compares every result with the recorded one
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { vi } from "vitest";

export interface ContractFixture
{
	file: string;
	turns: number;
	fuzzRounds: number;
	state: string; //GameState.exportGameState() of the reference
	results: [string, string, string][]; //[call name, context, serialized result]
}

export const contractDir = (module: string) => path.join(__dirname, "contracts", module);

export function fixtures(module: string): string[]
{
	return fs.readdirSync(contractDir(module)).filter((f) => f.endsWith(".json.gz")).sort();
}

export function readFixture(module: string, name: string): ContractFixture
{
	return JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(contractDir(module), name))).toString("utf8"));
}

//The contract's run function: the file is a plain script shared with the recorder
export function contract<T>(module: string, run: string): T
{
	const src = fs.readFileSync(path.join(__dirname, "contracts", module + ".contract.js"), "utf8");
	return new Function(src + "\nreturn " + run + ";")() as T;
}

//Fresh modules (Equipment keeps what it loaded), then the state restored the way the recorder
//restored it: GameState.restoreFromString into the game, which builds no UI (setupGameState)
export async function restoreState(state: string)
{
	vi.resetModules();
	const { GameState } = await import("../src/gamestate");
	type GameStateConstructor = import("../src/gamestate").GameStateConstructor;
	const { game } = await import("../src/game");
	const loaded = new Promise<void>((resolve) => { game.setupGameState = resolve; });
	game.cleanup = () => {};
	new (GameState as unknown as GameStateConstructor)(game).restoreFromString(state);
	await loaded;
	return game.scenario;
}

//Mismatches, grouped by call name, the first few of each in full
export function compareResults(expected: ContractFixture["results"], actual: ContractFixture["results"]): string | null
{
	if (expected.length !== actual.length)
		return `${actual.length} calls instead of ${expected.length}` + firstDifference(expected, actual);
	const byName = new Map<string, number>();
	const examples: string[] = [];
	for (let i = 0; i < expected.length; i++)
	{
		const [name, context, want] = expected[i], got = actual[i][2];
		if (want === got) continue;
		byName.set(name, (byName.get(name) || 0) + 1);
		if (examples.length < 5)
			examples.push(`#${i} ${name} (${context})\n    expected ${want.slice(0, 300)}\n    actual   ${got.slice(0, 300)}`);
	}
	if (!byName.size) return null;
	return [...byName].map(([n, c]) => `${n}: ${c} different`).join(", ") + "\n" + examples.join("\n");
}

function firstDifference(expected: ContractFixture["results"], actual: ContractFixture["results"]): string
{
	for (let i = 0; i < Math.min(expected.length, actual.length); i++)
		if (expected[i][0] !== actual[i][0] || expected[i][1] !== actual[i][1])
			return `, first different call #${i}: expected ${expected[i][0]} (${expected[i][1]}), actual ${actual[i][0]} (${actual[i][1]})`;
	return "";
}
