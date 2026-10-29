//The running game, for the modules that read it while it runs (storage, the host, the session's glue,
//the command-line player's page): they read it here instead of importing game.ts, so the imports don't go
//round in a circle (#104). the host's runGame sets it once, right after game.ts makes the game; they only read it when the
//player or the game does something, after that
import type { Game } from "./game";

export let game: Game = null;

export function setGame(g: Game) {
	game = g;
}
