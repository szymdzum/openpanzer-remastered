//The running game, for the UI modules (ui, uibuilder, uicombatlog, render, gamestate, osglue and
//the tutorial): they read it here instead of importing game.ts, which builds the UI, so the
//imports don't go round in a circle (#104). game.ts sets it once, right after making the game;
//the UI only reads it when the player or the game loop does something, after that
import type { Game } from "./game";

export let game: Game = null;

export function setGame(g: Game) {
	game = g;
}
