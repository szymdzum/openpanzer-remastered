//Terrain caps initiative in the remaster's rules (#14): the terrain of the defender's hex limits both sides'
//initiative, as the manual says ("the terrain of the defending unit modify initiative values"). The classic
//rules compare the equipment's initiative only. On a small map built by hand
import { expect, test } from "vitest";
import { attackResult } from "../src/core/combat";
import { estimateAttack } from "../src/core/estimate";
import { classicRules, remasterRules } from "../src/core/rules";
import { terrainInitiative, terrainType } from "../src/core/tables";
import type { Contribution, Ruleset, World } from "../src/core/types";
import { unitById } from "../src/core/world";
import { handWorld } from "./coreworld";

const PZ_IIA = 140, TP7 = 273;

//A Pz IIA (initiative 7) next to a 7TP (6) on the given terrain; or the 7TP attacking the Pz IIA
function fight(rules: Ruleset, terrain: number, tankAttacks = true): World {
	const tank = { eqid: PZ_IIA, owner: tankAttacks ? 0 : 1, row: 2, col: 2 }, gun = { eqid: TP7, owner: tankAttacks ? 1 : 0, row: 2, col: 3 };
	return handWorld({ rows: 6, cols: 6, terrain: (r, c) => r === 2 && c === 3 ? terrain : terrainType.Clear,
		units: tankAttacks ? [tank, gun] : [gun, tank] }, undefined, { rules });
}

const initiativeOf = (w: World) => {
	const record: Contribution[] = [];
	attackResult(w, unitById(w, 0), unitById(w, 1), null, record);
	return record.filter((c) => c.name === "initiative").map((c) => `${c.side} ${c.field} ${c.before} -> ${c.after}`);
};

test("The remaster's attacker loses its first-strike lead in a forest, where initiative is capped for both sides (#14)", () => {
	expect(terrainInitiative[terrainType.Forest]).toBe(3);
	//7 against 6 on open ground: the attacker's edge, and a point of attack
	expect(initiativeOf(fight(remasterRules, terrainType.Clear))).toEqual(["attacker adv 9 -> 13", "attacker aav 3 -> 4"]);
	//3 against 3 in the forest: still the attacker's on a tie, but no lead in attack
	expect(initiativeOf(fight(remasterRules, terrainType.Forest))).toEqual(["attacker adv 9 -> 13"]);
});

test("The remaster's defender with the better equipment gets no edge from it in a city, where both are capped to 1 (#14)", () => {
	//the Pz IIA (7) defends against the 7TP (6) on the 7TP's side of the line: the defender's edge on open ground
	const defends = (terrain: number) => handWorld({ rows: 6, cols: 6, terrain: (r, c) => r === 2 && c === 3 ? terrain : terrainType.Clear,
		units: [{ eqid: TP7, owner: 0, row: 2, col: 2 }, { eqid: PZ_IIA, owner: 1, row: 2, col: 3 }] }, undefined, { rules: remasterRules });
	expect(initiativeOf(defends(terrainType.Clear))).toEqual(["defender ddv 9 -> 13", "defender dav 3 -> 4"]);
	expect(initiativeOf(defends(terrainType.City))).toEqual(["attacker adv 9 -> 13"]);
});

test("The cap is the defender's hex, not the attacker's: a unit attacking out of a city is not limited by it (#14)", () => {
	const w = handWorld({ rows: 6, cols: 6, terrain: (r, c) => r === 2 && c === 2 ? terrainType.City : terrainType.Clear,
		units: [{ eqid: PZ_IIA, owner: 0, row: 2, col: 2 }, { eqid: TP7, owner: 1, row: 2, col: 3 }] }, undefined, { rules: remasterRules });
	expect(initiativeOf(w)).toEqual(["attacker adv 9 -> 13", "attacker aav 3 -> 4"]);
});

test("The classic rules compare the equipment's initiative only, whatever the terrain (#14)", () => {
	for (const terrain of [terrainType.Clear, terrainType.Forest, terrainType.City])
		expect(initiativeOf(fight(classicRules, terrain))).toEqual(["attacker adv 9 -> 13", "attacker aav 3 -> 4"]);
});

test("The attack preview follows the cap: the estimate's record and result are those of the capped fight (#14)", () => {
	const w = fight(remasterRules, terrainType.Forest);
	const e = estimateAttack(w, unitById(w, 0), unitById(w, 1));
	expect(e.record.filter((c) => c.name === "initiative")).toHaveLength(1);
	expect(e.result).toEqual(attackResult(w, unitById(w, 0), unitById(w, 1), null));
});
