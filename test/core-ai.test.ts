//The AI and the tutorial as controllers on the core (src/core/ai.ts, src/core/tutorial.ts), played in
//the core's headless session (src/core/session.ts) for rounds of turns: every engine fixture loaded on
//its current player's turn (#71), the replay's items (harness/replay.sh) started anew AI against AI,
//and the tutorial from its later turns, its units where its script puts them. Until the old engine went (#137) each advance was compared with the old AI's
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
	const { game } = await import("../src/app/game");
	const { Equipment } = await import("../src/legacy/equipment");
	const { Rng } = await import("../src/core/random");
	const { toData } = await import("../src/legacy/state");
	const { uiSettings } = await import("../src/app/settings");
	const { playerType } = await import("../src/core/tables");
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

//Where the tutorial's script has put its units when turns 3, 4 and 5 start, by unit id: the Legion, the
//artillery, the three SS infantry, the recon car and the Pz IIA. The allied infantry in the city is gone
//by turn 4
const TUTORIAL_PLACES: Record<number, [number, number, number][]> = {
	3: [[0, 8, 7], [1, 8, 10], [2, 7, 15], [3, 11, 9], [5, 9, 14], [6, 8, 14], [7, 9, 15]],
	4: [[0, 8, 7], [1, 8, 10], [2, 7, 15], [3, 15, 10], [5, 9, 14], [6, 8, 14], [7, 8, 15]],
	5: [[0, 9, 9], [1, 10, 11], [2, 10, 15], [3, 15, 10], [5, 12, 9], [6, 12, 12], [7, 11, 10]],
};
const TUTORIAL_CITY_DEFENDER = 4;

//The tutorial as from turn turn, as a game loaded on that turn, its units where its script puts them
async function tutorialAt(turn: number): Promise<Session> {
	const { o, localSide } = await startItem("scripted:tutorial.xml", turn);
	const m = o.game.scenario.map;
	m.turn = turn;
	(await import("../src/legacy/context")).touched();
	const places = TUTORIAL_PLACES[turn];
	if (places !== undefined) {
		if (turn > 3) {
			m.getUnitById(TUTORIAL_CITY_DEFENDER).destroyed = true;
			m.updateUnitList();
		}
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

//The tutorial's script runs to turn 5, then hands its players over
const ROUNDS = 2, TUTORIAL_ROUNDS = 7;

test.each(fixtures("engine"))("The core's AI plays %s as the old AI did, turn by turn", async (name) => {
	same(name, played(await fixtureSession(name, 7), name.startsWith("scripted") ? TUTORIAL_ROUNDS : ROUNDS));
}, 120_000);

//harness/replay.sh's items: three scenarios of the issues, the first campaign's first scenario, every
//40th scenario of the list, a later campaign's, and the tutorial with its scripted players
const replayItems = ["drpzop01.xml", "drstu02.xml", "dr9fr03.xml", "campaign:0",
	...scenariolist.filter((s) => s.length > 1).flatMap((s, i) => i % 40 === 20 ? [s[0]] : []), "campaign:10", "scripted:tutorial.xml"];

//(the game started the turn of the AI moving first, #292: the session taking the game over plans it, as
//a game loaded on that turn does, #71; a person moving first, a campaign's, has no turn started)
test.each(replayItems)("The core's AI and tutorial play %s from its start as the old ones did, AI against AI", async (item) => {
	const { o, localSide } = await startItem(item, item.length * 7919);
	same(item, played(sessionOf(o, localSide, o.game.session.first !== null), item.startsWith("scripted") ? TUTORIAL_ROUNDS : ROUNDS));
}, 120_000);

//Turns 3 to 5 with its units where its script puts them (the fuel emptied and the main menu opened
//when turn 5 is built), turn 6 on the units as they start, the players handed over to a person and the
//AI. The view events when the players join are pinned too
test.each([3, 4, 5, 6])("The core's tutorial plays from turn %i as the old one did", async (turn) => {
	const s = await tutorialAt(turn);
	same("tutorial from turn " + turn, played(s, TUTORIAL_ROUNDS, [hash(JSON.stringify(s.joined))]));
}, 120_000);

//Where the tutorial's turn 1 sends its seven units (src/core/tutorial.ts), by unit id: the Legion, the
//artillery, the three SS infantry, the recon car and the Pz IIA
const TUTORIAL_TURN_1: [number, number, number][] = [[0, 8, 7], [1, 8, 10], [2, 7, 11], [3, 10, 14], [5, 10, 10], [6, 9, 11], [7, 8, 11]];

//The places of the tutorial's seven units now, by unit id
function placesOf(s: Session, of: [number, number, number][]): [number, number, number][] {
	return of.map(([id]) => {
		const u = s.world.state.units.find((x) => x.id === id);
		return [id, u?.row, u?.col];
	});
}

//The script is planned on the terrain's costs (the trucks are wheeled, 2 a clear hex): every move is in
//its unit's range (#188, the script was planned one point a hex)
test("A new tutorial's turn 1 moves its units to the hexes its script sends them to (#188)", async () => {
	const { o, localSide } = await startItem("scripted:tutorial.xml", 1);
	const s = sessionOf(o, localSide, false);
	while (s.ended === null && s.world.state.turn.turn < 2) advance(s);
	expect(placesOf(s, TUTORIAL_TURN_1)).toEqual(TUTORIAL_TURN_1);
}, 120_000);

//A new game played by the tutorial on both sides, whatever the dice: every order the script gives is
//one the core allows, the game goes on to the hand-over after turn 5 (it got stuck on turn 2, #80), and
//when the dice let the story go as written the units are where the later turns look for them
test("A new tutorial plays its script to its end, every scripted order allowed (#188)", async () => {
	for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
		const { o, localSide } = await startItem("scripted:tutorial.xml", seed);
		const s = sessionOf(o, localSide, false);
		const { refused, places } = playedToHandOver(s);
		expect(refused, "seed " + seed).toEqual([]);
		expect(s.ended, "seed " + seed).toBeNull();
		expect(s.world.state.players.map((p) => p.type), "seed " + seed).toEqual([o.playerType.humanLocal, o.playerType.aiLocal]);
		if (seed === 1) expect(places).toEqual(TUTORIAL_PLACES);
	}
}, 240_000);

//The tutorial played to the allies' turn 6, which hands them over to the AI as the axis' turn 6 handed
//them to a person: the orders refused, and the places of its units when turns 3 to 5 start
function playedToHandOver(s: Session): { refused: string[]; places: Record<number, [number, number, number][]> } {
	const refused: string[] = [], places: Record<number, [number, number, number][]> = {};
	const turn = () => s.world.state.turn;
	while (s.ended === null && !(turn().turn === 6 && turn().currentPlayer === 1)) {
		const a = advance(s);
		if (a.kind === "order" && a.refusal !== null) refused.push(`turn ${turn().turn}: ${JSON.stringify(a.order)} ${a.refusal.reason}`);
		if (a.kind === "endTurn" && turn().currentPlayer === 0 && TUTORIAL_PLACES[turn().turn]) places[turn().turn] = placesOf(s, TUTORIAL_PLACES[turn().turn]);
	}
	return { refused, places };
}

//The tutorial on both sides started by the core, the streams given: what each message of turn 3 says
//about the city (8,15) and whether the city was the axis' when it said it
async function cityMessages(seed: number): Promise<[string, boolean][]> {
	const { setupOf } = await import("./corefiles");
	const { newGame } = await import("../src/core/newgame");
	const { playerType } = await import("../src/core/tables");
	const setup = { ...setupOf("tutorial.xml", { game: seed, ai: seed + 7 }), isAI: [2, 2, 2, 2] };
	const s = startSession(createWorld(newGame(setup), setup.equipment), (type, player) => type === playerType.aiLocal
		? aiController(player) : type === playerType.aiScripted ? tutorialController(player) : null, { fresh: true });
	const said: [string, boolean][] = [];
	while (s.ended === null && s.world.state.turn.turn <= 3) {
		const a = advance(s);
		if (a.kind !== "order" || !("view" in a.order) || a.order.view.type !== "message" || s.world.state.turn.turn !== 3) continue;
		const city = s.world.state.map.hexes[8 * s.world.state.map.cols + 15];
		if (/city/i.test(a.order.view.text)) said.push([a.order.view.text.slice(0, 40), city.owner === a.player]);
	}
	return said;
}

//Seeds 106 and 143: the city's defender survives the artillery's and the three infantry's attacks, and the
//tank's capture is skipped (an enemy holds the hex); seed 1: it falls and the tank takes the city
test("The tutorial says the city is ours only once the tank took it, and that its defender held when it did (#269)", async () => {
	const ours = "The city is now ours, and it's flag chan", held = "The city's defender held against all our";
	for (const seed of [1, 106, 143]) {
		const said = await cityMessages(seed), texts = said.map(([t]) => t);
		for (const [text, owned] of said) if (text === ours) expect(owned, "seed " + seed).toBe(true);
		expect(texts.includes(ours) !== texts.includes(held), "seed " + seed + ": " + texts.join(" | ")).toBe(true);
		expect(texts.includes(held), "seed " + seed).toBe(seed !== 1);
	}
}, 120_000);
