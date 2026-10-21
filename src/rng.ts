/**
 * Rng - the engine's random numbers: the combat dice (GameRules.rollDice), the leaders, the
 * prototypes a scenario awards and the AI's purchases and scores.
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

//Every draw stays where it was, one Rng.random() for each Math.random() the bundle made: the
//order of the draws is behavior (the UI's sprite and sound picks share the stream, and the
//replays and contracts are recorded with it). Without a source, Math.random is read at the call,
//so a harness that replaces Math.random with a seeded one (harness/replay.js, record.js, the
//contracts' check) still seeds the engine. A headless game can set a source of its own
export interface RngModule
{
	source: (() => number) | null; //a number in [0, 1), null: Math.random
	random(): number;
}

export var Rng: RngModule = {
	source: null,
	random: function()
	{
		return Rng.source !== null ? Rng.source() : Math.random();
	}
};
