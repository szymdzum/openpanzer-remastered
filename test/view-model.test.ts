// @vitest-environment node
//The new UI's view model (src/view/store/model.ts, #380) on the small game built by hand (test/smallgame.ts): what
//the screens show of a world, and why a control is off, without the DOM. Germany (player 0) is a person's,
//the Soviet Union (player 1) the AI's; the side shown is the Axis
import { expect, test } from "vitest";
import { smallGame, smallGameData, smallGameUnits } from "./smallgame";
import { worldOf } from "../src/legacy/mirror";
import { classicRules, remasterRules } from "../src/core/rules";
import type { World } from "../src/core/types";
import { dateOf, endTurnRefusal, isYourTurn, prestigeText, reasonOf, refusalOf, statusOf, yourPlayer } from "../src/view/store/model";

//The small game's world, with the units given and the current player, the side shown 0
function world(units = smallGameUnits, current = 0): World {
	const saved = smallGameData(units);
	saved.state.turn.currentPlayer = current;
	saved.state.players[0].prestige = 120;
	const { scenario } = smallGame(units, saved);
	return worldOf(scenario, null, { spotSide: 0, noFOW: false, rules: classicRules });
}

test("The status bar's side, turn and prestige are the current player's and the person's (#346)", () => {
	expect(statusOf(world())).toEqual({ turn: 1, maxTurns: 10, side: 0, sideName: "Axis", country: "Germany", nation: "de", date: "22 Jun 1941",
		weather: { icon: "fair", word: "Fair" }, ground: { icon: "dry", word: "Dry" }, rules: "Classic", prestige: 120, yourTurn: true });
	//On the AI's turn: its side and country, and the prestige of the person who plays the side shown
	const theirs = world(smallGameUnits, 1);
	expect(statusOf(theirs)).toMatchObject({ side: 1, sideName: "Allies", country: "Russia", nation: "su", prestige: 120, yourTurn: false });
	expect([isYourTurn(theirs), yourPlayer(theirs).id]).toEqual([false, 0]);
});

test("The status bar shows the scenario's date, weather and ground, and the rules the game plays (#317)", () => {
	const saved = smallGameData();
	Object.assign(saved.state.scenario, { date: "1939-09-05T23:00:00.000Z", atmospheric: 2, ground: 2 });
	saved.state.players[0].country = 2; //(Bulgaria: no mark in the icon set)
	const w = worldOf(smallGame(smallGameUnits, saved).scenario, null, { spotSide: 0, noFOW: false, rules: remasterRules });
	//(the local midnight the scenario starts from, in the time zone the tests run in)
	expect(statusOf(w)).toMatchObject({ date: "06 Sep 1939", weather: { icon: "rain", word: "Rain" }, ground: { icon: "mud", word: "Mud" },
		rules: "Remaster", country: "Bulgaria", nation: null });
	//A country an equipment set doesn't name, and no player whose turn it is: no country
	const unknown = smallGameData();
	unknown.data.equipment = "eqp-none";
	const set = worldOf(smallGame(smallGameUnits, unknown).scenario, null, { spotSide: 0, noFOW: false, rules: classicRules });
	expect(statusOf(set)).toMatchObject({ side: 0, country: "", nation: null });
	const nobody = { ...w, state: { ...w.state, turn: { ...w.state.turn, currentPlayer: 9 } } };
	expect(statusOf(nobody)).toMatchObject({ side: -1, sideName: "", country: "", nation: null, yourTurn: false });
	expect([dateOf("1944-12-31T23:00:00.000Z"), prestigeText(3056), prestigeText(120), prestigeText(1234567), prestigeText(-1500)])
		.toEqual(["01 Jan 1945", "3,056", "120", "1,234,567", "-1,500"]);
});

test("End turn is only the person's, on their turn", () => {
	expect(endTurnRefusal(world())).toBeNull();
	expect(endTurnRefusal(world(smallGameUnits, 1))).toBe("Not your turn");
});

test("A command on an enemy unit, or on the AI's turn, isn't the person's to send", () => {
	const w = world([[142, 0, 5, 5], [504, 1, 5, 6], [504, 1, 11, 11]]);
	expect(refusalOf(world(smallGameUnits, 1), { type: "resupply", unit: 1 })).toBe("Not your turn");
	expect(refusalOf(w, { type: "resupply", unit: 1 })).toBe("Not your unit");
});

test("A refusal reads as a sentence; a command naming no unit on the map is refused as the core refuses it", () => {
	expect(reasonOf({ reason: "no such unit" })).toBe("The unit is gone");
	expect(reasonOf({ reason: "not enough prestige" })).toBe("Not enough prestige");
	expect(refusalOf(world(), { type: "resupply", unit: 99 })).toBe("The unit is gone");
	expect(refusalOf(world(), { type: "buy", eqid: 0, transport: 0 })).toBe("No such equipment");
});
