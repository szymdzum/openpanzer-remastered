// @vitest-environment node
//The facts the unit card states in words (#37), each a query of the core, on hand-built worlds: the full moves its
//fuel pays for, the moves left, the shot, what riding a transport means, the resupply, what the entrenchment and the
//experience add in a fight. Each is checked against what the step and the attack actually do
import { expect, test } from "vitest";
import { canFire, canFireThisTurn, firesOnAircraft } from "../src/core/attack";
import {
	attackResult, defenderEqid, dismountsWhenAttacked, entrenchmentAgainst, entrenchmentCountsTwiceAgainst, entrenchmentFacts,
	entrenchmentAttacking, experienceBonus, INITIATIVE_DEFENCE, INITIATIVE_MAX_ATTACK, initiativeEdge, isCloseCombat, rangeDefence, riding
} from "../src/core/combat";
import { fullMoves, movesLeftThisTurn, unitMoveRange } from "../src/core/movement";
import { step, type Stepped } from "../src/core/step";
import { beginDraft, finishDraft } from "../src/core/draft";
import { weakDefences } from "../src/core/equipment";
import { canResupply } from "../src/core/supply";
import { entrenchBase, entrenchLimit, unitEndTurn } from "../src/core/turn";
import type { Contribution, UnitState, World } from "../src/core/types";
import { isRiding, unitById } from "../src/core/world";
import { leaderType, terrainNames, terrainType, unitClass } from "../src/core/tables";
import { type HandUnit, handWorld } from "./coreworld";

const PZ_IIA = 140, TP7 = 273, ME_109 = 159, INFANTERIE = 115, OPEL_BLITZ = 157, PFERDEWAGEN = 158, PAK36 = 66, FLAK36 = 79;
const PIECHOTA = 270, PF621 = 278, PIONIERZY = 268, A_WZ13 = 262, TRANSPORTSCHIFFE = 546;

//Unit 0 of a world with the German unit given at 2,2 (a Polish 7TP far off at 0,7 unless others are given)
function one(unit: Partial<HandUnit> & Pick<HandUnit, "eqid">, others: HandUnit[] = [{ eqid: TP7, owner: 1, row: 0, col: 7 }],
	terrain: (r: number, c: number) => number = () => terrainType.Clear): { w: World; u: UnitState } {
	const w = handWorld({ rows: 6, cols: 8, terrain, units: [{ owner: 0, row: 2, col: 2, ...unit }, ...others] });
	return { w, u: unitById(w, 0) };
}

const truck = (fuel = 55, ammo = 4) => ({ eqid: OPEL_BLITZ, ammo, fuel });
const fact = <T>(f: (w: World, u: UnitState) => T) => (unit: Partial<HandUnit> & Pick<HandUnit, "eqid">) => {
	const { w, u } = one(unit);
	return f(w, u);
};

function played(r: Stepped): Extract<Stepped, { ok: true }> {
	if ("refusal" in r) throw new Error(r.refusal.reason);
	return r;
}

test("A unit's full moves are its fuel over a whole turn's points and the leaders' hexes, rounded down (#37)", () => {
	const full = fact(fullMoves);
	expect(full({ eqid: PZ_IIA })).toBe(10); //50 fuel, 5 points
	expect(full({ eqid: PZ_IIA, fuel: 14 })).toBe(2);
	expect(full({ eqid: PZ_IIA, fuel: 4 })).toBe(0); //short of one full move
	//a move counts at full points, whatever is left this turn
	expect(full({ eqid: PZ_IIA, fuel: 10, moveLeft: 1, hasMoved: true })).toBe(2);
	//a leader's hexes are moves too: any leader gives a tank its class leader's hex, Aggressive Maneuver one more
	expect(full({ eqid: PZ_IIA, leader: leaderType.tankKiller })).toBe(8); //50 / 6
	expect(full({ eqid: PZ_IIA, leader: leaderType.aggressiveManeuver })).toBe(7); //50 / 7
});

test("A mounted unit's full moves are its transport's fuel over the transport's points; legs, a towed gun, horses, an aircraft, a carrier count none (#37)", () => {
	const full = fact(fullMoves);
	expect(full({ eqid: INFANTERIE, transport: truck(), isMounted: true })).toBe(5); //the Opel Blitz: 55 fuel, 10 points
	expect(full({ eqid: INFANTERIE, fuel: 0, transport: truck(31), isMounted: true })).toBe(3);
	expect(full({ eqid: INFANTERIE, transport: truck(9), isMounted: true })).toBe(0);
	expect(full({ eqid: PAK36, transport: truck(), isMounted: true })).toBe(5);
	expect(full({ eqid: INFANTERIE, transport: truck() })).toBeNull(); //on foot
	expect(full({ eqid: PAK36 })).toBeNull(); //towed, no transport
	expect(full({ eqid: PAK36, transport: { eqid: PFERDEWAGEN, ammo: 0, fuel: 0 }, isMounted: true })).toBeNull();
	expect(full({ eqid: ME_109 })).toBeNull();
	expect(full({ eqid: PZ_IIA, carrier: TRANSPORTSCHIFFE })).toBeNull();
	expect(full({ eqid: PZ_IIA, carrier: -TRANSPORTSCHIFFE })).toBe(10); //landing: its own fuel again
});

test("A move burns the points it uses: a whole turn's move on clear ground burns what fullMoves counts as one (#37)", () => {
	//tracks pay 1 a clear hex, wheels 2: five hexes are the Pz IIA's 5 points and the Opel Blitz's 10
	for (const unit of [{ eqid: PZ_IIA, fuel: 12 }, { eqid: INFANTERIE, transport: truck(25), isMounted: true }]) {
		const w = handWorld({ rows: 6, cols: 10, units: [{ owner: 0, row: 2, col: 0, ...unit }, { eqid: TP7, owner: 1, row: 5, col: 9 }] });
		const u = unitById(w, 0);
		const moved = unitById(played(step(w, { type: "move", unit: 0, to: { row: 2, col: 5 } })).world, 0);
		expect([fullMoves(w, u), fullMoves(w, moved)]).toEqual([2, 1]);
	}
});

test("The moves left this turn are the move range's reach, none once the unit has moved, mounted or with a leader (#37)", () => {
	const left = (unit: Partial<HandUnit> & Pick<HandUnit, "eqid">) => {
		const { w, u } = one(unit);
		return [movesLeftThisTurn(w, u), unitMoveRange(w, u)];
	};
	expect(left({ eqid: PZ_IIA })).toEqual([5, 5]);
	expect(left({ eqid: PZ_IIA, moveLeft: 2 })).toEqual([2, 2]); //a recon unit moving again
	expect(left({ eqid: PZ_IIA, fuel: 3 })).toEqual([3, 3]);
	expect(left({ eqid: PZ_IIA, leader: leaderType.aggressiveManeuver })).toEqual([7, 7]);
	//the leaders' hexes and a transport's whole points stay in the range after the move: only hasMoved says it is done
	expect(left({ eqid: PZ_IIA, leader: leaderType.aggressiveManeuver, moveLeft: 0, hasMoved: true })).toEqual([0, 2]);
	expect(left({ eqid: INFANTERIE, transport: truck(), isMounted: true })).toEqual([10, 10]);
	expect(left({ eqid: INFANTERIE, transport: truck(), isMounted: true, hasMoved: true })).toEqual([0, 10]);
	//a towed gun without transport moves one hex
	expect(left({ eqid: FLAK36 })).toEqual([1, 1]);
});

test("A unit can fire this turn until it fires or rides its transport, with ammo, when what it is now uses ammo (#37)", () => {
	const fires = fact(canFireThisTurn);
	expect(fires({ eqid: PZ_IIA })).toBe(true);
	expect(fires({ eqid: PZ_IIA, ammo: 1 })).toBe(true);
	expect(fires({ eqid: PZ_IIA, hasMoved: true })).toBe(true); //moving on its own tracks keeps its shot
	expect(fires({ eqid: PZ_IIA, hasFired: true })).toBe(false);
	expect(fires({ eqid: PZ_IIA, ammo: 0 })).toBe(false);
	//mounted, the transport's ammo: a horse-drawn wagon has none to use
	expect(fires({ eqid: INFANTERIE, transport: truck(), isMounted: true })).toBe(true);
	expect(fires({ eqid: INFANTERIE, ammo: 6, transport: truck(55, 0), isMounted: true })).toBe(false);
	expect(fires({ eqid: INFANTERIE, transport: { eqid: PFERDEWAGEN, ammo: 0, fuel: 0 }, isMounted: true })).toBe(false);
	//what doesn't use ammo has no shot, whatever the count says
	expect(fires({ eqid: INFANTERIE, transport: { eqid: PFERDEWAGEN, ammo: 1, fuel: 0 }, isMounted: true })).toBe(false);
});

test("Riding: a move burns the transport's fuel, not the unit's, uses all its points and its shot (#37)", () => {
	const { w } = one({ eqid: INFANTERIE, transport: truck(), isMounted: true }, [{ eqid: TP7, owner: 1, row: 5, col: 7 }]);
	const before = unitById(w, 0);
	expect(isRiding(before)).toBe(true);
	expect(riding(w, before)).toMatchObject({ transport: OPEL_BLITZ, fuel: 55 });
	const moved = unitById(played(step(w, { type: "move", unit: 0, to: { row: 2, col: 3 } })).world, 0);
	expect(moved).toMatchObject({ hasFired: true, hasMoved: true, fuel: before.fuel, transport: { fuel: 55 - 2 } }); //wheels: 2 a clear hex
	expect([canFireThisTurn(w, moved), movesLeftThisTurn(w, moved)]).toEqual([false, 0]);
	//on foot, it moves on its own points and keeps its shot
	const { w: foot } = one({ eqid: INFANTERIE, transport: truck() }, [{ eqid: TP7, owner: 1, row: 5, col: 7 }]);
	expect([isRiding(unitById(foot, 0)), riding(foot, unitById(foot, 0))]).toEqual([false, null]);
	const walked = unitById(played(step(foot, { type: "move", unit: 0, to: { row: 2, col: 3 } })).world, 0);
	expect(walked).toMatchObject({ hasFired: false, transport: { fuel: 55 } });
});

test("Riding: attacked, mounted infantry gets off and defends on foot; a mounted gun, or infantry surprised moving, defends as its transport (#37)", () => {
	const of = (unit: Partial<HandUnit> & Pick<HandUnit, "eqid">) => {
		const { w, u } = one(unit);
		return riding(w, u);
	};
	expect(of({ eqid: INFANTERIE, transport: truck(), isMounted: true }))
		.toEqual({ transport: OPEL_BLITZ, fuel: 55, dismounts: true, defendsWith: INFANTERIE, surprisedDefendsWith: OPEL_BLITZ });
	expect(of({ eqid: INFANTERIE, transport: truck(), isMounted: true, isSurprised: true }))
		.toEqual({ transport: OPEL_BLITZ, fuel: 55, dismounts: false, defendsWith: OPEL_BLITZ, surprisedDefendsWith: OPEL_BLITZ });
	expect(of({ eqid: PAK36, transport: truck(20), isMounted: true }))
		.toEqual({ transport: OPEL_BLITZ, fuel: 20, dismounts: false, defendsWith: OPEL_BLITZ, surprisedDefendsWith: OPEL_BLITZ });

	//the attack reads the equipment defenderEqid names: its ground defence against a tank
	for (const [def, eqid] of [[{ isSurprised: false }, PIECHOTA], [{ isSurprised: true }, PF621]] as const) {
		const w = handWorld({ rows: 6, cols: 8, units: [{ eqid: PZ_IIA, owner: 0, row: 2, col: 2 },
			{ eqid: PIECHOTA, owner: 1, row: 2, col: 3, transport: { eqid: PF621, ammo: 0, fuel: 55 }, isMounted: true, ...def }] });
		const d = unitById(w, 1), record: Contribution[] = [];
		attackResult(w, unitById(w, 0), d, null, record);
		expect(defenderEqid(w, d)).toBe(eqid);
		expect(record.find((c) => c.name === "attacker's type" && c.field === "ddv").after).toBe(w.equipment[eqid].grounddef);
	}
});

test("Riding: an attack on mounted infantry leaves it on foot, a mounted gun stays on its transport (#37)", () => {
	for (const [eqid, onFoot] of [[PIECHOTA, true], [A_WZ13, false]] as const) {
		const w0 = handWorld({ rows: 6, cols: 8, units: [{ eqid: PZ_IIA, owner: 0, row: 2, col: 2 },
			{ eqid, owner: 1, row: 2, col: 3, transport: { eqid: PF621, ammo: 0, fuel: 55 }, isMounted: true }] });
		const w = { ...w0, state: { ...w0.state, rng: { game: 1, ai: 7 } } };
		expect(dismountsWhenAttacked(w, unitById(w, 1))).toBe(onFoot);
		const after = unitById(played(step(w, { type: "attack", unit: 0, target: 1 })).world, 1);
		expect(after.isMounted).toBe(!onFoot);
	}
});

test("A unit can resupply when it hasn't moved, fired or resupplied and is short of ammo or fuel, its transport's too (#37)", () => {
	const can = fact(canResupply);
	expect(can({ eqid: PZ_IIA, ammo: 2 })).toBe(true);
	expect(can({ eqid: PZ_IIA, fuel: 49 })).toBe(true);
	expect(can({ eqid: PZ_IIA })).toBe(false); //full
	expect(can({ eqid: PZ_IIA, ammo: 2, hasMoved: true })).toBe(false);
	expect(can({ eqid: PZ_IIA, ammo: 2, hasFired: true })).toBe(false);
	expect(can({ eqid: PZ_IIA, ammo: 2, hasResupplied: true })).toBe(false);
	expect(can({ eqid: INFANTERIE, transport: truck(30) })).toBe(true); //the truck is short of fuel
	expect(can({ eqid: ME_109, ammo: 2 })).toBe(false); //no airfield near
});

test("Entrenchment adds its level to the defence, nothing against those that ignore it, twice for infantry in close terrain against vehicles (#37)", () => {
	const forest = () => terrainType.Forest, city = () => terrainType.City, clear = () => terrainType.Clear;
	//what an Infanterie entrenched 3 on the terrain, with the leader given, gets against an attacker
	const against = (terrain: () => number, attacker: Partial<HandUnit> & Pick<HandUnit, "eqid">, defLeader = -1) => {
		const w = handWorld({ rows: 6, cols: 8, terrain, units: [{ eqid: INFANTERIE, owner: 0, row: 2, col: 2, entrenchment: 3, leader: defLeader },
			{ owner: 1, row: 2, col: 3, ...attacker }] });
		return entrenchmentAgainst(w, unitById(w, 1), unitById(w, 0));
	};
	expect(against(clear, { eqid: TP7 })).toBe(3);
	expect(against(forest, { eqid: TP7 })).toBe(6); //a tank against infantry in a forest
	expect(against(city, { eqid: TP7 })).toBe(6);
	expect(against(forest, { eqid: PIECHOTA })).toBe(3); //infantry against infantry
	expect(against(forest, { eqid: A_WZ13 })).toBe(3); //artillery
	expect(against(clear, { eqid: PIONIERZY })).toBe(0); //pioneers ignore entrenchment
	expect(against(clear, { eqid: PIONIERZY }, leaderType.ferociousDefense)).toBe(3);
	expect(against(clear, { eqid: TP7, leader: leaderType.infiltrationTactics })).toBe(0); //anywhere
	expect(against(clear, { eqid: TP7, leader: leaderType.infiltrationTactics }, leaderType.ferociousDefense)).toBe(3);
	expect(against(clear, { eqid: TP7, leader: leaderType.streetFighter })).toBe(3); //only in a city, rough or port
	expect(against(city, { eqid: TP7, leader: leaderType.streetFighter })).toBe(0);
	expect(against(city, { eqid: TP7, leader: leaderType.streetFighter }, leaderType.ferociousDefense)).toBe(6);
	expect([unitClass.tank, unitClass.recon, unitClass.antiTank, unitClass.flak, unitClass.fortification]
		.every(entrenchmentCountsTwiceAgainst)).toBe(true);
	expect([unitClass.infantry, unitClass.groundTransport, unitClass.artillery, unitClass.airDefence, unitClass.fighter]
		.some(entrenchmentCountsTwiceAgainst)).toBe(false);
});

test("The card's entrenchment facts: its level, and where ferocious defense, street fighters and close terrain change it (#37)", () => {
	const facts = (terrain: number, unit: Partial<HandUnit> & Pick<HandUnit, "eqid">) => {
		const { w, u } = one({ entrenchment: 2, ...unit }, undefined, () => terrain);
		return entrenchmentFacts(w, u);
	};
	expect(facts(terrainType.Clear, { eqid: INFANTERIE })).toEqual({ level: 2, holds: false, streetFighters: false, doubled: false });
	expect(facts(terrainType.Forest, { eqid: INFANTERIE })).toEqual({ level: 2, holds: false, streetFighters: false, doubled: true });
	expect(facts(terrainType.City, { eqid: INFANTERIE })).toEqual({ level: 2, holds: false, streetFighters: true, doubled: true });
	expect(facts(terrainType.Rough, { eqid: INFANTERIE })).toEqual({ level: 2, holds: false, streetFighters: true, doubled: false });
	expect(facts(terrainType.City, { eqid: INFANTERIE, leader: leaderType.ferociousDefense }))
		.toEqual({ level: 2, holds: true, streetFighters: false, doubled: true });
	expect(facts(terrainType.City, { eqid: PZ_IIA })).toEqual({ level: 2, holds: false, streetFighters: true, doubled: false });
	//mounted infantry defends on foot: doubled; a mounted gun defends as its truck
	expect(facts(terrainType.Forest, { eqid: INFANTERIE, transport: truck(), isMounted: true }).doubled).toBe(true);
	expect(facts(terrainType.Forest, { eqid: PAK36, transport: truck(), isMounted: true }).doubled).toBe(false);
});

test("A move leaves no entrenchment (#37)", () => {
	const { w } = one({ eqid: PZ_IIA, entrenchment: 2 }, [{ eqid: TP7, owner: 1, row: 5, col: 7 }]);
	expect(unitById(played(step(w, { type: "move", unit: 0, to: { row: 2, col: 3 } })).world, 0).entrenchment).toBe(0);
});

test("Experience adds a point a 100 to the attack and the defence, attacking and defending (#37)", () => {
	expect([0, 99, 100, 199, 250, 599].map((experience) => experienceBonus({ experience } as UnitState))).toEqual([0, 0, 1, 1, 2, 5]);
	const w = handWorld({ rows: 6, cols: 8, units: [{ eqid: PZ_IIA, owner: 0, row: 2, col: 2, experience: 250 },
		{ eqid: TP7, owner: 1, row: 2, col: 3, experience: 120 }] });
	const record: Contribution[] = [];
	attackResult(w, unitById(w, 0), unitById(w, 1), null, record);
	expect(record.filter((c) => c.name === "experience").map((c) => [c.side, c.field, c.after - c.before]))
		.toEqual([["attacker", "aav", 2], ["attacker", "adv", 2], ["defender", "dav", 1], ["defender", "ddv", 1]]);
});

test("A hex's entrenchment limit is its terrain's base and 5 levels more, which the end of turn digs up to and no further (#37)", () => {
	const limits = [terrainType.Clear, terrainType.Hill, terrainType.Port, terrainType.Forest, terrainType.Bocage, terrainType.Mountain,
		terrainType.Rough, terrainType.City, terrainType.Fortification].map((t) => {
		const { w, u } = one({ eqid: INFANTERIE }, undefined, () => t);
		return [terrainNames[t], entrenchBase(w, u), entrenchLimit(w, u)];
	});
	expect(limits).toEqual([["Clear", 0, 5], ["Hill", 1, 6], ["Port", 1, 6], ["Forest", 2, 7], ["Bocage", 2, 7], ["Mountain", 2, 7],
		["Rough", 2, 7], ["City", 3, 8], ["Fortification", 4, 9]]);
	//a veteran in a city: the base at the first end of turn, then a level at a time, and never past the limit
	let { w } = one({ eqid: INFANTERIE, experience: 500 }, undefined, () => terrainType.City);
	const levels: number[] = [];
	for (let turn = 0; turn < 40; turn++) {
		const d = beginDraft(w);
		unitEndTurn(d, 0);
		w = finishDraft(d);
		levels.push(unitById(w, 0).entrenchment);
	}
	expect([levels[0], Math.max(...levels), levels[levels.length - 1]]).toEqual([3, 8, 8]);
});

test("The weak defence is the lowest of ground, air and close defence, when it is at most half the highest (#37)", () => {
	const weak = (grounddef: number, airdef: number, closedef: number) => weakDefences({ grounddef, airdef, closedef } as EquipmentEntry);
	expect(weak(7, 8, 2)).toEqual(["closedef"]); //the Pz IIA: 2 against 8
	expect(weak(7, 8, 4)).toEqual(["closedef"]); //half, exactly
	expect(weak(7, 8, 5)).toEqual([]);
	expect(weak(3, 10, 5)).toEqual(["grounddef"]);
	expect(weak(9, 1, 6)).toEqual(["airdef"]);
	expect(weak(2, 0, 0)).toEqual(["airdef", "closedef"]); //the lowest twice: both
	expect(weak(0, 0, 0)).toEqual([]); //nothing to be weak against
	//the game's own: the Pz IIA and the Infanterie are weak at close quarters
	const { w } = one({ eqid: PZ_IIA });
	expect([weakDefences(w.equipment[PZ_IIA]), weakDefences(w.equipment[INFANTERIE])]).toEqual([["closedef"], ["closedef"]]);
});

test("Initiative: the side with more, the attacker on a tie, gets 4 more defence and its lead in attack, up to 4 (#37)", () => {
	expect([0, 3, 7, -2, -9].map(initiativeEdge)).toEqual([{ attacker: true, defence: 4, attack: 0 }, { attacker: true, defence: 4, attack: 3 },
		{ attacker: true, defence: 4, attack: 4 }, { attacker: false, defence: 4, attack: 2 }, { attacker: false, defence: 4, attack: 4 }]);
	expect([INITIATIVE_DEFENCE, INITIATIVE_MAX_ATTACK]).toEqual([4, 4]);
	//what the attack does: a Pz IIA on a 7TP, each way, as initiativeEdge has it
	const edge = (atk: number, def: number) => {
		const w = handWorld({ rows: 6, cols: 8, units: [{ eqid: atk, owner: 0, row: 2, col: 2 }, { eqid: def, owner: 1, row: 2, col: 3 }] });
		const record: Contribution[] = [];
		attackResult(w, unitById(w, 0), unitById(w, 1), null, record);
		const lead = w.equipment[atk].initiative - w.equipment[def].initiative;
		return [lead, record.filter((c) => c.name === "initiative").map((c) => [c.side, c.field, c.after - c.before])];
	};
	for (const [atk, def] of [[PZ_IIA, TP7], [TP7, PZ_IIA], [PZ_IIA, PIECHOTA], [PIECHOTA, PZ_IIA]]) {
		const [lead, steps] = edge(atk, def), e = initiativeEdge(lead as number);
		const side = e.attacker ? "attacker" : "defender";
		expect(steps).toEqual([[side, e.attacker ? "adv" : "ddv", e.defence], ...e.attack > 0 ? [[side, e.attacker ? "aav" : "dav", e.attack]] : []]);
	}
});

test("Range defence: all of the modifier from further than the next hex within the defender's range, half adjacent or beyond it, none in close combat (#37)", () => {
	expect([rangeDefence(5, 2, 3), rangeDefence(5, 3, 3), rangeDefence(5, 1, 3), rangeDefence(5, 4, 3), rangeDefence(5, 2, 1)]).toEqual([5, 5, 2, 2, 2]);
	//what the attack does to the defender's modifier: artillery attacked by artillery two hexes off, within its range (all
	//of it) or not; an Infanterie, which fires only next to it, attacked from two hexes off (half) and next to it (half);
	//none in close combat
	const defended = (defender: number, attacker: number, col: number, terrain = terrainType.Clear) => {
		const w = handWorld({ rows: 6, cols: 8, terrain: () => terrain, units: [{ eqid: defender, owner: 0, row: 2, col: 2 },
			{ eqid: attacker, owner: 1, row: 2, col }] });
		const record: Contribution[] = [];
		attackResult(w, unitById(w, 1), unitById(w, 0), null, record);
		return record.filter((c) => c.name === "range defense" && c.side === "defender").map((c) => c.after - c.before);
	};
	const gun = (eqid: number) => handWorld({ rows: 1, cols: 1, units: [] }).equipment[eqid];
	const art = gun(A_WZ13), inf = gun(INFANTERIE);
	expect(art.gunrange).toBeGreaterThanOrEqual(2);
	expect(defended(A_WZ13, A_WZ13, 4)).toEqual([art.rangedefmod]);
	expect(defended(INFANTERIE, A_WZ13, 4)).toEqual([inf.rangedefmod >> 1]);
	expect(defended(INFANTERIE, TP7, 3)).toEqual([inf.rangedefmod >> 1]);
	expect(defended(INFANTERIE, PIECHOTA, 3, terrainType.Forest)).toEqual([]);
});

test("Close combat: infantry attacking a unit in a city, forest, mountain or fortification hex, or a fortification anywhere; the defender uses its close defence (#37)", () => {
	const close = [terrainType.Clear, terrainType.City, terrainType.Forest, terrainType.Mountain, terrainType.Fortification, terrainType.Rough,
		terrainType.Hill].filter((t) => isCloseCombat(unitClass.infantry, unitClass.tank, t));
	expect(close.map((t) => terrainNames[t])).toEqual(["City", "Forest", "Mountain", "Fortification"]);
	expect(isCloseCombat(unitClass.infantry, unitClass.fortification, terrainType.Clear)).toBe(true);
	expect(isCloseCombat(unitClass.tank, unitClass.infantry, terrainType.City)).toBe(false);
	//what the attack does: a 7TP in a forest attacked by infantry defends with its close defence, by a tank not
	const defence = (attacker: number) => {
		const w = handWorld({ rows: 6, cols: 8, terrain: () => terrainType.Forest, units: [{ eqid: TP7, owner: 1, row: 2, col: 2 },
			{ eqid: attacker, owner: 0, row: 2, col: 3 }] });
		const record: Contribution[] = [];
		attackResult(w, unitById(w, 1), unitById(w, 0), null, record);
		return record.filter((c) => c.name === "close combat" && c.side === "defender").map((c) => c.after);
	};
	const tp7 = handWorld({ rows: 1, cols: 1, units: [] }).equipment[TP7];
	expect([defence(INFANTERIE), defence(PZ_IIA)]).toEqual([[tp7.closedef], []]);
});

test("Attacking, a unit's own entrenchment adds to its defence, none in close combat (#37)", () => {
	expect([entrenchmentAttacking(3, true, false), entrenchmentAttacking(3, true, true), entrenchmentAttacking(3, false, false)]).toEqual([3, 0, 0]);
	const own = (attacker: number, terrain: number) => {
		const w = handWorld({ rows: 6, cols: 8, terrain: () => terrain, units: [{ eqid: attacker, owner: 0, row: 2, col: 2, entrenchment: 2 },
			{ eqid: PIECHOTA, owner: 1, row: 2, col: 3 }] });
		const record: Contribution[] = [];
		attackResult(w, unitById(w, 0), unitById(w, 1), null, record);
		return record.filter((c) => c.name === "entrenchment" && c.side === "attacker").map((c) => c.after - c.before);
	};
	expect([own(PZ_IIA, terrainType.Forest), own(INFANTERIE, terrainType.Clear), own(INFANTERIE, terrainType.Forest)]).toEqual([[2], [2], []]);
});

test("Only a unit with an air attack fires on aircraft (#37)", () => {
	const w = handWorld({ rows: 6, cols: 8, units: [{ eqid: PZ_IIA, owner: 0, row: 2, col: 2 }, { eqid: FLAK36, owner: 0, row: 2, col: 4 },
		{ eqid: ME_109, owner: 1, row: 2, col: 3 }] });
	expect([firesOnAircraft(w.equipment[PZ_IIA]), firesOnAircraft(w.equipment[FLAK36])]).toEqual([false, true]);
	expect([canFire(w, unitById(w, 0), unitById(w, 2)), canFire(w, unitById(w, 1), unitById(w, 2))]).toEqual([false, true]);
});
