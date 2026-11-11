//The remastered AI's staff on hand-built maps (test/remastered-staff.test.ts, test/remastered-rear.test.ts): a map of
//the remaster's rules with objectives, and one turn of a controller played as the session plays it
import { JSDOM } from "jsdom";
import type { Command } from "../src/core/command";
import type { Controller } from "../src/core/controller";
import { createWorld } from "../src/core/create";
import { newGame } from "../src/core/newgame";
import { classicRules, remasterRules } from "../src/core/rules";
import { step } from "../src/core/step";
import { playerType } from "../src/core/tables";
import type { Position, RulesetName, UnitState, World } from "../src/core/types";
import { hexIndex, unitById } from "../src/core/world";
import { setupOf } from "./corefiles";
import { germanyPoland, type HandUnit, handWorld } from "./coreworld";

//A hand-built 12 x 16 map of the remaster's rules, everything in sight unless `fog`, seeded: `own` are Germany's
//objectives (Poland's to take), `enemy` Poland's (Germany's to take); `start`: the objectives each side had to take at
//the scenario's start (the side with more is the attacker, #256), unknown when not given
export function world(units: HandUnit[], own: Position[], enemy: Position[] = [], seed = 3, fog = false, start?: [number, number]): World {
	const w = handWorld({ rows: 12, cols: 16, units, startObjectives: start }, germanyPoland, { rules: remasterRules, noFOW: !fog });
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

//A scenario's start in the rules given, seeded, every player the AI
export function scenarioWorld(file: string, rules: RulesetName = "remaster", seed = 5): World {
	const setup = { ...setupOf(file, { game: seed, ai: seed + 7919 }, null, undefined, [], new new JSDOM().window.DOMParser()),
		rules: rules === "remaster" ? remasterRules : classicRules };
	const created = newGame(setup);
	for (const p of created.state.players) p.type = playerType.aiLocal;
	return createWorld(created, setup.equipment, { spotSide: -1, rules: setup.rules });
}
