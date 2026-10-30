//The leaders' spotting and prestige abilities (#3): Forest Camouflage and Influence work in the remaster's rules and
//do nothing in the classic ones (the original's). On small maps built by hand, with the fog of war
import { expect, test } from "vitest";
import { attackCells } from "../src/core/attack";
import { upgradeCost } from "../src/core/costs";
import { classicRules, remasterRules } from "../src/core/rules";
import { seesUnit } from "../src/core/sight";
import { step } from "../src/core/step";
import { leaderType, terrainType } from "../src/core/tables";
import type { Ruleset, World } from "../src/core/types";
import { hexIndex, isSpotted, unitById } from "../src/core/world";
import { handWorld } from "./coreworld";

const INFANTERIE = 115, LEFH_18 = 92, PSW_233 = 119, PZ_IIA = 140, PZ_IIIE = 142;

//A Psw 233 (unit 0, spots 3) at 3,1, a leFH 18 (unit 1, fires 5) at 3,0, a Polish Infanterie (unit 2) with the leader
//given at 3,4, three hexes from the Psw, on a forest unless clear is asked, seen this round when tempSpotted
function forestWorld(rules: Ruleset, leader: number, terrain = terrainType.Forest, tempSpotted = false): World {
	return handWorld({ rows: 8, cols: 8, terrain: (row, col) => row === 3 && col === 4 ? terrain : terrainType.Clear, units: [
		{ eqid: PSW_233, owner: 0, row: 3, col: 1 }, { eqid: LEFH_18, owner: 0, row: 3, col: 0 },
		{ eqid: INFANTERIE, owner: 1, row: 3, col: 4, leader, tempSpotted }] }, undefined, { rules });
}

const infantry = (w: World) => unitById(w, 2)!;
const targets = (w: World) => attackCells(w, unitById(w, 1)!).map((c) => `${c.row},${c.col}`);

test("A unit with Forest Camouflage in a forest isn't seen by an enemy that isn't next to it in the remaster rules (#3)", () => {
	const w = forestWorld(remasterRules, leaderType.forestCamouflage);
	expect(isSpotted(w, hexIndex(w, 3, 4), 0)).toBe(true);
	expect(seesUnit(w, infantry(w), 0)).toBe(false);
	expect(targets(w)).not.toContain("3,4");
});

test("An enemy that moves next to a unit with Forest Camouflage spots it (#3)", () => {
	const r = step(forestWorld(remasterRules, leaderType.forestCamouflage), { type: "move", unit: 0, to: { row: 3, col: 3 } });
	if (r.ok === false) throw new Error(r.refusal.reason);
	expect(r.events.some((e) => e.type === "spotted" && e.units.includes(2))).toBe(true);
	expect(seesUnit(r.world, infantry(r.world), 0)).toBe(true);
	expect(targets(r.world)).toContain("3,4");
});

test("A unit with Forest Camouflage out of a forest is seen as any other (#3)", () => {
	const w = forestWorld(remasterRules, leaderType.forestCamouflage, terrainType.Clear);
	expect(seesUnit(w, infantry(w), 0)).toBe(true);
	expect(targets(w)).toContain("3,4");
});

test("A unit with Forest Camouflage is seen in a forest in the classic rules (kept, #3)", () => {
	const w = forestWorld(classicRules, leaderType.forestCamouflage);
	expect(seesUnit(w, infantry(w), 0)).toBe(true);
	expect(targets(w)).toContain("3,4");
});

test("A unit with Forest Camouflage seen this round hides again at the end of the round, no enemy next to it (#3)", () => {
	let w = forestWorld(remasterRules, leaderType.forestCamouflage, terrainType.Forest, true);
	expect(seesUnit(w, infantry(w), 0)).toBe(true);
	for (let i = 0; i < 2; i++) {
		const r = step(w, { type: "endTurn" });
		if (r.ok === false) throw new Error(r.refusal.reason);
		w = r.world;
	}
	expect(infantry(w).tempSpotted).toBe(false);
	expect(seesUnit(w, infantry(w), 0)).toBe(false);
});

//---- Influence: "Allows the unit to upgrade to better equipment at reduced prestige point cost"

const tank = (rules: Ruleset, leader: number) => {
	const w = handWorld({ rows: 4, cols: 4, units: [{ eqid: PZ_IIA, owner: 0, row: 1, col: 1, leader }] }, undefined, { rules });
	return upgradeCost(w, unitById(w, 0)!, PZ_IIIE, -1);
};

test("A unit with Influence upgrades for half the price in the remaster rules (#3)", () => {
	const full = tank(remasterRules, -1);
	expect(full).toBeGreaterThan(0);
	expect(tank(remasterRules, leaderType.influence)).toBe(full >> 1);
});

test("A unit with Influence upgrades for the full price in the classic rules (kept, #3)", () => {
	expect(tank(classicRules, leaderType.influence)).toBe(tank(classicRules, -1));
});
