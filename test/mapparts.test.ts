//GameMap's parts (MapVisibility, MapBoard, MapSelection, UndoSlot) stay out of the saved game: the
//map's and the hexes' own data fields, in the order they are saved, are the ones the game always
//had. And a hex's counters keep their arithmetic: off with nothing on stays at 0. The harness and
//the engine contract compare toData (src/state.ts) since #127, not these fields; the save is still
//the JSON of the objects until #128, so their fields and order stay pinned here until then
import { expect, test } from "vitest";
import { fixtures, readFixture, restoreState } from "./contracts";

const dataKeys = (o: object) => Object.keys(o).filter((k) => typeof (o as Record<string, unknown>)[k] !== "function");

//No describe block: Stryker's Vitest runner picks tests by name and misses names inside one
test.each(fixtures("engine"))("the map and hex data fields of %s", async (name) => {
	const scenario = await restoreState(readFixture("engine", name).state);
	const m = scenario.map;
	expect(dataKeys(m)).toEqual(["rows", "cols", "isLastRowPartial", "isLastColPartial", "map", "terrainImage",
		"victoryTurns", "maxTurns", "turn", "currentUnit", "sidesVictoryHexes", "currentPlayer", "name"]);
	expect(dataKeys(m.map[0][0])).toEqual(["unit", "airunit", "terrain", "road", "owner", "flag", "isDeployment",
		"victorySide", "name", "isMoveSel", "isAttackSel"]);
});

test("a hex counter doesn't go below 0", async () => {
	const scenario = await restoreState(readFixture("engine", fixtures("engine")[0]).state);
	const { uiSettings } = await import("../src/prototypes");
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
