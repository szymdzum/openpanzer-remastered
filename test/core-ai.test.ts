//The AI and the tutorial as controllers on the core (src/core/ai.ts, src/core/tutorial.ts), played in
//the core's headless session (src/core/session.ts) for rounds of turns: every engine fixture loaded on
//its current player's turn (#71), the replay's items (harness/replay.sh) started anew AI against AI,
//and the tutorial from its later turns, its units where its script meant them to be (a new game is
//stuck on turn 2, #80). Until the old engine went (#137) each advance was compared with the old AI's
//and the old AIScripted's, played as Game played them, in lockstep: the same order, answer, turn start,
//state and end (test/aigames.ts then). The hashes of every advance then (test/coreai.json.gz) pin them
//since: the order or the end of turn, the state after it, how the game ended
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { createHash } from "node:crypto";
import { expect, test } from "vitest";
import { aiController } from "../src/core/ai";
import { tutorialController } from "../src/core/tutorial";
import { createWorld } from "../src/core/create";
import { advance, startSession, type Session } from "../src/core/session";
import { fixtures, readFixture, restoreState } from "./contracts";
import { freshGame, mulberry32, startState } from "./lifecycle";

//The game's modules (fresh for every game: the equipment lists are module state, #22)
async function modules() {
	const { game } = await import("../src/game");
	const { Equipment } = await import("../src/equipment");
	const { Rng } = await import("../src/rng");
	const { toData } = await import("../src/state");
	const { playerType, uiSettings } = await import("../src/prototypes");
	return { game, Equipment, Rng, toData, playerType, uiSettings };
}
type Modules = Awaited<ReturnType<typeof modules>>;

//Game's getLocalSide: the sides of the human and the scripted players, 2 when both
function localSideOf(o: Modules): number {
	let sides = 1, side = -1;
	for (const p of o.game.scenario.map.getPlayers())
		if (p.type === o.playerType.humanLocal || p.type === o.playerType.aiScripted) {
			if (side !== -1 && side !== p.side) sides++;
			side = p.side;
		}
	return sides > 1 ? 2 : side;
}

//The core's session from the game's state now: the AI plays every player of its type, the tutorial its
//scripted ones; the screen shows the local side (Game.setCurrentSide)
function sessionOf(o: Modules, localSide: number, loaded: boolean): Session {
	const m = o.game.scenario.map;
	o.game.spotSide = localSide === 2 ? m.currentPlayer.side : localSide;
	const w = createWorld(o.toData(o.game.scenario, o.game), o.Equipment.equipment, { spotSide: o.game.spotSide, noFOW: !!o.uiSettings.noFOW });
	return startSession(w, (type, player) => type === o.playerType.aiLocal ? aiController(player)
		: type === o.playerType.aiScripted ? tutorialController(player) : null, { loaded, localSide });
}

//An engine fixture restored as a save is loaded: every player the AI but the tutorial's scripted ones
async function fixtureSession(name: string, seed: number): Promise<Session> {
	await restoreState(readFixture("engine", name).state);
	const o = await modules();
	Math.random = mulberry32(seed);
	o.Rng.seed(seed);
	for (const p of o.game.scenario.map.getPlayers()) if (p.type !== o.playerType.aiScripted) p.type = o.playerType.aiLocal;
	return sessionOf(o, localSideOf(o), true);
}

//A replay item started as the replay starts it: the streams seeded, every player the AI
//("scripted:<file>": its scripted players; a campaign's player too), the local side as Game counted it
//at the start, before (harness/replay.js makeAllAI)
async function startItem(item: string, seed: number): Promise<{ o: Modules; localSide: number }> {
	const game = await freshGame();
	const o = await modules();
	o.Rng.seed(seed);
	await startState(game, item.startsWith("campaign:") ? item + ":0" : item, [1, 1, 1, 1]);
	Math.random = mulberry32(seed);
	const localSide = localSideOf(o);
	for (const p of game.scenario.map.getPlayers()) if (p.type !== o.playerType.aiScripted) p.type = o.playerType.aiLocal;
	return { o, localSide };
}

//Where the tutorial's turns 1 and 2 meant its units to be when turn 3 starts, and turn 3 when turn 4
//starts, by unit id: a new game never gets there (#80, #188). The allied infantry in the city is gone
//by then
const TUTORIAL_PLACES: Record<number, [number, number, number][]> = {
	3: [[3, 15, 10], [2, 7, 15], [6, 8, 14], [5, 9, 14], [0, 7, 9], [1, 7, 13], [7, 8, 15]],
	4: [[3, 15, 10], [2, 14, 11], [6, 14, 9], [5, 14, 8], [0, 11, 9], [1, 13, 13], [7, 12, 12]],
};
const TUTORIAL_CITY_DEFENDER = 4;

//The tutorial as from turn turn, as a game loaded on that turn, its units where its script meant them
async function tutorialAt(turn: number): Promise<Session> {
	const { o, localSide } = await startItem("scripted:tutorial.xml", turn);
	const m = o.game.scenario.map;
	m.turn = turn;
	const places = TUTORIAL_PLACES[turn];
	if (places !== undefined) {
		m.getUnitById(TUTORIAL_CITY_DEFENDER).destroyed = true;
		m.updateUnitList();
		for (const [id, row, col] of places) {
			const u = m.getUnitById(id), p = u.getPos();
			m.map[p.row][p.col].delUnit(u);
			m.map[row][col].setUnit(u);
		}
	}
	return sessionOf(o, localSide, false);
}

const hash = (t: string) => createHash("sha1").update(t).digest("hex").slice(0, 12);

//The session played for rounds of turns or to the game's end: the hashes of its start, every advance
//with the state after it, and its end (start: what else to pin first)
function played(s: Session, rounds: number, start: string[] = []): string[] {
	const out = [...start, hash(JSON.stringify(s.world.state))];
	const last = s.world.state.turn.turn + rounds;
	while (s.ended === null && s.world.state.turn.turn < last) {
		const a = advance(s);
		out.push(hash(JSON.stringify(a) + JSON.stringify(s.world.state)));
	}
	out.push(hash(JSON.stringify(s.ended)));
	return out;
}

//The hashes recorded (UPDATE_CONTRACTS=1 writes them again, in a commit that names the issue it fixes)
const pinned = path.join(__dirname, "coreai.json.gz");
const recorded = () => JSON.parse(zlib.gunzipSync(fs.readFileSync(pinned)).toString("utf8")) as Record<string, string[]>;

function same(name: string, got: string[]) {
	if (process.env.UPDATE_CONTRACTS) {
		fs.writeFileSync(pinned, zlib.gzipSync(JSON.stringify({ ...recorded(), [name]: got }), { level: 9 }));
		return;
	}
	const want = recorded()[name];
	expect(want, name + " recorded").toBeDefined();
	const i = want.findIndex((h, k) => got[k] !== h);
	expect(i === -1 && got.length === want.length ? "" : `${name}: advance ${i} of ${got.length} (${want.length} recorded)`).toBe("");
}

//The tutorial's script runs to turn 4, then hands its players over
const ROUNDS = 2, TUTORIAL_ROUNDS = 7;

test.each(fixtures("engine"))("The core's AI plays %s as the old AI did, turn by turn", async (name) => {
	same(name, played(await fixtureSession(name, 7), name.startsWith("scripted") ? TUTORIAL_ROUNDS : ROUNDS));
}, 120_000);

//harness/replay.sh's items: three scenarios of the issues, the first campaign's first scenario, every
//40th scenario of the list, a later campaign's, and the tutorial with its scripted players
const replayItems = ["drpzop01.xml", "drstu02.xml", "dr9fr03.xml", "campaign:0",
	...scenariolist.filter((s) => s.length > 1).flatMap((s, i) => i % 40 === 20 ? [s[0]] : []), "campaign:10", "scripted:tutorial.xml"];

test.each(replayItems)("The core's AI and tutorial play %s from its start as the old ones did, AI against AI", async (item) => {
	const { o, localSide } = await startItem(item, item.length * 7919);
	same(item, played(sessionOf(o, localSide, false), item.startsWith("scripted") ? TUTORIAL_ROUNDS : ROUNDS));
}, 120_000);

//Turns 3 and 4 with its units where its script meant them (the fuel emptied and the main menu opened
//when turn 4 is built), turn 5 on the units as they start, the players handed over to a person and the
//AI. The view events when the players join are pinned too
test.each([3, 4, 5])("The core's tutorial plays from turn %i as the old one did", async (turn) => {
	const s = await tutorialAt(turn);
	same("tutorial from turn " + turn, played(s, TUTORIAL_ROUNDS, [hash(JSON.stringify(s.joined))]));
}, 120_000);
