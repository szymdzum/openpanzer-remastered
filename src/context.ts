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
import type { World } from "./core/types";

//The engine modules (map, unit, ai, scenarioloader) read these instead of the global game: the
//scenario (Unit.copy takes the player from its map, #68), the campaign (difficulty, the
//dossier, outside a campaign the new units' experience), the campaign player and the side the
//screen shows (Unit.unitEndTurn hides units by it). Functions, read at the moment the engine
//needs them: Game sets a context that reads its own fields (game.ts), so a harness or a test
//that assigns game.spotSide or game.campaign is seen as before. Without a game: no scenario,
//no campaign, no side shown. host: the game as the state's campaign host (src/state.ts), which the
//commands on the core read the state of the game with (src/commands.ts); world: the core's world of the
//game's objects, which the rules read (src/gamerules.ts)
export interface EngineContext {
	scenario(): Scenario | null;
	campaign(): Campaign | null;
	campaignPlayer(): Player | null;
	spotSide(): number;
	host(): CampaignHost | null;
	world(): World; //the core's world of the game's objects now (src/mirror.ts rulesWorld), which the rules read
}

export var engineContext: EngineContext = {
	scenario: function() { return null; },
	campaign: function() { return null; },
	campaignPlayer: function() { return null; },
	spotSide: function() { return -1; },
	host: function() { return null; },
	world: function() { throw new Error("no game: no world"); }
};

export function setEngineContext(context: EngineContext): void {
	engineContext = context;
}

//How many times something said it wrote into the game's objects outside the mirror (src/mirror.ts):
//the screen's carrier flips, the animation's facing, its sorts of the lists (#186, #187), a unit put on
//a hex, a load. The world the screen's rules read is kept while this count stays (the harness writes
//without saying: under ?harness the world is compared with the objects instead)
let writes = 0;

//The game's objects were written to: the screen's rules read their world again
export function touched(): void {
	writes++;
}

export function objectWrites(): number {
	return writes;
}
