/**
 * Draft - the state a step changes, and the primitives it changes it with: place, move and remove a
 * unit with its sight, score, the dossier
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 *
 * A step never changes the state it was given (its caller keeps it: the undo, the preview, the AI's
 * look ahead). The draft copies the state's lists when it starts, a few thousand pointers, and an
 * object of the state (a unit, a hex, a player) the first time the step writes to it: a step costs
 * what it changes, not the size of the state. Write through the write* functions, never to an
 * object a query returned before it: that one may be the caller's.
 *
 * The sight (D10) is kept up to date as the old engine switched its counters: off before a unit
 * leaves or changes, on after. On, it marks the enemy units the unit's side didn't see as seen
 * (tempSpotted), where the old engine's setSpotRange did. Where the old engine forgot to switch
 * its counters (#73: an embark, an upgrade, a leader that sees farther), the draft switches them
 * all the same, without marking: the sight always equals computeSight's.
 */

import { difficultyModifiers, movMethod, outcomeNames, unitClass } from "../prototypes";
import type { GameEvent } from "./events";
import { spotCells, zocCells } from "./sight";
import type {
	CoreUnit, Draft, GameState, HexState, OffMapUnit, PlayerState, Position, Sight, UnitId, UnitState, World
} from "./types";
import { isSpotted, sideOf, unitAt, unitData, unitIndex } from "./world";

//A draft of w's state: the lists copied, the objects in them shared until written
export function beginDraft(w: World): Draft {
	const s = w.state;
	const state: GameState = {
		...s, map: { ...s.map, hexes: s.map.hexes.slice() }, units: s.units.slice(), players: s.players.slice(),
		turn: { ...s.turn }, objectives: [s.objectives[0], s.objectives[1]],
	};
	const sight: Sight = { spot: [w.sight.spot[0].slice(), w.sight.spot[1].slice()],
		zoc: [w.sight.zoc[0].slice(), w.sight.zoc[1].slice()] };
	return { ...w, state, sight, copied: new Set(), rng: { state: s.rng === null ? null : s.rng.game }, events: [] };
}

//The world after the step: the draft's state with the game stream where the dice left it
export function finishDraft(d: Draft): World {
	const s = d.state;
	const state: GameState = s.rng === null ? s : { ...s, rng: { game: d.rng.state, ai: s.rng.ai } };
	return { data: d.data, state, equipment: d.equipment, rules: d.rules, noFOW: d.noFOW, spotSide: d.spotSide, destroyed: d.destroyed,
		index: d.index, sight: d.sight, scratch: d.scratch };
}

export function emit(d: Draft, e: GameEvent) {
	d.events.push(e);
}

//The draft's own copy of a unit, to write to
export function writeUnit(d: Draft, id: UnitId): UnitState {
	const i = d.index.get(id);
	const u = d.state.units[i];
	if (d.copied.has(u)) return u;
	const c: UnitState = { ...u, transport: u.transport === null ? null : { ...u.transport } };
	d.state.units[i] = c;
	d.copied.add(c);
	return c;
}

export function writeHex(d: Draft, hex: number): HexState {
	const h = d.state.map.hexes[hex];
	if (d.copied.has(h)) return h;
	const c = { ...h };
	d.state.map.hexes[hex] = c;
	d.copied.add(c);
	return c;
}

//The player's copy, its core list copied too (the dossier when written: writeDossier)
export function writePlayer(d: Draft, id: number): PlayerState {
	const p = d.state.players[id];
	if (d.copied.has(p)) return p;
	const c = { ...p, core: p.core.slice() };
	d.state.players[id] = c;
	d.copied.add(c);
	return c;
}

//A side's objectives, to change
export function writeObjectives(d: Draft, side: number): Position[] {
	const list = d.state.objectives[side];
	if (d.copied.has(list)) return list;
	const c = list.map((o) => ({ row: o.row, col: o.col }));
	d.state.objectives[side] = c;
	d.copied.add(c);
	return c;
}

//The player of an id as Map.getPlayer finds it: by index, the first player past the end
export function playerAt(w: World, id: number): PlayerState {
	const players = w.state.players;
	return id < players.length ? players[id] : players[0];
}

//Adds gain * count to a player's score, scaled by the campaign's difficulty (Player.updateScore)
export function addScore(d: Draft, player: number, gain: number, count = 1) {
	const coef = d.state.campaign !== null ? difficultyModifiers[d.state.campaign.difficulty].scoreCoef : 1;
	writePlayer(d, player).score += (gain * count * coef) >> 0;
}

//Takes the unit out of the hex's slots it holds (Hex.delUnit: by id, so a carrier's paratroopers
//that changed from air to ground leave the right one)
function leaveHex(d: Draft, hex: number, id: UnitId) {
	const h = d.state.map.hexes[hex];
	if (h.unit !== id && h.air !== id) return;
	const w = writeHex(d, hex);
	if (w.unit === id) w.unit = null;
	if (w.air === id) w.air = null;
}

//Puts the unit in the hex's slot of what it is now, air or ground, over what was there (Hex.setUnit, #74)
function enterHex(d: Draft, hex: number, u: UnitState) {
	const air = unitData(d, u).movmethod === movMethod.air;
	const w = writeHex(d, hex);
	if (air) w.air = u.id;
	else w.unit = u.id;
}

//A unit's zone of control and spotting off, before it leaves its hex or changes (MapVisibility.setUnit)
export function sightOff(d: Draft, u: UnitState) {
	countCells(d, d.sight.zoc, u, zocCells(d, u), -1);
	countCells(d, d.sight.spot, u, spotCells(d, u), -1);
}

//And on, once it is where it goes or what it becomes: the enemy units it spotted for the first time,
//marked seen (GameRules.setSpotRange)
export function sightOn(d: Draft, u: UnitState): UnitId[] {
	countCells(d, d.sight.zoc, u, zocCells(d, u), 1);
	return spotOn(d, u);
}

//Only the spotting, off and on (mounting changes the spotting range, not the zone of control)
export function spotOff(d: Draft, u: UnitState) {
	countCells(d, d.sight.spot, u, spotCells(d, u), -1);
}

//Hex by hex in the old engine's order: a hex the side didn't see yet shows its unit (the ground one
//of two), marked seen when it is an enemy's, then the hex counts as seen
export function spotOn(d: Draft, u: UnitState): UnitId[] {
	const side = sideOf(d, u), spotted: UnitId[] = [];
	for (const c of spotCells(d, u)) {
		const hex = c.row * d.state.map.cols + c.col;
		if (!isSpotted(d, hex, side)) {
			const other = unitAt(d, hex, false);
			if (other !== null && sideOf(d, other) !== side) {
				spotted.push(other.id);
				writeUnit(d, other.id).tempSpotted = true;
			}
		}
		if (side < 2) d.sight.spot[side][hex]++;
	}
	if (spotted.length) emit(d, { type: "spotted", unit: u.id, units: spotted });
	return spotted;
}

function countCells(d: Draft, counts: [Uint16Array, Uint16Array], u: UnitState, cells: Position[], by: number) {
	const side = sideOf(d, u);
	if (side > 1) return;
	for (const c of cells) counts[side][c.row * d.state.map.cols + c.col] += by;
}

//Moves a unit to a hex (MapBoard.relocate): its sight off, the hexes, change (the facing, the undo's
//fields), its sight on. The enemy units it spotted for the first time
export function relocate(d: Draft, id: UnitId, to: Position, change: (u: UnitState) => void): UnitId[] {
	const u = writeUnit(d, id);
	sightOff(d, u);
	leaveHex(d, u.row * d.state.map.cols + u.col, id);
	change(u);
	u.row = to.row;
	u.col = to.col;
	enterHex(d, to.row * d.state.map.cols + to.col, u);
	return sightOn(d, u);
}

//Changes a unit where the old engine left its counters as they were (#73: an embark, an upgrade, a
//leader that sees farther): its sight off and on around the change, no unit marked seen
export function changeUnit(d: Draft, id: UnitId, change: (u: UnitState) => void) {
	const u = writeUnit(d, id);
	sightOff(d, u);
	change(u);
	countCells(d, d.sight.zoc, u, zocCells(d, u), 1);
	countCells(d, d.sight.spot, u, spotCells(d, u), 1);
}

//Puts a unit not on the map yet on a hex (MapBoard.place): the next id, its flag if it has none, its
//sight on. The new unit
export function place(d: Draft, unit: OffMapUnit, at: Position): UnitState {
	const s = d.state;
	const u: UnitState = { id: s.nextUnitId, eqid: unit.eqid, owner: unit.owner, row: at.row, col: at.col, ...unit };
	u.transport = unit.transport === null ? null : { ...unit.transport };
	if (u.flag === -1) u.flag = playerAt(d, u.owner).country + 1;
	s.nextUnitId++;
	s.units.push(u);
	d.copied.add(u);
	d.index = unitIndex(s);
	enterHex(d, at.row * s.map.cols + at.col, u);
	sightOn(d, u);
	return u;
}

//A unit's fields but its id and position (state.ts offMapUnit, in its order)
export function offMap(u: UnitState): OffMapUnit {
	const { id: _id, row: _row, col: _col, ...o } = u;
	return { ...o, transport: u.transport === null ? null : { ...u.transport } };
}

//Takes a unit off the map (MapBoard.remove and the unit list's cleanup): its sight off, its hex, out
//of the unit list. A core unit stays in its player's list as lost; lost in a campaign (not disbanded),
//it counts in the campaign player's dossier
export function removeUnit(d: Draft, id: UnitId, dossier: boolean) {
	const u = d.state.units[d.index.get(id)];
	sightOff(d, u);
	leaveHex(d, u.row * d.state.map.cols + u.col, id);
	d.state.units.splice(d.index.get(id), 1);
	d.index = unitIndex(d.state);
	d.state.players.forEach((p, i) => {
		const at = p.core.findIndex((c) => "onMap" in c && c.onMap === id);
		if (at >= 0) writePlayer(d, i).core[at] = { lost: offMap(u) } as CoreUnit;
	});
	if (dossier && d.state.campaign !== null) countLoss(d, u);
}

//The campaign player (the last player of the campaign's country, as Game links it) counts the unit
//as its own loss, core or auxiliary, or as a kill (Player.addDestroyedUnitToDossier)
function countLoss(d: Draft, u: UnitState) {
	let cp = -1;
	d.state.players.forEach((p, i) => { if (p.country === d.state.campaign.country) cp = i; });
	const p = writePlayer(d, cp);
	if (!d.copied.has(p.dossier)) {
		p.dossier = p.dossier.units ? structuredClone(p.dossier) : newDossier();
		d.copied.add(p.dossier);
	}
	const uclass = unitData(d, u, true).uclass;
	const units = p.dossier.units;
	if (p.id === playerAt(d, u.owner).id) {
		if (u.isCore) units.lostcore[uclass]++;
		else units.lostaux[uclass]++;
	} else {
		units.killed[uclass]++;
	}
}

//An empty dossier, every unit class at 0 (Player.initDossier)
export function newDossier(): PlayerState["dossier"] {
	const counts = () => {
		const byClass: { [uclass: number]: number } = {};
		for (const c of Object.keys(unitClass)) byClass[unitClass[c as keyof typeof unitClass]] = 0;
		return byClass;
	};
	const outcomes: { [outcome: string]: string[] } = {};
	for (const o of Object.keys(outcomeNames)) outcomes[o] = [];
	return { units: { lostaux: counts(), lostcore: counts(), killed: counts() }, outcomes };
}
