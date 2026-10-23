//Undo: what the player gets back and what stays the same after a move is taken back
import { expect, test } from "vitest";
import { readFixture, restoreState } from "./contracts";

//#68: undo restored the unit with a detached copy of its player, so what the unit spent or earned
//afterwards went to the copy (a free reinforcement, here)
test("After an undo the unit still belongs to its player, and a reinforcement costs that player (#68)", async () => {
	const scenario = await restoreState(readFixture("engine", "ruscam09-t2.json.gz").state);
	const { GameRules } = await import("../src/gamerules");
	const { playerType } = await import("../src/prototypes");
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
