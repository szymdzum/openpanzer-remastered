//A campaign's difficulty, as a new game starts its scenario (src/core/newgame.ts): the easier levels
//give the campaign player a minimum prestige per turn, a share of the campaign's starting prestige
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";
import type { CampaignScenarioData } from "../src/core/campaign";
import { newGame } from "../src/core/newgame";
import { difficultyType } from "../src/prototypes";
import { difficultyModifiers } from "../src/core/tables";
import type { CampaignState } from "../src/core/state";
import { GAME_DIR, setupOf } from "./corefiles";

//The first scenario of every campaign of the list at operational, the easiest level: the campaign
//player's country gets at least a quarter of the starting prestige each turn, the other players (the
//AI's) what the scenario file gives them, as on Historical
test("The easier difficulties raise only the campaign player's prestige per turn, not the AI's (#15)", () => {
	const difficulty = difficultyType.operational;
	let raisedAI = 0;
	campaignlist.forEach((c, index) => {
		const scenarios = JSON.parse(fs.readFileSync(path.join(GAME_DIR, "resources/campaigns/data", c.file), "utf8")) as CampaignScenarioData[];
		const startPrestige = (c.prestige * (1 + difficultyModifiers[difficulty].startPrestige)) >> 0;
		const campaign: CampaignState = { id: index, file: c.file, scenario: 0, country: c.flag, difficulty, startPrestige,
			progress: { isStart: true, removeNonCampaignUnits: false, awardPrototype: false } };
		const setup = setupOf(scenarios[0].scenario, { game: 1, ai: 1 }, campaign);
		const min = Math.round(startPrestige * difficultyModifiers[difficulty].turnPrestige);
		const players = newGame(setup).state.players;
		setup.scenario.players.forEach((file, i) => {
			const p = players[i];
			if (p.country === c.flag) {
				expect(p.prestigePerTurn).toEqual(file.prestigePerTurn.map((v) => Math.max(v, min)));
			} else {
				if (file.prestigePerTurn.some((v) => v < min)) raisedAI++;
				expect(p.prestigePerTurn, `${c.file} player ${i}`).toEqual(file.prestigePerTurn);
			}
		});
	});
	expect(raisedAI, "AI players whose file gives less than the minimum").toBeGreaterThan(0);
});
