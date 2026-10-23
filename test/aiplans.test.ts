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
import { distance } from "../src/core/geometry";
import { step } from "../src/core/step";
import { setupOf } from "./corefiles";
import { handWorld } from "./coreworld";
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

//A Me-109 over a fortress on an objective of its side, an infantry next to it: the fighter flies off,
//which frees the air above the hex, not the ground the fortress keeps. The infantry stays off it, and
//every order played leaves each unit on its hex
test("The AI doesn't plan a unit onto a hex its own unit of the same kind keeps: an aircraft leaving frees only the air (#74)", () => {
	const ME_109 = 159, FESTUNG = 107, INFANTERIE = 115, TP7 = 273;
	let w = handWorld({ rows: 10, cols: 10, units: [
		{ eqid: ME_109, owner: 0, row: 4, col: 4 },
		{ eqid: FESTUNG, owner: 0, row: 4, col: 4 },
		{ eqid: INFANTERIE, owner: 0, row: 4, col: 5 },
		{ eqid: TP7, owner: 1, row: 8, col: 8 },
	] });
	w.state.rng = { game: 1, ai: 1 };
	w.state.map.hexes[4 * 10 + 4].victorySide = 0;
	w.state.objectives[0].push({ row: 4, col: 4 });
	const orders = firstOrders(w, 0).map((o) => "command" in o ? o.command : null);
	expect(orders).toContainEqual({ type: "move", unit: 0, to: { row: 4, col: 5 } }); //the fighter leaves
	expect(orders).not.toContainEqual(expect.objectContaining({ type: "move", unit: 2, to: { row: 4, col: 4 } }));
	for (const cmd of orders) {
		const r = cmd === null ? null : step(w, cmd);
		if (r !== null && r.ok) w = r.world;
	}
	for (const u of w.state.units) {
		const h = w.state.map.hexes[u.row * 10 + u.col];
		expect([h.unit, h.air], "unit " + u.id).toContain(u.id);
	}
});

//A Me-109 over a fortress on an objective of its side, ordered off: the plan frees the air above the
//hex, and the fortress stays. An infantry next to the hex counts it as a friend that stays, and a Ju-52
//scored over the objective finds its ground held, as when the fighter wasn't ordered anywhere
test("The AI scores the ground unit under an aircraft ordered away as staying: a freed hex is freed for the slot that left (#207)", () => {
	const ME_109 = 159, FESTUNG = 107, INFANTERIE = 115, JU_52 = 176, TP7 = 273;
	const w = handWorld({ rows: 10, cols: 10, units: [
		{ eqid: ME_109, owner: 0, row: 4, col: 4 },
		{ eqid: FESTUNG, owner: 0, row: 4, col: 4 },
		{ eqid: INFANTERIE, owner: 0, row: 4, col: 6 },
		{ eqid: JU_52, owner: 0, row: 2, col: 2 },
		{ eqid: TP7, owner: 1, row: 8, col: 8 },
	] });
	w.state.map.hexes[4 * 10 + 4].victorySide = 0;
	//A constant random factor of 1
	const config = { ...aiDefaultConfig, randomFactor: aiDefaultConfig.randomFactor.map(() => 1) };
	const score = (unit: number, row: number, col: number, freed: AIPlan["freedPositions"]) => {
		const plan: AIPlan = { enemyUnits: new Map(), takenPositions: [], freedPositions: freed, objectives: [] };
		return cellScore({ w, player: 0, config, plan, rng: { state: 1 } }, w.state.units[unit], { row, col }, true);
	};
	const fighterLeaves = [{ row: 4, col: 4, air: true }];
	expect(score(2, 4, 5, fighterLeaves)).toBe(score(2, 4, 5, []));
	expect(score(3, 4, 4, fighterLeaves)).toBe(score(3, 4, 4, []));
	//When the fortress is the one leaving, its neighbour and the objective count it gone
	const fortressLeaves = [{ row: 4, col: 4, air: false }];
	expect(score(2, 4, 5, fortressLeaves)).toBe(score(2, 4, 5, []) + 20);
	expect(score(3, 4, 4, fortressLeaves)).toBe(score(3, 4, 4, []) + 300);
});

//Plays the orders the AI of player gives on its turn of w, and its turn's end; the world after and
//the commands it sent
function aiTurn(w: World, player: number) {
	const ai = aiController(player, {});
	ai.join(w);
	w = ai.plan(ai.startTurn(w).world);
	const commands = [];
	for (let o = ai.next(w); o !== null; o = ai.next(w)) {
		if (!("command" in o)) continue;
		commands.push(o.command);
		const r = step(w, o.command);
		if (r.ok) w = r.world;
	}
	const ended = step(w, { type: "endTurn" });
	return { world: ended.ok ? ended.world : w, commands };
}

//A towed howitzer with its half-track, an objective ten hexes away: the gun can't move on its own
//(a towed unit with a transport has no move range unmounted), so the AI mounts it and drives it on.
//Mounted it can't fire that turn, so it plans no attack after the move. Two turns get it next to the
//objective, the infantry walking behind
test("The AI mounts a towed gun on its transport to move it toward its objective (#82)", () => {
	const LEFH18 = 92, SDKFZ7 = 2403, INFANTERIE = 115, TP7 = 273;
	let w = handWorld({ rows: 10, cols: 14, units: [
		{ eqid: LEFH18, owner: 0, row: 4, col: 1, transport: { eqid: SDKFZ7, ammo: 0, fuel: 60 } },
		{ eqid: INFANTERIE, owner: 0, row: 6, col: 1 },
		{ eqid: TP7, owner: 1, row: 0, col: 13 },
	] });
	w.state.rng = { game: 1, ai: 1 };
	w.state.map.hexes[4 * 14 + 11].victorySide = 0;
	w.state.objectives[0].push({ row: 4, col: 11 });
	const near = () => distance(w.state.units[0].row, w.state.units[0].col, 4, 11);
	const first = aiTurn(w, 0);
	const mount = first.commands.findIndex((c) => c.type === "mount" && c.unit === 0);
	expect(mount).toBeGreaterThanOrEqual(0);
	expect(first.commands[mount + 1]).toMatchObject({ type: "move", unit: 0 });
	expect(first.commands).not.toContainEqual(expect.objectContaining({ type: "attack", unit: 0 }));
	w = first.world;
	expect(near()).toBeLessThan(10);
	expect(w.state.units[0].isMounted).toBe(true); //until the round ends
	w = aiTurn(w, 1).world; //the round ends: off its transport again
	expect(w.state.units[0].isMounted).toBe(false);
	w = aiTurn(w, 0).world;
	expect(near()).toBeLessThanOrEqual(1);
});

//An anti-tank gun with its half-track and a 7TP it sees (it fired) on the way to the objective: the gun
//would like to stand next to the tank, but not in its truck, which it stays in until the round ends
test("The AI doesn't drive a unit in its transport next to an enemy it sees (#82)", () => {
	const PAK40 = 78, SDKFZ7 = 2403, TP7 = 273;
	const w = handWorld({ rows: 10, cols: 14, units: [
		{ eqid: PAK40, owner: 0, row: 4, col: 1, transport: { eqid: SDKFZ7, ammo: 0, fuel: 60 } },
		{ eqid: TP7, owner: 1, row: 4, col: 6, tempSpotted: true },
	] });
	w.state.rng = { game: 1, ai: 1 };
	w.state.map.hexes[4 * 14 + 11].victorySide = 0;
	w.state.objectives[0].push({ row: 4, col: 11 });
	const moves = aiTurn(w, 0).commands.filter((c) => c.type === "move");
	expect(moves).toHaveLength(1);
	const to = moves[0].type === "move" ? moves[0].to : null;
	expect(distance(to!.row, to!.col, 4, 6)).toBeGreaterThan(1);
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
