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
import { changes } from "../cli/report";
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
