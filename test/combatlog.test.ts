//The combat log's turn summary from the combats it was told about, on units made by hand: what the
//attack and the summary window (src/uicombatlog.ts) read of each unit
import { beforeEach, expect, test, vi } from "vitest";
import { CombatLog } from "../src/legacy/combatlog";
import { Cell } from "../src/legacy/prototypes";
import type { Unit } from "../src/legacy/unit";
import { freshGame, startState } from "./lifecycle";

function unit(id: number, side: number, strength: number, entrenchment: number): Unit {
	return { id, eqid: 100 + id, player: { side }, strength, experience: 0, entrenchment, ammo: 5, isMounted: false,
		isSurprised: false, isCore: false, getPos: () => new Cell(id, id) } as unknown as Unit;
}

beforeEach(() => CombatLog.reset());

test("The combat log counts the entrenchment the defender lost and its attacker once (#79)", () => {
	const id = CombatLog.addCombatStart(unit(1, 0, 10, 1), unit(2, 1, 10, 4), 1);
	CombatLog.addCombatEnd(unit(1, 0, 8, 1), unit(2, 1, 7, 2), id, false);
	const defender = CombatLog.log.combat[2];
	expect(defender.entrenchLost).toBe(2);
	expect(defender.unitCombatList).toEqual([1]);
	expect(CombatLog.log.combat[1]).toMatchObject({ entrenchLost: 0, unitCombatList: [2] });
});

test("The resupply report lists the first unit of the scenario, id 0 (#114)", () => {
	CombatLog.addResupply(Object.assign(unit(0, 1, 10, 0), { fuel: 20 }));
	expect(CombatLog.log.resupply[0]).toMatchObject({ eqid: 100, ammo: 5, fuel: 20, side: 1 });
});

test("A fight is logged with the turn it is fought on, not a global map's (#28)", async () => {
	const game = await freshGame();
	await startState(game, "campaign:0:1");
	const { CombatLog: log } = await import("../src/legacy/combatlog");
	const { Commands } = await import("../src/legacy/commands");
	const { GameRules } = await import("../src/legacy/gamerules");
	const map = game.scenario.map;
	const own = map.getUnits().filter((u) => u.player.id === map.currentPlayer.id);
	const [attacker, defender] = own.flatMap((a) => map.getUnits().filter((d) => GameRules.isEnemy(a, d)
		&& GameRules.canInitiateAttack(a, d) && GameRules.isInAttackRange(a, d)).map((d) => [a, d]))[0];
	const started = vi.spyOn(log, "addCombatStart");
	expect(Commands.execute(game.scenario, { type: "attack", unit: attacker.id, target: defender.id }).ok).toBe(true);
	expect(started.mock.calls.length).toBeGreaterThan(0);
	expect(started.mock.calls.map((c) => c[2])).toEqual(started.mock.calls.map(() => map.turn));
}, 60_000);
