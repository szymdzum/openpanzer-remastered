/**
 * CoreLoad - the running game's scenarios started on the core (#137): once the scenario loader has the
 * file, the map image and the equipment in, the core's newGame makes the game (a campaign's scenario
 * with the player carried from the one before) and the scenario's objects are filled from it
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 *
 * The loader reads the files as before, in the same order (the page's requests are part of what the
 * harness replays); only who makes the units and players changed. Set by game.ts as ScenarioLoader.build.
 */

import { uiSettings } from "./prototypes";
import { Equipment } from "./equipment";
import { Rng } from "./rng";
import type { Scenario } from "./scenario";
import { campaignState, fromData, type PlayerState, type RngStreams } from "./state";
import { awardedPrototype } from "./core/campaign";
import { type FileUnit, newGame, type ScenarioFile } from "./core/newgame";
import { readScenarioFile } from "./core/scenariofile";
import { game } from "./session";

//What the game carries into a scenario it starts: a campaign's player from the scenario before
let carried: PlayerState | null = null;

export function carryPlayer(p: PlayerState | null) {
	carried = p;
}

//The prototype the last scenario started gave (its eqid), for the message; null for none
export let prototypeAwarded: number | null = null;

//Where the streams are; null while the game stream reads Math.random
function streams(): RngStreams | null {
	return Rng.game.state === null || Rng.ai.state === null ? null : { game: Rng.game.state, ai: Rng.ai.state };
}

//ScenarioLoader.build: the game the scenario file starts, into the scenario loading, then its load ends
export function buildOnCore(scen: Scenario, xmlData: Document, imageSize: [number, number]) {
	const campaign = game.campaign !== null ? campaignState(game.campaign, game.getCampaignProgress()) : null;
	const file = readScenarioFile(xmlData);
	const saved = newGame({ file: scen.file, name: scen.name, description: scen.getDescription(), scenario: file,
		imageSize, equipment: Equipment.equipment, indexes: Equipment.equipmentIndexes, isAI: uiSettings.isAI, rng: streams(), campaign,
		carried: campaign !== null ? carried : null });
	prototypeAwarded = awardedPrototype(campaign, saved.state);
	fromData(saved, campaign !== null ? game : null, scen);
	cacheFileImages(scen, file);
	scen.onLoadFinished();
}

//The icons of every unit the file put on the map, in the image cache as the old loader left them: a
//campaign's start removes some of them (the scenario's own units on the player's deployment hexes) but
//their icons stay cached
function cacheFileImages(scen: Scenario, file: ScenarioFile) {
	const m = scen.map, images = m.getUnitImagesList();
	for (const h of file.hexes)
		if (h.row < m.rows && h.col < m.cols)
			for (const u of h.units) cacheUnitImages(images, u);
}

//(MapBoard.add: the unit's, its transport's and its carrier's; a unit the loader skipped has none)
function cacheUnitImages(images: { [eqid: number]: string }, u: FileUnit) {
	const known = (eqid: number) => Equipment.equipment[eqid] !== undefined;
	if (!(u.eqid >= 0 && u.owner >= 0) || !known(u.eqid)) return;
	images[u.eqid] = Equipment.equipment[u.eqid].icon;
	if (u.transport !== null && known(u.transport)) images[u.transport] = Equipment.equipment[u.transport].icon;
	if (u.carrier !== null && u.carrier > 0) images[u.carrier] = Equipment.equipment[u.carrier].icon;
}
