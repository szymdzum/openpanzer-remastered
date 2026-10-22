//The AI plans a turn where it used to throw: an exception in the AI's planning is thrown inside
//Map.endTurn, and the game hangs on that turn (#80). On the small game built by hand, then on the
//scenarios of the issues
import { expect, test } from "vitest";
import { AI, type AIPlan, aiDefaultConfig, createAIEvaluator } from "../src/ai";
import { freshGame, mulberry32, startState } from "./lifecycle";
import { smallGame } from "./smallgame";

//A victory hex keeps owner -1 when the scenario gives it none (#100): Map.setHex counts it as
//nobody's, so the AI scores it as an objective that isn't its own, like the enemy's
test("The AI scores a victory hex with no owner as one that isn't its own (#100)", () => {
	const { map, players } = smallGame();
	const infantry = map.map[7][7].unit!; //the AI's (side 1)
	map.map[7][6].victorySide = 1; //next to it
	const plan: AIPlan = { enemyUnits: {}, takenPositions: [], freedPositions: [], defendObjectives: [], objectives: [] };
	//A constant rng: the score's random factor is 1
	const evaluator = createAIEvaluator(players[1], map, plan, aiDefaultConfig, () => 0.5);
	const scoreWithOwner = (owner: number) => {
		map.map[7][6].owner = owner;
		return evaluator.getCellScore(infantry, { row: 7, col: 7, canMove: true });
	};
	const enemys = scoreWithOwner(0), ours = scoreWithOwner(1);
	expect(scoreWithOwner(-1)).toBe(enemys);
	//Infantry next to an objective to take scores 100, next to one of its own 70
	expect(enemys - ours).toBe(30);
});

test("The AI plans its turn with units on and next to victory hexes with no owner (#100, #110)", () => {
	const { map, players } = smallGame();
	for (const [row, col] of [[7, 7], [7, 6], [8, 7]]) {
		map.map[row][col].victorySide = 0;
		map.setHex(row, col);
	}
	const ai = new AI(players[1], map, { rng: mulberry32(3) });
	ai.buildActions();
	expect(ai.getAction()).not.toBeNull();
});

//Loads file and has the AI plan the turn of each of its players, as at the start of the scenario
async function planEveryPlayer(file: string) {
	const game = await freshGame();
	const scenario = await startState(game, file);
	const { AI: FreshAI } = await import("../src/ai"); //the game's modules, loaded again by freshGame
	const planned: number[] = [];
	for (const player of scenario.map.getPlayers()) {
		const ai = new FreshAI(player, scenario.map, { rng: mulberry32(1) });
		ai.buildActions();
		planned.push(player.id);
	}
	return planned;
}

//The scenarios with victory hexes that have no owner (pc1100r too, with #101)
test.each(["it22ligh.xml", "lah_it_10.xml", "lah_it_charn.xml", "pc1bat3.xml", "pc1hong.xml", "pc1kok2.xml",
	"pc1lin4.xml", "pc1manr.xml", "pc1pata.xml", "pc1sel2.xml", "pc1sthm.xml"])(
	"The AI plans a turn on %s, which has victory hexes with no owner (#100)", async (file) => {
		expect((await planEveryPlayer(file)).length).toBeGreaterThan(1);
	});
