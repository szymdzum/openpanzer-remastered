//GameMap's parts (MapVisibility, MapBoard, MapSelection, UndoSlot): a hex's counters keep their
//arithmetic, off with nothing on stays at 0, and the edges of the selection and the lookups. (The
//map's and the hexes' own data fields were pinned here while the save was the JSON of the objects;
//since #128 it is toData's state, src/app/save.ts)
import { expect, test } from "vitest";
import { fixtures, readFixture, restoreState } from "./contracts";
import { smallGame } from "./smallgame";

//No describe block: Stryker's Vitest runner picks tests by name and misses names inside one
test("a hex counter doesn't go below 0", async () => {
	const scenario = await restoreState(readFixture("engine", fixtures("engine")[0]).state);
	const { uiSettings } = await import("../src/app/settings");
	const noFOW = uiSettings.noFOW;
	uiSettings.noFOW = false;
	const h = scenario.map.map[0][0];
	let n = 0;
	while (h.isZOC(1) && n < 100) { h.setZOC(1, false); n++; }
	h.setZOC(1, false);
	expect(h.isZOC(1)).toBe(false);
	h.setZOC(1, true);
	expect(h.isZOC(1)).toBe(true);
	h.setZOC(1, false);
	expect(h.isZOC(1)).toBe(false);
	while (h.isSpotted(0) && n < 200) { h.setSpotted(0, false); n++; }
	h.setSpotted(0, false);
	h.setSpotted(0, true);
	expect(h.isSpotted(0)).toBe(true);
	h.setSpotted(0, false);
	expect(h.isSpotted(0)).toBe(false);
	uiSettings.noFOW = noFOW;
});

test("the selection takes only a unit of the current player", async () => {
	const scenario = await restoreState(readFixture("engine", fixtures("engine")[0]).state);
	const m = scenario.map;
	const own = m.getUnits().find((u) => u.player.id === m.currentPlayer.id)!;
	const other = m.getUnits().find((u) => u.player.id !== m.currentPlayer.id)!;
	expect(m.selectUnit(null)).toBe(false);
	expect(m.selectUnit(other)).toBe(false);
	expect(m.currentUnit).not.toBe(other);
	expect(m.selectUnit(own)).toBe(true);
	expect(m.currentUnit).toBe(own);
});

test("copying no player changes nothing", async () => {
	const scenario = await restoreState(readFixture("engine", fixtures("engine")[0]).state);
	const p = scenario.map.getPlayers()[0];
	const before = JSON.stringify(p);
	expect(p.copy(null)).toBeUndefined();
	expect(JSON.stringify(p)).toBe(before);
});

test("looking up a unit id that isn't on the map gives null", async () => {
	const scenario = await restoreState(readFixture("engine", fixtures("engine")[0]).state);
	expect(scenario.map.getUnitById(-1)).toBeNull();
	expect(scenario.map.getUnitById(1e6)).toBeNull();
	expect(scenario.map.getPlayers()[0].addCoreUnit(null)).toBe(false);
});

test("an enemy on a hex the attacker's side doesn't spot can be attacked only after it fired from hiding", async () => {
	const scenario = await restoreState(readFixture("engine", fixtures("engine")[0]).state);
	const { uiSettings } = await import("../src/app/settings");
	const { GameRules } = await import("../src/gamerules");
	const noFOW = uiSettings.noFOW;
	uiSettings.noFOW = false;
	const units = scenario.map.getUnits();
	const atk = units.find((u) => u.player.id === scenario.map.currentPlayer.id && units.some((t) => GameRules.canInitiateAttack(u, t)))!;
	const target = units.find((t) => t.player.side !== atk.player.side && GameRules.canInitiateAttack(atk, t))!;
	const h = scenario.map.map[target.getPos().row][target.getPos().col];
	for (let n = 0; h.isSpotted(atk.player.side) && n < 100; n++) h.setSpotted(atk.player.side, false);
	const airMode = target === h.airunit;
	target.tempSpotted = false;
	expect(h.getAttackableUnit(atk, airMode)).toBeNull();
	target.tempSpotted = true;
	expect(h.getAttackableUnit(atk, airMode)).toBe(target);
	uiSettings.noFOW = noFOW;
});

//A Me-109 over an infantry: the hex lets go of the aircraft by its id, the infantry stays
test("taking an aircraft off a hex leaves the ground unit under it", () => {
	const { map } = smallGame([[115, 0, 3, 3], [159, 0, 3, 3], [504, 1, 7, 7]]);
	const h = map.map[3][3];
	h.delUnit(h.airunit!);
	expect(h.airunit).toBeNull();
	expect(h.unit!.id).toBe(0);
});
