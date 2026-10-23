//The AI plans a turn where it used to throw: an exception in the AI's planning was thrown inside
//Map.endTurn, and the game hung on that turn (#80). On the small game built by hand, then on the
//scenarios of the issues, with the core's AI (src/core/ai.ts)
import { expect, test } from "vitest";
import { aiController } from "../src/core/ai";
import { type AIPlan, cellScore } from "../src/core/aiscore";
import { createWorld } from "../src/core/create";
import { newGame } from "../src/core/newgame";
import type { World } from "../src/core/types";
import { Equipment } from "../src/equipment";
import { aiDefaultConfig, unitClass } from "../src/prototypes";
import type { SavedGame } from "../src/state";
import { setupOf } from "./corefiles";
import { smallGameData } from "./smallgame";

const at = (saved: SavedGame, row: number, col: number) => saved.state.map.hexes[row * saved.state.map.cols + col];

const worldOf = (saved: SavedGame) => createWorld(saved, Equipment.equipment);

//A victory hex keeps owner -1 when the scenario gives it none (#100): it counts as nobody's, so the
//AI scores it as an objective that isn't its own, like the enemy's
test("The AI scores a victory hex with no owner as one that isn't its own (#100)", () => {
	const saved = smallGameData();
	const infantry = saved.state.units.find((u) => u.row === 7 && u.col === 7)!; //the AI's (side 1)
	at(saved, 7, 6).victorySide = 1; //next to it
	const plan: AIPlan = { enemyUnits: new Map(), takenPositions: [], freedPositions: [], objectives: [] };
	//A constant random factor of 1
	const config = { ...aiDefaultConfig, randomFactor: aiDefaultConfig.randomFactor.map(() => 1) };
	const scoreWithOwner = (owner: number) => {
		at(saved, 7, 6).owner = owner;
		const s = { w: worldOf(saved), player: 1, config, plan, rng: { state: 1 } };
		return cellScore(s, infantry, { row: 7, col: 7 }, true);
	};
	const enemys = scoreWithOwner(0), ours = scoreWithOwner(1);
	expect(scoreWithOwner(-1)).toBe(enemys);
	//Infantry next to an objective to take scores 100, next to one of its own 70
	expect(enemys - ours).toBe(30);
});

//The orders the AI of player gives on its first turn of w
function firstOrders(w: World, player: number) {
	const ai = aiController(player, {});
	ai.join(w);
	const planned = ai.plan(ai.startTurn(w).world);
	const orders = [];
	for (let o = ai.next(planned); o !== null; o = ai.next(planned)) orders.push(o);
	return orders;
}

test("The AI plans its turn with units on and next to victory hexes with no owner (#100, #110)", () => {
	const saved = smallGameData();
	for (const [row, col] of [[7, 7], [7, 6], [8, 7]]) {
		at(saved, row, col).victorySide = 0;
		at(saved, row, col).owner = -1;
	}
	expect(firstOrders(worldOf(saved), 1).length).toBeGreaterThan(0);
});

//The units the AI buys at the start of its turn on the small game, with 3000 prestige and its ground
//purchases cycling through classes, and where its stream is after (how many numbers it drew)
function purchases(groundPurchaseClasses: number[]) {
	const saved = smallGameData();
	saved.state.scenario.date = "1943-07-01T00:00:00.000Z";
	saved.state.players[1].prestige = 3000;
	saved.state.turn.currentPlayer = 1;
	const ai = aiController(1, { config: { ...aiDefaultConfig, groundPurchaseClasses } });
	const w = worldOf(saved);
	ai.join(w);
	const played = ai.startTurn(w);
	return { commands: played.commands, ai: played.world.state.rng!.ai };
}

//The equipment index has no list for a class the country has none of (#101): the purchase moves on
//to the next class without a draw, as when nothing of the class is affordable
test("The AI's purchase skips a class its country has no equipment of (#101)", () => {
	const bought = purchases(aiDefaultConfig.groundPurchaseClasses);
	expect(bought.commands.length).toBeGreaterThan(0);
	//The Soviet Union has no battleship
	expect(purchases([unitClass.battleship, ...aiDefaultConfig.groundPurchaseClasses])).toEqual(bought);
});

//Starts file and has the AI of each of its players plan its first turn; the players that planned
function planEveryPlayer(file: string) {
	const setup = setupOf(file, { game: 1, ai: 1 });
	const w = createWorld(newGame(setup), setup.equipment);
	return w.state.players.map((p) => (firstOrders(w, p.id), p.id));
}

//The scenarios with victory hexes that have no owner
test.each(["it22ligh.xml", "lah_it_10.xml", "lah_it_charn.xml", "pc1bat3.xml", "pc1hong.xml", "pc1kok2.xml",
	"pc1lin4.xml", "pc1manr.xml", "pc1pata.xml", "pc1sel2.xml", "pc1sthm.xml"])(
	"The AI plans a turn on %s, which has victory hexes with no owner (#100)", (file) => {
		expect(planEveryPlayer(file).length).toBeGreaterThan(1);
	});

//Its side 1 has no equipment of a class the AI buys (#101), besides victory hexes with no owner
test("The AI plans a turn on pc1100r.xml, where a country has no equipment of a class it buys (#101)", () => {
	expect(planEveryPlayer("pc1100r.xml")).toEqual([0, 1]);
});
