/**
 * Mirror - the old engine's objects (Scenario, GameMap, Hex, Unit, Player) as a mirror of the core's
 * world, both ways, while the old UI and the harness read and write them (#137)
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 *
 * The core's world is the game; the objects hold what the old UI draws and the harness reads. After
 * each step or checkpoint applyData updates them in place to the world's state, by unit id, keeping
 * each object (the UI compares units with === and keeps them in closures). What wrote to them since
 * (the harness, the UI's sorts of the equipment lists, the animation's facing, the selection's
 * carrier flips) is read back by worldOf, which makes the world again from toData of the objects: the
 * writes keep the effect they had on the old engine. checkMirror says when the two differ.
 *
 * The spotting and zone of control counters stay the old engine's until the switch removes them: the
 * world takes them as its sight and keeps their arithmetic (World.keepDrift), so they drift as before
 * (#72, #73), and applyData writes the world's sight back into them.
 */

import { Cell } from "./prototypes";
import { Equipment, type EquipmentIndexes } from "./equipment";
import { Unit } from "./unit";
import type { GameMap, Player } from "./map";
import type { Reinforcement, Scenario } from "./scenario";
import { Rng } from "./rng";
import {
	type CampaignHost, type CoreUnit, offMapUnit, type OffMapUnit, type PlayerState, restoreUndo, setUnitFields, toData, type UnitState
} from "./state";
import { createWorld } from "./core/create";
import type { Sight, World } from "./core/types";

//What the world takes beside the objects: the side the screen shows, the fog of war
export interface MirrorInputs {
	spotSide: number;
	noFOW: boolean;
}

//Every unit object a map has held, by id: an order can name a unit gone from the map (the old AI's
//plan held the object), and a replay describes it as it was
const seen = new WeakMap<GameMap, Map<number, Unit>>();

function seenUnits(m: GameMap): Map<number, Unit> {
	let units = seen.get(m);
	if (units === undefined) seen.set(m, units = new Map(m.getUnits().map((u) => [u.id, u])));
	return units;
}

//The unit object of an id, on the map or gone from it, null when the map never had it
export function unitObject(m: GameMap, id: number): Unit | null {
	const u = m.getUnitById(id);
	return u !== null ? u : seenUnits(m).get(id) || null;
}

//The world of the objects as they are now: toData's state, the old counters as the sight (drifting as
//they did), the units destroyed by an attack whose cleanup hasn't run yet
export function worldOf(scenario: Scenario, host: CampaignHost | null, inputs: MirrorInputs): World {
	const m = scenario.map;
	const destroyed = new Set(m.getUnits().filter((u) => u.destroyed).map((u) => u.id));
	return createWorld(toData(scenario, host), Equipment.equipment, { spotSide: inputs.spotSide, noFOW: inputs.noFOW, destroyed,
		sight: countersOf(m), keepDrift: true });
}

//The old counters, count for count
function countersOf(m: GameMap): Sight {
	const counters = m.getBoard().visibility.counters, n = m.rows * m.cols;
	const sight: Sight = { spot: [new Uint16Array(n), new Uint16Array(n)], zoc: [new Uint16Array(n), new Uint16Array(n)] };
	for (let r = 0; r < m.rows; r++)
		for (let c = 0; c < m.cols; c++)
			for (const side of [0, 1]) {
				sight.spot[side][r * m.cols + c] = counters[r][c].spot[side];
				sight.zoc[side][r * m.cols + c] = counters[r][c].zoc[side];
			}
	return sight;
}

//Where the objects differ from the world's state, "" when they don't (the same toData, the same counters)
export function mirrorDifference(scenario: Scenario, w: World, host: CampaignHost | null): string {
	const want = JSON.stringify(w.state), got = JSON.stringify(toData(scenario, host).state);
	if (want !== got) {
		let d = 0;
		while (d < want.length && want[d] === got[d]) d++;
		return "the objects' state differs from the world's at " + d + ": " + got.slice(Math.max(0, d - 80), d + 80);
	}
	const counters = countersOf(scenario.map);
	for (const side of [0, 1])
		if (counters.spot[side].join() !== w.sight.spot[side].join() || counters.zoc[side].join() !== w.sight.zoc[side].join())
			return "the counters differ from the world's sight";
	return "";
}

//The objects updated in place to the world's state (and its sight into the counters)
export function applyData(scenario: Scenario, w: World, host: CampaignHost | null) {
	const m = scenario.map, s = w.state;
	applyScenario(scenario, w);
	const players = m.getPlayers();
	s.players.forEach((p, i) => applyPlayer(players[i], p));
	const units = applyUnits(m, w);
	s.players.forEach((p, i) => applyCore(m, players[i], p.core, units));
	applyHexes(m, w, units);
	m.turn = s.turn.turn;
	m.currentPlayer = s.turn.currentPlayer >= 0 ? players[s.turn.currentPlayer] : null;
	s.objectives.forEach((list, side) => applyCells(m.sidesVictoryHexes[side], list));
	m.getBoard().uniqueID = s.nextUnitId;
	applyUndo(m, w);
	applyReinforcements(scenario, w);
	applySight(m, w.sight);
	if (s.rng !== null) {
		Rng.game.state = s.rng.game;
		Rng.ai.state = s.rng.ai;
	}
	applyEquipment(s.equipment.indexes);
	if (host && s.campaign !== null) host.setCampaignProgress({ ...s.campaign.progress }, scenario);
}

function applyScenario(scenario: Scenario, w: World) {
	const s = w.state.scenario;
	if (scenario.date.toISOString() !== s.date) scenario.date.setTime(new Date(s.date).getTime());
	scenario.dayTurn = s.dayTurn;
	scenario.turnsPerDay = s.turnsPerDay;
	scenario.atmosferic = s.atmospheric;
	scenario.ground = s.ground;
	scenario.latitude = s.latitude;
	scenario.maxTurns = s.maxTurns;
	scenario.map.maxTurns = s.maxTurns;
	applyNumbers(scenario.map.victoryTurns, s.victoryTurns);
	for (const side of [0, 1]) Object.assign(scenario.expPerSide[side], s.expPerSide[side]);
	applyNumbers(scenario.unitsCostPerSide, s.unitsCostPerSide);
}

//An array of numbers to the values given, in place
function applyNumbers(to: number[], from: readonly number[]) {
	if (to.length === from.length && to.every((x, i) => x === from[i])) return;
	to.length = 0;
	to.push(...from);
}

//A list of cells to the positions given, in place (the side's objectives, which the old engine spliced)
function applyCells(to: Cell[], from: readonly { row: number; col: number }[]) {
	if (to.length === from.length && to.every((c, i) => c.row === from[i].row && c.col === from[i].col)) return;
	to.length = 0;
	for (const c of from) to.push(new Cell(c.row, c.col));
}

function applyPlayer(p: Player, s: PlayerState) {
	p.id = s.id;
	p.side = s.side;
	p.country = s.country;
	p.type = s.type;
	p.prestige = s.prestige;
	applyNumbers(p.prestigePerTurn, s.prestigePerTurn);
	p.score = s.score;
	p.playedTurn = s.playedTurn;
	p.airTransports = s.airTransports;
	p.navalTransports = s.navalTransports;
	applyNumbers(p.supportCountries, s.supportCountries);
	if (JSON.stringify(p.dossier) !== JSON.stringify(s.dossier)) p.dossier = structuredClone(s.dossier);
}

//The units of the state, in its order, each the object of its id (one of the player's core units when
//it was waiting to deploy, a new one when it is new); the units gone are off their hexes, destroyed.
//The unit objects by id
function applyUnits(m: GameMap, w: World): Map<number, Unit> {
	const list = m.getUnits(), all = seenUnits(m);
	const before = new Map(list.map((u) => [u.id, u]));
	const deployed = deployedObjects(m, w);
	const units = new Map<number, Unit>();
	for (const s of w.state.units) {
		const u = before.get(s.id) || deployed.get(s.id) || new Unit(s.eqid);
		const was = before.has(s.id) ? shown(u) : null;
		applyUnit(m, u, s, w.destroyed.has(s.id) || s.strength <= 0);
		units.set(s.id, u);
		all.set(s.id, u);
		cacheImages(m.getBoard().images, u, was);
	}
	for (const u of list)
		if (!units.has(u.id)) {
			u.destroyed = true;
			u.setHex(null);
		}
	list.length = 0;
	list.push(...units.values());
	return units;
}

//What a unit's icons are of: its equipment and its transport's
function shown(u: Unit): [number, number] {
	return [u.eqid, u.transport === null ? 0 : u.transport.eqid];
}

//The icons of the image cache a unit adds: put on the map (was null: MapBoard.add, the unit's, its
//transport's and its carrier's), or upgraded there (GameMap.upgradeUnit: the unit's eqid gets what it
//shows now, its transport's when mounted)
function cacheImages(images: { [eqid: number]: string }, u: Unit, was: [number, number] | null) {
	if (was === null) {
		images[u.eqid] = Equipment.equipment[u.eqid].icon;
		if (u.transport !== null) images[u.transport.eqid] = u.transport.icon;
		if (u.carrier > 0) images[u.carrier] = Equipment.equipment[u.carrier].icon;
	} else if (was[0] !== u.eqid || (u.transport !== null && was[1] !== u.transport.eqid)) {
		images[u.eqid] = u.getIcon();
		if (u.transport !== null) images[u.transport.eqid] = u.transport.icon;
	}
}

//The objects of the core units that are on the map now and weren't (deployed): the same object, as
//the old engine put it on the map
function deployedObjects(m: GameMap, w: World): Map<number, Unit> {
	const onMap = new Set(m.getUnits().map((u) => u.id)), objects = new Map<number, Unit>();
	w.state.players.forEach((p, i) => {
		const core = m.getPlayers()[i].getCoreUnitList();
		p.core.forEach((c, k) => {
			if ("onMap" in c && !onMap.has(c.onMap) && core[k] !== undefined && !core[k].isDeployed) objects.set(c.onMap, core[k]);
		});
	});
	return objects;
}

//The unit's fields to the state's, its player, its hex
function applyUnit(m: GameMap, u: Unit, s: UnitState, destroyed: boolean) {
	applyOffMap(m, u, s);
	u.id = s.id;
	u.destroyed = destroyed;
	u.setHex(s.row >= 0 ? m.map[s.row][s.col] : null);
}

//A unit's fields but its id and position, and its player
function applyOffMap(m: GameMap, u: Unit, s: OffMapUnit) {
	u.eqid = s.eqid;
	setUnitFields(u, s);
	u.player = m.getPlayer(s.owner);
}

//A player's core list to the state's, in place: entry k keeps its object when it is the same unit
//(the map's unit of its id, or the one off the map at k); a unit sold is taken out, one bought added
function applyCore(m: GameMap, p: Player, core: CoreUnit[], units: Map<number, Unit>) {
	const list = p.getCoreUnitList();
	if (list.length === core.length + 1) {
		const sold = core.findIndex((c, k) => !sameCore(list[k], c, units));
		list.splice(sold < 0 ? core.length : sold, 1);
	}
	core.forEach((c, k) => {
		if ("onMap" in c) {
			list[k] = units.get(c.onMap);
			return;
		}
		//(a unit off the map keeps the object it had there: a lost one the map's, a reserve one its own)
		const off = "reserve" in c ? c.reserve : c.lost;
		const u = list[k] !== undefined ? list[k] : new Unit(off.eqid);
		applyOffMap(m, u, off);
		u.isDeployed = "lost" in c;
		u.destroyed = "lost" in c;
		if (u.getHex() !== null) u.setHex(null);
		list[k] = u;
	});
	list.length = core.length;
}

//Whether the object at a core list's place is still the unit of the state's entry there
function sameCore(u: Unit | undefined, c: CoreUnit, units: Map<number, Unit>): boolean {
	if (u === undefined) return false;
	if ("onMap" in c) return units.get(c.onMap) === u;
	const off = "reserve" in c ? c.reserve : c.lost;
	return JSON.stringify(offMapUnit(u)) === JSON.stringify(off);
}

function applyHexes(m: GameMap, w: World, units: Map<number, Unit>) {
	const s = w.state.map;
	for (let r = 0; r < m.rows; r++)
		for (let c = 0; c < m.cols; c++) {
			const h = m.map[r][c], x = s.hexes[r * m.cols + c];
			h.unit = x.unit === null ? null : units.get(x.unit);
			h.airunit = x.air === null ? null : units.get(x.air);
			h.owner = x.owner;
			h.flag = x.flag;
			h.victorySide = x.victorySide;
		}
}

//The undo slot as the state has it (state.ts restoreUndo)
function applyUndo(m: GameMap, w: World) {
	const undoable = w.state.turn.undoable, slot = m.getUndoSlot();
	if (undoable !== null) restoreUndo(m, undoable);
	else if (slot.unit !== null) slot.clear();
}

//The scenario's reinforcements by turn as the state lists them: a turn's entries kept while they are
//the state's, in order (the ones that arrived taken out), else made again
function applyReinforcements(scenario: Scenario, w: World) {
	const byTurn = new Map<number, { row: number; col: number; unit: OffMapUnit }[]>();
	for (const r of w.state.reinforcements) {
		if (!byTurn.has(r.turn)) byTurn.set(r.turn, []);
		byTurn.get(r.turn).push(r);
	}
	for (const t of Object.keys(scenario.reinforcements))
		if (!byTurn.has(+t)) scenario.reinforcements[t] = [];
	for (const [turn, want] of byTurn) {
		const have = scenario.reinforcements[turn] || [];
		const kept = keptEntries(have, want);
		if (kept !== null) {
			have.length = 0;
			have.push(...kept);
			continue;
		}
		scenario.reinforcements[turn] = [];
		for (const r of want) {
			const u = new Unit(r.unit.eqid);
			setUnitFields(u, r.unit);
			u.id = -1;
			scenario.addReinforcement(turn, r.row, r.col, u);
		}
	}
}

//The entries of have that are want's, in want's order, or null when want isn't a part of have
function keptEntries(have: Reinforcement[], want: { row: number; col: number; unit: OffMapUnit }[]): Reinforcement[] | null {
	const kept: Reinforcement[] = [];
	let i = 0;
	for (const r of want) {
		while (i < have.length && !(have[i].row === r.row && have[i].col === r.col
			&& JSON.stringify(offMapUnit(have[i].unit)) === JSON.stringify(r.unit))) i++;
		if (i === have.length) return null;
		kept.push(have[i++]);
	}
	return kept;
}

function applySight(m: GameMap, sight: Sight) {
	const counters = m.getBoard().visibility.counters;
	for (let r = 0; r < m.rows; r++)
		for (let c = 0; c < m.cols; c++)
			for (const side of [0, 1]) {
				counters[r][c].spot[side] = sight.spot[side][r * m.cols + c];
				counters[r][c].zoc[side] = sight.zoc[side][r * m.cols + c];
			}
}

//The equipment lists by country and class as the state has them, in place: the purchase window holds
//and sorts them (#186)
function applyEquipment(indexes: { [country: string]: EquipmentIndexes }) {
	const have = Equipment.equipmentIndexes;
	for (const country of Object.keys(have))
		if (!(country in indexes)) delete have[country];
	for (const [country, x] of Object.entries(indexes)) {
		const classes = have[country] === undefined ? undefined : have[country].unitclass;
		if (classes === undefined || x.unitclass === undefined) have[country] = structuredClone(x);
		else applyClasses(classes, x.unitclass);
	}
}

function applyClasses(classes: { [uclass: string]: number[] }, want: { [uclass: string]: number[] }) {
	for (const k of Object.keys(classes))
		if (!(k in want)) delete classes[k];
	for (const [k, list] of Object.entries(want)) {
		if (classes[k] === undefined) classes[k] = list.slice();
		else applyNumbers(classes[k], list);
	}
}
