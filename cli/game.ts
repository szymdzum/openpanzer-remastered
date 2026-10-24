//The command-line player's game (#279): a scenario started from the game's files, saved as JSON between
//calls, a person's commands played on the core's session and the AI's turns played inside "end".
//Each call loads the save, plays or answers, and writes it back
import fs from "node:fs";
import path from "node:path";
import type { Command, Refusal } from "../src/commands";
import { aiController } from "../src/core/ai";
import { createWorld } from "../src/core/create";
import type { GameEvent } from "../src/core/events";
import { equipmentCountries, newGame } from "../src/core/newgame";
import { type Advance, advance, endTurn, play, playOn, type Session, startSession } from "../src/core/session";
import { outcome, type Outcome } from "../src/core/turn";
import type { GameState, ScenarioData, World } from "../src/core/types";
import { playerType } from "../src/prototypes";
import { readEquipment, setupOf } from "./files";

//What a save holds: the core's data and state, and what a call needs to rebuild the world and the
//session around them. report: the enemy's last turn, for the person's side to read
export interface Save {
	format: "openpanzer-cli/1";
	file: string;
	countries: number[];
	humanSides: number[];
	data: ScenarioData;
	state: GameState;
	report: GameEvent[];
}

//A game loaded for a call: the session, the side the person plays (the first of its sides) and the save
export interface Game {
	save: Save;
	session: Session;
	side: number;
}

//A new game of a scenario file, the person playing humanSides and the AI the others; seed: the game's
//dice (the AI's stream is seed + 7919, as the arena seeds it)
export async function newSave(file: string, humanSides: number[], seed: number): Promise<Save> {
	const { JSDOM } = await import("jsdom");
	const setup = setupOf(file, { game: seed, ai: seed + 7919 }, null, undefined, [], new new JSDOM().window.DOMParser());
	const created = newGame(setup);
	for (const p of created.state.players) p.type = humanSides.includes(p.side) ? playerType.humanLocal : playerType.aiLocal;
	return { format: "openpanzer-cli/1", file, countries: equipmentCountries(setup.scenario, []), humanSides,
		data: created.data, state: created.state, report: [] };
}

const aiFor = (type: number, player: number) => type === playerType.aiLocal ? aiController(player) : null;

//The game of a save: the world, the session with the AI's controllers, the person's side shown
export function open(save: Save): Game {
	const { equipment } = readEquipment(save.data.equipment || "eqp-adlerkorps", save.countries);
	const side = save.humanSides[0];
	const world = createWorld({ data: save.data, state: save.state }, equipment, { spotSide: side });
	const session = startSession(world, aiFor, { loaded: true, localSide: save.humanSides.length > 1 ? 2 : side });
	return { save, session, side };
}

export function readSave(file: string): Save {
	if (!fs.existsSync(file)) throw new Error(`no game at ${file}: start one with "new"`);
	const save = JSON.parse(fs.readFileSync(file, "utf8")) as Save;
	if (save.format !== "openpanzer-cli/1") throw new Error(`${file} is not a command-line game`);
	return save;
}

export function writeSave(file: string, g: Game) {
	g.save.data = g.session.world.data;
	g.save.state = g.session.world.state;
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, JSON.stringify(g.save));
}

export const world = (g: Game): World => g.session.world;

export function isHumanTurn(g: Game): boolean {
	const w = world(g), p = w.state.turn.currentPlayer;
	return p >= 0 && g.save.humanSides.includes(w.state.players[p].side);
}

//Why a person can't send a command now, null when it can
function notNow(g: Game): Refusal | null {
	if (g.session.ended !== null) return { reason: "the game is over" };
	return isHumanTurn(g) ? null : { reason: "not your turn" };
}

//A person's command played whole (a move and an attack wait at checkpoints for a screen: none here):
//its events, or why it was refused
export function playCommand(g: Game, cmd: Command): { events: GameEvent[]; refusal: Refusal | null } {
	const refusal = notNow(g);
	if (refusal !== null) return { events: [], refusal };
	const first = play(g.session, cmd);
	const events = [...first.events];
	for (let cp = first.checkpoint; cp !== null;) {
		const next = playOn(g.session, cp);
		events.push(...next.events);
		cp = next.checkpoint;
	}
	return { events, refusal: first.refusal };
}

//An advance's events: an order's, or an end of turn's with the next player's turn start and arrivals
function eventsOf(a: Advance): GameEvent[] {
	if (a.kind === "order") return a.events;
	if (a.kind === "endTurn") return [...a.events, ...(a.started ? a.started.events : []), ...a.arrived];
	return [];
}

const aiPlays = (g: Game) => g.session.ended === null && !isHumanTurn(g);

//The AI's turns until the person plays again or the game ends: every event of them
export function playAI(g: Game): GameEvent[] {
	const events: GameEvent[] = [];
	for (let n = 0; n < 100_000 && aiPlays(g); n++) events.push(...eventsOf(advance(g.session)));
	return events;
}

//The person's end of turn, then the AI's turns: every event of them, kept as the save's report
export function endHumanTurn(g: Game): GameEvent[] {
	const events = [...eventsOf(endTurn(g.session)), ...playAI(g)];
	g.save.report = events;
	return events;
}

//How the game ended, by the core's outcome: a capture, an elimination or the turn limit
export function result(g: Game): Outcome | null {
	const end = g.session.ended;
	if (end === null || end.kind === "stuck") return null;
	if (end.kind === "turnLimit") return outcome(world(g), { endedSide: end.side });
	return outcome(world(g), end.how === "capture" ? { victorySide: end.side } : {});
}
