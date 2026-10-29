//The rules a game plays by (#53): the classic ones, which the contracts and verify pin against the
//original, and the remaster's, the default for new games. A game keeps its rules from its start to its
//end: through its saves, and on the command line
import { expect, test, vi } from "vitest";
import { readFixture, restoreState } from "./contracts";

test("The remaster's rules are the classic ones but for the AI's play, who attacks whom, where a side deploys, when it is eliminated, the leaders it wins, the turn limit and who wins by capture, under their own name (#53, #235, #285, #302, #115, #78, #256, #91)", async () => {
	const { classicRules, remasterRules, rulesetNamed } = await import("../src/core/rules");
	expect(remasterRules.name).toBe("remaster");
	expect({ ...remasterRules, name: "classic", ai: classicRules.ai, airAttacksNextHex: false, checkTargets: false,
		deployOnOwnTowns: false, waitingUnitsFight: false, wholeLeaderList: false, defenderHoldsOut: false,
		captureNeedsObjectives: false }).toEqual(classicRules);
	expect([remasterRules.airAttacksNextHex, remasterRules.checkTargets, remasterRules.deployOnOwnTowns, remasterRules.waitingUnitsFight,
		remasterRules.wholeLeaderList, remasterRules.defenderHoldsOut, remasterRules.captureNeedsObjectives]).toEqual([true, true, true, true, true, true, true]);
	expect(remasterRules.ai.config).toBe(classicRules.ai.config);
	expect([rulesetNamed("remaster"), rulesetNamed("classic"), rulesetNamed(undefined), rulesetNamed("pg2")])
		.toEqual([remasterRules, classicRules, classicRules, classicRules]);
});

test("Without a game the engine reads the classic rules (#53)", async () => {
	vi.resetModules();
	const { engineContext } = await import("../src/legacy/context");
	expect(engineContext.rules()).toBe("classic");
});

test("A new game plays the remaster's rules unless the settings ask for the classic ones (#53)", async () => {
	const { newGameRules, uiSettings } = await import("../src/app/settings");
	expect(uiSettings.classicRules).toBe(false);
	expect(newGameRules()).toBe("remaster");
	uiSettings.classicRules = true;
	expect(newGameRules()).toBe("classic");
	uiSettings.classicRules = false;
});

test("A save names its game's rules; a save of version 1 or of the format before plays the classic ones (#53)", async () => {
	const { readSave } = await import("../src/app/save");
	const read = (o: unknown) => readSave(JSON.stringify(o))?.save;
	expect(read({ version: 1, data: { name: "a" }, state: { turn: 3 } }))
		.toEqual({ version: 3, rules: "classic", data: { name: "a", startObjectives: null }, state: { turn: 3 } });
	expect(read({ version: 2, rules: "remaster", data: {}, state: {} })?.rules).toBe("remaster");
	expect(read({ version: 2, rules: "pg2", data: {}, state: {} })?.rules).toBe("classic");
	expect(readSave(readFixture("engine", "drpzop01-t0.json.gz").state)?.save.rules).toBe("classic");
});

test("A game saved and loaded plays on by the same rules (#53)", async () => {
	await restoreState(readFixture("engine", "drpzop01-t0.json.gz").state);
	const { game } = await import("../src/app/game");
	const { GameState } = await import("../src/app/storage");
	expect(game.rules).toBe("classic");
	game.rules = "remaster";
	const saved = new GameState(game).exportGameState();
	expect(JSON.parse(saved)).toMatchObject({ version: 3, rules: "remaster" });
	await restoreState(saved);
	const loaded = (await import("../src/app/game")).game;
	expect(loaded.rules).toBe("remaster");
	expect((await import("../src/legacy/context")).engineContext.world().rules.name).toBe("remaster");
}, 60_000);

test("The command-line player's new game plays the remaster's rules unless --rules classic, and its save keeps them (#53)", async () => {
	const { newSave, open, world } = await import("../cli/game");
	const remaster = open(await newSave("drpzop01.xml", [0], 1));
	const classic = open(await newSave("drpzop01.xml", [0], 1, "classic"));
	expect([remaster.save.rules, world(remaster).rules.name]).toEqual(["remaster", "remaster"]);
	expect([classic.save.rules, world(classic).rules.name]).toEqual(["classic", "classic"]);
	const { rules: _, ...before } = classic.save;
	expect(world(open(before)).rules.name).toBe("classic");
	expect(world(remaster).state).toEqual(world(classic).state);
}, 60_000);
