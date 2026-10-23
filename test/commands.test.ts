// @vitest-environment node
//The player's commands (src/commands.ts) on a small map built by hand: what each one checks,
//what it does on the core through the game's objects, and when the move and the attack finish
import { afterEach, beforeEach, expect, test } from "vitest";
import { type AttackResult, Commands, type Command } from "../src/commands";
import { engineContext, setEngineContext } from "../src/context";
import { Equipment } from "../src/equipment";
import { GameRules } from "../src/gamerules";
import type { GameMap, Player } from "../src/map";
import { Rng } from "../src/rng";
import type { Scenario } from "../src/scenario";
import { Transport, type Unit } from "../src/unit";
import { type Cell, terrainType, unitClass } from "../src/prototypes";
import { smallGame, smallGameUnits } from "./smallgame";

const check = (sc: Scenario, cmd: Command) => Commands.check(sc, cmd);
const execute = Commands.execute.bind(Commands);

//German infantry at 6,7 next to Soviet infantry at 7,7, the rest as in the small game
const duel: [number, number, number, number][] = [[115, 0, 6, 7], ...smallGameUnits.slice(1)];
//A German tank and Soviet infantry it can't see, in its way south
const ambush: [number, number, number, number][] = [[142, 0, 3, 7], [504, 1, 6, 7]];

let scenario: Scenario, map: GameMap, players: Player[];
const defaultContext = engineContext;
function setup(units = smallGameUnits) {
	({ scenario, map, players } = smallGame(units));
}
beforeEach(() => setup());
afterEach(() => {
	setEngineContext(defaultContext);
});

const unitAt = (row: number, col: number) => map.map[row][col].getUnit(false)!;
//What a command could change: the units, the players and the hexes' units
function state(): string {
	return JSON.stringify([map.getUnits().map((u) => [u.id, u.getPos(), u.strength, u.ammo, u.fuel, u.isMounted, u.carrier,
		u.hasMoved, u.hasFired, u.hasResupplied]), players.map((p) => [p.prestige, p.getCoreUnitList().length]), map.currentPlayer.id]);
}
function refusal(cmd: Command): string | null {
	const r = check(scenario, cmd);
	return r === null ? null : r.reason;
}
//The first cell the unit can move to
function reachable(u: Unit): Cell {
	const c = GameRules.getMoveRange(map, u).find((x) => x.canMove)!;
	return { row: c.row, col: c.col };
}

test("check changes nothing, execute refuses what check refuses and changes nothing then", () => {
	const inf = unitAt(3, 3);
	const commands: Command[] = [
		{ type: "move", unit: inf.id, to: { row: 0, col: 11 } },
		{ type: "move", unit: inf.id, to: reachable(inf) },
		{ type: "attack", unit: inf.id, target: unitAt(9, 9).id },
		{ type: "resupply", unit: inf.id },
		{ type: "reinforce", unit: inf.id },
		{ type: "mount", unit: inf.id },
		{ type: "unmount", unit: inf.id },
		{ type: "embark", unit: inf.id },
		{ type: "disembark", unit: inf.id },
		{ type: "undo", unit: inf.id },
		{ type: "deploy", index: 0, to: { row: 1, col: 1 } },
		{ type: "buy", eqid: 115, transport: -1 },
		{ type: "upgrade", unit: inf.id, eqid: 142, transport: -1 },
		{ type: "upgradeUndeployed", index: 0, eqid: 115, transport: -1 },
		{ type: "disband", unit: 99 },
		{ type: "sell", index: 0 },
		{ type: "endTurn" },
	];
	const before = state();
	for (const cmd of commands) {
		const r = check(scenario, cmd);
		expect(state(), cmd.type).toBe(before);
		if (r === null) continue;
		expect(execute(scenario, cmd)).toEqual({ ok: false, refusal: r });
		expect(state(), cmd.type).toBe(before);
	}
});

test("A move goes where the unit can get to, along the cells given or its move range", () => {
	const inf = unitAt(3, 3);
	expect(refusal({ type: "move", unit: 99, to: { row: 3, col: 4 } })).toBe("no such unit");
	expect(refusal({ type: "move", unit: inf.id, to: { row: 0, col: 11 } })).toBe("can't get there");
	expect(refusal({ type: "move", unit: inf.id, to: { row: -1, col: 3 } })).toBe("can't get there");
	const to = reachable(inf);
	expect(refusal({ type: "move", unit: inf.id, to: to, cells: [] })).toBe("can't get there");
	expect(refusal({ type: "move", unit: inf.id, to: to, cells: GameRules.getMoveRange(map, inf) })).toBeNull();

	const r = execute(scenario, { type: "move", unit: inf.id, to: to });
	expect(r.ok && r.result.passedCells.length).toBeGreaterThan(0);
	expect(inf.getPos()).toEqual(to);
	expect(inf.hasMoved).toBe(true);
});

test("A move finishes when the caller's animation ends, or at once", () => {
	const inf = unitAt(3, 3), to = reachable(inf);
	let finish: (() => unknown) | null = null;
	let captured = 0, animated: unknown = null;
	const r = execute(scenario, { type: "move", unit: inf.id, to: to }, {
		animate(mr, f) {
			expect(inf.getPos()).toEqual(to); //moved already, finished later
			animated = mr;
			finish = () => f({ onCapture() { captured++; } });
		},
	});
	expect(r.ok).toBe(true);
	expect(finish).not.toBeNull();
	const res = finish!() as { move: unknown; surprise: unknown };
	expect(r.ok && res.move === r.result && animated === r.result).toBe(true);
	expect([res.surprise, captured]).toEqual([null, 0]);

	//Into a hidden enemy: the move stops next to it, the surprise attack is resolved and finished in
	//the same call
	setup(ambush);
	const tank = unitAt(3, 7), enemy = unitAt(6, 7);
	expect(map.map[6][7].isSpotted(0)).toBe(false);
	Rng.game.state = 5;
	const losses: Unit[] = [];
	const s = execute(scenario, { type: "move", unit: tank.id, to: { row: 7, col: 7 } },
		{ surprise: { onLosses(a) { losses.push(a.defending.unit); } } });
	expect(s.ok && s.result.surpriseCell).toMatchObject({ row: 6, col: 7 });
	expect(tank.getPos()).toEqual({ row: 5, col: 7 });
	expect([losses, tank.isSurprised]).toEqual([[enemy], false]);
});

test("An attack needs both units and the target in range", () => {
	setup(duel);
	const inf = unitAt(6, 7), enemy = unitAt(7, 7);
	expect(refusal({ type: "attack", unit: 99, target: enemy.id })).toBe("no such unit");
	expect(refusal({ type: "attack", unit: inf.id, target: 99 })).toBe("no such target");
	expect(refusal({ type: "attack", unit: inf.id, target: unitAt(9, 9).id })).toBe("out of range");
	expect(refusal({ type: "attack", unit: inf.id, target: enemy.id })).toBeNull();
	//A unit that has fired can still be ordered to: the AI attacks after a surprise attack
	inf.hasFired = true;
	expect(refusal({ type: "attack", unit: inf.id, target: enemy.id })).toBeNull();
});

test("An attack fires its hooks in the combat's order and finishes when the caller says", () => {
	setup(duel);
	const inf = unitAt(6, 7), enemy = unitAt(7, 7);
	Rng.game.state = 3;
	const calls: string[] = [];
	let finish: (() => AttackResult) | null = null;
	const r = execute(scenario, { type: "attack", unit: inf.id, target: enemy.id }, {
		onStart() { calls.push("start " + enemy.strength); },
		onSupportShot() { calls.push("support"); },
		onAttack(res) { calls.push("attack " + (res.attacking.unit === inf)); },
		animate(result, f) {
			calls.push("animate " + (result.defending.unit === enemy));
			finish = () => f({ onLosses() { calls.push("losses"); } });
		},
	});
	expect(r.ok).toBe(true);
	expect(calls.filter((c) => c !== "support")).toEqual(["start 10", "attack true", "animate true"]);
	expect(finish!().attacking.unit).toBe(inf);
	expect(calls[calls.length - 1]).toBe("losses");
	expect(enemy.strength).toBeLessThanOrEqual(10);

	//Without animate it finishes at once
	setup(duel);
	Rng.game.state = 3;
	const finished: string[] = [];
	const again = execute(scenario, { type: "attack", unit: unitAt(6, 7).id, target: unitAt(7, 7).id },
		{ finish: { onLosses() { finished.push("losses"); } } });
	expect(finished).toEqual(["losses"]);
	expect(again.ok && [again.result.attacking.newstr, again.result.defending.newstr])
		.toEqual(r.ok && [r.result.attacking.newstr, r.result.defending.newstr]);
});

test("Resupply and reinforce a unit", () => {
	const inf = unitAt(3, 3);
	expect(refusal({ type: "resupply", unit: 99 })).toBe("no such unit");
	inf.ammo = 0;
	const r = execute(scenario, { type: "resupply", unit: inf.id });
	expect(r.ok && r.result.ammo).toBeGreaterThan(0);
	expect(inf.ammo).toBeGreaterThan(0);

	const tank = unitAt(4, 4);
	expect(refusal({ type: "reinforce", unit: 99 })).toBe("no such unit");
	tank.strength = 5;
	players[0].prestige = 1000;
	const s = execute(scenario, { type: "reinforce", unit: tank.id });
	expect(s.ok && s.result.strength).toBeGreaterThan(0);
	expect(tank.strength).toBeGreaterThan(5);
	expect(players[0].prestige).toBeLessThan(1000);
});

test("Mount and unmount a unit with a transport", () => {
	const inf = unitAt(3, 3);
	expect(refusal({ type: "mount", unit: 99 })).toBe("no such unit");
	expect(refusal({ type: "unmount", unit: 99 })).toBe("no such unit");
	inf.transport = new Transport(Equipment.getCountryEquipmentByClass(unitClass.groundTransport, 8)[0]);
	expect(execute(scenario, { type: "mount", unit: inf.id })).toEqual({ ok: true, result: null });
	expect(inf.isMounted).toBe(true);
	expect(execute(scenario, { type: "unmount", unit: inf.id })).toEqual({ ok: true, result: null });
	expect(inf.isMounted).toBe(false);
});

//The UI's context button can be older than the unit's state: the commands refuse what the rules
//refuse, and change nothing (the old engine played them, the score too)
test("Resupply, reinforce, mount and unmount refuse a unit the rules refuse, and change nothing (#147)", () => {
	const inf = unitAt(3, 3), tank = unitAt(4, 4);
	players[0].prestige = 1000;
	const before = state();
	const score = players[0].score;
	expect(refusal({ type: "resupply", unit: inf.id })).toBe("can't resupply"); //full
	expect(refusal({ type: "reinforce", unit: tank.id })).toBe("can't reinforce"); //full strength
	expect(refusal({ type: "reinforce", unit: tank.id, overstrength: true })).toBe("can't reinforce"); //no experience
	expect(refusal({ type: "mount", unit: inf.id })).toBe("can't mount"); //no transport
	expect(refusal({ type: "unmount", unit: inf.id })).toBe("can't unmount"); //not mounted
	for (const cmd of [{ type: "resupply", unit: inf.id }, { type: "reinforce", unit: tank.id },
		{ type: "mount", unit: inf.id }, { type: "unmount", unit: inf.id }] as Command[])
		execute(scenario, cmd);
	expect([state(), players[0].score, inf.isMounted]).toEqual([before, score, false]);
});

test("Embark on a port with a naval transport left, then disembark", () => {
	const inf = unitAt(3, 3);
	expect(refusal({ type: "embark", unit: inf.id })).toBe("can't embark");
	expect(refusal({ type: "disembark", unit: inf.id })).toBe("can't disembark");
	map.map[3][3].terrain = terrainType.Port;
	expect(refusal({ type: "embark", unit: inf.id })).toBe("can't embark"); //no transports left
	players[0].navalTransports = 1;
	expect(execute(scenario, { type: "embark", unit: inf.id })).toEqual({ ok: true, result: true });
	expect(inf.carrier).toBeGreaterThan(0);
	expect(players[0].navalTransports).toBe(0);
	expect(execute(scenario, { type: "disembark", unit: inf.id })).toEqual({ ok: true, result: true });
	expect(inf.carrier).toBeLessThan(0); //leaving: the move to a disembark hex lands it
	//Back on the carrier it was leaving
	expect(execute(scenario, { type: "embark", unit: inf.id })).toEqual({ ok: true, result: true });
	expect(inf.carrier).toBeGreaterThan(0);
});

test("Undo takes back the unit's last move", () => {
	const inf = unitAt(3, 3), from = inf.getPos();
	expect(refusal({ type: "undo", unit: inf.id })).toBe("can't undo");
	execute(scenario, { type: "move", unit: inf.id, to: reachable(inf) });
	expect(refusal({ type: "undo", unit: unitAt(4, 4).id })).toBe("can't undo");
	expect(execute(scenario, { type: "undo", unit: inf.id })).toEqual({ ok: true, result: null });
	expect(inf.getPos()).toEqual(from);
	expect(inf.hasMoved).toBe(false);
});

test("Buy, upgrade, deploy and sell a core unit; upgrade and disband one on the map", () => {
	const p = players[0];
	p.prestige = 0;
	expect(refusal({ type: "buy", eqid: 0, transport: -1 })).toBe("no such equipment");
	expect(refusal({ type: "buy", eqid: 999999, transport: -1 })).toBe("no such equipment");
	expect(refusal({ type: "buy", eqid: 115, transport: 999999 })).toBe("no such equipment");
	expect(refusal({ type: "buy", eqid: 115, transport: -1 })).toBe("not enough prestige");
	p.prestige = 5000;
	expect(execute(scenario, { type: "buy", eqid: 115, transport: -1 })).toEqual({ ok: true, result: true });
	expect(p.getCoreUnitList().map((u) => [u.eqid, u.isDeployed])).toEqual([[115, false]]);
	expect(p.prestige).toBe(5000 - GameRules.calculateUnitCosts(115, -1));

	//Upgrade it before it is deployed: the same class only
	expect(refusal({ type: "upgradeUndeployed", index: 1, eqid: 115, transport: -1 })).toBe("no such unit");
	expect(refusal({ type: "upgradeUndeployed", index: 0, eqid: 142, transport: -1 })).toBe("not the same class");
	expect(execute(scenario, { type: "upgradeUndeployed", index: 0, eqid: -1, transport: -1 })).toEqual({ ok: true, result: true });

	//Deploy it on a deployment hex of its side
	expect(refusal({ type: "deploy", index: 1, to: { row: 1, col: 1 } })).toBe("no such unit");
	expect(refusal({ type: "deploy", index: 0, to: { row: 1, col: 1 } })).toBe("not a deployment hex");
	expect(refusal({ type: "deploy", index: 0, to: { row: 12, col: 1 } })).toBe("off the map");
	map.map[1][1].isDeployment = 1;
	expect(refusal({ type: "deploy", index: 0, to: { row: 1, col: 1 } })).toBe("not a deployment hex"); //the enemy's
	map.map[1][1].isDeployment = 0;
	map.map[3][3].isDeployment = 0;
	expect(refusal({ type: "deploy", index: 0, to: { row: 3, col: 3 } })).toBe("the hex is taken");
	expect(execute(scenario, { type: "deploy", index: 0, to: { row: 1, col: 1 } })).toEqual({ ok: true, result: true });
	const bought = unitAt(1, 1);
	expect(bought.isDeployed).toBe(true);
	expect(refusal({ type: "deploy", index: 0, to: { row: 1, col: 1 } })).toBe("already deployed");

	//Upgrade a unit on the map, then disband it: sold for part of its price
	expect(refusal({ type: "upgrade", unit: 99, eqid: 115, transport: -1 })).toBe("no such unit");
	expect(refusal({ type: "upgrade", unit: bought.id, eqid: 142, transport: -1 })).toBe("not the same class");
	expect(refusal({ type: "upgrade", unit: bought.id, eqid: 999999, transport: -1 })).toBe("no such equipment");
	const infantry = Equipment.getCountryEquipmentByClass(unitClass.infantry, 8).find((id) => id !== 115)!; //another one
	p.prestige = 0;
	expect(refusal({ type: "upgrade", unit: bought.id, eqid: infantry, transport: -1 })).toBe("not enough prestige");
	p.prestige = 5000;
	expect(execute(scenario, { type: "upgrade", unit: bought.id, eqid: infantry, transport: -1 })).toEqual({ ok: true, result: true });
	expect([bought.eqid, p.prestige < 5000]).toEqual([infantry, true]);
	expect(refusal({ type: "disband", unit: 99 })).toBe("no such unit");
	const prestige = p.prestige;
	expect(execute(scenario, { type: "disband", unit: bought.id })).toEqual({ ok: true, result: true });
	expect(map.getUnitById(bought.id)).toBeNull();
	expect(p.prestige).toBeGreaterThan(prestige);

	//Sell a core unit not on the map
	execute(scenario, { type: "buy", eqid: 115, transport: -1 });
	const list = p.getCoreUnitList();
	const index = list.findIndex((u) => !u.isDeployed);
	expect(refusal({ type: "sell", index: list.length })).toBe("no such unit");
	const before = [list.length, p.prestige];
	expect(execute(scenario, { type: "sell", index: index })).toEqual({ ok: true, result: true });
	expect([p.getCoreUnitList().length, p.prestige > before[1]]).toEqual([before[0] - 1, true]);
});

//(the game ends a turn through its session, with the next player's turn start and the turn limit:
//test/core-session.test.ts; the command is the step alone)
test("End turn hands the turn to the next player", () => {
	expect(check(scenario, { type: "endTurn" })).toBeNull();
	expect(execute(scenario, { type: "endTurn" })).toEqual({ ok: true, result: null });
	expect(map.currentPlayer.id).toBe(1);
});

//check refuses an upgrade where the old engine's own upgrade did nothing: the same three cases
test("An upgrade check refuses where the old engine's upgrade did nothing, and changes nothing", () => {
	const inf = unitAt(3, 3), p = players[0];
	const infantry = Equipment.getCountryEquipmentByClass(unitClass.infantry, 8).find((id) => id !== 115)!;
	const cases: [number, number, number, string][] = [ //unit id, eqid, prestige, the refusal
		[99, infantry, 5000, "no such unit"],
		[inf.id, 142, 5000, "not the same class"],
		[inf.id, infantry, 0, "not enough prestige"],
	];
	for (const [id, eqid, prestige, reason] of cases) {
		p.prestige = prestige;
		const before = state();
		expect(refusal({ type: "upgrade", unit: id, eqid: eqid, transport: -1 })).toBe(reason);
		expect(execute(scenario, { type: "upgrade", unit: id, eqid: eqid, transport: -1 }).ok).toBe(false);
		expect(state()).toBe(before);
	}
});
