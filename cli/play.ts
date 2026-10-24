//The command-line player (#279): a scenario played on the core from the terminal, the person's side
//against the AI. npm run -s play -- help
import path from "node:path";
import type { Command } from "../src/commands";
import { attackableUnit } from "../src/core/attack";
import { check } from "../src/core/step";
import type { Position, World } from "../src/core/types";
import { isAir } from "../src/core/units";
import { hexIndex, sideOf, unitById } from "../src/core/world";
import { unitClassNames } from "../src/prototypes";
import { hex, map, reserve, shop, status } from "./board";
import { attackerLine, attackers, estimateLine, targets } from "./combat";
import { scenarioList } from "./files";
import { endHumanTurn, type Game, isHumanTurn, newSave, open, playAI, playCommand, readSave, result, world, writeSave } from "./game";
import { knownWorld, SIDES, seen } from "./known";
import { describe } from "./report";
import { moveLine, moves, supply, unitLine } from "./units";

const HELP = `npm run -s play -- <command> [--game FILE] [--json]
The game is saved in FILE (default .play/game.json, or $OPENPANZER_PLAY). Cells are row,col.

Start
  scenarios                          the scenario files and names
  new FILE [--side 0|1] [--seed N]   a new game of a scenario file, you on side 0 (Axis) by default

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

const VALUED = ["--game", "--side", "--seed", "--from"];

export function parseArgs(argv: string[]): Args {
	const words: string[] = [], flags = new Map<string, string | true>();
	for (let i = 0; i < argv.length; i++) {
		if (!argv[i].startsWith("--")) words.push(argv[i]);
		else flags.set(argv[i].slice(2), VALUED.includes(argv[i]) ? argv[++i] : true);
	}
	return { words, flags };
}

class UsageError extends Error {}

export function cellOf(text: string | undefined): Position {
	const m = /^(\d+),(\d+)$/.exec(text ?? "");
	if (!m) throw new UsageError(`expected a cell row,col, got "${text ?? ""}"`);
	return { row: +m[1], col: +m[2] };
}

function intOf(text: string | undefined, what: string): number {
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
	text.includes(",") ? enemyOn(knownWorld(w, side), cellOf(text), attacker) : intOf(text, "a unit id or a cell");

type Words = string[];
type Flags = Args["flags"];
const unitWord = (x: Words) => intOf(x[1], "a unit id");
const SIMPLE = ["mount", "unmount", "resupply", "embark", "disembark", "undo", "disband"] as const;
const simple = (type: (typeof SIMPLE)[number]) => (x: Words): Command => ({ type, unit: unitWord(x) });

//An action's words as the core's command
const COMMANDS: { [verb: string]: (x: Words, w: World, side: number, flags: Flags) => Command } = {
	move: (x) => ({ type: "move", unit: unitWord(x), to: cellOf(x[2]) }),
	attack: (x, w, side) => ({ type: "attack", unit: unitWord(x), target: targetOf(w, side, x[2] ?? "", unitWord(x)) }),
	reinforce: (x, _w, _s, flags) => ({ type: "reinforce", unit: unitWord(x), overstrength: flags.has("over") }),
	buy: (x) => ({ type: "buy", eqid: intOf(x[1], "an equipment id"), transport: optionalInt(x[2], "a transport id") }),
	deploy: (x) => ({ type: "deploy", index: intOf(x[1], "a reserve index"), to: cellOf(x[2]) }),
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
const answer = (lines: string[], data: unknown = lines): Answer => ({ lines, data });

//What a command reads: its words and flags, the game, its world, the person's side and the save file
interface Call { x: Words; flags: Flags; g: Game; w: World; side: number; file: string }

function gameOver(g: Game): string[] {
	const r = result(g);
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

function actAnswer(c: Call): Answer {
	const cmd = commandOf(c.w, c.side, c.x, c.flags);
	const r = playCommand(c.g, cmd);
	if (r.refusal) return answer([`refused: ${r.refusal.reason}`], { command: cmd, refusal: r.refusal });
	writeSave(c.file, c.g);
	const after = world(c.g), u = "unit" in cmd ? unitById(after, cmd.unit) : null;
	const unitNow = u ? [unitLine(knownWorld(after, c.side), u, true)] : [];
	return answer([...describe(after, c.w, c.side, r.events), ...gameOver(c.g), ...unitNow], { command: cmd, events: r.events });
}

function endAnswer(c: Call): Answer {
	if (!isHumanTurn(c.g)) throw new UsageError("not your turn");
	const events = endHumanTurn(c.g);
	writeSave(c.file, c.g);
	return answer([...describe(world(c.g), c.w, c.side, events), ...status(world(c.g), c.side), ...gameOver(c.g)], { events });
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
	const from = c.flags.has("from") ? cellOf(c.flags.get("from") as string) : undefined;
	const t = targets(c.w, c.side, intOf(c.x[1], "a unit id"), from);
	return answer(t.estimates.length ? t.estimates.map((e) => estimateLine(knownWorld(c.w, c.side), e)) : [t.note], t);
}

function attackersAnswer(c: Call): Answer {
	const a = attackers(c.w, c.side, targetOf(c.w, c.side, c.x[1] ?? ""));
	return answer(a.estimates.length ? a.estimates.map((e) => attackerLine(knownWorld(c.w, c.side), e)) : [a.note], a);
}

function reportAnswer(c: Call): Answer {
	const lines = describe(c.w, c.w, c.side, c.g.save.report);
	return answer(lines.length ? lines : ["nothing to report"]);
}

function checkAnswer(c: Call): Answer {
	const cmd = commandOf(c.w, c.side, c.x.slice(1), c.flags), refusal = check(c.w, cmd);
	return answer([refusal === null ? "allowed" : `refused: ${refusal.reason}`], { command: cmd, refusal });
}

//The commands on a loaded game
const ON_GAME: { [verb: string]: (c: Call) => Answer } = {
	status: (c) => answer([...status(c.w, c.side), ...gameOver(c.g)]),
	units: unitsAnswer,
	enemies: enemiesAnswer,
	unit: unitAnswer,
	map: (c) => answer(map(c.w, c.side, rangeOf(c.x[1], c.w.state.map.rows - 1), rangeOf(c.x[2], c.w.state.map.cols - 1), c.flags.has("zoc"))),
	hex: (c) => answer(hex(c.w, c.side, cellOf(c.x[1]))),
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

const flagInt = (args: Args, name: string, fallback: number) => args.flags.has(name) ? intOf(args.flags.get(name) as string, name) : fallback;

async function newGameAnswer(args: Args, file: string): Promise<Answer> {
	const side = flagInt(args, "side", 0), seed = flagInt(args, "seed", Date.now() % 100000);
	const g = open(await newSave(args.words[1], [side], seed)), before = world(g);
	//(a new game whose first player is the AI: it plays its first turn, as the arena has it)
	g.save.report = isHumanTurn(g) ? [] : playAI(g);
	writeSave(file, g);
	return answer([`new game of ${args.words[1]}, you play ${SIDES[side]}, seed ${seed}, saved in ${file}`,
		...describe(world(g), before, side, g.save.report), ...status(world(g), side)], { file, side, seed });
}

function scenariosAnswer(): Answer {
	const list = scenarioList().filter((e) => e.length > 1);
	return answer(list.map((e) => `${e[0]}  ${e[1]}`), list.map((e) => ({ file: e[0], name: e[1] })));
}

//The commands before a game is loaded
const NO_GAME: { [verb: string]: (args: Args, file: string) => Answer | Promise<Answer> } = {
	help: () => answer([HELP], null),
	scenarios: scenariosAnswer,
	new: newGameAnswer,
};

function onGame(verb: string, args: Args, file: string): Answer {
	const handle = ON_GAME[verb];
	if (!handle) throw new UsageError(`unknown command "${verb}" (help lists them)`);
	const g = open(readSave(file));
	return handle({ x: args.words, flags: args.flags, g, w: world(g), side: g.side, file });
}

//A call: the answer to its command, the game loaded from file and saved back when it played
export async function run(args: Args, file: string): Promise<Answer> {
	const verb = args.words[0] ?? "help";
	return NO_GAME[verb] ? NO_GAME[verb](args, file) : onGame(verb, args, file);
}

const errorText = (e: unknown) => e instanceof Error ? e.message : JSON.stringify(e);
const output = (args: Args, a: Answer) => args.flags.has("json") ? JSON.stringify(a.data, null, 1) : a.lines.join("\n");

const saveFile = (args: Args) => path.resolve((args.flags.get("game") as string) || process.env.OPENPANZER_PLAY || ".play/game.json");
const exitCode = (e: unknown) => e instanceof UsageError ? 2 : 1;

async function main() {
	const args = parseArgs(process.argv.slice(2)), file = saveFile(args);
	try {
		process.stdout.write(output(args, await run(args, file)) + "\n");
	} catch (e) {
		process.stderr.write(errorText(e) + "\n");
		process.exitCode = exitCode(e);
	}
}

//(run as the program, not when a test imports it)
if (path.resolve(process.argv[1] ?? "") === path.resolve(new URL(import.meta.url).pathname)) await main();
