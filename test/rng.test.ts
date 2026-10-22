//The random streams (src/rng.ts, #126): the game stream (the dice, the leaders, the AI) and the
//cosmetic one (the UI's sprite and sound picks), each a mulberry32 whose state is one number, so an
//animation or a sound no longer moves the dice
import { afterEach, expect, test } from "vitest";
import { nextRandom, Rng } from "../src/rng";
import { animationSprite } from "../src/animation";
import { soundData } from "../src/sound";
import { uiSettings } from "../src/prototypes";
import { mulberry32 } from "./lifecycle";

const realRandom = Math.random, startState = { game: Rng.game.state, cosmetic: Rng.cosmetic.state };
afterEach(() => {
	Math.random = realRandom;
	Rng.source = null;
	Rng.game.state = startState.game;
	Rng.cosmetic.state = startState.cosmetic;
});

const draws = (next: () => number, n: number) => Array.from({ length: n }, next);

test("A stream is the harness's mulberry32: seeded with a number, it draws what mulberry32 of it does", () => {
	for (const seed of [0, 1, 31, 0x7fffffff, 0xffffffff]) {
		const stream = { state: seed };
		expect(draws(() => nextRandom(stream), 20)).toEqual(draws(mulberry32(seed), 20));
	}
});

test("A stream's state is a number: read it, set it back, and it draws the same again", () => {
	const stream = { state: 12345 };
	nextRandom(stream);
	const saved = stream.state;
	expect(Number.isInteger(saved) && saved >= 0 && saved < 2 ** 32).toBe(true);
	const next = draws(() => nextRandom(stream), 10);
	stream.state = saved;
	expect(draws(() => nextRandom(stream), 10)).toEqual(next);
});

test("The game stream reads Math.random at the call until it is seeded, the source when one is set", () => {
	expect(Rng.game.state).toBeNull();
	Math.random = mulberry32(7);
	const fromMath = draws(Rng.random, 5);
	Math.random = () => { throw new Error("Math.random drawn"); };
	Rng.game.state = 7;
	expect(draws(Rng.random, 5)).toEqual(fromMath);
	Rng.source = mulberry32(7);
	Rng.game.state = 0;
	expect(draws(Rng.random, 5)).toEqual(fromMath);
	expect(Rng.game.state).toBe(0);
});

test("The cosmetic stream is seeded at load and by Rng.seed, never from Math.random", () => {
	expect(Rng.cosmetic.state).not.toBeNull();
	Math.random = () => { throw new Error("Math.random drawn"); };
	Rng.seed(1);
	const first = draws(Rng.cosmeticRandom, 10);
	Rng.seed(1);
	expect(draws(Rng.cosmeticRandom, 10)).toEqual(first);
	//Salted: the same seed doesn't give the cosmetic stream Math.random's numbers
	expect(first).not.toEqual(draws(mulberry32(1), 10));
});

//The animations' sprite picks and the sound variants ran between the support fire shots on the
//dice's Math.random, so animating moved the dice. Now a pick is a cosmetic draw
test("The UI's sprite and sound picks draw from the cosmetic stream, not the dice's", () => {
	const pick = animationSprite([{ path: "a.png", width: 1, frames: 1 }, { path: "b.png", width: 1, frames: 1 }], "explosion");
	const muted = uiSettings.muteUnitSounds;
	uiSettings.muteUnitSounds = true;
	Math.random = () => { throw new Error("Math.random drawn"); };
	try {
		Rng.seed(3);
		const before = Rng.cosmetic.state;
		pick();
		void soundData["explosion"].play();
		expect(Rng.cosmetic.state).not.toBe(before);
		Rng.seed(3);
		const sprites = draws(() => pick() === pick() ? 1 : 0, 20);
		Rng.seed(3);
		expect(draws(() => pick() === pick() ? 1 : 0, 20)).toEqual(sprites);
	} finally {
		uiSettings.muteUnitSounds = muted;
	}
});
