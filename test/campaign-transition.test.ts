//#64: a campaign's next scenario carried state over from the scenario before (players reports: city
//names of the first map on the second, transports at 0, a save that wouldn't load). A campaign's
//scenario starts as the scenario loaded alone, apart from what the campaign gives it on purpose: the
//campaign player's prestige, score, dossier and core units, the difficulty's turns and prestige, the
//AI players and the leaders drawn. A save of it loads the same game. The next scenario loads once,
//however many ticks of the turn loop pass while it loads, and the save stays until it has
import { expect, test } from "vitest";
import { freshGame, startState, until } from "./lifecycle";
import type { SavedGame } from "../src/core/state";
import type { ScenarioOutcome } from "../src/core/types";

type Game = Awaited<ReturnType<typeof freshGame>>;

const SAVE = "openpanzer-game-3.2"; //(GameState's save name, MAJOR_VERSION 3.2)

async function campaign(index: number, difficulty = 1) {
	const game = await freshGame();
	await startState(game, `campaign:${index}:${difficulty}`);
	return game;
}

//The scenario ended with the outcome and the player's click on its message, then the turn loop's
//ticks until the next one has loaded; false when the campaign ended
async function next(game: Game, outcome: ScenarioOutcome): Promise<boolean> {
	const before = game.scenario;
	game.continueCampaign(outcome);
	if (game.gameEnded) return false;
	game.uiMessageClicked = true;
	game.host.processTurn();
	await until(() => game.scenario !== before && game.scenario !== null && game.scenario.isLoaded && game.gameStarted,
		"the campaign's next scenario");
	return true;
}

async function data(game: Game): Promise<SavedGame> {
	const { toData } = await import("../src/legacy/state");
	return toData(game.scenario, game.campaign !== null ? game : null);
}

//What a scenario starts with whether a campaign plays it or not: the map, its names and owners, the
//other players' units and reinforcements (their leaders drawn apart), the players but for what the
//campaign and its difficulty give
function alike(saved: SavedGame, country: number) {
	const s = saved.state, cp = s.players.findIndex((p) => p.country === country);
	const unleader = <T>(x: T): T => JSON.parse(JSON.stringify(x).replace(/"leader":-?\d+/g, "\"leader\":0"));
	return {
		data: { ...saved.data, description: "" },
		scenario: { ...s.scenario, maxTurns: 0, victoryTurns: [] as number[] },
		map: { ...s.map, hexes: s.map.hexes.map((h) => [h.owner, h.flag, h.victorySide]) },
		units: unleader(s.units.filter((u) => u.owner !== cp).map((u) => ({ ...u, id: 0 }))),
		players: s.players.map((p, i) => i === cp
			? { id: p.id, side: p.side, country: p.country, airTransports: p.airTransports, navalTransports: p.navalTransports,
				supportCountries: p.supportCountries }
			: { ...p, type: 0, prestige: 0, score: 0 }),
		objectives: s.objectives,
		reinforcements: unleader(s.reinforcements),
		turn: s.turn,
	};
}

//Every campaign of the list, its first two scenarios won: the next one against the same file loaded
//alone in a fresh game, then the save made at its start loaded, and the campaign played on from there
test("A campaign's next scenario starts as the scenario loaded alone, and its save loads the same game (#64)", async () => {
	const problems: string[] = [];
	for (let index = 0; index < campaignlist.length; index++) {
		let game = await campaign(index);
		for (let step = 0; step < 2 && await next(game, "victory"); step++) {
			const file = game.scenario.file, country = game.campaign.country;
			const started = await data(game), save = localStorage.getItem(SAVE);
			const alone = await freshGame();
			await startState(alone, file);
			const [want, got] = [alike(await data(alone), country), alike(started, country)];
			for (const k of Object.keys(want) as (keyof typeof want)[])
				if (JSON.stringify(want[k]) !== JSON.stringify(got[k])) problems.push(`${file} ${k}`);
			game = await freshGame();
			localStorage.setItem(SAVE, save);
			game.state.restore(game.onScenarioLoadFinished.bind(game, null, true), () => problems.push(file + " no save"));
			await until(() => game.scenario !== null && game.scenario.isLoaded && game.gameStarted, file + " restored");
			if (JSON.stringify(await data(game)) !== JSON.stringify(started)) problems.push(file + " restored");
		}
	}
	expect(problems).toEqual([]);
}, 120_000);

//The comment on #64: Player.setPlayerToHQ left the units at HQ the id they had on the map before,
//which an id of the next map could take. The next scenario makes its units at HQ from the state,
//which has no id for them (src/legacy/state.ts coreUnit)
test("A campaign's core units waiting at HQ keep no id of the scenario before (#64)", async () => {
	const game = await campaign(0);
	await next(game, "victory");
	const cp = game.getCampaignPlayer();
	const waiting = cp.getCoreUnitList().filter((u) => u.getHex() === null);
	expect(waiting.length, "core units not deployed yet").toBeGreaterThan(0);
	expect(waiting.map((u) => u.id)).toEqual(waiting.map(() => -1));
});

//#64: the turn loop asked for the next scenario on every tick until it had loaded, each load starting
//over the one before through the loader's shared scenario: the players three times over. The loop
//asks for it once
test("A campaign's next scenario loads once however many ticks of the turn loop pass while it loads (#64)", async () => {
	const game = await campaign(0);
	let loads = 0;
	const host = game.host, finished = host.scenarioLoaded.bind(host);
	host.scenarioLoaded = (...args: Parameters<typeof host.scenarioLoaded>) => {
		loads++;
		finished(...args);
	};
	const before = game.scenario;
	game.continueCampaign("victory");
	game.uiMessageClicked = true;
	for (let tick = 0; tick < 50 && loads === 0; tick++) {
		game.host.processTurn();
		await Promise.resolve(); //(a step of the load between two ticks)
	}
	await until(() => game.scenario !== before && game.scenario !== null && game.scenario.isLoaded && game.gameStarted, "the next scenario");
	await new Promise((r) => setTimeout(r, 50));
	expect(loads).toBe(1);
	expect(game.scenario.map.getPlayers().length).toBe((await data(game)).state.players.length);
	expect(game.scenario.map.getPlayers().map((p) => p.country)).toEqual([7, 13]);
});

//#64: the next scenario's load deleted the save first and wrote the new one only once it had loaded:
//closing the game meanwhile, or a load that failed, lost the campaign. The save stays until the next
//scenario's replaces it
test("The campaign's save stays while its next scenario loads, until the next scenario's replaces it (#64)", async () => {
	const game = await campaign(0);
	const first = localStorage.getItem(SAVE);
	expect(first, "the first scenario saved").not.toBeNull();
	const before = game.scenario;
	game.continueCampaign("victory");
	game.uiMessageClicked = true;
	game.host.processTurn();
	expect(localStorage.getItem(SAVE), "the save while the next scenario loads").toBe(first);
	await until(() => game.scenario !== before && game.scenario !== null && game.scenario.isLoaded && game.gameStarted, "the next scenario");
	const saved = JSON.parse(localStorage.getItem(SAVE)) as SavedGame;
	expect(saved.state.scenario.file, "the next scenario's save").toBe(game.scenario.file);
	expect(game.scenario.file).not.toBe(before.file);
});
