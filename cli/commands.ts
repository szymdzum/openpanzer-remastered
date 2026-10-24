//The command-line player's commands (#279): the words of a call as the core's commands and queries, on
//a Front, where the game is played: headless on the core from a save file (game.ts), or on the game's
//page with its animations (page.ts, "npm run play:live"). Nothing here reads a file or the page
import type { Command, Refusal } from "../src/commands";
import { attackableUnit } from "../src/core/attack";
import type { GameEvent } from "../src/core/events";
import { check } from "../src/core/step";
import type { SessionEnd } from "../src/core/session";
import { outcome, type Outcome } from "../src/core/turn";
import type { Position, RulesetName, World } from "../src/core/types";
import { isAir } from "../src/core/units";
import { hexIndex, onMap, sideOf, unitById } from "../src/core/world";
import { unitClassNames } from "../src/prototypes";
import { hex, map, reserve, shop, status } from "./board";
import { attackerLine, attackers, estimateLine, isTarget, targets } from "./combat";
import { knownWorld, SIDES, seen } from "./known";
import { changes, describe } from "./report";
import { moveLine, moves, supply, unitLine } from "./units";

//Where the game is played. events: what a command or the enemy's turn did, null when the front doesn't
//know them (the page): the answer is then what changed between the worlds before and after
export interface Front {
	world(): World;
	side: number;
	humanTurn(): boolean;
	act(cmd: Command): Promise<{ events: GameEvent[] | null; refusal: Refusal | null }>;
	end(): Promise<GameEvent[] | null>;
	report(): string[];
	result(): Outcome | null;
}

export const HELP = `npm run -s play -- <command> [--game FILE] [--live] [--json]
The game is saved in FILE (default .play/game.json, or $OPENPANZER_PLAY). Cells are row,col.
--live (or $OPENPANZER_LIVE=URL): play on the game's page instead, with its animations: start it with
"npm run play:live" and open http://127.0.0.1:8644/ (docs/CLI.md).

Start
  scenarios                          the scenario files and names
  new FILE [--side 0|1] [--seed N] [--rules classic|remaster]
                                     a new game of a scenario file, you on side 0 (Axis) by default,
                                     the remaster's rules unless classic (on the page: the settings')

Look (your side's view: enemies only where you see them)
  status                             turn, limits, prestige, victory hexes, the turn limit's verdict now
  units [--ready]                    your units (--ready: those that can still act)
  enemies                            the enemy units you see
  unit ID                            one unit, with what it can attack now
  map [R0-R1 C0-C1] [--zoc]          the map as text (--zoc: the seen enemies' zones of control)
  hex R,C                            a hex: terrain, owner, units, who of yours can attack there
  moves ID                           where a unit can move: path cost, fuel left, zone of control
  targets ID [--from R,C]            what a unit can attack, now or after moving to R,C, with the estimate
  attackers ID|R,C                   which of your units can hit an enemy, now or after a move
  supply                             units short of ammo, fuel or strength; what a resupply or reinforcement gives
  shop [CLASS]                       what you can buy (CLASS: a unit class number or name)
  reserve                            units waiting to deploy, free deployment hexes
  report                             what the enemy's last turn did, as you saw it
  check ACTION...                    whether an action is allowed, without playing it

Act
  move ID R,C | attack ID TARGET|R,C | mount ID | unmount ID | resupply ID | reinforce ID [--over]
  embark ID | disembark ID | undo ID | buy EQID [TRANSPORT] | deploy INDEX R,C | upgrade ID EQID [TRANSPORT]
  disband ID | end (ends your turn; the AI plays its turn and the report is shown)`;

export interface Args { words: string[]; flags: Map<string, string | true> }

const VALUED = ["--game", "--side", "--seed", "--from", "--rules"];

export function parseArgs(argv: string[]): Args {
	const words: string[] = [], flags = new Map<string, string | true>();
	for (let i = 0; i < argv.length; i++) {
		if (!argv[i].startsWith("--")) words.push(argv[i]);
		else flags.set(argv[i].slice(2), VALUED.includes(argv[i]) ? argv[++i] : true);
	}
	return { words, flags };
}

//A call's words that don't make sense: said as they are, without a stack (exit code 2)
export class UsageError extends Error {}

//A cell of the map w plays on: one off it is refused as the words' mistake, not read (#309)
export function cellOf(text: string | undefined, w: World): Position {
	const m = /^(\d+),(\d+)$/.exec(text ?? "");
	if (!m) throw new UsageError(`expected a cell row,col, got "${text ?? ""}"`);
	const { rows, cols } = w.state.map;
	if (!onMap(w, +m[1], +m[2])) throw new UsageError(`no hex ${text}: the map is ${rows} rows by ${cols} columns (0-${rows - 1}, 0-${cols - 1})`);
	return { row: +m[1], col: +m[2] };
}

export function intOf(text: string | undefined, what: string): number {
	if (!/^-?\d+$/.test(text ?? "")) throw new UsageError(`expected ${what}, got "${text ?? ""}"`);
	return +text;
}

const optionalInt = (text: string | undefined, what: string) => text === undefined ? -1 : intOf(text, what);
const groundOrAir = (kw: World, i: number) => unitById(kw, kw.state.map.hexes[i].unit ?? kw.state.map.hexes[i].air ?? -1);

//The enemy on a hex: the one the attacker fights (an aircraft over a tank for a fighter), else the ground's
function enemyOn(kw: World, p: Position, attacker: number | undefined): number {
	const i = hexIndex(kw, p.row, p.col), a = attacker === undefined ? null : unitById(kw, attacker);
	const t = a ? attackableUnit(kw, a, i, isAir(kw, a)) : groundOrAir(kw, i);
	if (!t) throw new UsageError(`no enemy you see on ${p.row},${p.col}`);
	return t.id;
}

//An enemy named by id or by its hex
const targetOf = (w: World, side: number, text: string, attacker?: number) =>
	text.includes(",") ? enemyOn(knownWorld(w, side), cellOf(text, w), attacker) : intOf(text, "a unit id or a cell");

type Words = string[];
type Flags = Args["flags"];
const unitWord = (x: Words) => intOf(x[1], "a unit id");
const SIMPLE = ["mount", "unmount", "resupply", "embark", "disembark", "undo", "disband"] as const;
const simple = (type: (typeof SIMPLE)[number]) => (x: Words): Command => ({ type, unit: unitWord(x) });

//An action's words as the core's command
const COMMANDS: { [verb: string]: (x: Words, w: World, side: number, flags: Flags) => Command } = {
	move: (x, w) => ({ type: "move", unit: unitWord(x), to: cellOf(x[2], w) }),
	attack: (x, w, side) => ({ type: "attack", unit: unitWord(x), target: targetOf(w, side, x[2] ?? "", unitWord(x)) }),
	reinforce: (x, _w, _s, flags) => ({ type: "reinforce", unit: unitWord(x), overstrength: flags.has("over") }),
	buy: (x) => ({ type: "buy", eqid: intOf(x[1], "an equipment id"), transport: optionalInt(x[2], "a transport id") }),
	deploy: (x, w) => ({ type: "deploy", index: intOf(x[1], "a reserve index"), to: cellOf(x[2], w) }),
	upgrade: (x) => ({ type: "upgrade", unit: unitWord(x), eqid: intOf(x[2], "an equipment id"), transport: optionalInt(x[3], "a transport id") }),
	...Object.fromEntries(SIMPLE.map((t) => [t, simple(t)])),
};

export function commandOf(w: World, side: number, x: Words, flags: Flags = new Map()): Command {
	const make = COMMANDS[x[0]];
	if (!make) throw new UsageError(`unknown command "${x[0]}" (help lists them)`);
	return make(x, w, side, flags);
}

//What a call answers: lines for a person, data for --json
export interface Answer { lines: string[]; data: unknown }
export const answer = (lines: string[], data: unknown = lines): Answer => ({ lines, data });

//What a command reads: its words and flags, the front, its world now and the person's side
interface Call { x: Words; flags: Flags; front: Front; w: World; side: number }

export function gameOver(front: Front): string[] {
	const r = front.result();
	return r ? [`GAME OVER: ${r.winner < 0 ? "no winner" : SIDES[r.winner] + " wins"} (${r.kind}, ${r.rating})`] : [];
}

function rangeOf(text: string | undefined, last: number): [number, number] {
	const m = /^(\d+)-(\d+)$/.exec(text ?? "");
	return m ? [+m[1], Math.min(+m[2], last)] : [0, last];
}

function classOf(k: string | undefined): number | undefined {
	if (k === undefined) return undefined;
	return /^\d+$/.test(k) ? +k : unitClassNames.findIndex((n) => n.toLowerCase().startsWith(k.toLowerCase()));
}

const statsLine = (e: EquipmentEntry) => `  ${unitClassNames[e.uclass]}: soft ${e.softatk} hard ${e.hardatk} air ${e.airatk} naval ${e.navalatk},`
	+ ` defense ground ${e.grounddef} air ${e.airdef} close ${e.closedef}, initiative ${e.initiative}, range ${e.gunrange}, spot ${e.spotrange}`;

function attackLines(c: Call, kw: World, id: number): string[] {
	const t = targets(c.w, c.side, id);
	return t.estimates.length ? ["  can attack:", ...t.estimates.map((x) => "    " + estimateLine(kw, x))] : ["  " + t.note];
}

function unitAnswer(c: Call): Answer {
	const u = unitById(c.w, intOf(c.x[1], "a unit id"));
	if (!u || !seen(c.w, c.side, u)) throw new UsageError(`no unit #${c.x[1]} you see`);
	const kw = knownWorld(c.w, c.side), mine = sideOf(c.w, u) === c.side;
	return answer([unitLine(kw, u, mine), statsLine(c.w.equipment[u.eqid]), ...(mine ? attackLines(c, kw, u.id) : [])]);
}

//An attack on an enemy the side doesn't see is refused as on a unit that doesn't exist: the screen can't
//click a hidden unit, but the core's check doesn't ask (a program could name it by its id)
function unseenTarget(w: World, side: number, cmd: Command): Refusal | null {
	if (cmd.type !== "attack") return null;
	const t = unitById(w, cmd.target);
	return t === null || !seen(w, side, t) ? { reason: "no such target" } : null;
}

//An attack the core allows on a unit the screen doesn't list as a target of the attacker's (in the classic
//rules: an aircraft of range 1 on a ground unit from the next hex, #285) is refused as the screen can't
//click it
function notATarget(w: World, side: number, cmd: Command): Refusal | null {
	if (cmd.type !== "attack") return null;
	const kw = knownWorld(w, side);
	return isTarget(kw, unitById(kw, cmd.unit), unitById(kw, cmd.target)) ? null : { reason: "not a target from here" };
}

//Why a command is refused, as the side may know it: the target it sees, then the core's check (the
//screen's own: a move's range is the one the screen shows), then the screen's targets
const refusalOf = (w: World, side: number, cmd: Command) => unseenTarget(w, side, cmd) ?? check(w, cmd) ?? notATarget(w, side, cmd);

//What a command or a turn did: its events as text, or what changed when they aren't known
const told = (before: World, after: World, side: number, events: GameEvent[] | null) =>
	events === null ? changes(before, after, side) : describe(after, before, side, events);

//Nothing is played once the game is over: the answer says how it ended (#311)
const overRefusal = (front: Front): Refusal | null => front.result() === null ? null : { reason: "the game is over" };

const refusedAnswer = (c: Call, cmd: Command, refusal: Refusal) =>
	answer([`refused: ${refusal.reason}`, ...gameOver(c.front)], { command: cmd, refusal });

async function actAnswer(c: Call): Promise<Answer> {
	const cmd = commandOf(c.w, c.side, c.x, c.flags), refused = overRefusal(c.front) ?? refusalOf(c.w, c.side, cmd);
	if (refused) return refusedAnswer(c, cmd, refused);
	const r = await c.front.act(cmd);
	if (r.refusal) return answer([`refused: ${r.refusal.reason}`], { command: cmd, refusal: r.refusal });
	const after = c.front.world(), u = "unit" in cmd ? unitById(after, cmd.unit) : null;
	const unitNow = u ? [unitLine(knownWorld(after, c.side), u, true)] : [];
	return answer([...told(c.w, after, c.side, r.events), ...gameOver(c.front), ...unitNow], { command: cmd, events: r.events });
}

async function endAnswer(c: Call): Promise<Answer> {
	const over = overRefusal(c.front);
	if (over) return answer([`refused: ${over.reason}`, ...gameOver(c.front)], { events: null, refusal: over });
	if (!c.front.humanTurn()) throw new UsageError("not your turn");
	const events = await c.front.end(), after = c.front.world();
	//(the page doesn't know the turn's events: its report tells the fights it saw and what changed, #307)
	const turn = events === null ? c.front.report() : told(c.w, after, c.side, events);
	return answer([...turn, ...status(after, c.side), ...gameOver(c.front)], { events });
}

function unitsAnswer(c: Call): Answer {
	const kw = knownWorld(c.w, c.side);
	const lines = c.w.state.units.filter((u) => sideOf(c.w, u) === c.side).map((u) => unitLine(kw, u, true));
	return answer(c.flags.has("ready") ? lines.filter((l) => l.includes(" can: ")) : lines);
}

function enemiesAnswer(c: Call): Answer {
	const kw = knownWorld(c.w, c.side), list = kw.state.units.filter((u) => sideOf(kw, u) !== c.side);
	return answer(list.length ? list.map((u) => unitLine(kw, u, false)) : ["no enemy in sight"]);
}

function movesAnswer(c: Call): Answer {
	const m = moves(c.w, c.side, intOf(c.x[1], "a unit id"));
	return answer([...(m.note ? [m.note] : []), ...m.cells.map(moveLine)], m);
}

function targetsAnswer(c: Call): Answer {
	const from = c.flags.has("from") ? cellOf(c.flags.get("from") as string, c.w) : undefined;
	const t = targets(c.w, c.side, intOf(c.x[1], "a unit id"), from);
	return answer(t.estimates.length ? t.estimates.map((e) => estimateLine(knownWorld(c.w, c.side), e)) : [t.note], t);
}

function attackersAnswer(c: Call): Answer {
	const a = attackers(c.w, c.side, targetOf(c.w, c.side, c.x[1] ?? ""));
	return answer(a.estimates.length ? a.estimates.map((e) => attackerLine(knownWorld(c.w, c.side), e)) : [a.note], a);
}

function reportAnswer(c: Call): Answer {
	const lines = c.front.report();
	return answer(lines.length ? lines : ["nothing to report"]);
}

//What an allowed action leaves the unit unable to do this turn, said beside "allowed": a unit that moves
//on its transport can't attack or get off it after the move (the Bzura playtest's turn 3)
function caveat(w: World, cmd: Command): string {
	const u = "unit" in cmd ? unitById(w, cmd.unit) : null;
	if (cmd.type === "mount") return " (once it moves on its transport it can't attack or unmount this turn)";
	return cmd.type === "move" && u !== null && u.isMounted ? " (on its transport: it can't attack or unmount after this move)" : "";
}

function checkAnswer(c: Call): Answer {
	const cmd = commandOf(c.w, c.side, c.x.slice(1), c.flags), refusal = overRefusal(c.front) ?? refusalOf(c.w, c.side, cmd);
	return refusal === null ? answer(["allowed" + caveat(c.w, cmd)], { command: cmd, refusal }) : refusedAnswer(c, cmd, refusal);
}

//The commands on a game
const ON_GAME: { [verb: string]: (c: Call) => Answer | Promise<Answer> } = {
	status: (c) => answer([...status(c.w, c.side), ...gameOver(c.front)]),
	units: unitsAnswer,
	enemies: enemiesAnswer,
	unit: unitAnswer,
	map: (c) => answer(map(c.w, c.side, rangeOf(c.x[1], c.w.state.map.rows - 1), rangeOf(c.x[2], c.w.state.map.cols - 1), c.flags.has("zoc"))),
	hex: (c) => answer(hex(c.w, c.side, cellOf(c.x[1], c.w))),
	moves: movesAnswer,
	targets: targetsAnswer,
	attackers: attackersAnswer,
	supply: (c) => answer(supply(c.w, c.side)),
	shop: (c) => answer(shop(c.w, c.side, classOf(c.x[1]))),
	reserve: (c) => answer(reserve(c.w, c.side)),
	report: reportAnswer,
	check: checkAnswer,
	end: endAnswer,
	...Object.fromEntries(Object.keys(COMMANDS).map((verb) => [verb, actAnswer])),
};

//A command on a game: its answer, played on the front
export async function runOn(args: Args, front: Front): Promise<Answer> {
	const verb = args.words[0];
	const handle = ON_GAME[verb];
	if (!handle) throw new UsageError(`unknown command "${verb}" (help lists them)`);
	return handle({ x: args.words, flags: args.flags, front, w: front.world(), side: front.side });
}

//How a game ended, by the core's outcome: a capture, an elimination or the turn limit
export function resultOf(w: World, end: SessionEnd | null): Outcome | null {
	if (end === null || end.kind === "stuck") return null;
	if (end.kind === "turnLimit") return outcome(w, { endedSide: end.side });
	return outcome(w, end.how === "capture" ? { victorySide: end.side } : {});
}

//How a game on the page ended: the screen plays the person's commands on its own objects, not through
//the session, so a capture or an elimination the person won ends the screen's game (screenEnded) and
//not the session's: the person's side won it (#311)
export function pageResultOf(w: World, end: SessionEnd | null, screenEnded: boolean, side: number): Outcome | null {
	const r = resultOf(w, end);
	if (r !== null || !screenEnded) return r;
	return outcome(w) ?? outcome(w, { victorySide: side });
}

//The side a new game gives the person, and its dice
export const flagInt = (args: Args, name: string, fallback: number) => args.flags.has(name) ? intOf(args.flags.get(name) as string, name) : fallback;

//The rules a new game plays by: --rules classic or remaster (#53), else fallback
export function flagRules(args: Args, fallback: RulesetName): RulesetName {
	const r = args.flags.get("rules");
	if (r === undefined) return fallback;
	if (r !== "classic" && r !== "remaster") throw new UsageError(`--rules is classic or remaster, got "${String(r)}"`);
	return r;
}
