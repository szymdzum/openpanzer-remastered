// @vitest-environment node
//The mirror one way (#376): the game's objects are a copy of its world for the old UI and the harness.
//What is written into them never reaches the game: the next step starts from the world kept; and what the
//selection did to a unit itself (a unit left while disembarking put back on its carrier) is the game's
//embark now. On a small map built by hand (test/smallgame.ts), the world kept as on the page (the
//small game's other tests write into the objects by hand, as the harness does)
import { afterEach, beforeEach, expect, test } from "vitest";
import { backAboard, Commands } from "../src/commands";
import { engineContext, setEngineContext } from "../src/context";
import { mirrorOptions, worldOf } from "../src/mirror";
import { MapSelection } from "../src/selection";
import { adjacent } from "../src/core/geometry";
import { classicRules } from "../src/core/rules";
import { computeSight } from "../src/core/sight";
import type { GameMap } from "../src/map";
import type { Scenario } from "../src/scenario";
import type { SavedGame } from "../src/core/state";
import { smallGame, smallGameData, smallGameUnits } from "./smallgame";

const JU52 = 176; //a German air transport

let scenario: Scenario, map: GameMap;
const defaultContext = engineContext, defaultAboard = MapSelection.backAboard;
const options = { ...mirrorOptions };

//The small game with the world kept, the selection putting a unit back aboard as the game's does
function setup(saved?: SavedGame) {
	({ scenario, map } = saved === undefined ? smallGame() : smallGame(smallGameUnits, saved));
	mirrorOptions.cache = true;
	MapSelection.backAboard = (u) => backAboard(scenario, u.id);
}
beforeEach(() => setup());
afterEach(() => {
	setEngineContext(defaultContext);
	MapSelection.backAboard = defaultAboard;
	Object.assign(mirrorOptions, options);
});

const world = () => worldOf(scenario, null, { spotSide: 0, noFOW: false, rules: classicRules });

//The German infantry at 3,3 on a Ju 52 (in the hex's air slot), disembarking when carrier is negative;
//with blocked, German infantry on every hex around it
function carried(carrier: number, blocked: boolean): SavedGame {
	const around = blocked ? adjacent(3, 3).map((c): [number, number, number, number] => [115, 0, c.row, c.col]) : [];
	const units = [smallGameUnits[0], ...around, ...smallGameUnits.slice(4)];
	const saved = smallGameData(units);
	const hex = saved.state.map.hexes[3 * saved.state.map.cols + 3];
	saved.state.map.hexes[3 * saved.state.map.cols + 3] = { ...hex, unit: null, air: 0 };
	saved.state.units[0] = { ...saved.state.units[0], carrier };
	return saved;
}

test("What is written into the game's objects reaches no step: the step starts from the game's world (#376)", () => {
	const written = map.getUnits()[1], strength = written.strength;
	const mover = map.getUnits()[0], to = { row: 2, col: 3 };
	world(); //(the game started: its world kept)
	written.strength = 3;
	//(the tests and the dev server throw where something wrote into the objects without saying so)
	expect(() => Commands.execute(scenario, { type: "move", unit: mover.id, to })).toThrow(/outside a step/);
	mirrorOptions.checks = false;
	expect(Commands.execute(scenario, { type: "move", unit: mover.id, to }).ok).toBe(true);
	expect(world().state.units[1].strength).toBe(strength);
	expect(written.strength, "the objects mirror the world again").toBe(strength);
	expect(mover.getPos()).toEqual(to);
});

test("A unit the selection leaves while disembarking goes back aboard by the game's embark (#376)", () => {
	setup(carried(JU52, false));
	const para = map.getUnitById(0);
	expect(Commands.execute(scenario, { type: "disembark", unit: para.id })).toEqual({ ok: true, result: true });
	expect(world().state.units[0].carrier).toBe(-JU52);
	//Selected again, it shows where it can land and stays disembarking
	map.selectUnit(para);
	expect(map.getCurrentMoveRange().map((c) => [c.row, c.col])).toEqual(adjacent(3, 3).map((c) => [c.row, c.col]));
	expect(world().state.units[0].carrier).toBe(-JU52);
	const counters = JSON.stringify(map.getVisibility().counters);
	map.delCurrentUnit();
	const w = world();
	expect(w.state.units[0].carrier).toBe(JU52);
	expect(para.carrier).toBe(JU52);
	expect(w.sight).toEqual(computeSight(w));
	//(the hexes' counters stay as the old selection's flip left them, until the next command)
	expect(JSON.stringify(map.getVisibility().counters)).toBe(counters);
});

test("A disembarking unit selected with nowhere left to land goes back aboard by the game's embark (#376)", () => {
	setup(carried(-JU52, true));
	const para = map.getUnitById(0);
	expect(world().state.units[0].carrier).toBe(-JU52);
	map.selectUnit(para);
	expect(world().state.units[0].carrier).toBe(JU52);
	expect(para.carrier).toBe(JU52);
	expect(map.currentUnit).toBe(para);
	//(aboard, it shows its move hexes as the carrier's)
	expect(map.getCurrentMoveRange().length).toBeGreaterThan(0);
});
