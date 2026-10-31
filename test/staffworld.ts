//The remastered AI's staff on hand-built maps (test/remastered-staff.test.ts, test/remastered-rear.test.ts): a map of
//the remaster's rules with objectives, and one turn of a controller played as the session plays it
import type { Command } from "../src/core/command";
import type { Controller } from "../src/core/controller";
import { remasterRules } from "../src/core/rules";
import { step } from "../src/core/step";
import type { Position, UnitState, World } from "../src/core/types";
import { hexIndex, unitById } from "../src/core/world";
import { germanyPoland, type HandUnit, handWorld } from "./coreworld";

//What a map may change: its width, its terrain (clear by default)
export interface MapShape {
	cols?: number;
	terrain?: (row: number, col: number) => number;
}

//A hand-built 12 x 16 map of the remaster's rules, everything in sight unless `fog`, seeded: `own` are Germany's
//objectives (Poland's to take), `enemy` Poland's (Germany's to take)
export function world(units: HandUnit[], own: Position[], enemy: Position[] = [], seed = 3, fog = false, shape: MapShape = {}): World {
	const w = handWorld({ rows: 12, cols: shape.cols ?? 16, terrain: shape.terrain, units }, germanyPoland, { rules: remasterRules, noFOW: !fog });
	w.state.rng = { game: seed, ai: seed + 7919 };
	const mark = (at: Position, owner: number) => {
		w.state.map.hexes[hexIndex(w, at.row, at.col)] = { ...w.state.map.hexes[hexIndex(w, at.row, at.col)], victorySide: ~owner & 1, owner };
		w.state.objectives[~owner & 1].push(at);
	};
	for (const at of own) mark(at, 0);
	for (const at of enemy) mark(at, 1);
	return w;
}

export interface Turn {
	world: World;
	commands: Command[];
	refused: number;
}

//One turn of player 0 by the controller: it joins the game (the classic AI takes its prestige to reinforce), its plan, then its orders played one by one, as the session plays them
export function playOneTurn(c: Controller, w: World, between: (w: World, n: number) => World = (x) => x): Turn {
	let now = c.plan(c.join(w).world);
	const commands: Command[] = [];
	let refused = 0;
	for (let n = 0; n < 500; n++) {
		now = between(now, n);
		const o = c.next(now);
		if (o === null) break;
		if (!("command" in o)) continue;
		commands.push(o.command);
		const r = step(now, o.command);
		if (r.ok) now = r.world;
		else refused++;
	}
	return { world: now, commands, refused };
}

export const position = (w: World, id: number): Position => {
	const u = unitById(w, id) as UnitState;
	return { row: u.row, col: u.col };
};

