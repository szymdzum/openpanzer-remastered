// @vitest-environment node
//The new UI's view model (src/view/model.ts, #380) on the small game built by hand (test/smallgame.ts): what
//the screens show of a world, and why a control is off, without the DOM. Germany (player 0) is a person's,
//the Soviet Union (player 1) the AI's; the side shown is the Axis
import { expect, test } from "vitest";
import { smallGame, smallGameData, smallGameUnits } from "./smallgame";
import { worldOf } from "../src/mirror";
import { classicRules } from "../src/core/rules";
import { step } from "../src/core/step";
import type { World } from "../src/core/types";
import { endTurnRefusal, isYourTurn, reasonOf, refusalOf, statusOf, unitView, yourPlayer } from "../src/view/model";

//The small game's world, with the units given and the current player, the side shown 0
function world(units = smallGameUnits, current = 0): World {
	const saved = smallGameData(units);
	saved.state.turn.currentPlayer = current;
	saved.state.players[0].prestige = 120;
	const { scenario } = smallGame(units, saved);
	return worldOf(scenario, null, { spotSide: 0, noFOW: false, rules: classicRules });
}

test("The status bar's side, turn and prestige are the current player's and the person's", () => {
	expect(statusOf(world())).toEqual({ turn: 1, maxTurns: 10, side: 0, sideName: "Axis", prestige: 120, yourTurn: true });
	//On the AI's turn: its side, and the prestige of the person who plays the side shown
	const theirs = world(smallGameUnits, 1);
	expect(statusOf(theirs)).toEqual({ turn: 1, maxTurns: 10, side: 1, sideName: "Allies", prestige: 120, yourTurn: false });
	expect([isYourTurn(theirs), yourPlayer(theirs).id]).toEqual([false, 0]);
});

test("End turn is only the person's, on their turn", () => {
	expect(endTurnRefusal(world())).toBeNull();
	expect(endTurnRefusal(world(smallGameUnits, 1))).toBe("Not your turn");
});

test("The selected unit as the side shown sees it, its actions with the core's refusals in plain words", () => {
	const w = world();
	const tank = unitView(w, 1);
	expect(tank).toMatchObject({ id: 1, className: "Tank", side: 0, own: true, at: { row: 4, col: 4 }, strength: 10, moved: false, fired: false });
	expect(tank.name).toBe(w.equipment[142].name);
	expect(tank.moves).toBe(w.equipment[142].movpoints);
	expect(tank.actions.map((a) => [a.label, a.refusal])).toEqual([
		["Resupply", "Can't resupply"], ["Reinforce", "Can't reinforce"], ["Mount", "Can't mount"], ["Dismount", "Can't unmount"],
		["Embark", "Can't embark"], ["Disembark", "Can't disembark"], ["Undo move", "Can't undo"]]);
	expect(tank.actions[0].command).toEqual({ type: "resupply", unit: 1 });
});

test("A move the person made can be undone: the unit shows it moved and its Undo is on", () => {
	const moved = step(world(), { type: "move", unit: 1, to: { row: 4, col: 6 } });
	expect(moved.ok).toBe(true);
	const tank = moved.ok ? unitView(moved.world, 1) : null;
	expect([tank.moved, tank.at, tank.moves]).toEqual([true, { row: 4, col: 6 }, 0]);
	expect(tank.actions.find((a) => a.label === "Undo move").refusal).toBeNull();
});

test("An enemy unit shows only where the side shown sees it, and none of its actions are the person's", () => {
	const w = world([[142, 0, 5, 5], [504, 1, 5, 6], [504, 1, 11, 11]]);
	expect(unitView(w, 2)).toBeNull(); //(far in the fog)
	const enemy = unitView(w, 1);
	expect([enemy.side, enemy.own]).toEqual([1, false]);
	expect(new Set(enemy.actions.map((a) => a.refusal))).toEqual(new Set(["Not your unit"]));
	//On the AI's turn nothing is the person's
	expect(unitView(world(smallGameUnits, 1), 1).actions[0].refusal).toBe("Not your turn");
	expect(unitView(w, 99)).toBeNull();
});

test("A refusal reads as a sentence; a command naming no unit on the map is refused as the core refuses it", () => {
	expect(reasonOf({ reason: "no such unit" })).toBe("The unit is gone");
	expect(reasonOf({ reason: "not enough prestige" })).toBe("Not enough prestige");
	expect(refusalOf(world(), { type: "resupply", unit: 99 })).toBe("The unit is gone");
	expect(refusalOf(world(), { type: "buy", eqid: 0, transport: 0 })).toBe("No such equipment");
});
