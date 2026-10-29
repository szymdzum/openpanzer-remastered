//What the UI animates after a step (#347): a step is played whole in the core, then shown from its events as a
//row of beats, each a unit moving along its path, a unit firing or an explosion, with its sound. The beats and their
//order are the old UI's (src/ui.ts uiUnitMove, uiAttackHits, uiAttackLosses, uiRetreat, uiSurrender, before #351), its
//sprite strips and sound files as they are; which variant plays is picked later, from the cosmetic stream
//(src/view/player.ts). Plain functions of the worlds and the events,
//tested without the DOM (test/view-beats.test.ts)
import type { EventOf, Fighter, GameEvent, PathStep } from "../core/events";
import { directionTo } from "../core/geometry";
import type { Position, UnitId, UnitState, World } from "../core/types";
import { isTrain } from "../core/units";
import { isBridgeForSide } from "../core/movement";
import { hexIndex, unitById } from "../core/world";
import { unitClass } from "../core/tables";
import { at, seen } from "./hud/results";

//A sprite strip: its frames side by side, each width pixels wide
export interface Sheet {
	file: string;
	frames: number;
	width: number;
}

//A unit turned to face the other as a fight begins
export interface Turn {
	unit: UnitId;
	facing: number;
}

export type Beat =
	//a unit along its path (seen: the side shown sees it on that hex), its sprite strip
	| { kind: "move"; unit: UnitId; icon: string; path: PathStep[]; sounds: string[] }
	//a unit firing, facing its target; the fight's first shot turns its two units to face each other first (turn)
	| { kind: "fire"; at: Position; facing: number; sheets: Sheet[]; sounds: string[]; turn?: Turn[] }
	//an explosion where a unit was destroyed or surrendered
	| { kind: "explosion"; unit: UnitId; at: Position; facing: number; sheets: Sheet[]; sounds: string[] };

const ANIMATIONS = "resources/animations/", SOUNDS = "resources/sounds/";

//A sound's variants: base.mp3, base2.mp3 to base<n>.mp3; with a .wav first, the first variant is the .wav
const mp3s = (base: string, n: number) => Array.from({ length: n }, (_, i) => SOUNDS + base + (i === 0 ? "" : i + 1) + ".mp3");
const wavThen = (base: string, n: number) => [SOUNDS + base + ".wav", ...mp3s(base, n).slice(1)];
const wavFirst = (wav: string, base: string, n: number) => [SOUNDS + wav, ...mp3s(base, n)];

const EXPLOSIONS: Sheet[] = ["explosions", "explosions2", "explosions3"].map((f) => ({ file: ANIMATIONS + f + ".png", frames: 12, width: 120 }));
const GUN: Sheet[] = [{ file: ANIMATIONS + "fire-gun.png", frames: 5, width: 150 }];
const SMALL_GUN: Sheet[] = [{ file: ANIMATIONS + "fire-smallgun.png", frames: 7, width: 80 }];
const EXPLOSION_SOUNDS = wavThen("fire/explosion", 5);

//A unit class's shot: its strip and its sound's variants; a class that doesn't fire (transports, carriers) has none
const FIRE: Partial<Record<number, [Sheet[], string[]]>> = {
	[unitClass.infantry]: [SMALL_GUN, wavFirst("fire/smallgun.wav", "fire/infantry", 5)],
	[unitClass.tank]: [GUN, wavFirst("fire/gun.wav", "fire/tank", 4)],
	[unitClass.recon]: [GUN, mp3s("fire/recon", 3)],
	[unitClass.antiTank]: [GUN, mp3s("fire/antitank", 4)],
	[unitClass.flak]: [GUN, mp3s("fire/aa", 5)],
	[unitClass.fortification]: [SMALL_GUN, mp3s("fire/fortification", 2)],
	[unitClass.groundTransport]: [SMALL_GUN, [SOUNDS + "fire/smallgun.wav"]],
	[unitClass.artillery]: [GUN, wavFirst("fire/gun.wav", "fire/artillery", 4)],
	[unitClass.airDefence]: [GUN, mp3s("fire/aa", 5)],
	[unitClass.fighter]: [SMALL_GUN, wavFirst("fire/smallgun.wav", "fire/fighter", 3)],
	[unitClass.tacticalBomber]: [SMALL_GUN, wavFirst("fire/smallgun.wav", "fire/bomber", 4)],
	[unitClass.levelBomber]: [SMALL_GUN, wavFirst("fire/smallgun.wav", "fire/bomber", 4)],
	[unitClass.submarine]: [GUN, mp3s("fire/submarine", 2)],
	[unitClass.destroyer]: [GUN, mp3s("fire/smallship", 3)],
	[unitClass.battleship]: [GUN, mp3s("fire/bigship", 4)],
	[unitClass.battleCruiser]: [GUN, mp3s("fire/bigship", 4)],
	[unitClass.cruiser]: [GUN, mp3s("fire/bigship", 4)],
	[unitClass.lightCruiser]: [GUN, mp3s("fire/smallship", 3)],
};

const TRACKS = wavThen("move/track", 3), HALF_TRACKS = wavThen("move/htrack", 3), LEGS = wavThen("move/leg", 4), WINGS = wavThen("move/air", 4),
	WAKE = wavThen("move/naval", 3);

//A move's sound by the unit's move method: tracked, half tracked, wheeled, leg, towed, air, deep naval, coastal, all
//terrain tracked, amphibious, naval, all terrain leg
const MOVE_SOUNDS = [TRACKS, HALF_TRACKS, HALF_TRACKS, LEGS, LEGS, WINGS, WAKE, WAKE, LEGS, TRACKS, WAKE, LEGS];

//Every strip a beat can draw, to load before the first one plays
export const SHEETS: Sheet[] = [...EXPLOSIONS, ...GUN, ...SMALL_GUN];

//A unit as it is after the step, or as it was before it when the step took it off the map
const unitIn = (before: World, after: World, id: UnitId) => unitById(after, id) || unitById(before, id);

//A unit moving along a path it was seen on, with its move method's sound (a train's are the tracks')
function moveBeat(before: World, after: World, id: UnitId, path: PathStep[]): Beat | null {
	const u = unitIn(before, after, id);
	if (u === null) return null;
	const e = after.equipment[u.isMounted && u.transport !== null ? u.transport.eqid : u.eqid];
	const sounds = isTrain(after, u) ? TRACKS : MOVE_SOUNDS[e.movmethod];
	return { kind: "move", unit: id, icon: e.icon, path, sounds };
}

//A fighter firing at the other, when it fires at all (its class has a shot) and the side shown sees it
function fireBeat(before: World, after: World, w: Fighter, target: Fighter): Beat | null {
	const shot = FIRE[after.equipment[w.eqid].uclass];
	if (shot === undefined || !seen(before, after, at(w))) return null;
	return { kind: "fire", at: at(w), facing: directionTo(w.row, w.col, target.row, target.col), sheets: shot[0], sounds: shot[1] };
}

function explosion(before: World, after: World, unit: UnitId, p: Position): Beat | null {
	return seen(before, after, p) ? { kind: "explosion", unit, at: at(p), facing: 0, sheets: EXPLOSIONS, sounds: EXPLOSION_SOUNDS } : null;
}

//A fighter turned to face the other, as the core turns them (src/core/fight.ts face): not on a bridge of its side
function turnOf(before: World, w: Fighter, other: Fighter): Turn[] {
	if (isBridgeForSide(before, hexIndex(before, w.row, w.col), w.side)) return [];
	return [{ unit: w.unit, facing: directionTo(w.row, w.col, other.row, other.col) }];
}

//A fight's shots: a support gun's alone; the attacker's, then the defender's when it fires back and is still there. The
//first shot shown turns both units to face each other before it fires, as the old UI showed them turned first
function fightBeats(before: World, after: World, e: EventOf<"fight">): (Beat | null)[] {
	const first = fireBeat(before, after, e.attacker, e.defender);
	const shots = e.support || !e.result.defcanfire || e.defender.after.strength <= 0 ? [first] : [first, fireBeat(before, after, e.defender, e.attacker)];
	const opening = shots.find((b) => b !== null && b.kind === "fire");
	if (opening !== undefined && opening.kind === "fire")
		opening.turn = [...turnOf(before, e.attacker, e.defender), ...turnOf(before, e.defender, e.attacker)];
	return shots;
}

function beatsOf(before: World, after: World, e: GameEvent): (Beat | null)[] {
	switch (e.type) {
		case "moved":
		case "retreated":
			return e.visible ? [moveBeat(before, after, e.unit, e.path)] : [];
		case "fight":
			return fightBeats(before, after, e);
		case "destroyed":
		case "surrendered":
			return [explosion(before, after, e.unit, e.at)];
		default:
			return [];
	}
}

//The beats of a step, in the order of its events: what the side shown sees of it
export function beatsFor(before: World, after: World, events: GameEvent[]): Beat[] {
	const beats: Beat[] = [];
	for (const e of events)
		for (const b of beatsOf(before, after, e))
			if (b !== null) beats.push(b);
	return beats;
}

//The units a step's events move, fight or take off the map
function touched(events: GameEvent[]): UnitId[] {
	const ids: UnitId[] = [];
	for (const e of events)
		if (e.type === "fight") ids.push(e.attacker.unit, e.defender.unit);
		else if (e.type === "moved" || e.type === "retreated" || e.type === "destroyed" || e.type === "surrendered") ids.push(e.unit);
	return ids;
}

//How long the map keeps each unit the step touched as it was before the step (#503), as the old UI showed a step: a
//unit until the end of its beat (its move, its explosion), one without a beat (it only fought, or moved unseen) until
//the last beat ends. A beat's index, beats.length for the last's end
export function heldUntil(beats: Beat[], events: GameEvent[]): Map<UnitId, number> {
	const until = new Map<UnitId, number>();
	for (const id of touched(events)) until.set(id, beats.length);
	beats.forEach((b, i) => {
		if (b.kind !== "fire") until.set(b.unit, i);
	});
	return until;
}

//The hex slot that holds the unit in a world, null when none does
function slotOf(w: World, id: UnitId, u: UnitState | null): { hex: number; key: "unit" | "air" } | null {
	if (u === null || u.row < 0) return null;
	const hex = u.row * w.state.map.cols + u.col, h = w.state.map.hexes[hex];
	return h.unit === id ? { hex, key: "unit" } : h.air === id ? { hex, key: "air" } : null;
}

//The world the map draws while a step's beats play (#503): the world after it, with the units held as they were before
//it, on their hexes (a destroyed one back on the map), each still seen when the step spotted it, and turned the way a
//fight's first shot turned it (turned)
export function shownWorld(before: World, after: World, held: UnitId[], turned: ReadonlyMap<UnitId, number> = new Map()): World {
	if (held.length === 0) return after;
	const units = after.state.units.slice(), hexes = after.state.map.hexes.slice(), index = new Map(after.index);
	//(each taken off its hex first, then put back where it was: a hex one left may be another's before)
	for (const id of held) {
		const slot = slotOf(after, id, unitById(after, id));
		if (slot !== null) hexes[slot.hex] = { ...hexes[slot.hex], [slot.key]: null };
	}
	for (const id of held) {
		const was = unitById(before, id), now = unitById(after, id), slot = slotOf(before, id, was);
		if (was === null) continue;
		const i = index.get(id);
		const u = { ...was, facing: turned.get(id) ?? was.facing, tempSpotted: was.tempSpotted || (now !== null && now.tempSpotted) };
		if (i === undefined) {
			index.set(id, units.length);
			units.push(u);
		} else units[i] = u;
		if (slot !== null) hexes[slot.hex] = { ...hexes[slot.hex], [slot.key]: id };
	}
	return { ...after, state: { ...after.state, units, map: { ...after.state.map, hexes } }, index, scratch: null };
}
