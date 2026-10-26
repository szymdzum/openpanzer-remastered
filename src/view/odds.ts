//The attack preview's view model (#347, the AttackPreview and CombatOdds cards): which enemies in range the selected
//unit can't attack and why (stage 0), the two losses and the one certain trap at a glance (stage 1), and the odds
//card (stage 2). Every number is the core's estimate of the attack (src/core/estimate.ts), which draws no dice; the
//reasons are the combat steps the estimate recorded (#118), so they are the rules the world plays. Hidden guns
//aren't in the estimate and nothing here pretends they are. Plain functions, tested on hand-built worlds
//(test/view-odds.test.ts)
import { attackableUnit, isInAttackRange, unitAttackRange } from "../core/attack";
import { canStartAttackOn } from "../core/equipment";
import { type AttackEstimate, estimateAttack } from "../core/estimate";
import { distance } from "../core/geometry";
import type { Contribution, Position, Side, UnitState, World } from "../core/types";
import { isAir } from "../core/units";
import { ammoOf, currentEqid, hexIndex, sideOf, unitById, unitData } from "../core/world";
import { terrainNames, terrainType } from "../prototypes";
import type { IconName, Nation } from "./icon";
import { canOrder, countryName, nationOf } from "./model";
import { isShown, type Selection } from "./mapview";

//An enemy in range the selected unit can't attack, and why (stage 0: a grey badge)
export interface Blocked {
	at: Position;
	reason: string;
}

//A certain trap or bonus the glance shows beside the losses: rugged defense, an overrun, support fire, no return fire
export type Glyph = "rugged" | "overrun" | "support" | "no-return";

//A side's estimated loss, in its side's colour
export interface Chip {
	side: number;
	loss: number;
}

//Stage 1 at the hovered target: your loss, theirs, at most one glyph
export interface Glance {
	at: Position;
	yours: Chip;
	theirs: Chip;
	glyph: Glyph | null;
}

export type Tone = "good" | "warn" | "bad";

//A side's strength on the card: before and after, the part of the loss the support fire takes (hatched)
export interface Bar {
	name: string;
	who: string; //"yours", or the enemy's country
	side: "axis" | "allied";
	before: number;
	after: number;
	support: number;
	of: number; //the bar's segments: 10, more for an overstrength unit
}

//A modifier that decides the fight, with its effect for the player (up) or against (dn); key: a rule that turns the
//whole fight, written in critical
export interface Reason {
	icon: IconName;
	text: string;
	effect: string;
	tone: "up" | "dn" | "";
	key: boolean;
}

export interface Tag {
	text: string;
	tone: "good" | "bad" | "";
}

//Stage 2, the odds card beside the target, away from the attacker
export interface Odds {
	at: Position;
	from: Position;
	away: "right" | "left"; //the side of the target the card opens on: away from the attacker
	verb: string; //Attack, or Bombard from range
	icon: IconName;
	target: string;
	nation: Nation | null;
	where: string; //"City · entrenched 4 · 2 bars of experience"
	bars: [Bar, Bar];
	verdict: { word: string; tone: Tone; icon: IconName };
	reasons: Reason[];
	next: Tag[];
	advice: string | null;
	commit: string;
	glyph: Glyph | null;
}

const same = (a: Position, b: Position) => a.row === b.row && a.col === b.col;
const bars = (u: UnitState) => (u.experience / 100) >> 0;
const plural = (n: number, one: string, many: string) => n + " " + (n === 1 ? one : many);
const signed = (n: number) => (n > 0 ? "+" : "−") + Math.abs(n);

//Why the unit can't start an attack on an enemy in its range, as the core's rules decide it (src/core/attack.ts)
function blockedReason(w: World, u: UnitState, target: UnitState): string {
	if (u.hasFired) return "Already fired";
	if (ammoOf(u) <= 0) return u.isMounted && u.transport !== null ? "In its transport: can't fire" : "No ammo";
	if (isAir(w, target) && unitData(w, u).airatk <= 0) return "Can't attack aircraft";
	if (!canStartAttackOn(w.equipment, currentEqid(u), currentEqid(target))) return "Can't attack " + unitData(w, target).name;
	//(the rest: an aircraft of range 1 that hits the ground only below it, in the rules that say so)
	return isAir(w, u) ? "Hits the ground only below it" : "Not a target from here";
}

//The enemies the side sees in the selected unit's range that it can't attack (stage 0), each hex once; none for a
//unit the person can't order
export function blockedOf(w: World, sel: Selection | null): Blocked[] {
	const u = sel === null ? null : unitById(w, sel.unit);
	if (u === null || sel === null || !canOrder(w, u)) return [];
	const blocked: Blocked[] = [];
	const side = sideOf(w, u);
	for (const t of w.state.units) {
		if (t.row < 0 || sideOf(w, t) === side || !isShown(w, t) || !isInAttackRange(w, u, t)) continue;
		const at = { row: t.row, col: t.col };
		if (sel.targets.some((c) => same(c, at)) || blocked.some((b) => same(b.at, at))) continue;
		blocked.push({ at, reason: blockedReason(w, u, t) });
	}
	return blocked;
}

//The attacker and the unit it attacks on a hovered hex of its targets, null on any other hex
function fightAt(w: World, sel: Selection | null, at: Position | null, airMode: boolean): { atk: UnitState; def: UnitState } | null {
	if (sel === null || at === null || !sel.targets.some((c) => same(c, at))) return null;
	const atk = unitById(w, sel.unit);
	const def = atk === null ? null : attackableUnit(w, atk, hexIndex(w, at.row, at.col), airMode);
	return atk === null || def === null ? null : { atk, def };
}

//What the attacker loses: the support fire first, then the defender's fire
const supportLoss = (e: AttackEstimate) => e.support.reduce((n, s) => n + s.losses, 0);
const yourLoss = (atk: UnitState, e: AttackEstimate) => Math.min(atk.strength, supportLoss(e) + e.result.losses);
//(a stopped attack isn't made: the defender loses nothing)
const theirLoss = (e: AttackEstimate) => e.stopped ? 0 : e.result.kills;

//The one glyph: a certain trap outranks a good trade
function glyphOf(e: AttackEstimate): Glyph | null {
	if (e.result.isRugged) return "rugged";
	if (e.result.isOverrun) return "overrun";
	if (e.support.length > 0) return "support";
	return e.result.defcanfire ? null : "no-return";
}

export function glanceOf(w: World, sel: Selection | null, at: Position | null, airMode: boolean): Glance | null {
	const f = fightAt(w, sel, at, airMode);
	if (f === null) return null;
	const e = estimateAttack(w, f.atk, f.def);
	return { at: { row: at!.row, col: at!.col }, yours: { side: sideOf(w, f.atk), loss: yourLoss(f.atk, e) },
		theirs: { side: sideOf(w, f.def), loss: theirLoss(e) }, glyph: glyphOf(e) };
}

//The sum a combat step added to one value of one side (a step that sets a value outright isn't a modifier)
function delta(record: Contribution[], names: string[], side: Side, field: Contribution["field"]): number {
	return record.filter((c) => names.includes(c.name) && c.side === side && c.field === field).reduce((n, c) => n + c.after - c.before, 0);
}

const has = (record: Contribution[], name: string) => record.some((c) => c.name === name);

//A terrain's name as the card writes it
const terrainOf = (t: number) => t === terrainType.Clear ? "Open ground" : terrainNames[t];

//The fight the reasons are read from: the two units, the estimate and its record, the defender's terrain in words
interface Read {
	w: World;
	atk: UnitState;
	def: UnitState;
	e: AttackEstimate;
	r: Contribution[];
	terrain: string;
}

const reason = (icon: IconName, text: string, effect = "", tone: Reason["tone"] = "", key = false): Reason => ({ icon, text, effect, tone, key });

//A rule that turns the whole fight, written in critical
function rugged({ e, r }: Read): Reason | null {
	if (e.result.isRugged) return reason("critical", "Your defence drops to 0 and your attack is halved", "", "", true);
	return has(r, "surprised") ? reason("critical", "Surprised: your defence drops to 0 and your attack is halved", "", "", true) : null;
}

//The guns the side sees that fire on the attacker first, the strength they take
function supportFire({ w, e }: Read): Reason | null {
	if (e.support.length === 0) return null;
	const gun = unitData(w, unitById(w, e.support[0].unit)!).name, more = e.support.length - 1;
	const lost = supportLoss(e);
	return reason("artillery", "Support fire from " + gun + (more > 0 ? " and " + plural(more, "other gun", "other guns") : "") + " before you attack",
		lost > 0 ? signed(-lost) : "", lost > 0 ? "dn" : "");
}

function fromRange({ atk, def, e }: Read): Reason | null {
	return distance(atk.row, atk.col, def.row, def.col) > 1 && !e.result.defcanfire
		? reason("artillery", "From range: the target can't fire back and no support fire answers") : null;
}

//Infantry in close terrain: both on close defence against infantry, else the attacker +4
function closeCombat({ r, terrain }: Read): Reason | null {
	if (!has(r, "close combat")) return null;
	return delta(r, ["close combat"], "attacker", "aav") === 0 ? reason("infantry", "Close combat in " + terrain + ": both sides use close defence")
		: reason("infantry", "Close combat: they use their close defence", "+4 atk", "up");
}

//The defender's entrenchment, twice for infantry in close terrain against what the attacker is
function entrenchment({ w, atk, def, r, terrain }: Read): Reason | null {
	const dug = delta(r, ["entrenchment", "infantry entrenched in close terrain"], "defender", "ddv");
	if (dug <= 0) return null;
	return has(r, "infantry entrenched in close terrain")
		? reason("entrench", "Entrenchment counts twice: infantry in " + terrain + " against " + unitData(w, atk).name, "+" + dug + " def", "dn")
		: reason("entrench", "Entrenched " + def.entrenchment, "+" + dug + " def", "dn");
}

function city({ r }: Read): Reason | null {
	const d = delta(r, ["city"], "defender", "ddv");
	return d > 0 ? reason("scenario", "Defending in a city", "+" + d + " def", "dn") : null;
}

//A side in a river without a road: the other gets +4 and +4
function river({ r }: Read): Reason | null {
	if (has(r, "defender in a river")) return reason("info", "They stand in a river", "+4 atk", "up");
	return has(r, "attacker in a river") ? reason("info", "You stand in a river", "+4 atk", "dn") : null;
}

//Who fires first, and the attack it gives
function initiative({ w, atk, def, r }: Read): Reason | null {
	const a = unitData(w, atk).initiative, d = unitData(w, def).initiative;
	const ours = delta(r, ["initiative"], "attacker", "aav"), theirs = delta(r, ["initiative"], "defender", "dav");
	if (ours > 0) return reason("clock", "You fire first: initiative " + a + " against " + d, "+" + ours + " atk", "up");
	return theirs > 0 ? reason("clock", "They fire first: initiative " + d + " against " + a, "+" + theirs + " atk", "dn") : null;
}

//The experience bars between the two, when they differ
function experience({ atk, def }: Read): Reason | null {
	const a = bars(atk), d = bars(def);
	return a === d ? null : reason("star", "Experience: " + plural(a, "bar", "bars") + " against " + d, signed(a - d), a > d ? "up" : "dn");
}

//The hits the defender took this turn, the defence they cost it
function hits({ def, r }: Read): Reason | null {
	const lost = -delta(r, ["hits"], "defender", "ddv");
	return lost > 0 ? reason("casualty", "Hit " + plural(def.hits, "time", "times") + " this turn", "−" + lost + " def", "up") : null;
}

//The reasons in the card's order (CombatOdds, Why): rugged defense, support fire, close combat, entrenchment, city,
//river, initiative, experience, hits taken this turn
const REASONS = [rugged, supportFire, fromRange, closeCombat, entrenchment, city, river, initiative, experience, hits];

//The reasons that decide the fight, the first four
function reasonsOf(w: World, atk: UnitState, def: UnitState, e: AttackEstimate): Reason[] {
	const read: Read = { w, atk, def, e, r: e.record, terrain: terrainOf(w.data.hexes[hexIndex(w, def.row, def.col)].terrain).toLowerCase() };
	return REASONS.map((f) => f(read)).filter((x) => x !== null).slice(0, 4);
}

//What follows the attack, as tags
function nextOf(def: UnitState, e: AttackEstimate): Tag[] {
	if (e.stopped) return [{ text: "Attack stopped by the support fire", tone: "bad" }];
	const tags: Tag[] = [];
	if (e.fate === "destroyed") tags.push({ text: "Destroyed", tone: "good" });
	if (e.fate === "retreats") tags.push({ text: "Retreats one hex", tone: "good" });
	if (e.fate === "surrenders") tags.push({ text: "Surrenders: no free hex behind", tone: "good" });
	if (!e.result.defcanfire) tags.push({ text: "No return fire", tone: "good" });
	if (e.result.isOverrun) tags.push({ text: "+1 move", tone: "good" }, { text: "Can attack again", tone: "good" });
	if (e.fate !== null) return tags;
	//(every attack takes a level of entrenchment and costs the defender 2 defence for the next attack this turn)
	if (def.entrenchment > 0) tags.push({ text: "Entrenchment " + def.entrenchment + " → " + (def.entrenchment - 1), tone: "good" });
	tags.push({ text: "−2 defence for the next attack this turn", tone: "good" });
	return tags;
}

//The verdict's word and tone; its icon is the tone's (a state is never colour alone)
function verdictOf(lost: number, killed: number, e: AttackEstimate): Odds["verdict"] {
	const [word, tone] = verdictWord(lost, killed, e);
	return { word, tone, icon: tone === "good" ? "ok" : tone === "warn" ? "low" : "critical" };
}

//The verdicts, the first that holds: a certain trap first, then the trade (the losses yours, the kills theirs)
const VERDICTS: [(e: AttackEstimate, lost: number, killed: number) => boolean, string, Tone][] = [
	[(e) => e.result.isRugged, "Rugged defense", "bad"],
	[(e) => e.stopped, "Attack stopped", "bad"],
	[(e) => e.result.isOverrun, "Overrun", "good"],
	[(e, lost) => lost === 0 && !e.result.defcanfire, "No return fire", "good"],
	[(_e, lost, killed) => killed > 0 && killed >= 2 * lost, "Favourable", "good"],
	[(_e, lost, killed) => lost > killed, "Unfavourable", "bad"],
	[(_e, lost, killed) => killed === lost, "Even", "warn"],
	[() => true, "Costly win", "warn"],
];

function verdictWord(lost: number, killed: number, e: AttackEstimate): [string, Tone] {
	const [, word, tone] = VERDICTS.find(([holds]) => holds(e, lost, killed))!;
	return [word, tone];
}

//One sentence for a fight not to take as it is
function adviceOf(e: AttackEstimate): string | null {
	if (e.result.isRugged) return "Bring the entrenchment down first: shell it with artillery or bomb it. Every hit takes a level.";
	if (e.stopped) return "Silence the guns first, or attack from out of their range.";
	return null;
}

//Where the target stands: its terrain, how far, its entrenchment and experience
function whereOf(w: World, atk: UnitState, def: UnitState): string {
	const d = distance(atk.row, atk.col, def.row, def.col);
	const parts = [terrainOf(w.data.hexes[hexIndex(w, def.row, def.col)].terrain),
		d <= 1 ? (d === 0 ? "below" : "adjacent") : "range " + d + " of " + unitAttackRange(w, atk)];
	if (def.entrenchment > 0) parts.push("entrenched " + def.entrenchment);
	if (bars(def) > 0) parts.push(plural(bars(def), "bar", "bars") + " of experience");
	return parts.join(" · ");
}

const sideName = (side: number): Bar["side"] => side === 1 ? "allied" : "axis";

//The odds card for the hovered or tapped target, null on any other hex; touch: the tap that opened it attacks next
export function oddsOf(w: World, sel: Selection | null, at: Position | null, airMode: boolean, touch: boolean): Odds | null {
	const f = fightAt(w, sel, at, airMode);
	if (f === null) return null;
	const { atk, def } = f, e = estimateAttack(w, atk, def);
	const lost = yourLoss(atk, e), killed = theirLoss(e), support = Math.min(supportLoss(e), atk.strength);
	const country = countryName(w, w.state.players[def.owner].country);
	const ranged = distance(atk.row, atk.col, def.row, def.col) > 1;
	const verdict = verdictOf(lost, killed, e);
	const fire = ranged ? "fire" : "attack";
	const commit = touch ? "Tap again to " + fire + " · tap elsewhere to cancel"
		: "Click to " + fire + (verdict.tone === "bad" ? " anyway" : "") + " · Esc to cancel";
	return {
		at: { row: def.row, col: def.col }, from: { row: atk.row, col: atk.col }, away: atk.col <= def.col ? "right" : "left", verb: ranged ? "Bombard" : "Attack", icon: ranged ? "artillery" : "attack",
		target: unitData(w, def).name, nation: nationOf(country), where: whereOf(w, atk, def),
		bars: [
			{ name: unitData(w, atk).name, who: "yours", side: sideName(sideOf(w, atk)), before: atk.strength, after: atk.strength - lost, support,
				of: Math.max(10, atk.strength) },
			{ name: unitData(w, def).name, who: country, side: sideName(sideOf(w, def)), before: def.strength, after: def.strength - killed, support: 0,
				of: Math.max(10, def.strength) },
		],
		verdict, reasons: reasonsOf(w, atk, def, e), next: nextOf(def, e), advice: adviceOf(e), commit, glyph: glyphOf(e),
	};
}
