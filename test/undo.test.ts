//Undo: what the player gets back and what stays the same after a move is taken back
import { expect, test } from "vitest";
import { readFixture, restoreState } from "./contracts";

//#68: undo restored the unit with a detached copy of its player, so what the unit spent or earned
//afterwards went to the copy (a free reinforcement, here)
test("After an undo the unit still belongs to its player, and a reinforcement costs that player (#68)", async () => {
	const scenario = await restoreState(readFixture("engine", "ruscam09-t2.json.gz").state);
	const { GameRules } = await import("../src/gamerules");
	const { playerType } = await import("../src/core/tables");
	const { Commands } = await import("../src/commands");
	(await import("../src/mirror")).mirrorOptions.cache = false; //(the strength written by hand below)
	const map = scenario.map;
	const player = map.currentPlayer;
	player.type = playerType.humanLocal;

	//A unit of the player on the move whose first move can be undone (it spots nothing new), and
	//which can reinforce when it's down to 5
	let unit: import("../src/unit").Unit | null = null;
	for (const u of map.getUnits().filter((x) => x.player === player && !x.hasMoved && x.getHex())) {
		const cell = GameRules.getMoveRange(map, u)[0];
		if (!cell) continue;
		map.selectUnit(u);
		Commands.execute(scenario, { type: "move", unit: u.id, to: { row: cell.row, col: cell.col } });
		if (!map.canUndoMove(u)) continue;
		Commands.execute(scenario, { type: "undo", unit: u.id });
		expect(u.player).toBe(player);
		const strength = u.strength;
		u.strength = 5;
		if (GameRules.canReinforce(map.map, u)) { unit = u; break; }
		u.strength = strength;
	}
	expect(unit, "a unit whose move can be undone and which can reinforce").not.toBeNull();

	const prestige = player.prestige;
	const r = Commands.execute(scenario, { type: "reinforce", unit: unit!.id });
	expect(r.ok && r.result.strength).toBeGreaterThan(0);
	expect(player.prestige).toBeLessThan(prestige);
});

//A German infantry (115, spotting 2 hexes) two hexes from a Polish gun (264) it sees, on a hand-built
//map: it moves out of sight of the gun, then the move is taken back. The gun is as it was, seen but not
//marked as having shown itself. The original's undo moved the unit back as a move, so its spotting
//marked every enemy unit around its old hex as seen until the round's end, as if they had fired: they
//stayed visible and attackable through the fog (#140)
test("An undo leaves the enemy units the unit sees again as they were, not marked seen (#140)", async () => {
	const { handWorld } = await import("./coreworld");
	const { classicRules, remasterRules } = await import("../src/core/rules");
	const { step } = await import("../src/core/step");
	const { isSpotted, unitById } = await import("../src/core/world");
	for (const rules of [classicRules, remasterRules]) {
		const w = handWorld({ rows: 8, cols: 8, units: [
			{ eqid: 115, owner: 0, row: 3, col: 4 },
			{ eqid: 264, owner: 1, row: 3, col: 6 },
		] }, undefined, { rules });
		expect(isSpotted(w, 3 * 8 + 6, 0)).toBe(true);
		const moved = step(w, { type: "move", unit: 0, to: { row: 3, col: 1 } });
		if (moved.ok === false) throw new Error(moved.refusal.reason);
		expect(isSpotted(moved.world, 3 * 8 + 6, 0)).toBe(false);
		expect(moved.world.state.turn.undoable).not.toBeNull();
		const undone = step(moved.world, { type: "undo", unit: 0 });
		if (undone.ok === false) throw new Error(undone.refusal.reason);
		expect(isSpotted(undone.world, 3 * 8 + 6, 0), rules.name).toBe(true);
		expect(unitById(undone.world, 1), rules.name).toEqual(unitById(w, 1));
		expect(undone.world.state.units, rules.name).toEqual(w.state.units);
	}
});

//A German infantry on a hand-built map takes the second of Germany's three objectives, all Polish, then
//the move is taken back: the objective is back in its place in Germany's list, which an AI player of the
//side follows in its order. The original's undo put it at the end (#141)
test("An undo puts a captured objective back in its place in its side's list (#141)", async () => {
	const { handWorld, germanyPoland } = await import("./coreworld");
	const { createWorld } = await import("../src/core/create");
	const { classicRules, remasterRules } = await import("../src/core/rules");
	const { step } = await import("../src/core/step");
	for (const rules of [classicRules, remasterRules]) {
		const hand = handWorld({ rows: 8, cols: 8, units: [{ eqid: 115, owner: 0, row: 3, col: 4 }, { eqid: 264, owner: 1, row: 7, col: 7 }] },
			undefined, { rules });
		const saved = structuredClone({ data: hand.data, state: hand.state });
		const objectives = [{ row: 1, col: 1 }, { row: 3, col: 2 }, { row: 6, col: 6 }];
		for (const o of objectives) Object.assign(saved.state.map.hexes[o.row * 8 + o.col], { owner: 1, flag: 15, victorySide: 0 });
		saved.state.objectives = [objectives, []];
		const w = createWorld(saved, germanyPoland, { rules });
		const moved = step(w, { type: "move", unit: 0, to: { row: 3, col: 2 } });
		if (moved.ok === false) throw new Error(moved.refusal.reason);
		expect(moved.world.state.objectives, rules.name).toEqual([[objectives[0], objectives[2]], [objectives[1]]]);
		const undone = step(moved.world, { type: "undo", unit: 0 });
		if (undone.ok === false) throw new Error(undone.refusal.reason);
		expect(undone.world.state.objectives, rules.name).toEqual([objectives, []]);
		expect(undone.world.state.map.hexes, rules.name).toEqual(w.state.map.hexes);
	}
});
