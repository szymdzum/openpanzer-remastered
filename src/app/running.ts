//The running game, for the modules that read it while it runs: they read it here instead of importing
//game.ts, so the imports don't go round in a circle (#104). The host's runGame sets it once, right after
//game.ts makes the game.
import type { Game } from "./game";

export let game: Game = null;

export function setGame(g: Game) {
	game = g;
}
