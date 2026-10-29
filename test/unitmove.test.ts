//A move on a transport that uses no fuel (a horse-drawn wagon): the contracts reach this case only
//when their random play happens to, so it is pinned here, played as the game plays a move
import { expect, test } from "vitest";
import { restoreState, readFixture } from "./contracts";

test("A unit moved on a transport that uses no fuel spends no fuel", async () => {
	const scenario = await restoreState(readFixture("engine", "ruscam09-t2.json.gz").state);
	const { Equipment } = await import("../src/legacy/equipment");
	const { GameRules } = await import("../src/legacy/gamerules");
	const { Transport } = await import("../src/legacy/unit");
	const { Commands } = await import("../src/legacy/commands");
	const m = scenario.map;
	const eqid = Object.keys(Equipment.equipment).map(Number).find((id) => Equipment.equipment[id].fuel === 0)!;
	const unit = m.getUnits().find((u) => u.player === m.currentPlayer && u.getPos() && !u.hasMoved && GameRules.unitUsesFuel(u))!;
	unit.transport = new Transport(eqid);
	unit.isMounted = true;
	const [fuel, transportFuel] = [unit.fuel, unit.transport.fuel];
	const to = GameRules.getMoveRange(m, unit).find((c) => c.canMove && !m.map[c.row][c.col].unit)!;
	expect(Commands.execute(scenario, { type: "move", unit: unit.id, to: { row: to.row, col: to.col } }).ok).toBe(true);
	expect(GameRules.unitUsesFuel(unit.transport)).toBe(false);
	expect([unit.fuel, unit.transport.fuel]).toEqual([fuel, transportFuel]);
	//(a mounted unit spends all its move points and can't fire after)
	expect([unit.moveLeft, unit.hasFired]).toEqual([0, true]);
});
