//The AI as a controller on the core (src/core/ai.ts) played in the core's headless session
//(src/core/session.ts), against the old AI played as Game plays it (test/aigames.ts), in lockstep from
//the same state and the same random streams. After every advance (an order, or an end of turn with the
//next player's turn start, plan and reinforcements):
//- the same order: the old AI's action as the command it amounts to, and the core AI's;
//- the same answer: both ran it, or both refused it (the old game skipped an attack out of range);
//- at a turn's start, the same purchases and deployment, as commands, and the same state after the plan;
//- the same state (toData as JSON: the AI stream's position, the equipment lists the purchases cut, #22);
//- the core's sight is computeSight's of its state, and the old engine's counters;
//- the game ends at the same advance, the same way.
//Masked, by issue: the old engine's counters drift from its units (#72, #73) and the AI reads them; they
//are made again from the units before each advance (the core's sight), as in test/core-steps.test.ts.
//The games: every engine fixture, loaded on its current player's turn (#71), and the replay's items
//(harness/replay.sh) started anew, AI against AI. CORE_AI_ROUNDS=<n> plays more rounds than 2. The engine
//contract's AI turns are test/core-aicontract.test.ts's
import fs from "node:fs";
import { afterAll, expect, test } from "vitest";
import { aiController } from "../src/core/ai";
import { tutorialController } from "../src/core/tutorial";
import { createWorld } from "../src/core/create";
import { advance, type Advance, startSession, type Session } from "../src/core/session";
import { computeSight } from "../src/core/sight";
import type { World } from "../src/core/types";
import { difference, makeScriptedPlayers, type OldAdvance, type OldGame, oldAdvance, oldState, planLoadedTurn, startFixture,
	startItem, startTutorialAt } from "./aigames";
import { fixtures } from "./contracts";
import { countersEqual, drifted, resync } from "./invariants";

const ROUNDS = process.env.CORE_AI_ROUNDS ? Number(process.env.CORE_AI_ROUNDS) : 2;
//The tutorial's script runs to turn 4, then hands its players over
const TUTORIAL_ROUNDS = Math.max(ROUNDS, 7);

const stats: Record<string, number> = {};
const count = (what: string, n = 1) => { stats[what] = (stats[what] || 0) + n; };
afterAll(() => { if (process.env.FC_STATS) fs.writeSync(2, JSON.stringify(stats) + "\n"); });

//The core's session from the old game's state now: the AI plays every player the old AI plays. keep:
//on the old engine's counters with their arithmetic (World.keepDrift), as the running game until #137
//removes them
function sessionOf(g: OldGame, loaded: boolean, keep = false): Session {
	const w = createWorld(g.toData(g.game.scenario, g.game), g.Equipment.equipment, { spotSide: g.game.spotSide, noFOW: g.uiSettings.noFOW,
		sight: keep ? oldCounters(g) : undefined, keepDrift: keep });
	return startSession(w, (type, player) => type === g.playerType.aiLocal ? aiController(player)
		: type === g.playerType.aiScripted ? tutorialController(player) : null, { loaded, localSide: g.localSide });
}

//The old engine's counters as the core's sight, count for count
function oldCounters(g: OldGame): World["sight"] {
	const counters = g.m.getBoard().visibility.counters, n = g.m.rows * g.m.cols;
	const sight: World["sight"] = { spot: [new Uint16Array(n), new Uint16Array(n)], zoc: [new Uint16Array(n), new Uint16Array(n)] };
	counters.forEach((row, r) => row.forEach((h, c) => [0, 1].forEach((side) => {
		sight.spot[side][r * g.m.cols + c] = h.spot[side];
		sight.zoc[side][r * g.m.cols + c] = h.zoc[side];
	})));
	return sight;
}

//The core's sight: computeSight's of its state, and the old engine's counters unless they drifted from
//its units during the advance (#72, #73: then they are made again). On the old counters (keepDrift),
//always the old counters
function sightProblem(g: OldGame, w: World): string {
	if (w.keepDrift) {
		if (drifted(g)) count("drifted, kept");
		return countersEqual(g, (side, i) => w.sight.spot[side][i], (side, i) => w.sight.zoc[side][i]) ? "" : "the core's sight isn't the old counters";
	}
	const fresh = computeSight(w);
	if (![0, 1].every((s) => fresh.spot[s].join() === w.sight.spot[s].join() && fresh.zoc[s].join() === w.sight.zoc[s].join()))
		return "the core's sight isn't computeSight's";
	if (countersEqual(g, (side, i) => w.sight.spot[side][i], (side, i) => w.sight.zoc[side][i])) return "";
	if (!drifted(g)) return "the core's sight isn't the old counters";
	count("resynced");
	resync(g);
	return "";
}

//What differs between the two advances, "" when nothing
function advanceProblem(g: OldGame, s: Session, o: OldAdvance, c: Advance): string {
	if (o.kind !== c.kind) return `old ${o.kind}, core ${c.kind}`;
	const problem = o.kind === "order" && c.kind === "order" ? orderProblem(o, c)
		: o.kind === "endTurn" && c.kind === "endTurn" ? turnStartProblem(s, o, c) : "";
	if (problem !== "") return problem;
	const want = oldState(g), got = JSON.stringify(s.world.state);
	count("states");
	if (want !== got) return "toData:" + difference(want, got);
	return sightProblem(g, s.world);
}

//The same order, and the same answer: the old game skipped an attack out of range or on a unit gone,
//which the step refuses
function orderProblem(o: Extract<OldAdvance, { kind: "order" }>, c: Extract<Advance, { kind: "order" }>): string {
	count("orders");
	const want = JSON.stringify(o.order), got = JSON.stringify(c.order);
	if (want !== got) return `order: old ${want}, core ${got}`;
	if ("command" in c.order) count(c.refusal === null ? "commands" : "refused");
	const core = c.refusal === null ? null : c.refusal.reason;
	return (o.refusal === "skipped" ? core === null : o.refusal !== core) ? `refusal: old ${o.refusal}, core ${core}` : "";
}

//The next player's turn start: the same purchases and deployment, the same state after its plan (the
//save point, where nothing changed since; none when the turn limit ended the game)
function turnStartProblem(s: Session, o: Extract<OldAdvance, { kind: "endTurn" }>, c: Extract<Advance, { kind: "endTurn" }>): string {
	count("turns");
	const started = c.started === null ? [] : c.started.commands;
	count("turn start commands", started.length);
	if (JSON.stringify(o.started) !== JSON.stringify(started))
		return `turn start: old ${JSON.stringify(o.started)}, core ${JSON.stringify(started)}`;
	const view = c.started === null ? [] : c.started.view;
	count("turn start view events", view.length);
	if (JSON.stringify(o.view) !== JSON.stringify(view)) return `turn start view: old ${JSON.stringify(o.view)}, core ${JSON.stringify(view)}`;
	if (o.startedState === null || s.ended !== null) return "";
	const got = JSON.stringify(s.saved.state);
	return o.startedState === got ? "" : "the state after the turn start and plan:" + difference(o.startedState, got);
}

//Plays both in lockstep for rounds of turns, or until the game ends; throws at the first difference
function playBoth(name: string, g: OldGame, s: Session, rounds: number) {
	count("games");
	const last = s.world.state.turn.turn + rounds, log: string[] = [];
	while (g.ended === null && s.world.state.turn.turn < last) {
		const o = oldAdvance(g), c = advance(s);
		log.push("turn " + s.world.state.turn.turn + ": " + (c.kind === "order" ? JSON.stringify(c.order) : c.kind));
		const problem = advanceProblem(g, s, o, c);
		if (problem !== "") throw new Error(name + "\n  " + log.slice(-5).join("\n  ") + "\n" + problem);
	}
	expect(JSON.stringify(s.ended), name + ": how the game ended").toBe(JSON.stringify(g.ended));
	if (s.ended !== null) count("ended " + s.ended.kind);
}

test.each(fixtures("engine"))("The core's AI plays %s as the old AI, turn by turn", async (name) => {
	const g = await startFixture(name, 7);
	const s = sessionOf(g, true);
	planLoadedTurn(g);
	playBoth(name, g, s, name.startsWith("scripted") ? TUTORIAL_ROUNDS : ROUNDS);
});

test.each(fixtures("engine"))("On the old counters with their arithmetic, the core's AI plays %s as the old AI, drift included", async (name) => {
	const g = await startFixture(name, 11);
	const s = sessionOf(g, true, true);
	planLoadedTurn(g);
	playBoth(name, g, s, name.startsWith("scripted") ? TUTORIAL_ROUNDS : ROUNDS);
});

//harness/replay.sh's items: three scenarios of the issues, the first campaign's first scenario, every
//40th scenario of the list, a later campaign's, and the tutorial with its scripted players
const replayItems = ["drpzop01.xml", "drstu02.xml", "dr9fr03.xml", "campaign:0",
	...scenariolist.filter((s) => s.length > 1).flatMap((s, i) => i % 40 === 20 ? [s[0]] : []), "campaign:10", "scripted:tutorial.xml"];

test.each(replayItems)("The core's AI and tutorial play %s from its start as the old ones, AI against AI", async (item) => {
	const g = await startItem(item, item.length * 7919);
	playBoth(item, g, sessionOf(g, false), item.startsWith("scripted") ? TUTORIAL_ROUNDS : ROUNDS);
});

//The tutorial from its later turns (a new game is stuck on turn 2, #80): turns 3 and 4 with its units
//where its script meant them to be (the fuel emptied and the main menu opened when turn 4 is built),
//turn 5 on the units as they start, the players handed over to a person and the AI (made then, the
//hand-over happens again at the next turn start). The same view events when the players join
test.each([3, 4, 5])("The core's tutorial plays from turn %i as the old one", async (turn) => {
	const g = await startTutorialAt(turn, turn);
	const s = sessionOf(g, false);
	expect(JSON.stringify(s.joined), "the view events at the join").toBe(JSON.stringify(makeScriptedPlayers(g)));
	count("join view events", s.joined.length);
	playBoth("tutorial from turn " + turn, g, s, TUTORIAL_ROUNDS);
});

afterAll(() => {
	//(not a test of its own: the counts are the sum of the games above, whichever ran)
	if (stats.games === 2 * fixtures("engine").length + replayItems.length + 3) {
		expect(stats.commands).toBeGreaterThan(500);
		expect(stats["turn start commands"]).toBeGreaterThan(10);
	}
});

