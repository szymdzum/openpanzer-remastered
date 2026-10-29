/**
 * Rng - the random numbers, in streams. The game stream: the combat dice (GameRules.rollDice), the
 * leaders and the prototypes a scenario awards. The AI stream: the AI's purchases and scores. The
 * cosmetic stream: the UI's sprite and sound picks and its debug dossier.
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
//reads Math.random at the call until it is seeded: a test that replaces Math.random with a seeded
//one still seeds the engine, and the module seeds nothing while it loads. The game seeds every
//stream when it starts (main.ts), so the dice have a position a save keeps (docs/STATE.md D8). A
//headless game can set a source of its own. The AI and the UI's picks have their own streams, so an
//AI's choices, an animation or a sound don't move the dice: Rng.seed(seed) is how the harness seeds
//them all, beside Math.random
export interface RngModule {
	source: (() => number) | null; //the game stream's numbers in [0, 1) when set
	game: RngStream;
	ai: RngStream;
	cosmetic: RngStream;
	random: () => number; //the game stream
	aiRandom: () => number;
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

//A seed nobody picked: not Math.random, which would take a number from the game stream
export function randomSeed(): number {
	return crypto.getRandomValues(new Uint32Array(1))[0];
}

//Each stream starts from the seed mixed with its own constant, so two streams seeded with the same
//number don't draw the same numbers
var AI_SALT = 0x61692121, COSMETIC_SALT = 0x636f736d;

export var Rng: RngModule = {
	source: null,
	game: { state: null },
	ai: { state: randomSeed() },
	cosmetic: { state: randomSeed() },
	random: function() {
		return Rng.source !== null ? Rng.source() : nextRandom(Rng.game);
	},
	aiRandom: function() {
		return nextRandom(Rng.ai);
	},
	cosmeticRandom: function() {
		return nextRandom(Rng.cosmetic);
	},
	//Every stream from the seed the harness seeds Math.random with (harness/replay.js per scenario,
	//the contracts' check per call), so a replay plays the same
	//dice, AI, sprites and sounds on both sides. The game stream takes the seed as it is: it draws
	//what the harness's Math.random draws, the numbers the original game rolls with that seed
	seed: function(seed: number) {
		Rng.game.state = seed >>> 0;
		Rng.ai.state = (seed ^ AI_SALT) >>> 0;
		Rng.cosmetic.state = (seed ^ COSMETIC_SALT) >>> 0;
	}
};
