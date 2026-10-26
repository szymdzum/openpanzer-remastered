// @vitest-environment node
//An attack estimated before it is made (src/core/estimate.ts, #347): the attack preview's numbers on hand-built
//worlds, the CombatOdds card's four examples among them, and checked against the attack the dice play
import { expect, test } from "vitest";
import { handWorld, type HandUnit } from "./coreworld";
import { estimateAttack } from "../src/core/estimate";
import { adjacent } from "../src/core/geometry";
import { step } from "../src/core/step";
import type { GameEvent } from "../src/core/events";
import type { World } from "../src/core/types";
import { hexIndex, isSpotted, unitById } from "../src/core/world";
import { terrainType } from "../src/prototypes";

const PZ_38T = 136, PZ_IIA = 140, INFANTERIE = 115, LEFH18 = 92, TP7 = 273, PIECHOTA = 270, WZ97 = 264;

//A 10 x 10 map seen by side 0, player 0's turn; the terrain given at some hexes, clear elsewhere
function hand(units: HandUnit[], terrain: Record<string, number> = {}): World {
	return handWorld({ rows: 10, cols: 10, units, terrain: (r, c) => terrain[r + "," + c] || terrainType.Clear }, undefined, { spotSide: 0 });
}

const estimate = (w: World) => estimateAttack(w, unitById(w, 0)!, unitById(w, 1)!);

//The cards' units, as CombatOdds and CombatResults show them (Ciechanów, Polish 1939 equipment)
const overrun = () => hand([{ eqid: PZ_38T, owner: 0, row: 4, col: 3 }, { eqid: TP7, owner: 1, row: 4, col: 4, strength: 3 }]);
const rugged = () => hand([{ eqid: PZ_IIA, owner: 0, row: 4, col: 3 }, { eqid: PIECHOTA, owner: 1, row: 4, col: 4, strength: 9, entrenchment: 4,
	experience: 200 }, { eqid: WZ97, owner: 1, row: 5, col: 5 }], { "4,4": terrainType.City });
const forest = (strength = 10) => hand([{ eqid: INFANTERIE, owner: 0, row: 4, col: 3 }, { eqid: PIECHOTA, owner: 1, row: 4, col: 4, strength,
	entrenchment: 2 }], { "4,4": terrainType.Forest });
const bombard = () => hand([{ eqid: LEFH18, owner: 0, row: 4, col: 1 }, { eqid: TP7, owner: 1, row: 4, col: 4, strength: 8, entrenchment: 2 }]);

test("A tank next to a weak enemy overruns it: the defender destroyed, no support fire and no return fire (CombatOdds)", () => {
	const e = estimate(overrun());
	expect(e.result).toMatchObject({ kills: 3, losses: 0, isOverrun: true, defcanfire: false });
	expect([e.support, e.stopped, e.fate]).toEqual([[], false, "destroyed"]);
	expect(e.record.map((c) => c.name)).toContain("initiative");
});

test("A rugged defense is certain before the attack, the gun the side sees fires first and counts in the losses (CombatOdds)", () => {
	const e = estimate(rugged());
	expect(e.result).toMatchObject({ kills: 0, losses: 5, isRugged: true, defcanfire: true });
	expect(e.support).toEqual([{ unit: 2, losses: 1 }]);
	expect([e.stopped, e.fate]).toEqual([false, null]);
	expect(e.record.map((c) => c.name)).toEqual(expect.arrayContaining(["city", "entrenchment", "infantry entrenched in close terrain",
		"rugged defense"]));
});

test("Close combat in a forest and a bombardment from range give the cards' numbers as the engine rounds them (#90)", () => {
	//(the card's 10 → 4 and its retreat came from the old half-point-high rounding: the engine's estimate is 5)
	const close = estimate(forest());
	expect(close.result).toMatchObject({ kills: 5, losses: 4 });
	expect(close.record.map((c) => c.name)).toContain("close combat");
	const far = estimate(bombard());
	expect(far.result).toMatchObject({ kills: 1, losses: 0, defcanfire: false });
	expect(far.fate).toBe(null);
});

//The forest's weak defender with every other neighbour taken by its own side: nowhere to go
const boxed = () => hand([{ eqid: INFANTERIE, owner: 0, row: 4, col: 3 }, { eqid: PIECHOTA, owner: 1, row: 4, col: 4, strength: 6, entrenchment: 2 },
	...adjacent(4, 4).filter((c) => !(c.row === 4 && c.col === 3)).map((c) => ({ eqid: PIECHOTA, owner: 1, ...c }))], { "4,4": terrainType.Forest });

test("A defender the attack pushes past its retreat line falls back where a hex behind it is free, else surrenders", () => {
	expect(estimate(forest(6)).fate).toBe("retreats");
	expect(estimate(boxed()).fate).toBe("surrenders");
});

test("A gun the attacker's side doesn't see isn't in the estimate; once it fired from hiding it is", () => {
	//(a 75mm three hexes from the tank, past what the tank spots)
	const w = hand([{ eqid: PZ_IIA, owner: 0, row: 4, col: 3 }, { eqid: TP7, owner: 1, row: 4, col: 4 }, { eqid: WZ97, owner: 1, row: 7, col: 3 }]);
	expect(isSpotted(w, hexIndex(w, 7, 3), 0)).toBe(false);
	expect(estimate(w).support).toEqual([]);
	unitById(w, 2)!.tempSpotted = true;
	expect(estimate(w).support).toHaveLength(1);
});

test("Support fire that takes the attacker past its retreat line stops the attack: no fate for the defender", () => {
	const w = hand([{ eqid: PZ_IIA, owner: 0, row: 4, col: 3, strength: 3 }, { eqid: TP7, owner: 1, row: 4, col: 4 },
		{ eqid: WZ97, owner: 1, row: 5, col: 5 }, { eqid: WZ97, owner: 1, row: 3, col: 4 }]);
	const e = estimate(w);
	expect(e.support.reduce((n, s) => n + s.losses, 0)).toBeGreaterThan(0);
	expect([e.stopped, e.fate]).toEqual([true, null]);
});

//How an attack the dice played ended for the defender (its id 1), from the step's events
function fateIn(events: GameEvent[]): string {
	if (events.some((x) => x.type === "destroyed" && x.unit === 1)) return "destroyed";
	if (events.some((x) => x.type === "retreated")) return "retreats";
	return events.some((x) => x.type === "surrendered") ? "surrenders" : "null";
}

//The attack played with the dice of a seed: the kills of the attack itself and the defender's fate
function played(w0: World, seed: number): { kills: number | null; fate: string } {
	const r = step({ ...w0, state: { ...w0.state, rng: { game: seed, ai: 7 } } }, { type: "attack", unit: 0, target: 1 });
	if ("refusal" in r) throw new Error(r.refusal.reason);
	const fight = r.events.find((x) => x.type === "fight" && !x.support);
	return { kills: fight !== undefined && fight.type === "fight" ? fight.result.kills : null, fate: fateIn(r.events) };
}

test("When the dice roll the estimate, the attack ends as the estimate said: the defender holds, falls back, surrenders or is destroyed", () => {
	const seen = new Set<string>();
	for (const make of [() => forest(6), boxed, () => forest(), overrun, rugged]) {
		const w0 = make(), e = estimate(w0);
		const rolled = Array.from({ length: 300 }, (_, i) => played(w0, i + 1)).filter((p) => p.kills === e.result.kills);
		for (const p of rolled) expect(p.fate).toBe(String(e.fate));
		for (const p of rolled) seen.add(p.fate);
	}
	expect([...seen].sort()).toEqual(["destroyed", "null", "retreats", "surrenders"]);
});
