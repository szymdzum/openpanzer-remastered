//The command-line player (#279, cli/): a game started from the files, played and saved, the AI's turn
//inside the end of turn, and the side's view that never shows an enemy unit it doesn't see
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { endHumanTurn, isHumanTurn, newSave, open, playCommand, readSave, world, writeSave } from "../cli/game";
import { status } from "../cli/board";
import { attackers, targets } from "../cli/combat";
import { knownWorld, seen } from "../cli/known";
import { moves } from "../cli/units";
import { parseArgs } from "../cli/commands";
import { run } from "../cli/play";
import { changes, describe } from "../cli/report";
import { sideOf, unitById } from "../src/core/world";

const AXIS = 0;
const seenEnemies = (g: ReturnType<typeof open>) =>
	world(g).state.units.filter((u) => sideOf(world(g), u) !== AXIS && seen(world(g), AXIS, u)).map((u) => u.id);

test("A new game shows the side's victory hexes and only the enemy units it sees (#279)", async () => {
	const g = open(await newSave("drpzop01.xml", [AXIS], 1));
	expect(isHumanTurn(g)).toBe(true);
	const s = status(world(g), AXIS).join("\n");
	expect(s).toContain("2,20 Janon: held by Allies, Axis to take");
	expect(s).toContain("1,10 Neidenburg: held by Axis, Allies to take");
	expect(s).toContain("Axis holds 2, Allies 5");
	//the known world has the enemy units the side sees, not the others
	const kw = knownWorld(world(g), AXIS), byId = (a: number, b: number) => a - b;
	const known = kw.state.units.filter((u) => sideOf(kw, u) !== AXIS).map((u) => u.id);
	expect(known.sort(byId)).toEqual(seenEnemies(g).sort(byId));
	expect(known.length).toBeLessThan(world(g).state.units.filter((u) => sideOf(world(g), u) !== AXIS).length);
}, 60_000);

test("A move's cost is what the move pays, and a preview from another hex reveals nothing (#279)", async () => {
	const g = open(await newSave("drpzop01.xml", [AXIS], 1));
	//the Psw 231(8) at 1,10: 0,15 costs 9, the fuel it uses
	const m = moves(world(g), AXIS, 1).cells.find((c) => c.cell === "0,15");
	expect(m).toMatchObject({ cost: 9, fuelLeft: 46 });
	const before = seenEnemies(g);
	targets(world(g), AXIS, 1, { row: 0, col: 15 });
	expect(seenEnemies(g)).toEqual(before);
	const r = playCommand(g, { type: "move", unit: 1, to: { row: 0, col: 15 } });
	expect(r.refusal).toBeNull();
	expect(unitById(world(g), 1)).toMatchObject({ row: 0, col: 15, fuel: 46 });
	expect(seenEnemies(g).length).toBeGreaterThan(before.length);
}, 60_000);

test("Attackers of a target list who can hit it now or after a move, with the estimate (#279)", async () => {
	const g = open(await newSave("drpzop01.xml", [AXIS], 1));
	playCommand(g, { type: "move", unit: 1, to: { row: 0, col: 15 } });
	//the bunker at 2,15, spotted by the move: the SS infantry by the bridge can reach it
	const a = attackers(world(g), AXIS, 14);
	expect(a.estimates.length).toBeGreaterThan(0);
	expect(a.estimates[0]).toMatchObject({ target: 14 });
	expect(a.estimates[0].kills).toBeGreaterThan(0);
}, 60_000);

test("The end of turn plays the AI's turn and the save plays on from where it stopped (#279)", async () => {
	const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "openpanzer-cli-")), "game.json");
	const g = open(await newSave("drpzop01.xml", [AXIS], 1));
	expect(playCommand(g, { type: "attack", unit: 1, target: 14 }).refusal).not.toBeNull();
	const events = endHumanTurn(g);
	expect(events.some((e) => e.type === "turnStarted" && e.turn === 2)).toBe(true);
	expect(isHumanTurn(g)).toBe(true);
	expect(world(g).state.turn.turn).toBe(2);
	writeSave(file, g);
	const again = open(readSave(file));
	expect(world(again).state).toEqual(world(g).state);
	expect(again.save.report.length).toBe(events.length);
}, 60_000);

test("Every command answers, from a new game to the enemy's turn report (#279)", async () => {
	const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "openpanzer-cli-")), "game.json");
	const call = async (line: string) => (await run(parseArgs(line.split(" ")), file)).lines.join("\n");
	expect(await call("scenarios")).toContain("drpzop01.xml  Panzer-Verbaende Ostpreussen");
	expect(await call("new drpzop01.xml --seed 1")).toContain("you play Axis, seed 1");
	expect(await call("units")).toContain("#1 Psw 231(8) @1,10 | Recon | str 10 | ammo 8/8 | fuel 55/55 | ent 0 | xp 7 | moves 10/10 | can: move");
	expect(await call("enemies")).toBe("#58 Fortification @13,6 | Fortification | str 8 | ammo 10/10 | ent 0 | xp 69");
	expect(await call("map 0-3 8-13")).toContain("  1 . .T$RrB.I. ");
	expect(await call("moves 1")).toContain("0,15 cost 9 fuel left 46");
	expect(await call("check move 1 30,30")).toMatch(/^refused: /);
	expect(await call("shop tank")).toContain("148 Pz IVD [Tank] cost 336");
	expect(await call("move 1 0,15")).toContain("Axis #1 Psw 231(8) spotted");
	expect(await call("hex 2,15")).toContain("2,15: Clear, owner none, spotted by you\nground: #14 Bunker @2,15");
	expect(await call("attackers 2,15")).toContain("#3 SS Infanterie @1,12 on #14 Bunker @2,15 from 2,14");
	expect(await call("targets 3 --from 2,14")).toContain("#14 Bunker @2,15 from 2,14: kills");
	expect(await call("unit 1")).toContain("Recon: soft 3 hard 3");
	expect(await call("buy 749")).toBe("bought He-111H-3 for 636");
	expect(await call("reserve")).toContain("He-111H-3");
	expect(await call("supply")).toContain("#36 15 sFH18 @8,3");
	expect(await call("attack 1 1,18")).toBe("refused: out of range");
	const end = await call("end");
	expect(end).toContain("-- Allies turn 1 --");
	expect(end).toContain("turn 2/17, Axis to play");
	expect(await call("report")).toContain("-- Axis turn 2 --");
	expect((await call("status")).split("\n")[0]).toContain("turn 2/17");
	await expect(call("fly 1 2,2")).rejects.toThrow('unknown command "fly"');
}, 120_000);

test("What changed between two worlds, as the page's front tells a turn it plays on the screen (#279)", async () => {
	const g = open(await newSave("drpzop01.xml", [AXIS], 1));
	const before = world(g);
	playCommand(g, { type: "buy", eqid: 749, transport: -1 });
	playCommand(g, { type: "move", unit: 1, to: { row: 0, col: 15 } });
	expect(changes(before, world(g), AXIS)).toEqual([
		"Axis #1 Psw 231(8) 1,10 -> 0,15", "Allies #4 38 Piechota seen at 1,18", "Allies #14 Bunker seen at 2,15", "prestige 3056 -> 2420"]);
}, 60_000);

const tmpGame = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "openpanzer-cli-")), "game.json");
const caller = (file: string) => async (line: string) => (await run(parseArgs(line.split(" ")), file)).lines.join("\n");

test("An enemy the side doesn't see can't be attacked by its id: the answer is a missing unit's (#279)", async () => {
	const call = caller(tmpGame());
	await call("new drpzop01.xml --seed 1");
	//the TKS #28 at 6,13 is hidden from the Axis on turn 1, in the sFH 18 #21's range
	await expect(call("unit 28")).rejects.toThrow("no unit #28 you see");
	const missing = await call("check attack 21 999");
	expect(await call("check attack 21 28")).toBe(missing);
	expect(await call("attack 21 28")).toBe(missing);
}, 60_000);

test("The moves are the screen's move range, and a move's check agrees with them (#279)", async () => {
	const call = caller(tmpGame());
	await call("new drpzop01.xml --seed 1");
	//the Psw 231(8) at 1,10: 2,14 is spotted and in the hidden bunker's zone of control (2,15), which stops
	//a move there, as the screen's range has it: 2,15 isn't in reach
	const range = await call("moves 1");
	expect(range).toContain("2,14 cost 10 fuel left 48 (the move stops here)");
	expect(range).not.toContain("2,15 ");
	expect(await call("check move 1 2,14")).toBe("allowed");
	expect(await call("check move 1 2,15")).toBe("refused: can't get there");
	expect(await call("move 1 2,14")).toContain("#1 Psw 231(8) @2,14 | Recon | str 10 | ammo 8/8 | fuel 48/55 | ent 0 | xp 7 | moves 0/10");
}, 60_000);

test("The AI playing the first side buys and deploys on its first turn, as on every other (#279)", async () => {
	const file = tmpGame(), call = caller(file);
	await call("new drpzop01.xml --side 1 --seed 1");
	const axis = readSave(file).state.players.find((p) => p.side === AXIS);
	expect(axis.prestige).toBeLessThan(3056);
	expect(axis.core.length).toBeGreaterThan(0);
}, 60_000);

test("The report keeps the enemy's leaders and upgrades to itself (#279)", async () => {
	const g = open(await newSave("drpzop01.xml", [AXIS], 1)), w = world(g);
	expect(describe(w, w, AXIS, [{ type: "leader", unit: 4, leader: 1 }])).toEqual([]);
	expect(describe(w, w, AXIS, [{ type: "turnStarted", player: 1, turn: 1, date: "", dayTurn: 0 },
		{ type: "upgraded", unit: null, index: 0, eqid: 270, transport: -1, cost: 10 }])).toEqual(["-- Allies turn 1 --"]);
}, 60_000);

test("A move onto a hex whose terrain stops it uses the fuel of the points left, as the move pays (#284)", async () => {
	const g = open(await newSave("drpzop01.xml", [AXIS], 1));
	//the Kfz 13 at 12,3 (fuel 40, 6 points): 9,4 takes every point left
	const m = moves(world(g), AXIS, 53).cells.find((c) => c.cell === "9,4");
	expect(m).toMatchObject({ cost: 6, stops: true });
	expect(playCommand(g, { type: "move", unit: 53, to: { row: 9, col: 4 } }).refusal).toBeNull();
	expect(unitById(world(g), 53).fuel).toBe(m.fuelLeft);
	//the fuel minus the 6 points left, not plus the terrain's 254
	expect(m.fuelLeft).toBe(40 - 6);
}, 60_000);

test("A bomber attacks a ground unit from over it, not from the next hex, as on the screen (#285)", async () => {
	const file = tmpGame(), call = caller(file);
	await call("new drpzop01.xml --seed 1");
	await call("move 1 0,15");
	//the Do-17 at 4,7 (range 1) can reach the bunker at 2,15: from over it only
	const before = await call("attackers 14");
	expect(before).toContain("#20 Do-17Z-1 @4,7 on #14 Bunker @2,15 from 2,15");
	expect(before).not.toMatch(/#20 [^\n]* from 2,14/);
	await call("move 20 2,14");
	expect(await call("attackers 14")).not.toContain("#20 ");
	expect(await call("check attack 20 14")).toBe("refused: not a target from here");
	expect(await call("attack 20 14")).toBe("refused: not a target from here");
	expect(unitById(world(open(readSave(file))), 20).hasFired).toBe(false);
	//over it, it can
	const over = caller(tmpGame());
	await over("new drpzop01.xml --seed 1");
	await over("move 1 0,15");
	await over("move 20 2,15");
	expect(await over("check attack 20 14")).toBe("allowed");
	expect(await over("attack 20 14")).not.toMatch(/^refused/);
}, 60_000);

test("A unit with no air attack can't attack an aircraft next to it, as on the screen (#285)", async () => {
	const call = caller(tmpGame());
	await call("new drpzop01.xml --side 1 --seed 1");
	//the Me-109B-2 #78 over 2,20, after the Axis's first turn: the machine guns at 1,21 can hit it, the
	//infantry next to it (#5 at 1,19) and below it (#15) have no air attack
	const by = await call("attackers 78");
	expect(by).toContain("#7 7,92mm wz.08 @1,21 on #78 Me-109B-2 @2,20 from 1,21");
	expect(by).not.toContain("#5 ");
	expect(by).not.toContain("#15 ");
	expect(await call("targets 5")).not.toContain("#78 ");
	expect(await call("check attack 5 78")).toBe("refused: not a target from here");
	expect(await call("attack 5 78")).toBe("refused: not a target from here");
}, 60_000);
