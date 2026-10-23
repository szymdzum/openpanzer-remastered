/**
 * AIScripted - a player's handler when the scripted tutorial plays it (tutorial.xml): played by the
 * core's tutorial (src/core/tutorial.ts) in the game's session (#137), as AI's handler is
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 *
 * The script (messages, selections, moves, attacks for turns 1 to 4, then the players handed over to a
 * person and the AI) is the core's. The handler hands out its orders as the old actions.
 */

import { AI } from "./ai";

//(the AI's handler: the session's controller for the player is the tutorial's, by the player's type)
export class AIScripted extends AI {}
