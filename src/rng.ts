/**
 * Rng - the random numbers, in streams. The game stream: the combat dice (GameRules.rollDice), the
 * leaders, the prototypes a scenario awards and the AI's purchases and scores. The cosmetic stream:
 * the UI's sprite and sound picks and its debug dossier.
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

//A stream is mulberry32, the generator the harness seeds Math.random with (harness/lib/harness.js):
//its whole state is one 32-bit number, so where a stream is can be read, saved and set back.
//state null: the stream isn't seeded and reads Math.random at each draw
export interface RngStream {
	state: number | null;
}

//Every game draw stays where it was, one Rng.random() for each Math.random() the bundle made: the
//order of the draws is behavior (the replays and contracts are recorded with it). The game stream
//isn't seeded yet, so it reads Math.random at the call: a harness that replaces Math.random with a
//seeded one (harness/replay.js, record.js, the contracts' check) still seeds the engine. A headless
//game can set a source of its own. The UI's picks have their own stream, so an animation or a sound
//doesn't move the dice: Rng.seed(seed) is how the harness seeds it, beside Math.random
export interface RngModule {
	source: (() => number) | null; //the game stream's numbers in [0, 1) when set
	game: RngStream;
	cosmetic: RngStream;
	random: () => number; //the game stream
	cosmeticRandom: () => number;
	seed: (seed: number) => void;
}

//The next number in [0, 1) of the stream, which it advances
export function nextRandom(stream: RngStream): number {
	if (stream.state === null)
		return Math.random();
	var a = stream.state = (stream.state + 0x6D2B79F5) >>> 0;
	var t = Math.imul(a ^ a >>> 15, 1 | a);
	t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
	return ((t ^ t >>> 14) >>> 0) / 4294967296;
}

//A seed nobody picked, for the streams the player doesn't replay: not Math.random, which would take
//a number from the game stream
function entropy(): number {
	return crypto.getRandomValues(new Uint32Array(1))[0];
}

//Each stream starts from the seed mixed with its own constant, so two streams seeded with the same
//number don't draw the same numbers
var COSMETIC_SALT = 0x636f736d;

export var Rng: RngModule = {
	source: null,
	game: { state: null },
	cosmetic: { state: entropy() },
	random: function() {
		return Rng.source !== null ? Rng.source() : nextRandom(Rng.game);
	},
	cosmeticRandom: function() {
		return nextRandom(Rng.cosmetic);
	},
	//The streams Math.random doesn't seed, from the seed the harness seeds Math.random with
	//(harness/replay.js per scenario, harness/ui-replay.js at the start), so a replay draws the same
	//sprites and sounds on both sides
	seed: function(seed: number) {
		Rng.cosmetic.state = (seed ^ COSMETIC_SALT) >>> 0;
	}
};
