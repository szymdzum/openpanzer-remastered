//What the map shows right after a combat, from the step's events and nothing else: the strength each fighter lost over
//its hex, one stamp for what happened, and the same news as a line for the status bar. It replaces the original game's
//bouncing labels (uiShowAlert, reference/src/ui.js). Only what the side shown sees is told. Tested in
//test/view-results.test.ts
import type { EventOf, Fighter, GameEvent } from "../../core/events";
import { distance } from "../../core/geometry";
import type { Position, UnitId, World } from "../../core/types";
import { hexIndex, isSpotted, unitById } from "../../core/world";
import { terrainNames } from "../../core/tables";

/** A loss chip right of a unit's strength plate: the strength lost (none: 0 on paper) and a note that explains it. */
export interface HitChip {
	at: Position;
	loss: number;
	note: string | null;
}

export type StampTone = "good" | "bad" | "warn" | "brass";

/** The one stamp of a combat, over the unit it concerns: its word, the number after it. */
export interface Stamp {
	at: Position;
	word: string;
	extra: string | null;
	tone: StampTone;
}

/** The status bar's line: the unit's name in bold, then what happened. */
export interface News {
	name: string;
	text: string;
}

export interface Results {
	chips: HitChip[];
	stamp: Stamp | null;
	trail: { from: Position; to: Position } | null; //a retreat: from where the defender stood
	news: News;
}

type Fight = EventOf<"fight">;

const find = <T extends GameEvent["type"]>(events: GameEvent[], type: T): EventOf<T> | undefined =>
	events.find((e): e is EventOf<T> => e.type === type);
/** A hex's position copied off a unit or a fighter. */
export const at = (f: { row: number; col: number }): Position => ({ row: f.row, col: f.col });
//A loss as the chips write it: −6, and 0 for none
const loss = (n: number) => n === 0 ? "0" : "−" + n;
/** The dice can kill more than a unit has: it loses what it had. */
export const lost = (f: Fighter) => Math.max(0, f.before.strength - Math.max(0, f.after.strength));

//The attack itself is none when the support fire stopped it
interface Combat {
	main: Fight | null;
	support: Fight[];
	attacker: UnitId | null;
	stopped: boolean;
	destroyed: EventOf<"destroyed">[];
	retreat: EventOf<"retreated"> | undefined;
	surrender: EventOf<"surrendered"> | undefined;
}

function combatOf(events: GameEvent[]): Combat {
	const main = events.find((e): e is Fight => e.type === "fight" && !e.support) || null;
	const support = events.filter((e): e is Fight => e.type === "fight" && e.support);
	const stopped = find(events, "attackStopped");
	const attacker = main !== null ? main.attacker.unit : stopped !== undefined ? stopped.unit : support.length > 0 ? support[0].defender.unit : null;
	return { main, support, attacker, stopped: stopped !== undefined, destroyed: events.filter((e): e is EventOf<"destroyed"> => e.type === "destroyed"),
		retreat: find(events, "retreated"), surrender: find(events, "surrendered") };
}

//The name of a unit from the worlds before and after the step (a destroyed one is only in the first)
function nameOf(before: World, after: World, id: UnitId): string {
	const u = unitById(after, id) || unitById(before, id);
	return u === null ? "" : (after.equipment[u.eqid] || before.equipment[u.eqid]).name;
}

/** The side shown sees a hex before or after the step; with no side shown, every hex (the beats use it too). */
export function seen(before: World, after: World, p: Position): boolean {
	const side = after.spotSide;
	if (side < 0 || side > 1 || after.noFOW) return true;
	return isSpotted(before, hexIndex(before, p.row, p.col), side) || isSpotted(after, hexIndex(after, p.row, p.col), side);
}

const supportLoss = (c: Combat) => c.support.reduce((n, s) => n + lost(s.defender), 0);
const gone = (c: Combat, id: UnitId) => c.destroyed.some((d) => d.unit === id);

//The attacker's chip: what the support fire and the return fire took, the support's part noted
function attackerChip(c: Combat): HitChip | null {
	const a = c.main !== null ? c.main.attacker : c.support.length > 0 ? c.support[c.support.length - 1].defender : null;
	if (a === null || gone(c, a.unit)) return null;
	const bySupport = supportLoss(c), main = c.main !== null;
	return { at: at(a), loss: bySupport + (main ? lost(c.main!.attacker) : 0), note: bySupport > 0 && main ? bySupport + " by support" : null };
}

//The defender's chip, where it fell back to; its entrenchment's loss noted
function defenderChip(c: Combat): HitChip | null {
	if (c.main === null || gone(c, c.main.defender.unit)) return null;
	const d = c.main.defender, dug = d.before.entrenchment !== d.after.entrenchment;
	return { at: c.retreat !== undefined ? c.retreat.to : at(d), loss: lost(d),
		note: dug ? "entrenched " + d.before.entrenchment + " → " + d.after.entrenchment : null };
}

//Both fighters' chips, none for a unit destroyed: its stamp says it
const chipsOf = (c: Combat): HitChip[] => [attackerChip(c), defenderChip(c)].filter((x) => x !== null);

interface Told {
	stamp: Stamp | null;
	news: News;
}

function placeOf(w: World, p: Position): string {
	return terrainNames[w.data.hexes[hexIndex(w, p.row, p.col)].terrain].toLowerCase();
}

interface Fought {
	before: World;
	c: Combat;
	m: Fight;
	name: string;
	target: string;
	aLoss: number;
	dLoss: number;
}

const told = (where: Position, word: string, extra: string | null, tone: StampTone, name: string, text: string): Told =>
	({ stamp: { at: where, word, extra, tone }, news: { name, text } });

function overran({ m, name, target }: Fought): Told | null {
	return m.result.isOverrun ? told(at(m.attacker), "Overrun", "+1 move", "good", name, "overran the " + target + " · no return fire") : null;
}

//The support fire's part of the attacker's loss: the gun that took it, or how much the guns took
function supportPart(before: World, c: Combat): string {
	const hit = c.support.filter((s) => lost(s.defender) > 0);
	if (hit.length === 0) return "";
	return hit.length === 1 ? ", " + nameOf(before, before, hit[0].attacker.unit) + " " + loss(lost(hit[0].defender)) + " of it"
		: ", " + supportLoss(c) + " of it by support fire";
}

function rugged({ before, c, m, name, aLoss }: Fought): Told | null {
	if (!m.result.isRugged) return null;
	return told(at(m.defender), "Rugged defense", null, "bad", name, "hit a rugged defense in the " + placeOf(before, at(m.defender)) + " · "
		+ loss(aLoss) + supportPart(before, c));
}

function surrendered({ c, name, target }: Fought): Told | null {
	return c.surrender === undefined ? null
		: told(c.surrender.at, "Surrendered", null, "bad", name, "forced the " + target + " to surrender · it had nowhere to fall back");
}

//The defender destroyed, else the attacker
function destroyed({ c, m, name, target, aLoss, dLoss }: Fought): Told | null {
	const killed = c.destroyed.find((d) => d.unit === m.defender.unit), died = c.destroyed.find((d) => d.unit === m.attacker.unit);
	if (killed !== undefined) return told(killed.at, "Destroyed", "−" + dLoss, "bad", name, "destroyed the " + target + " · " + loss(aLoss));
	return died === undefined ? null : told(died.at, "Destroyed", null, "bad", name, "was destroyed attacking the " + target);
}

function retreated({ before, c, m, name, target }: Fought): Told | null {
	return c.retreat === undefined ? null : told(c.retreat.to, "Retreat", null, "warn", name,
		"drove the " + target + " out of the " + placeOf(before, at(m.defender)) + " · it fell back one hex");
}

//No stamp: the plain exchange, or a shot from range
function exchanged({ m, name, target, aLoss, dLoss }: Fought): Told {
	const ranged = distance(m.attacker.row, m.attacker.col, m.defender.row, m.defender.col) > 1;
	if (ranged || !m.result.defcanfire)
		return { stamp: null, news: { name, text: (ranged ? "shelled the " : "attacked the ") + target + " · " + loss(dLoss) + ", no return fire" } };
	return { stamp: null, news: { name, text: "attacked the " + target + " · " + target + " " + loss(dLoss) + ", " + name + " " + loss(aLoss) } };
}

//What decides an attack, in the card's order: its overrun, a rugged defense, a surrender, a unit destroyed, a retreat
const TELLERS = [overran, rugged, surrendered, destroyed, retreated];

//The attack the support fire stopped: its stamp over the attacker
function stoppedTold(c: Combat, name: string): Told | null {
	if (c.support.length === 0) return null;
	return told(at(c.support[c.support.length - 1].defender), "Attack stopped", null, "bad", name, "was stopped by the support fire · " + loss(supportLoss(c)));
}

function attackTold(before: World, after: World, c: Combat): Told | null {
	if (c.attacker === null) return null;
	const name = nameOf(before, after, c.attacker), m = c.main;
	if (m === null) return stoppedTold(c, name);
	const f: Fought = { before, c, m, name, target: nameOf(before, after, m.defender.unit), aLoss: lost(m.attacker) + supportLoss(c), dLoss: lost(m.defender) };
	for (const tell of TELLERS) {
		const t = tell(f);
		if (t !== null) return t;
	}
	return exchanged(f);
}

//What a move told without a fight: a hidden enemy it ran into, a flag it took
function moveTold(before: World, after: World, events: GameEvent[]): Told | null {
	const surprised = find(events, "surprised"), captured = find(events, "captured");
	if (surprised !== undefined) {
		const u = unitById(after, surprised.unit) || unitById(before, surprised.unit)!;
		return { stamp: { at: at(u), word: "Surprised", extra: null, tone: "warn" }, news: { name: nameOf(before, after, surprised.unit), text: "ran into a hidden enemy" } };
	}
	if (captured === undefined) return null;
	const place = after.data.hexes[hexIndex(after, captured.at.row, captured.at.col)].name || (captured.objective ? "an objective" : "a town");
	return { stamp: { at: captured.at, word: "Captured", extra: "+" + captured.prestige, tone: "brass" },
		news: { name: nameOf(before, after, captured.unit), text: "took " + place + " · +" + captured.prestige + " prestige" } };
}

//A new leader for a unit of the side shown only, as in the original game (reference/src/ui.js)
function leaderTold(before: World, after: World, events: GameEvent[]): Told | null {
	for (const e of events) {
		const u = e.type === "leader" ? unitById(after, e.unit) : null;
		if (u === null || after.state.players[u.owner].side !== after.spotSide) continue;
		return { stamp: { at: at(u), word: "New leader", extra: null, tone: "brass" }, news: { name: nameOf(before, after, u.id), text: "has a new leader" } };
	}
	return null;
}

function trailOf(c: Combat, stamp: Stamp | null): Results["trail"] {
	return c.retreat !== undefined && stamp !== null && stamp.word === "Retreat" ? { from: c.retreat.from, to: c.retreat.to } : null;
}

/** Null for a step with nothing to tell, or whose combat the side shown doesn't see at all. */
export function resultsOf(before: World, after: World, events: GameEvent[]): Results | null {
	const c = combatOf(events);
	const t = attackTold(before, after, c) || moveTold(before, after, events) || leaderTold(before, after, events);
	if (t === null) return null;
	const shown = (p: Position) => seen(before, after, p);
	const chips = chipsOf(c).filter((h) => shown(h.at));
	const stamp = t.stamp !== null && shown(t.stamp.at) ? t.stamp : null;
	return chips.length === 0 && stamp === null ? null : { chips, stamp, trail: trailOf(c, stamp), news: t.news };
}
