//The running game, for the modules that read it while it runs (gamestate, the host, the session's glue,
//the command-line player's page): they read it here instead of importing game.ts, so the imports don't go
//round in a circle (#104). game.ts sets it once, right after making the game; they only read it when the
//player or the game does something, after that
import type { Game } from "./game";

export let game: Game = null;

export function setGame(g: Game) {
	game = g;
}
