//The combat log's turn summary from the combats it was told about, on units made by hand: what the
//attack and the summary window (src/uicombatlog.ts) read of each unit
import { beforeEach, expect, test } from "vitest";
import { CombatLog } from "../src/combatlog";
import { Cell } from "../src/prototypes";
import type { Unit } from "../src/unit";

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
