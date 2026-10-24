//The command-line player (#279, cli/): a game started from the files, played and saved, the AI's turn
//inside the end of turn, and the side's view that never shows an enemy unit it doesn't see
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { endHumanTurn, isHumanTurn, newSave, open, playCommand, readGameFile, world, writeGameFile } from "../cli/game";
import { map, status } from "../cli/board";
import { attackers, targets } from "../cli/combat";
import { knownWorld, seen } from "../cli/known";
import { moves } from "../cli/units";
import { pageResultOf, parseArgs } from "../cli/commands";
import { run } from "../cli/play";
import { changes, describe, fightLines } from "../cli/report";
import { fightRecorder } from "../cli/fightlog";
import { CombatLog } from "../src/combatlog";
import type { Unit } from "../src/unit";
import { sideOf, unitById } from "../src/core/world";
import { terrainNames, terrainType } from "../src/prototypes";

const AXIS = 0;
const seenEnemies = (g: ReturnType<typeof open>) =>
	world(g).state.units.filter((u) => sideOf(world(g), u) !== AXIS && seen(world(g), AXIS, u)).map((u) => u.id);

test("A new game shows the side's victory hexes and only the enemy units it sees (#279)", async () => {
	const g = open(await newSave("drpzop01.xml", [AXIS], 1));
	expect(isHumanTurn(g)).toBe(true);
	const s = status(world(g), AXIS).join("\n");
	expect(s).toContain("2,20 Janow: held by Allies, Axis to take");
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
	writeGameFile(file, g);
	const again = open(readGameFile(file));
	expect(world(again).state).toEqual(world(g).state);
	expect(again.save.report.length).toBe(events.length);
}, 60_000);

test("Every command answers, from a new game to the enemy's turn report (#279)", async () => {
	const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "openpanzer-cli-")), "game.json");
	const call = async (line: string) => (await run(parseArgs(line.split(" ")), file)).lines.join("\n");
	expect(await call("scenarios")).toContain("drpzop01.xml  Panzer-Verbaende Ostpreussen");
	expect(await call("new drpzop01.xml --seed 1")).toContain("you play Axis, remaster rules, seed 1");
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
	const axis = readGameFile(file).state.players.find((p) => p.side === AXIS);
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

test("In the classic rules a bomber attacks a ground unit from over it, not from the next hex, as on the screen (#285)", async () => {
	const file = tmpGame(), call = caller(file);
	await call("new drpzop01.xml --seed 1 --rules classic");
	await call("move 1 0,15");
	//the Do-17 at 4,7 (range 1) can reach the bunker at 2,15: from over it only
	const before = await call("attackers 14");
	expect(before).toContain("#20 Do-17Z-1 @4,7 on #14 Bunker @2,15 from 2,15");
	expect(before).not.toMatch(/#20 [^\n]* from 2,14/);
	await call("move 20 2,14");
	expect(await call("attackers 14")).not.toContain("#20 ");
	expect(await call("check attack 20 14")).toBe("refused: not a target from here");
	expect(await call("attack 20 14")).toBe("refused: not a target from here");
	expect(unitById(world(open(readGameFile(file))), 20).hasFired).toBe(false);
	//over it, it can
	const over = caller(tmpGame());
	await over("new drpzop01.xml --seed 1 --rules classic");
	await over("move 1 0,15");
	await over("move 20 2,15");
	expect(await over("check attack 20 14")).toBe("allowed");
	expect(await over("attack 20 14")).not.toMatch(/^refused/);
}, 60_000);

test("In the remaster rules a bomber attacks a ground unit from the next hex too, as in PG2 (#285)", async () => {
	const file = tmpGame(), call = caller(file);
	await call("new drpzop01.xml --seed 1");
	await call("move 1 0,15");
	expect(await call("attackers 14")).toMatch(/#20 Do-17Z-1 @4,7 on #14 Bunker @2,15 from 2,1[45]/);
	await call("move 20 2,14");
	expect(await call("attackers 14")).toContain("#20 Do-17Z-1 @2,14 on #14 Bunker @2,15 from 2,14");
	expect(await call("check attack 20 14")).toBe("allowed");
	expect(await call("attack 20 14")).not.toMatch(/^refused/);
	expect(unitById(world(open(readGameFile(file))), 20).hasFired).toBe(true);
}, 60_000);

test("A unit with no air attack can't attack an aircraft next to it, as on the screen; in the remaster rules the core refuses it too (#285)", async () => {
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

test("The capture of the last objective ends the game: status says who won and how, and nothing plays on (#311)", async () => {
	const call = caller(tmpGame());
	await call("new dragrom10.xml --seed 1");
	//the Axis has two victory hexes to take, each a move away
	await call("move 1 5,6");
	const over = "GAME OVER: Axis wins (capture, briliant)";
	expect(await call("move 2 6,11")).toContain(over);
	expect(await call("status")).toContain(over);
	expect(await call("check move 3 11,4")).toBe(`refused: the game is over\n${over}`);
	expect(await call("move 3 11,4")).toBe(`refused: the game is over\n${over}`);
	expect(await call("end")).toBe(`refused: the game is over\n${over}`);
}, 60_000);

test("On the page, a capture the screen played ends the game though the session doesn't know it (#311)", async () => {
	const g = open(await newSave("dragrom10.xml", [AXIS], 1));
	playCommand(g, { type: "move", unit: 1, to: { row: 5, col: 6 } });
	expect(pageResultOf(world(g), null, false, AXIS)).toBeNull();
	playCommand(g, { type: "move", unit: 2, to: { row: 6, col: 11 } });
	//the screen's game ended (game.gameEnded), its session didn't: the person's side took the last objective
	expect(pageResultOf(world(g), null, true, AXIS)).toEqual({ kind: "capture", winner: AXIS, loser: 1, rating: "briliant" });
}, 60_000);

test("A mounted unit shows its own ammo and fuel, its transport's beside them (#306)", async () => {
	const file = tmpGame(), call = caller(file);
	await call("new drpzop01.xml --seed 1");
	//the Sturmpioniere #8 at 2,6 (ammo 7) on its Opel Blitz (ammo 4, fuel 55), down to 5 ammo
	const save = readGameFile(file);
	save.state.units.find((u) => u.id === 8).ammo = 5;
	fs.writeFileSync(file, JSON.stringify(save));
	await call("mount 8");
	const line = "#8 Sturmpioniere @2,6 | Infantry | str 10 | ammo 5/7 | ent 0 | xp 98 | mounted on Opel Blitz (ammo 4/4, fuel 55/55)";
	expect(await call("units")).toContain(line);
	expect(await call("unit 8")).toContain(line);
	expect(await call("hex 2,6")).toContain(line);
	expect(await call("supply")).toContain("#8 Sturmpioniere @2,6 | str 10 | ammo 5/7 | mounted on Opel Blitz (ammo 4/4, fuel 55/55)");
}, 60_000);

test("Attackers list every hex a unit can attack the target from after a move, not only the best (#308)", async () => {
	const g = open(await newSave("drpzop01.xml", [AXIS], 1));
	playCommand(g, { type: "move", unit: 1, to: { row: 0, col: 15 } });
	//the bunker at 2,15: the SS infanterie #3 at 1,12 reaches three of its neighbours, 2,14 the best
	const a = attackers(world(g), AXIS, 14).estimates.find((e) => e.attacker === 3);
	expect([a.from, ...a.also.map((e) => e.from)]).toEqual(["2,14", "3,14", "1,15"]);
	const call = caller(tmpGame());
	await call("new drpzop01.xml --seed 1");
	await call("move 1 0,15");
	expect(await call("attackers 14")).toContain("#3 SS Infanterie @1,12 on #14 Bunker @2,15 from 2,14: kills 5, losses 0, surrenders; also from 3,14, 1,15");
}, 60_000);

test("On the page, an enemy attack that costs only the attacker, and the side's support fire, are reported as fights (#307)", async () => {
	const g = open(await newSave("drpzop01.xml", [AXIS], 1)), w = world(g);
	//the screen logs each fire as src/commands.ts does: the units before, then after
	const log = { ...CombatLog }, fights = fightRecorder(log);
	const unit = (id: number, strength: number) => {
		const u = unitById(w, id);
		return { id, eqid: u.eqid, player: { side: sideOf(w, u) }, strength, experience: 0, entrenchment: 0, ammo: 1, isMounted: false,
			isSurprised: false, isCore: false, getPos: () => ({ row: u.row, col: u.col }) } as unknown as Unit;
	};
	const fire = (atk: number, def: number, after: [number, number], support: boolean) => {
		const id = log.addCombatStart(unit(atk, 10), unit(def, 10), 1);
		log.addCombatEnd(unit(atk, after[0]), unit(def, after[1]), id, support);
	};
	//the sFH 18 #21 fires in support of the Psw #1, which the Polish infantry #4 attacks and loses on
	fire(21, 4, [10, 8], true);
	fire(4, 1, [7, 10], false);
	expect(fightLines(w, AXIS, fights.take())).toEqual([
		"support fire: Axis 15 sFH18 #21 @4,8 10->10 on Allies 38 Piechota #4 @1,18 10->8",
		"attack: Allies 38 Piechota #4 @1,18 10->7 on Axis Psw 231(8) #1 @1,10 10->10"]);
	expect(fights.take()).toEqual([]);
}, 60_000);

test("A hex off the map is refused with the map's size, in hex and wherever a command takes a cell (#309)", async () => {
	const call = caller(tmpGame());
	await call("new drpzop01.xml --seed 1");
	const size = "the map is 32 rows by 37 columns (0-31, 0-36)";
	await expect(call("hex 32,5")).rejects.toThrow(`no hex 32,5: ${size}`);
	await expect(call("hex 5,37")).rejects.toThrow(`no hex 5,37: ${size}`);
	await expect(call("move 1 40,1")).rejects.toThrow(`no hex 40,1: ${size}`);
	await expect(call("targets 3 --from 40,1")).rejects.toThrow(`no hex 40,1: ${size}`);
	await expect(call("attackers 99,99")).rejects.toThrow(`no hex 99,99: ${size}`);
	expect(await call("hex 31,36")).toMatch(/^31,36: /);
}, 60_000);

test("Every terrain the map draws has its own character in the legend, bocage not the bunker's b (#310)", async () => {
	const g = open(await newSave("drpzop01.xml", [AXIS], 1)), w = world(g);
	const drawn = terrainNames.map((name, t) => {
		//hex 0,0 (clear, no road, no unit) drawn as each terrain
		const hexes = w.data.hexes.slice();
		hexes[0] = { ...hexes[0], terrain: t, road: 0 };
		const lines = map({ ...w, data: { ...w.data, hexes } }, AXIS, [0, 0], [0, 0], false);
		const char = lines[2].slice(4, 5);
		expect(lines.join("\n")).toContain(`${char} ${name.toLowerCase()}`);
		return char;
	});
	expect(new Set(drawn).size).toBe(terrainNames.length);
	expect(drawn[terrainType.Bocage]).not.toBe("b");
}, 60_000);

test("In the classic rules a fighter next to an enemy aircraft over a ground unit can attack the aircraft only, as on the screen (#305)", async () => {
	const file = tmpGame(), call = caller(file);
	await call("new drpzop01.xml --seed 1 --rules classic");
	//the Me-109E-3 #22 put at 2,19, next to the Polish infantry #15 at 2,20 with the Polish aircraft #76 over it
	const save = readGameFile(file), cols = save.state.map.cols, hexes = save.state.map.hexes;
	const put = (id: number, row: number, col: number) => {
		const u = save.state.units.find((x) => x.id === id);
		hexes[u.row * cols + u.col].air = null;
		hexes[row * cols + col].air = id;
		Object.assign(u, { row, col });
	};
	put(22, 2, 19);
	put(76, 2, 20);
	fs.writeFileSync(file, JSON.stringify(save));
	const listed = await call("targets 22");
	expect(listed).toMatch(/^#76 [^\n]* @2,20 from 2,19: /);
	expect(listed).not.toContain("#15 ");
	expect(await call("attackers 15")).not.toContain("#22 ");
	expect(await call("check attack 22 15")).toBe("refused: not a target from here");
	expect(await call("check attack 22 76")).toBe("allowed");
}, 60_000);

test("check says a unit that moves on its transport can't attack or unmount after the move (the Bzura playtest)", async () => {
	const call = caller(tmpGame());
	await call("new drpzop01.xml --seed 1");
	//the Sturmpioniere #8 at 2,6 and its Opel Blitz
	expect(await call("check mount 8")).toBe("allowed (once it moves on its transport it can't attack or unmount this turn)");
	expect(await call("check move 8 3,5")).toBe("allowed");
	await call("mount 8");
	expect(await call("check move 8 3,5")).toBe("allowed (on its transport: it can't attack or unmount after this move)");
	await call("move 8 3,5");
	expect(await call("check unmount 8")).toBe("refused: can't unmount");
}, 60_000);
