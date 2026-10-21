/**
 * EngineContext - what the engine reads of the game it plays in
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

import type { Scenario } from "./scenario";
import type { Campaign } from "./campaign";
import type { Player } from "./map";

//The engine modules (map, unit, ai, scenarioloader) read these instead of the global game: the
//scenario (Unit.copy takes the player from its map, #68), the campaign (difficulty, the
//dossier, outside a campaign the new units' experience), the campaign player and the side the
//screen shows (Unit.unitEndTurn hides units by it). Functions, read at the moment the engine
//needs them: Game sets a context that reads its own fields (game.ts), so a harness or a test
//that assigns game.spotSide or game.campaign is seen as before. Without a game: no scenario,
//no campaign, no side shown
export interface EngineContext
{
	scenario(): Scenario | null;
	campaign(): Campaign | null;
	campaignPlayer(): Player | null;
	spotSide(): number;
}

export var engineContext: EngineContext = {
	scenario: function() { return null; },
	campaign: function() { return null; },
	campaignPlayer: function() { return null; },
	spotSide: function() { return -1; }
};

export function setEngineContext(context: EngineContext): void
{
	engineContext = context;
}
