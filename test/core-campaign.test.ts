//A campaign on the core against the old engine's (docs/CORE.md, #135): every campaign of the list,
//at each difficulty in turn, started by Game.newCampaign and by newGame from its first scenario's
//file; then three scenarios on, each ended with an outcome by Game.continueCampaign and by
//endCampaignScenario, the next one started by Game.newScenario and by newGame with the player
//carried. Between them the campaign player's core units are changed as a scenario would: one hurt,
//one destroyed, one bought. After each start: the same toData, as JSON
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";
import { freshGame, startState, until } from "./lifecycle";
import { difference, GAME_DIR, setupOf } from "./corefiles";
import { awardedPrototype, endCampaignScenario, type CampaignScenarioData, scenarioEnded } from "../src/core/campaign";
import { createWorld } from "../src/core/create";
import { newGame } from "../src/core/newgame";
import type { ScenarioOutcome } from "../src/scenario";
import type { CampaignState, SavedGame } from "../src/state";

type Game = Awaited<ReturnType<typeof freshGame>>;

const OUTCOMES: ScenarioOutcome[] = ["briliant", "victory", "tactical", "lose"];

//The prototypes the old game's message showed, by eqid
const shownPrototypes: number[] = [];

//The old game, its UI's messages silent, its streams seeded, the campaign started
async function oldCampaign(index: number, difficulty: number): Promise<{ game: Game; data: () => SavedGame }> {
	const game = await freshGame();
	const { UIBuilder } = await import("../src/uibuilder");
	const { Rng } = await import("../src/rng");
	const { toData } = await import("../src/state");
	Object.assign(UIBuilder, { message() {}, showCampaignEnd() {}, showPrototypeAwardMessage(eqid: number) { shownPrototypes.push(eqid); } });
	Rng.game.state = 135 + index;
	Rng.ai.state = 7;
	await startState(game, `campaign:${index}:${difficulty}`);
	return { game, data: () => toData(game.scenario, game) };
}

//What a scenario does to the campaign player's core units: the first hurt (strength, ammo, moved,
//mounted, entrenched, more experience), the second destroyed when a third is left, a unit bought
function playScenario(game: Game, equipment: { [eqid: string]: EquipmentEntry }) {
	const m = game.scenario.map, cp = game.getCampaignPlayer(), list = cp.getCoreUnitList().filter((u) => u.getPos());
	if (list.length > 0)
		Object.assign(list[0], { strength: 3, ammo: 0, hasMoved: true, entrenchment: 2, experience: list[0].experience + 150,
			isMounted: list[0].transport !== null });
	if (list.length > 2) {
		list[1].destroyed = true;
		m.updateUnitList();
	}
	cp.prestige += 5000;
	const eqid = Object.keys(equipment).map(Number).find((id) => equipment[id].country === cp.country + 1 && equipment[id].uclass === 2);
	if (eqid !== undefined) cp.buyUnit(eqid);
}

//Whether f threw
function threw(f: () => void): boolean {
	try {
		f();
		return false;
	} catch {
		return true;
	}
}

//The first scenario's campaign as the core starts it
function startOf(index: number, difficulty: number, prestigeMod: number): CampaignState {
	const c = campaignlist[index];
	return { id: index, file: c.file, scenario: 0, country: c.flag, difficulty, startPrestige: (c.prestige + prestigeMod * c.prestige) >> 0,
		progress: { isStart: true, removeNonCampaignUnits: false, awardPrototype: false } };
}

type Seen = { starts: number; carried: number; prototypes: number; ended: number; threw: number; left: number };
type Old = Awaited<ReturnType<typeof oldCampaign>>;

//The first difference between the old engine's game and the core's, "" for none
function compared(what: string, want: SavedGame, got: SavedGame): string {
	const [a, b] = [JSON.stringify(want), JSON.stringify(got)];
	return a === b ? "" : what + ":" + difference(a, b);
}

//A campaign on both engines: its start, then up to three scenarios ended and the next started.
//What differs
async function playCampaign(index: number, seen: Seen): Promise<string> {
	const { difficultyModifiers } = await import("../src/prototypes");
	const difficulty = index % 3, file = campaignlist[index].file;
	const scenarios = JSON.parse(fs.readFileSync(path.join(GAME_DIR, "resources/campaigns/data", file), "utf8")) as CampaignScenarioData[];
	const old = await oldCampaign(index, difficulty);
	const campaign = startOf(index, difficulty, difficultyModifiers[difficulty].startPrestige);
	const problem = compared(file + " start", old.data(),
		newGame(setupOf(scenarios[0].scenario, { game: 135 + index, ai: 7 }, campaign, scenarios[0].intro)));
	if (problem) return problem;
	seen.starts++;
	for (let k = 0; k < 3; k++) {
		const next = await nextScenario(old, OUTCOMES[(index + k) % 4], scenarios, seen);
		if (next !== "") return next === "end" ? "" : file + " " + next;
		seen.carried++;
	}
	return "";
}

//A scenario played (playScenario), ended with outcome on both engines and the next one started:
//"" when they agree and the campaign goes on, "end" when it ended (or stopped, #182, on both), else
//what differs
async function nextScenario({ game, data }: Old, outcome: ScenarioOutcome, scenarios: CampaignScenarioData[], seen: Seen): Promise<string> {
	playScenario(game, (await import("../src/equipment")).Equipment.equipment);
	const ended = data();
	shownPrototypes.length = 0;
	const oldThrew = threw(() => game.continueCampaign(outcome));
	let n: ReturnType<typeof endCampaignScenario> = null;
	const coreThrew = threw(() => {
		n = endCampaignScenario(createWorld(ended, setupOf(game.scenario.file, null).equipment), outcome, scenarios);
	});
	//(kept #182: a core unit of a country the scenario didn't load stops the campaign)
	if (oldThrew || coreThrew) {
		seen.threw++;
		return oldThrew === coreThrew ? "end" : outcome + ": only one engine threw";
	}
	const oldNext = game.gameEnded ? null : game.campaign.getCurrentScenario();
	if ((n.next === null) !== (oldNext === null)) return outcome + ": the campaign's end differs";
	//The scenario as it stays until the next one loads: its campaign player sent to HQ in place
	const between = scenarioEnded(createWorld(ended, setupOf(game.scenario.file, null).equipment), outcome, scenarios, n.campaign);
	const left = data();
	if (JSON.stringify(left.state) !== JSON.stringify(between)) return outcome + ": the scenario left behind:" + difference(JSON.stringify(left.state), JSON.stringify(between));
	seen.left++;
	if (n.next === null) {
		seen.ended++;
		return "end";
	}
	const before = game.scenario;
	game.newScenario(oldNext.scenario, oldNext.intro);
	await until(() => game.scenario !== before && game.scenario.isLoaded && game.gameStarted, oldNext.scenario);
	const got = newGame({ ...setupOf(n.next.scenario, ended.state.rng, n.campaign, n.next.intro), carried: n.player });
	return prototypeProblem(n.campaign, got.state, seen) || compared(`after ${outcome}, ${n.next.scenario}`, data(), got);
}

//The prototype the old game's message showed and the one the core says it gave, "" when the same
function prototypeProblem(campaign: CampaignState, state: SavedGame["state"], seen: Seen): string {
	const shown = shownPrototypes.splice(0), awarded = awardedPrototype(campaign, state);
	if (awarded !== null) seen.prototypes++;
	const same = JSON.stringify(shown) === JSON.stringify(awarded === null ? [] : [awarded]);
	return same ? "" : `the prototype: old ${JSON.stringify(shown)}, core ${awarded}`;
}

test("Every campaign starts, ends its scenarios and carries its player on as on the old engine", async () => {
	const problems: string[] = [];
	const seen: Seen = { starts: 0, carried: 0, prototypes: 0, ended: 0, threw: 0, left: 0 };
	for (let index = 0; index < campaignlist.length; index++) {
		const problem = await playCampaign(index, seen);
		if (problem) problems.push(problem);
	}
	expect(problems).toEqual([]);
	expect(seen.starts).toBe(campaignlist.length);
	expect(seen.carried).toBeGreaterThan(20);
	expect(seen.prototypes).toBeGreaterThan(2);
	expect(seen.left).toBeGreaterThan(20);
	if (process.env.FC_STATS) fs.writeSync(2, JSON.stringify(seen) + "\n");
}, 600_000);
