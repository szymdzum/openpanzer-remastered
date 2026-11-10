//Interception (#632): in the remaster rules, as the manual says, "Fighters adjacent to defending bombers or ground
//units may intercept attacking air units, but fighters may make only one interception per turn, and each attacking
//air unit may be intercepted only once per turn". Flak and air defence fire in support as before. The classic rules
//keep the original's: every fighter with the attacker in its range fires, as often as its ammo lasts. On a small map
//built by hand: the defender on 5,5, the attackers on the hexes next to it
import { expect, test } from "vitest";
import { supportFireUnits } from "../src/core/attack";
import { estimateAttack } from "../src/core/estimate";
import type { GameEvent } from "../src/core/events";
import { adjacent, distance } from "../src/core/geometry";
import { classicRules, remasterRules } from "../src/core/rules";
import { step } from "../src/core/step";
import { leaderType } from "../src/core/tables";
import type { Position, Ruleset, UnitState, World } from "../src/core/types";
import { unitById } from "../src/core/world";
import { germanyPoland, type HandUnit, handWorld } from "./coreworld";

const JU87 = 173, ME109 = 159;
const PIECHOTA = 270, P11C = 280, KARAS = 281, WZ36 = 726;

const AT: Position = { row: 5, col: 5 };
const around = adjacent(AT.row, AT.col);
//Two hexes next to the defender for the attackers, and by the first of them a hex next to the defender and one two away
const FROM = around[0], FROM2 = around[3];
const apart = (a: Position, b: Position) => distance(a.row, a.col, b.row, b.col);
const NEAR = around.find((c) => apart(c, FROM) === 1)!;
const FAR = adjacent(FROM.row, FROM.col).find((c) => apart(c, AT) === 2)!;

const german = (eqid: number, at: Position, more: Partial<UnitState> = {}): HandUnit => ({ eqid, owner: 0, ...at, ...more });
const polish = (eqid: number, at: Position, more: Partial<UnitState> = {}): HandUnit => ({ eqid, owner: 1, ...at, ...more });

function hand(units: HandUnit[], rules: Ruleset): World {
	const w = handWorld({ rows: 10, cols: 10, units }, germanyPoland, { rules, noFOW: true });
	w.state.rng = { game: 7, ai: 1 };
	return w;
}

//The world after the attack, and the units that fired in support
function attack(w: World, unit: number, target: number): { world: World; support: number[] } {
	const r = step(w, { type: "attack", unit, target });
	if ("refusal" in r) throw new Error("attack refused: " + r.refusal.reason);
	const fights = r.events.filter((e): e is Extract<GameEvent, { type: "fight" }> => e.type === "fight");
	return { world: r.world, support: fights.filter((e) => e.support).map((e) => e.attacker.unit) };
}

const supporters = (w: World, unit: number, target: number) => supportFireUnits(w, unitById(w, unit), unitById(w, target)).map((u) => u.id);
const endTurn = (w: World): World => {
	const r = step(w, { type: "endTurn" });
	if ("refusal" in r) throw new Error(r.refusal.reason);
	return r.world;
};

test("only a fighter next to the defender intercepts an attacking aircraft (#632)", () => {
	//A Stuka by Polish infantry; a P.11c next to the Stuka but two hexes from the infantry, another next to both
	const units = [german(JU87, FROM), polish(PIECHOTA, AT), polish(P11C, FAR), polish(P11C, NEAR)];
	const w = hand(units, remasterRules);
	expect(supporters(w, 0, 1)).toEqual([3]);
	expect(attack(w, 0, 1).support).toEqual([3]);
	//(over the defender's own hex is next to it)
	const above = hand([german(JU87, FROM), polish(PIECHOTA, AT), polish(P11C, FAR), polish(P11C, AT)], remasterRules);
	expect(supporters(above, 0, 1)).toEqual([3]);
	expect(supporters(hand(units, classicRules), 0, 1)).toEqual([2, 3]);
});

test("a fighter intercepts once a turn (#632)", () => {
	//Two Stukas on the infantry, one P.11c over it: it meets the first, not the second
	const w = hand([german(JU87, FROM), polish(PIECHOTA, AT), german(JU87, FROM2), polish(P11C, AT)], remasterRules);
	const first = attack(w, 0, 1);
	expect(first.support).toEqual([3]);
	expect(unitById(first.world, 3).intercepted).toBe(true);
	expect(supporters(first.world, 2, 1)).toEqual([]);
	expect(attack(first.world, 2, 1).support).toEqual([]);
	//the next player's turn: it can again
	const next = endTurn(first.world);
	expect("intercepted" in unitById(next, 3)).toBe(false);
	expect(supporters(next, 2, 1)).toEqual([3]);
});

test("a fighter with Skilled Interceptor intercepts every attacker (#632, #3)", () => {
	const ace = polish(P11C, AT, { leader: leaderType.skilledInterceptor });
	const w = hand([german(JU87, FROM), polish(PIECHOTA, AT), german(JU87, FROM2), ace], remasterRules);
	const first = attack(w, 0, 1);
	expect([first.support, attack(first.world, 2, 1).support]).toEqual([[3], [3]]);
});

test("an attacking aircraft is intercepted once a turn (#632)", () => {
	//Two P.11c next to the infantry: the first in the units' order meets the Stuka, the other is left for the next one
	const stuka = german(JU87, FROM, { leader: leaderType.devastatingFire });
	const w = hand([stuka, polish(PIECHOTA, AT), german(JU87, FROM2), polish(P11C, NEAR), polish(P11C, AT)], remasterRules);
	const first = attack(w, 0, 1);
	expect(first.support).toEqual([3]);
	expect(unitById(first.world, 0).wasIntercepted).toBe(true);
	//Devastating Fire's second attack of the turn: the fighter that hasn't intercepted leaves it alone
	expect(unitById(first.world, 0).hasFired).toBe(false);
	expect(attack(first.world, 0, 1).support).toEqual([]);
	expect(attack(first.world, 2, 1).support).toEqual([4]);
	expect("wasIntercepted" in unitById(endTurn(first.world), 0)).toBe(false);
});

test("air defence still fires in support beside the interception, as often as it is in range (#632)", () => {
	const w = hand([german(JU87, FROM), polish(PIECHOTA, AT), german(JU87, FROM2), polish(P11C, AT), polish(WZ36, NEAR)], remasterRules);
	const first = attack(w, 0, 1);
	expect(first.support).toEqual([3, 4]);
	expect("intercepted" in unitById(first.world, 4)).toBe(false);
	expect(supporters(first.world, 2, 1)).toEqual(apart(NEAR, FROM2) <= 2 ? [4] : []);
});

test("the estimate counts only the interception that will happen (#632)", () => {
	const w = hand([german(JU87, FROM), polish(PIECHOTA, AT), german(JU87, FROM2), polish(P11C, FAR), polish(P11C, NEAR), polish(P11C, AT)],
		remasterRules);
	const shots = (x: World, unit: number) => estimateAttack(x, unitById(x, unit), unitById(x, 1)).support.map((s) => s.unit);
	expect(shots(w, 0)).toEqual([4]);
	const first = attack(w, 0, 1);
	expect(first.support).toEqual([4]);
	//the second Stuka: the fighter over the infantry is left, and after it nobody
	expect(shots(first.world, 2)).toEqual([5]);
	const second = attack(first.world, 2, 1);
	expect(second.support).toEqual([5]);
	expect(shots(hand([german(JU87, FROM, { wasIntercepted: true }), polish(PIECHOTA, AT), polish(P11C, AT)], remasterRules), 0)).toEqual([]);
});

test("in the classic rules every fighter in range still fires (#632)", () => {
	//Two Me-109 on a Karas, two P.11c next to both attackers' hexes or not: each fires at every attacker in its range
	const units = [german(ME109, FROM), polish(KARAS, AT), german(ME109, NEAR), polish(P11C, FAR), polish(P11C, FROM2)];
	const w = hand(units, classicRules);
	const first = attack(w, 0, 1);
	expect(first.support).toEqual([3]);
	const again = hand([...units.slice(0, 3), polish(P11C, FAR), polish(P11C, adjacent(FROM.row, FROM.col).find((c) => apart(c, AT) === 2
		&& !(c.row === FAR.row && c.col === FAR.col))!)], classicRules);
	const both = attack(again, 0, 1);
	expect(both.support).toEqual([3, 4]);
	//the same fighters at the second attacker if it is in their range: nothing is counted
	expect(JSON.stringify(both.world.state.units)).not.toMatch(/ntercepted/);
	expect(supporters(both.world, 0, 1)).toEqual([3, 4]);
});
