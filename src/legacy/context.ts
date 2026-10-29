/**
 * EngineContext - what the engine reads of the game it plays in
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

import type { Scenario } from "./scenario";
import type { Campaign } from "./campaign";
import type { Player } from "./map";
import type { CampaignHost } from "./state";
import type { RulesetName, World } from "../core/types";

//The engine modules (map, unit, ai, scenarioloader) read these instead of the global game: the
//scenario (Unit.copy takes the player from its map, #68), the campaign (difficulty, the
//dossier, outside a campaign the new units' experience), the campaign player and the side the
//screen shows (Unit.unitEndTurn hides units by it). Functions, read at the moment the engine
//needs them: Game sets a context that reads its own fields (game.ts), so a harness or a test
//that assigns game.spotSide or game.campaign is seen as before. Without a game: no scenario,
//no campaign, no side shown. host: the game as the state's campaign host (src/legacy/state.ts), which the
//commands on the core read the state of the game with (src/legacy/commands.ts); world: the game's world, which
//the rules read (src/legacy/gamerules.ts)
export interface EngineContext {
	scenario(): Scenario | null;
	campaign(): Campaign | null;
	campaignPlayer(): Player | null;
	spotSide(): number;
	rules(): RulesetName;	//the rules the game plays by (src/core/rules.ts)
	host(): CampaignHost | null;
	world(): World; //the game's world now (src/legacy/mirror.ts rulesWorld), which the rules read
}

export var engineContext: EngineContext = {
	scenario: function() { return null; },
	campaign: function() { return null; },
	campaignPlayer: function() { return null; },
	spotSide: function() { return -1; },
	rules: function() { return "classic"; },
	host: function() { return null; },
	world: function() { throw new Error("no game: no world"); }
};

export function setEngineContext(context: EngineContext): void {
	engineContext = context;
}

//How many times the game's objects were set up by hand outside a step and said so (src/legacy/mirror.ts): a load,
//the players' setup, a unit put on a hex, a test. The world is then made from them again when next asked;
//otherwise the world kept is the game and what is written into the objects never reaches it. Never the
//screen's: what changes the game is a command (#376). The harness writes without saying: under ?harness
//the world is compared with the objects instead
let writes = 0;

//The game's objects were set up by hand: the game's world is made from them again
export function touched(): void {
	writes++;
}

export function objectWrites(): number {
	return writes;
}
