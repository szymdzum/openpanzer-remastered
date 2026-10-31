/**
 * The remastered AI's maps of the game, once a turn from what its side knows (perception.ts): the influence of
 * both sides and the front between them, the enemy's threat, the distances to the objectives and the supply.
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

import { startsAirAttacks } from "../equipment";
import { distance } from "../geometry";
import { terrainType, unitClass } from "../tables";
import type { Position, UnitId, UnitState, World } from "../types";
import { isAir, isSea } from "../units";
import { currentEqid, hexIndex, unitData } from "../world";
import { around, costField, eachNeighbour, reached, stepField, terrainCosts, UNREACHED } from "./fields";
import type { Sighting, SideView } from "./perception";

/** Each side's strength spread over the hexes its units reach and hit next turn, and own less enemy. */
export interface Influence {
	own: Float32Array;
	enemy: Float32Array;
	balance: Float32Array;
}

/** The enemy strength that can strike a hex next turn: a ground unit there, an aircraft there. */
export interface Threat {
	ground: Float32Array;
	air: Float32Array;
}

/** An objective to take and the mean influence of each side around it: weak where the enemy holds it lightly. */
export interface Sector {
	at: Position;
	enemy: number;
	own: number;
	weak: boolean;
}

/** The movement points from each hex to the nearest objective to take and to hold, for a movement method. */
export interface DistanceField {
	movmethod: number;
	take: Uint16Array;
	hold: Uint16Array;
}

/**
 * The hexes from each hex to the nearest of the side's cities (ground), ports (sea) and, for an aircraft, the
 * airfields flying its player's country and the carriers of its player (`air`, by player: supply.ts).
 */
export interface SupplyMap {
	ground: Uint16Array;
	air: ReadonlyMap<number, Uint16Array>;
	sea: Uint16Array;
}

/** An own unit as the maps see it: the threat on its hex, its distance to supply and its points to the objectives. */
export interface UnitAnalysis {
	id: UnitId;
	threat: number;
	supply: number;
	take: number;
	hold: number;
}

/** The maps of a side, by hex index (row * cols + col); UNREACHED (fields.ts) where no way leads. */
export interface Analysis {
	side: number;
	turn: number;
	influence: Influence;
	front: number[];
	//The objectives to take, the weakest held first
	sectors: Sector[];
	threat: Threat;
	objectives: { take: Position[]; hold: Position[] };
	distance: DistanceField[];
	supply: SupplyMap;
	units: UnitAnalysis[];
}

/** What the analysis keeps from one turn to the next: the terrain's costs and the distance fields, by their inputs. */
export type AnalysisCache = Map<string, Uint8Array | Uint16Array>;

//The units a force is made of, as the maps count them: the side's own and the enemies it knows
type Force = Pick<Sighting, "row" | "col" | "eqid" | "moving" | "strength" | "confidence">;

//Near even: the hexes where the two sides' influence differs by less than this share of their sum are on the front
const FRONT_BAND = 0.1;
//The hexes around an objective whose influence says how strongly it is held
const SECTOR_RADIUS = 2;
//A sector is weak where the enemy holds it with at most this share of its mean over the objectives to take
const WEAK_SHARE = 0.5;

/** The side's maps of the world it knows; `cache` keeps what doesn't change from turn to turn. */
export function analyse(w: World, view: SideView, cache: AnalysisCache = new Map()): Analysis {
	const costsOf = (movmethod: number) => cached(cache, `costs ${w.state.scenario.ground} ${movmethod}`, () => terrainCosts(w, movmethod));
	const own = spread(w, view.own.map(forceOf), costsOf), enemy = spread(w, view.enemies, costsOf);
	const balance = own.influence.map((x, h) => x - enemy.influence[h]);
	const influence = { own: own.influence, enemy: enemy.influence, balance };
	const objectives = { take: w.state.objectives[view.side], hold: heldObjectives(w, view.side) };
	const distanceFields = fieldsOf(w, view.own, objectives, cache);
	const supply = supplyMap(w, view.side), threat = { ground: enemy.ground, air: enemy.air };
	return { side: view.side, turn: view.turn, influence, front: frontOf(w, influence), sectors: sectorsOf(w, influence, objectives.take),
		threat, objectives, distance: distanceFields, supply, units: view.own.map((u) => unitAnalysis(w, u, threat, supply, distanceFields)) };
}

function cached<T extends Uint8Array | Uint16Array>(cache: AnalysisCache, key: string, make: () => T): T {
	let v = cache.get(key);
	if (v === undefined) {
		v = make();
		cache.set(key, v);
	}
	return v as T;
}

const forceOf = (u: UnitState): Force => ({ row: u.row, col: u.col, eqid: u.eqid, moving: currentEqid(u), strength: u.strength, confidence: 1 });

const hitsGround = (e: EquipmentEntry) => e.softatk > 0 || e.hardatk > 0;

//The ground forces hold ground: aircraft and ships strike, but draw no front
const holdsGround = (e: EquipmentEntry) => e.uclass <= unitClass.airDefence && hitsGround(e);

//The hexes a force can strike next turn: those it reaches with a whole move, and its gun's range beyond them.
//Artillery fires from where it stands, and a unit riding its transport can't fire after a move
function strikeOf(w: World, f: Force, costsOf: (movmethod: number) => Uint8Array): { hexes: number[]; radius: number } {
	const e = w.equipment[f.eqid], mover = w.equipment[f.moving], from = hexIndex(w, f.row, f.col);
	const points = e.uclass !== unitClass.artillery && f.moving === f.eqid ? mover.movpoints : 0;
	const range = Math.max(1, e.gunrange);
	const reach = points > 0 ? reached(w, costsOf(mover.movmethod), from, points) : [from];
	return { hexes: around(w, reach, range), radius: points + range };
}

//What the forces of a side spread on the map: their influence, and the threat they make to a ground unit and to
//an aircraft
interface Spread {
	influence: Float32Array;
	ground: Float32Array;
	air: Float32Array;
}

function spread(w: World, forces: readonly Force[], costsOf: (movmethod: number) => Uint8Array): Spread {
	const n = w.state.map.rows * w.state.map.cols;
	const maps: Spread = { influence: new Float32Array(n), ground: new Float32Array(n), air: new Float32Array(n) };
	for (const f of forces) spreadForce(w, f, costsOf, maps);
	return maps;
}

//The threat maps a force adds to: the ground's if it hits ground units, the air's if it starts attacks on aircraft
function threatMaps(e: EquipmentEntry, maps: Spread): Float32Array[] {
	return [hitsGround(e) ? maps.ground : null, e.airatk > 0 && startsAirAttacks(e) ? maps.air : null].filter((m) => m !== null);
}

//A force's strength, weighted by how sure the side is of it, over its strike. Its influence falls off with the
//distance, to a share of its strength at the strike's far edge
function spreadForce(w: World, f: Force, costsOf: (movmethod: number) => Uint8Array, maps: Spread) {
	const e = w.equipment[f.eqid], weight = f.strength * f.confidence, cols = w.state.map.cols;
	const threatens = threatMaps(e, maps);
	if (weight <= 0 || threatens.length === 0) return;
	const strike = strikeOf(w, f, costsOf);
	for (const m of threatens) for (const h of strike.hexes) m[h] += weight;
	if (!holdsGround(e)) return;
	for (const h of strike.hexes)
		maps.influence[h] += weight * (1 - distance(Math.floor(h / cols), h % cols, f.row, f.col) / (strike.radius + 1));
}

//The hexes both sides reach where neither holds sway, or where the side that does changes from one hex to the next
function frontOf(w: World, inf: Influence): number[] {
	const { rows, cols } = w.state.map, front: number[] = [];
	for (let h = 0; h < inf.balance.length; h++) {
		if (inf.own[h] <= 0 || inf.enemy[h] <= 0) continue;
		const ours = inf.balance[h] >= 0;
		let turns = Math.abs(inf.balance[h]) <= FRONT_BAND * (inf.own[h] + inf.enemy[h]);
		eachNeighbour(rows, cols, h, (n) => {
			if (inf.balance[n] >= 0 !== ours) turns = true;
		});
		if (turns) front.push(h);
	}
	return front;
}

function sectorsOf(w: World, inf: Influence, take: readonly Position[]): Sector[] {
	const meanOver = (field: Float32Array, hexes: number[]) => hexes.reduce((a, h) => a + field[h], 0) / hexes.length;
	const sectors = take.map((at) => {
		const hexes = around(w, [hexIndex(w, at.row, at.col)], SECTOR_RADIUS);
		return { at, enemy: meanOver(inf.enemy, hexes), own: meanOver(inf.own, hexes), weak: false };
	});
	const mean = sectors.reduce((a, s) => a + s.enemy, 0) / Math.max(1, sectors.length);
	for (const s of sectors) s.weak = s.enemy <= WEAK_SHARE * mean;
	return sectors.sort((a, b) => a.enemy - b.enemy);
}

//The objectives the side holds and the enemy has to take
function heldObjectives(w: World, side: number): Position[] {
	const cols = w.state.map.cols, held: Position[] = [];
	w.state.map.hexes.forEach((h, i) => {
		if (h.victorySide !== -1 && h.owner >= 0 && w.state.players[h.owner].side === side) held.push({ row: Math.floor(i / cols), col: i % cols });
	});
	return held;
}

//A distance field per movement method of the side's units, kept while the objectives and the ground stay
function fieldsOf(w: World, own: readonly UnitState[], objectives: Analysis["objectives"], cache: AnalysisCache): DistanceField[] {
	const methods = [...new Set(own.map((u) => w.equipment[currentEqid(u)].movmethod))];
	return methods.map((movmethod) => ({ movmethod, take: fieldTo(w, cache, movmethod, objectives.take),
		hold: fieldTo(w, cache, movmethod, objectives.hold) }));
}

/** The movement points from each hex to the nearest of `targets` for a movement method, cached by the ground. */
export function fieldTo(w: World, cache: AnalysisCache, movmethod: number, targets: readonly Position[]): Uint16Array {
	const hexes = targets.map((p) => hexIndex(w, p.row, p.col)), ground = w.state.scenario.ground;
	const costs = cached(cache, `costs ${ground} ${movmethod}`, () => terrainCosts(w, movmethod));
	return cached(cache, `field ${ground} ${movmethod} ${hexes.join()}`, () => costField(w, costs, hexes));
}

//Where the side's units resupply and reinforce in full: ground units in a city, aircraft on an airfield of their
//player's country (or next to it) or a carrier of their player, ships in a port (supply.ts)
function supplyMap(w: World, side: number): SupplyMap {
	const ofTerrain = (terrain: number) => {
		const hexes: number[] = [];
		w.state.map.hexes.forEach((h, i) => {
			if (w.data.hexes[i].terrain === terrain && h.owner >= 0 && w.state.players[h.owner].side === side) hexes.push(i);
		});
		return stepField(w, hexes);
	};
	const air = new Map<number, Uint16Array>();
	for (const p of w.state.players) {
		if (p.side !== side) continue;
		const hexes: number[] = [];
		w.state.map.hexes.forEach((h, i) => {
			if (w.data.hexes[i].terrain === terrainType.Airfield && h.flag === p.country) hexes.push(i);
		});
		for (const u of w.state.units)
			if (u.owner === p.id && unitData(w, u).uclass === unitClass.carrier) hexes.push(hexIndex(w, u.row, u.col));
		air.set(p.id, stepField(w, hexes));
	}
	return { ground: ofTerrain(terrainType.City), air, sea: ofTerrain(terrainType.Port) };
}

function unitAnalysis(w: World, u: UnitState, threat: Threat, supply: SupplyMap, fields: readonly DistanceField[]): UnitAnalysis {
	const hex = hexIndex(w, u.row, u.col), air = isAir(w, u);
	const field = fields.find((f) => f.movmethod === w.equipment[currentEqid(u)].movmethod);
	const supplyField = air ? supply.air.get(u.owner) : isSea(w, u) ? supply.sea : supply.ground;
	return { id: u.id, threat: (air ? threat.air : threat.ground)[hex], supply: supplyField ? supplyField[hex] : UNREACHED,
		take: field ? field.take[hex] : UNREACHED, hold: field ? field.hold[hex] : UNREACHED };
}
