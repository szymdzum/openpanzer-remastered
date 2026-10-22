/**
 * Combat - an attack's result as named steps (#118): each step changes the four values the attack
 * compares, in today's order, and can say what it changed. Then the dice, or the estimate, and the
 * experience
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

import {
	leaderType, roadType, terrainType, UNIT_MAX_EXPERIENCE, UNIT_RETREAT_THRESHOLD, unitClass, unitEntrenchRate, unitType
} from "../prototypes";
import { nextRandom, type RngStream } from "../rng";
import { canFire, supportFireUnits, unitAttackRange } from "./attack";
import { ignoresEntrenchment } from "./equipment";
import { distance } from "./geometry";
import type {
	CombatResult, CombatStep, CombatValues, Contribution, Fight, Side, UnitState, World
} from "./types";
import { hasLeader, isAir, isCloseCombatTerrain, isGround, isSea } from "./units";
import { hexIndex, isSpotted, sideOf, unitData } from "./world";

//Sets a value of the fight, recorded when the fight keeps a record and the value changed
function change(f: Fight, name: string, side: Side, field: keyof CombatValues, value: number) {
	const before = f.values[field];
	f.values[field] = value;
	if (f.record !== null && before !== value) f.record.push({ name, side, field, before, after: value });
}

function add(f: Fight, name: string, side: Side, field: keyof CombatValues, amount: number) {
	change(f, name, side, field, f.values[field] + amount);
}

const expBars = (u: UnitState) => (u.experience / 100) >> 0;

//A step that applies a leader's bonus to the side that has it
function leaderStep(name: string, leader: number, run: (f: Fight, atk: boolean, def: boolean) => void): CombatStep {
	return { name, run: (f) => run(f, hasLeader(f.world, f.atk, leader), hasLeader(f.world, f.def, leader)) };
}

//In a river or a stream, with no road
function inRiver(terrain: number, road: number): boolean {
	return (terrain === terrainType.River || terrain === terrainType.Stream) && road === roadType.none;
}

//The entrenchment each side's defense counts: intact, the attacker's not in close combat; none
//against infiltration tactics, unless with ferocious defense
function entrenchments(f: Fight): [number, number] {
	const w = f.world;
	let a = f.aEntrenchIntact && !f.isCloseCombat ? f.atk.entrenchment : 0;
	let d = f.dEntrenchIntact ? f.def.entrenchment : 0;
	if (hasLeader(w, f.atk, leaderType.infiltrationTactics) && !hasLeader(w, f.def, leaderType.ferociousDefense)) d = 0;
	if (hasLeader(w, f.def, leaderType.infiltrationTactics) && !hasLeader(w, f.atk, leaderType.ferociousDefense)) a = 0;
	return [a, d];
}

//Infantry in a city, forest or mountain, not attacked by infantry, artillery, air or ships: its
//entrenchment counts twice
function entrenchedInCloseTerrain(f: Fight): boolean {
	return f.dData.uclass === unitClass.infantry && isCloseCombatTerrain(f.dTerrain) && !f.isCloseCombat
		&& f.aData.uclass > unitClass.infantry && f.aData.uclass < unitClass.groundTransport;
}

//Anti-tank that moved has no range defense, unless a tank killer
function attackerRangeDefense(f: Fight): boolean {
	return !(f.aData.uclass === unitClass.antiTank && f.atk.hasMoved && !hasLeader(f.world, f.atk, leaderType.tankKiller));
}

//The steps of an attack, in the order the old engine applies them (GameRules.calculateAttackResults)
export const classicCombat: CombatStep[] = [
	{ name: "infantry dismounts", run(f) {
		//a mounted infantry defender fights on foot, unless surprised
		if (f.def.isMounted && !f.def.isSurprised && unitData(f.world, f.def, true).uclass === unitClass.infantry)
			f.dData = f.world.equipment[f.def.eqid];
	} },
	{ name: "attacker's type", run(f) {
		//the defender's attack and defense against what the attacker is
		const d = f.dData, name = "attacker's type";
		switch (f.aType) {
			case unitType.air:
				change(f, name, "defender", "dav", d.airatk);
				change(f, name, "defender", "ddv", d.airdef);
				break;
			case unitType.soft:
				change(f, name, "defender", "dav", d.softatk);
				change(f, name, "defender", "ddv", d.grounddef);
				break;
			case unitType.hard:
				change(f, name, "defender", "dav", d.hardatk);
				change(f, name, "defender", "ddv", d.grounddef);
				break;
			case unitType.sea:
				change(f, name, "defender", "dav", d.navalatk);
				change(f, name, "defender", "ddv", d.grounddef);
				//kept bug #88: the next step overwrites it
				if (d.uclass === unitClass.submarine) change(f, name, "attacker", "adv", f.aData.closedef);
				break;
		}
	} },
	{ name: "defender's type", run(f) {
		//the attacker's attack and defense against what the defender is
		const a = f.aData, name = "defender's type";
		switch (f.dType) {
			case unitType.air:
				change(f, name, "attacker", "aav", a.airatk);
				change(f, name, "attacker", "adv", a.airdef);
				break;
			case unitType.soft:
				change(f, name, "attacker", "aav", a.softatk);
				change(f, name, "attacker", "adv", a.grounddef);
				break;
			case unitType.hard:
				change(f, name, "attacker", "aav", a.hardatk);
				change(f, name, "attacker", "adv", a.grounddef);
				break;
			case unitType.sea:
				change(f, name, "attacker", "aav", a.navalatk);
				change(f, name, "attacker", "adv", a.grounddef);
				if (a.uclass === unitClass.submarine) change(f, name, "defender", "ddv", f.dData.closedef);
				break;
		}
	} },
	{ name: "close combat", run(f) {
		//infantry attacking in close terrain or a fortification: the defender uses its close defense,
		//and against infantry so does the attacker; otherwise the attacker gets +4
		f.isCloseCombat = (isCloseCombatTerrain(f.dTerrain) || f.dData.uclass === unitClass.fortification)
			&& f.aData.uclass === unitClass.infantry;
		if (!f.isCloseCombat) return;
		change(f, "close combat", "defender", "ddv", f.dData.closedef);
		if (f.dData.uclass === unitClass.infantry)
			change(f, "close combat", "attacker", "adv", f.aData.closedef);
		else
			add(f, "close combat", "attacker", "aav", 4);
	} },
	leaderStep("aggressive attack", leaderType.aggressiveAttack, (f, atk, def) => {
		if (atk) {
			add(f, "aggressive attack", "attacker", "aav", 4);
			add(f, "aggressive attack", "attacker", "adv", 2);
		}
		if (def) {
			add(f, "aggressive attack", "defender", "dav", 2);
			add(f, "aggressive attack", "defender", "ddv", 2);
		}
	}),
	leaderStep("determined defense", leaderType.determinedDefense, (f, atk, def) => {
		if (atk) add(f, "determined defense", "attacker", "adv", 2);
		if (def) {
			add(f, "determined defense", "defender", "dav", 2);
			add(f, "determined defense", "defender", "ddv", 4);
		}
	}),
	leaderStep("tenacious defense", leaderType.tenaciousDefense, (f, atk, def) => {
		//not against air
		if (atk && f.dType !== unitType.air) add(f, "tenacious defense", "attacker", "adv", 4);
		if (def && f.aType !== unitType.air) add(f, "tenacious defense", "defender", "ddv", 4);
	}),
	{ name: "skilled ground attack", run(f) {
		const w = f.world;
		if (isAir(w, f.atk) && hasLeader(w, f.atk, leaderType.skilledGroundAttack) && isGround(w, f.def))
			add(f, "skilled ground attack", "attacker", "aav", 4);
	} },
	{ name: "artillery defender", run(f) {
		if (f.dData.uclass === unitClass.artillery) add(f, "artillery defender", "attacker", "adv", 3);
	} },
	{ name: "city", run(f) {
		if (f.dTerrain === terrainType.City) add(f, "city", "defender", "ddv", 4);
	} },
	{ name: "river", run(f) {
		//a unit in a river or stream without a road fights worse: its enemy gets +4 and +4
		if (inRiver(f.dTerrain, f.dRoad)) {
			add(f, "defender in a river", "attacker", "aav", 4);
			add(f, "defender in a river", "attacker", "adv", 4);
		}
		if (inRiver(f.aTerrain, f.aRoad)) {
			add(f, "attacker in a river", "defender", "dav", 4);
			add(f, "attacker in a river", "defender", "ddv", 4);
		}
	} },
	{ name: "entrenchment", run(f) {
		const [a, d] = entrenchments(f);
		add(f, "entrenchment", "attacker", "adv", a);
		add(f, "entrenchment", "defender", "ddv", d);
		if (entrenchedInCloseTerrain(f)) add(f, "infantry entrenched in close terrain", "defender", "ddv", d);
	} },
	{ name: "experience", run(f) {
		const a = expBars(f.atk), d = expBars(f.def);
		add(f, "experience", "attacker", "aav", a);
		add(f, "experience", "attacker", "adv", a);
		add(f, "experience", "defender", "dav", d);
		add(f, "experience", "defender", "ddv", d);
	} },
	{ name: "hits", run(f) {
		//the defender's hits this turn lower its defense, not against artillery, fortifications and ships
		const uclass = f.aData.uclass;
		if (uclass === unitClass.artillery || uclass === unitClass.fortification
			|| (uclass >= unitClass.submarine && uclass <= unitClass.lightCruiser))
			return;
		const penalty = f.def.hits * 2;
		change(f, "hits", "defender", "ddv", f.values.ddv <= penalty ? 0 : f.values.ddv - penalty);
	} },
	{ name: "range defense", run(f) {
		//ground against ground, not in close combat: half the modifier next to each other or out of
		//the defender's range, all of it otherwise
		const w = f.world, d = f.distance;
		if (!isGround(w, f.atk) || !isGround(w, f.def) || f.isCloseCombat) return;
		const half = d <= 1 || unitAttackRange(w, f.def) < d;
		if (attackerRangeDefense(f)) add(f, "range defense", "attacker", "adv", half ? f.aData.rangedefmod >> 1 : f.aData.rangedefmod);
		add(f, "range defense", "defender", "ddv", half ? f.dData.rangedefmod >> 1 : f.dData.rangedefmod);
	} },
	{ name: "initiative", run(f) {
		const w = f.world;
		let diff = f.aData.initiative - f.dData.initiative;
		if (hasLeader(w, f.atk, leaderType.firstStrike)) diff = Math.abs(diff);
		if (hasLeader(w, f.def, leaderType.firstStrike)) diff = -Math.abs(diff);
		if (diff >= 0) {
			add(f, "initiative", "attacker", "adv", 4);
			add(f, "initiative", "attacker", "aav", Math.min(4, diff));
		} else {
			add(f, "initiative", "defender", "ddv", 4);
			add(f, "initiative", "defender", "dav", Math.min(4, -diff));
		}
	} },
	{ name: "rugged defense", run(f) {
		//an entrenched defender next to the attacker, or a surprised attacker: no defense, half attack
		if (f.distance === 1 && f.dEntrenchIntact && isRuggedDefense(f.world, f.atk, f.def))
			f.result.isRugged = true;
		if (!f.atk.isSurprised && !f.result.isRugged) return;
		const name = f.atk.isSurprised ? "surprised" : "rugged defense";
		const side: Side = f.atk.isSurprised ? "attacker" : "defender";
		change(f, name, side, "adv", 0);
		change(f, name, side, "aav", f.values.aav / 2);
	} },
	{ name: "fire back", run(f) {
		//not from range, but ships against ships in the defender's gun range; not without a way to fire
		const w = f.world, d = f.distance;
		if (d > 1 && !(isSea(w, f.atk) && isSea(w, f.def) && f.dData.gunrange >= d))
			f.result.defcanfire = false;
		if (!canFire(w, f.def, f.atk))
			f.result.defcanfire = false;
	} },
];

function newResult(): CombatResult {
	return { kills: 0, losses: 0, atkSuppress: 0, defSuppress: 0, atkExpGained: 0, defExpGained: 0, defcanfire: true,
		atkLeaderGain: false, defLeaderGain: false, isOverrun: false, isRugged: false };
}

//An attack of atk on def alone (GameRules.calculateAttackResults). rng: the stream the dice come
//from, the game's (D8); null for the estimate, which draws nothing. record: what each step changed
export function attackResult(w: World, atk: UnitState, def: UnitState, rng: RngStream | null,
	record: Contribution[] | null = null): CombatResult {
	const aAir = isAir(w, atk), dAir = isAir(w, def);
	const aHex = hexIndex(w, atk.row, atk.col), dHex = hexIndex(w, def.row, def.col);
	//an air unit fights over clear terrain
	const aTerrain = aAir ? terrainType.Clear : w.data.hexes[aHex].terrain;
	const dTerrain = dAir ? terrainType.Clear : w.data.hexes[dHex].terrain;
	const aData = unitData(w, atk), dData = unitData(w, def);
	const f: Fight = {
		world: w, atk, def, aData, dData, aType: aData.target, dType: dData.target, aTerrain, dTerrain,
		aRoad: w.data.hexes[aHex].road, dRoad: w.data.hexes[dHex].road,
		distance: distance(atk.row, atk.col, def.row, def.col),
		aEntrenchIntact: isEntrenchmentIntact(w, def, atk, aTerrain), dEntrenchIntact: isEntrenchmentIntact(w, atk, def, dTerrain),
		isCloseCombat: false, values: { aav: 0, adv: 0, dav: 0, ddv: 0 }, result: newResult(), record,
	};
	for (const s of w.rules.combat) s.run(f);
	resolve(f, rng);
	return f.result;
}

//The dice (or the estimate), the tank's overrun and the experience both units gain
function resolve(f: Fight, rng: RngStream | null) {
	const { world: w, atk, def, values: v, result: cr } = f;
	const name = rng ? "dice" : "estimate";
	cr.kills = combatKills(w, v.aav, v.ddv, atk, def, rng);
	if (f.record !== null) f.record.push({ name, side: "attacker", field: "kills", before: 0, after: cr.kills });
	if (cr.defcanfire) {
		cr.losses = combatKills(w, v.dav, v.adv, def, atk, rng);
		if (f.record !== null) f.record.push({ name, side: "defender", field: "losses", before: 0, after: cr.losses });
	}
	//Tanks overrun a destroyed defender next to them
	cr.isOverrun = f.aData.uclass === unitClass.tank && cr.losses <= 1 && cr.kills >= def.strength && f.distance === 1
		&& !atk.isSurprised;
	experience(f);
}

//The experience the units gain: by the kills and losses, more against a stronger enemy, up to the cap
function experience(f: Fight) {
	const { atk, def, values: v, result: cr } = f;
	const bonus = (a: number, b: number) => Math.max(1, a + 6 - b);
	cr.atkExpGained = ((bonus(v.dav, v.adv) * (def.strength / 10) + bonus(v.ddv, v.aav)) * cr.kills) >> 0;
	cr.defExpGained = (2 * cr.kills) >> 0;
	if (cr.defcanfire) {
		cr.atkExpGained += 2 * cr.losses;
		cr.defExpGained += (bonus(v.aav, v.ddv) * (atk.strength / 10) + bonus(v.adv, v.dav)) * cr.losses;
	}
	//(the sum compared, not the room left: they round differently)
	if (atk.experience + cr.atkExpGained > UNIT_MAX_EXPERIENCE) cr.atkExpGained = UNIT_MAX_EXPERIENCE - atk.experience;
	if (def.experience + cr.defExpGained > UNIT_MAX_EXPERIENCE) cr.defExpGained = UNIT_MAX_EXPERIENCE - def.experience;
}

//The kill fraction: the attack over the defense, beyond 4 counted at 2/5, and the leaders'
function killFraction(w: World, atkval: number, defval: number, atk: UnitState, def: UnitState): number {
	let kF = atkval - defval;
	if (kF > 4) kF = 4 + (2 * kF - 8) / 5; //PG2 formula
	if (hasLeader(w, atk, leaderType.overwhelmingAttack)) kF += 2;
	if (hasLeader(w, def, leaderType.resilience)) kF -= 2;
	return kF;
}

//The lowest roll that kills a strength point: higher for artillery, level bombers, fortifications
//and ships firing on land
function hitThreshold(w: World, atk: UnitState, def: UnitState): number {
	const atkclass = unitData(w, atk).uclass;
	return atkclass === unitClass.artillery || atkclass === unitClass.levelBomber || atkclass === unitClass.fortification
		|| (isSea(w, atk) && !isSea(w, def)) ? 19 : 15;
}

//The strength atk kills with attack value atkval against defense defval: a die per strength point,
//or the expected number with rng null. Overwhelming attack kills one more
function combatKills(w: World, atkval: number, defval: number, atk: UnitState, def: UnitState, rng: RngStream | null): number {
	const kF = killFraction(w, atkval, defval, atk, def);
	const threshold = hitThreshold(w, atk, def);
	let kills = rng === null ? (5 * Math.min(19, Math.max(1, kF + 21 - threshold)) * atk.strength + 50) / 100
		: rolledKills(rng, kF, threshold, atk.strength);
	if (hasLeader(w, atk, leaderType.overwhelmingAttack)) kills += 1;
	return Math.round(kills);
}

//A die per strength point: 1 always misses, 20 always hits, the others hit from threshold - kF
function rolledKills(rng: RngStream, kF: number, threshold: number, strength: number): number {
	let kills = 0;
	for (let i = 0; i < strength; i++) {
		let roll = rollDice(rng, 1, 20);
		if (roll > 1 && roll < 20) roll += kF;
		if (roll >= threshold) kills++;
	}
	return kills;
}

//A random integer from min to max, both included, from the stream
export function rollDice(rng: RngStream, min: number, max: number): number {
	const lo = Math.ceil(min), hi = Math.floor(max);
	return Math.floor(nextRandom(rng) * (hi - lo + 1)) + lo;
}

//The attack with the support fire on the attacker first (GameRules.calculateCombatResults), unless
//the attacker is surprised. withHiddenUnits: the losses of every support unit, with the kills and
//losses as they come; otherwise only of the support units the attacker's side sees, capped at
//each unit's strength (kept bug #87: the kills on the support units count as kills on the target)
export function combatResult(w: World, atk: UnitState, def: UnitState, withHiddenUnits: boolean, rng: RngStream | null,
	record: Contribution[] | null = null): CombatResult {
	const side = sideOf(w, atk);
	let realLosses = 0, realKills = 0, evalLosses = 0, evalKills = 0;
	const support = atk.isSurprised ? [] : supportFireUnits(w, atk, def);
	for (const s of support) {
		const cr = attackResult(w, s, atk, rng);
		if (isSpotted(w, hexIndex(w, s.row, s.col), side) || s.tempSpotted) {
			if (record !== null) record.push({ name: "support fire", side: "defender", field: "losses", before: evalLosses, after: evalLosses + cr.kills });
			evalLosses += cr.kills; //the support's kills are the attacker's losses
			evalKills += cr.losses;
		}
		realLosses += cr.kills;
		realKills += cr.losses;
	}

	const cr = attackResult(w, atk, def, rng, record);
	const losses = withHiddenUnits ? realLosses + cr.losses : Math.min(evalLosses + cr.losses, atk.strength);
	const kills = withHiddenUnits ? realKills + cr.kills : Math.min(evalKills + cr.kills, def.strength);
	cr.losses = losses;
	cr.kills = kills;
	return cr;
}

//Whether def's entrenchment counts against atk on terrain: not against a unit that ignores it, or
//an infiltrating or street fighting one in a city, rough or port; always with ferocious defense
export function isEntrenchmentIntact(w: World, atk: UnitState, def: UnitState, terrain: number): boolean {
	if (hasLeader(w, def, leaderType.ferociousDefense)) return true;
	if (ignoresEntrenchment(w.equipment, atk.eqid)) return false;
	return !((hasLeader(w, atk, leaderType.infiltrationTactics) || hasLeader(w, atk, leaderType.streetFighter))
		&& (terrain === terrainType.City || terrain === terrainType.Rough || terrain === terrainType.Port));
}

//An entrenched defender's rugged defense: its experience, leader and entrenchment rate against the
//attacker's
export function isRuggedDefense(w: World, atk: UnitState, def: UnitState): boolean {
	let aRugged = expBars(atk) + 2;
	let dRugged = expBars(def) + 2;
	if (hasLeader(w, atk, leaderType.tenaciousDefense)) aRugged += 2;
	if (hasLeader(w, def, leaderType.tenaciousDefense)) dRugged += 2;
	const aRate = unitEntrenchRate[unitData(w, atk).uclass] + 1;
	const dRate = unitEntrenchRate[unitData(w, def).uclass] + 1;
	return (5 * ((50 * dRugged) / aRugged) * dRate * def.entrenchment) / (50 * aRate) > 50;
}

//A strength loss that makes a unit retreat: units that started weaker retreat sooner
export function isLossOverRetreatThreshold(strength: number, oldStrength: number): boolean {
	return (oldStrength - strength) / oldStrength >= UNIT_RETREAT_THRESHOLD - (10 - oldStrength) / 2 / 10;
}

//Ground against ground, not by artillery, a tactical bomber or a fortification
export function shouldDefenderRetreat(w: World, atk: UnitState, def: UnitState, oldStrength: number): boolean {
	const uclass = unitData(w, atk).uclass;
	if (!isGround(w, atk) || !isGround(w, def)) return false;
	if (uclass === unitClass.artillery || uclass === unitClass.tacticalBomber || uclass === unitClass.fortification) return false;
	return isLossOverRetreatThreshold(def.strength, oldStrength);
}
