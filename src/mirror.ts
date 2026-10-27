/**
 * Mirror - the old engine's objects (Scenario, GameMap, Hex, Unit, Player) as a copy of the core's world
 * for the harness, the old game objects' code and its tests to read (#137), one way only (#376). The old UI
 * that drew them went in #351
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 *
 * The core's world is the game; the objects hold what the old UI drew and the harness reads. After
 * each step or checkpoint applyData updates them in place to the world's state, by unit id, keeping
 * each object (the UI compares units with === and keeps them in closures), and keeps that world: the
 * next step and the screen's rules start from it, not from the objects. What the screen writes into
 * them (its selection's hexes, the unit it animates) is the screen's and never reaches the game: what
 * changes the game is a command (a unit left while disembarking goes back aboard by the embark,
 * src/selection.ts). The world is made from the objects only where they were set up outside a step and
 * said so (touched, src/context.ts: a load, the players' setup, a test), the streams moved outside a step
 * (a seed) or the campaign went on; and under ?harness (mirrorOptions.cache off), whose scripts set up
 * their games by writing into the objects anywhere: there the world kept is compared with the objects
 * (savedAs, src/state.ts) whenever it is asked for and made again from them when they differ, until the
 * harness plays on the game host (#378). mirrorDifference says when the two differ.
 *
 * The spotting and zone of control are the core's, computed from the units (D10: no drift, #72, #73):
 * applyData writes the world's sight into the hexes' counters, which the screen reads.
 */

import { Cell, uiSettings } from "./prototypes";
import { Equipment, type EquipmentIndexes } from "./equipment";
import { Unit } from "./unit";
import type { GameMap, Player } from "./map";
import type { Reinforcement, Scenario } from "./scenario";
import { Rng } from "./rng";
import {
	type CampaignHost, campaignState, type CoreUnit, offMapUnit, type OffMapUnit, type PlayerState, restoreUndo, sameData, sameItems,
	savedAs, setUnitFields, toData, type UnitState, writeSight
} from "./state";
import { objectWrites } from "./context";
import { createWorld } from "./core/create";
import { rulesetNamed } from "./core/rules";
import type { Ruleset, RulesetName, Sight, World } from "./core/types";

//What the world takes beside the objects: the side the screen shows, the fog of war, the rules
export interface MirrorInputs {
	spotSide: number;
	noFOW: boolean;
	rules: Ruleset;
}

//The inputs of a game's world: the side it shows, the fog of war setting, the rules it plays by
export const gameInputs = (g: { spotSide: number; rules: RulesetName }): MirrorInputs =>
	({ spotSide: g.spotSide, noFOW: !!uiSettings.noFOW, rules: rulesetNamed(g.rules) });

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

//How the mirror runs (src/main.ts sets it for the page). cache: the world kept is the game, which the next
//step and the screen's rules start from, the objects only a copy of it; off under ?harness, whose scripts
//set up their games by writing into the objects anywhere: the world kept is then compared with the objects
//(savedAs) whenever it is asked for, and made again from them when they differ. checks: the objects
//compared with the world kept before every step, now and then for the screen's rules, and with every
//update (the tests and the dev server: a write into the objects outside a step that didn't say so,
//touched(), throws there; the build ignores it, the next update overwrites it)
export const mirrorOptions = { cache: true, checks: true };

//The world kept, of which game and shown how. Made when first asked: after an update, from the world the
//objects were updated to
interface Kept {
	world: World | null;
	make: (() => World) | null;
	game: unknown[];	//of which game (gameOf)
	inputs: MirrorInputs;	//the side shown, the fog of war, the rules
	since: unknown[];	//what said it was the game's (said)
	queries: number;	//the times the screen's rules were given it
}

//Which game a world is of: the scenario and its map, the campaign's host, the equipment
function gameOf(scenario: Scenario, host: CampaignHost | null): unknown[] {
	return [scenario, scenario.map, host, Equipment.equipment, Equipment.equipmentIndexes];
}

const sameInputs = (a: MirrorInputs, b: MirrorInputs) => a.spotSide === b.spotSide && a.noFOW === b.noFOW && a.rules === b.rules;

//What says the world kept is still the game's beside its steps: the objects set up by hand (touched), the
//streams
function said(): unknown[] {
	return [objectWrites(), Rng.game.state, Rng.ai.state];
}

//The checks compare the objects with the world kept before every step, and for the screen's rules at the
//first query and then at one in so many (the render loop and a click ask hundreds of rules between two
//steps); toData with the world a step starts from at one step in so many (what savedAs leaves out would
//show there); and the objects with the world they were updated to at one update in so many
//(test/mirror.test.ts compares them after every piece of play). A world kept that isn't the objects'
//throws: something wrote into them outside a step without touched()
const CHECKED_QUERIES = 16;
const COMPARED_STEPS = 16;
const COMPARED_UPDATES = 8;

let held: Kept | null = null;
let steps = 0, updates = 0;

//The world kept, or what makes it when first asked
function keep(scenario: Scenario, host: CampaignHost | null, inputs: MirrorInputs, world: World | (() => World)) {
	held = { world: typeof world === "function" ? null : world, make: typeof world === "function" ? world : null,
		game: gameOf(scenario, host), inputs: { spotSide: inputs.spotSide, noFOW: inputs.noFOW, rules: inputs.rules }, since: said(),
		queries: 0 };
}

//The world kept of the same game
function heldOf(scenario: Scenario, host: CampaignHost | null): Kept | null {
	const k = held;
	if (k === null || !sameItems(k.game, gameOf(scenario, host))) return null;
	if (k.world === null) k.world = k.make();
	return k;
}

//The world kept of the same game, shown the same way
function heldFor(scenario: Scenario, host: CampaignHost | null, inputs: MirrorInputs): Kept | null {
	const k = heldOf(scenario, host);
	return k !== null && sameInputs(k.inputs, inputs) ? k : null;
}

//The world kept, still the game's (cache only): nothing set up by hand since (touched), the streams where
//they were, the same campaign progress
function current(scenario: Scenario, host: CampaignHost | null): Kept | null {
	const k = mirrorOptions.cache ? heldOf(scenario, host) : null;
	return k !== null && sameItems(k.since, said()) && sameCampaign(host, k.world) ? k : null;
}

//The world kept, still the game's and shown the same way
function trusted(scenario: Scenario, host: CampaignHost | null, inputs: MirrorInputs): Kept | null {
	const k = current(scenario, host);
	return k !== null && sameInputs(k.inputs, inputs) ? k : null;
}

//Whether the world's campaign is the game's now (its progress is Game's, which a campaign's end sets)
function sameCampaign(host: CampaignHost | null, w: World): boolean {
	const campaign = w.state.campaign;
	if (host === null || !host.campaign) return campaign === null;
	return campaign !== null && sameData(campaign, campaignState(host.campaign, host.getCampaignProgress()));
}

//The units marked destroyed: by an attack whose cleanup hasn't run yet
function destroyedUnits(m: GameMap): Set<number> {
	return new Set(m.getUnits().filter((u) => u.destroyed).map((u) => u.id));
}

//Whether a world is the objects': toData of them is its data and state, the units marked destroyed its
function isWorldOf(scenario: Scenario, host: CampaignHost | null, w: World): boolean {
	const destroyed = destroyedUnits(scenario.map);
	if (destroyed.size !== w.destroyed.size) return false;
	for (const id of destroyed) if (!w.destroyed.has(id)) return false;
	return savedAs(scenario, host, w);
}

//The game's world. The world kept while it is the game's, whatever the objects hold since (shown another
//way: the same state with another side's sight); else the objects' as they are now (a game loaded, set up
//by hand, ?harness): toData's state, its sight computed from the units, the units destroyed by an attack
//whose cleanup hasn't run yet, the world kept while it is theirs, else made again
export function worldOf(scenario: Scenario, host: CampaignHost | null, inputs: MirrorInputs): World {
	const k = current(scenario, host);
	if (k !== null) return sameInputs(k.inputs, inputs) ? k.world : shownAs(scenario, host, k.world, inputs);
	const h = heldFor(scenario, host, inputs);
	if (h !== null && isWorldOf(scenario, host, h.world)) {
		h.since = said();
		return h.world;
	}
	const w = createWorld(toData(scenario, host), Equipment.equipment, { spotSide: inputs.spotSide, noFOW: inputs.noFOW,
		rules: inputs.rules, destroyed: destroyedUnits(scenario.map) });
	keep(scenario, host, inputs, w);
	return w;
}

//The world kept shown another way (the side whose turn it is in a hotseat game): its state, its sight
//computed for the side shown, nothing read from the objects
function shownAs(scenario: Scenario, host: CampaignHost | null, w: World, inputs: MirrorInputs): World {
	const x = createWorld({ data: w.data, state: w.state }, Equipment.equipment, { spotSide: inputs.spotSide, noFOW: inputs.noFOW,
		rules: inputs.rules, destroyed: w.destroyed });
	keep(scenario, host, inputs, x);
	return x;
}

//The game's world for the screen's rules: the one kept while it is the game's and shown the same way,
//else worldOf
export function rulesWorld(scenario: Scenario, host: CampaignHost | null, inputs: MirrorInputs): World {
	const k = trusted(scenario, host, inputs);
	if (k === null) return worldOf(scenario, host, inputs);
	if (mirrorOptions.checks && k.queries++ % CHECKED_QUERIES === 0 && !isWorldOf(scenario, host, k.world))
		throw unannounced(scenario, host, k.world);
	return k.world;
}

//The game's world a step starts from: worldOf. The checks compare it with the objects (a write into them
//that didn't say so would be lost under the step's update), and savedAs with toData at one step in so many
export function stepWorld(scenario: Scenario, host: CampaignHost | null, inputs: MirrorInputs): World {
	const w = worldOf(scenario, host, inputs);
	if (mirrorOptions.checks && mirrorOptions.cache && !isWorldOf(scenario, host, w)) throw unannounced(scenario, host, w);
	if (mirrorOptions.checks && steps++ % COMPARED_STEPS === 0) {
		const d = stateDifference(w.state, toData(scenario, host).state);
		if (d !== "") throw new Error("Mirror: savedAs missed where toData differs " + d);
	}
	return w;
}

function unannounced(scenario: Scenario, host: CampaignHost | null, w: World): Error {
	const d = stateDifference(w.state, toData(scenario, host).state);
	return new Error("Mirror: the objects were written to outside a step without touched(): " + (d !== "" ? d : "the units marked destroyed"));
}

//Where the state the objects have differs from the one wanted, "" when it doesn't (the same JSON)
function stateDifference(want: unknown, have: unknown): string {
	if (sameData(want, have)) return "";
	const a = JSON.stringify(want), b = JSON.stringify(have);
	let d = 0;
	while (d < a.length && a[d] === b[d]) d++;
	return d < a.length || d < b.length ? "at " + d + ": " + b.slice(Math.max(0, d - 80), d + 80) : "";
}

//The old counters, count for count
function countersOf(m: GameMap): Sight {
	const counters = m.getVisibility().counters, n = m.rows * m.cols;
	const sight: Sight = { spot: [new Uint16Array(n), new Uint16Array(n)], zoc: [new Uint16Array(n), new Uint16Array(n)] };
	for (let r = 0; r < m.rows; r++)
		for (let c = 0; c < m.cols; c++)
			for (const side of [0, 1]) {
				sight.spot[side][r * m.cols + c] = counters[r][c].spot[side];
				sight.zoc[side][r * m.cols + c] = counters[r][c].zoc[side];
			}
	return sight;
}

//Where the objects differ from the world's state, "" when they don't (the same toData, as JSON, the
//same counters)
export function mirrorDifference(scenario: Scenario, w: World, host: CampaignHost | null): string {
	const d = stateDifference(w.state, toData(scenario, host).state);
	if (d !== "") return "the objects' state differs from the world's " + d;
	const counters = countersOf(scenario.map);
	for (const side of [0, 1])
		if (!sameCounts(counters.spot[side], w.sight.spot[side]) || !sameCounts(counters.zoc[side], w.sight.zoc[side]))
			return "the counters differ from the world's sight";
	return "";
}

//mirrorDifference where the checks compare an update, "" elsewhere
export function checkedDifference(scenario: Scenario, w: World, host: CampaignHost | null): string {
	return mirrorOptions.checks && updates++ % COMPARED_UPDATES === 0 ? mirrorDifference(scenario, w, host) : "";
}

function sameCounts(a: Uint16Array, b: Uint16Array): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
	return true;
}

//The objects updated in place to the world's state, and its sight into the counters unless counters is
//false (the selection's back aboard, src/commands.ts)
export function applyData(scenario: Scenario, w: World, host: CampaignHost | null, counters = true) {
	held = null;
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
	if (counters) writeSight(m, w.sight);
	if (s.rng !== null) {
		Rng.game.state = s.rng.game;
		Rng.ai.state = s.rng.ai;
	}
	applyEquipment(s.equipment.indexes);
	if (host && s.campaign !== null) host.setCampaignProgress({ ...s.campaign.progress }, scenario);
	//(the world the objects mirror now, as worldOf would make it: toData of them is w's state)
	const destroyed = destroyedUnits(m);
	keep(scenario, host, w, () => createWorld({ data: w.data, state: s }, Equipment.equipment, { spotSide: w.spotSide, noFOW: w.noFOW,
		rules: w.rules, destroyed }));
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
		applyUnit(m, u, s, w.destroyed.has(s.id) || s.strength <= 0);
		units.set(s.id, u);
		all.set(s.id, u);
		if (!before.has(s.id)) cacheImages(m.getBoard().images, u);
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

//The icons of a unit put on the map, for the image cache (MapBoard.add): the unit's, its transport's,
//its carrier's
function cacheImages(images: { [eqid: number]: string }, u: Unit) {
	images[u.eqid] = Equipment.equipment[u.eqid].icon;
	if (u.transport !== null) images[u.transport.eqid] = u.transport.icon;
	if (u.carrier > 0) images[u.carrier] = Equipment.equipment[u.carrier].icon;
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

//A unit a step took off the map, its object as it was in the last world of the step it was in (the update
//to the step's end then takes it off: src/commands.ts)
export function applyGone(m: GameMap, s: UnitState) {
	const u = unitObject(m, s.id);
	if (u !== null) applyOffMap(m, u, s);
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

//The equipment lists by country and class as the state has them, in place: what asked for a list
//unsorted holds the list itself
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
