//Unit.move with a transport that uses no fuel (a horse-drawn wagon): the contracts reach this case
//only when their random play happens to, so it is pinned here
import { expect, test } from "vitest";
import { restoreState, readFixture } from "./contracts";

test("A unit moved on a transport that uses no fuel spends no fuel", async () => {
	const scenario = await restoreState(readFixture("engine", "ruscam09-t0.json.gz").state);
	const { Equipment } = await import("../src/equipment");
	const { GameRules } = await import("../src/gamerules");
	const { Transport } = await import("../src/unit");
	const eqid = Object.keys(Equipment.equipment).map(Number).find((id) => Equipment.equipment[id].fuel === 0)!;
	const unit = scenario.map.getUnits().find((u) => GameRules.unitUsesFuel(u))!;
	unit.transport = new Transport(eqid);
	unit.isMounted = true;
	const [fuel, transportFuel] = [unit.fuel, unit.transport.fuel];
	unit.move(3);
	expect(GameRules.unitUsesFuel(unit.transport)).toBe(false);
	expect([unit.fuel, unit.transport.fuel]).toEqual([fuel, transportFuel]);
	expect([unit.moveLeft, unit.hasFired]).toEqual([0, true]);
});
