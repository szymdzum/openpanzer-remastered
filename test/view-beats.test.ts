// @vitest-environment node
//A step animated on the new UI (#347): its beats from the events (src/view/beats.ts) on hand-built worlds played with
//the game's dice, the player's pace and picks (src/view/player.ts) on fake timers, and a beat drawn on the canvas
//(src/view/motiondraw.ts)
import { afterEach, expect, test, vi } from "vitest";
import { handWorld, type HandUnit } from "./coreworld";
import { adjacent, directionTo } from "../src/core/geometry";
import { step } from "../src/core/step";
import type { Command } from "../src/commands";
import type { World } from "../src/core/types";
import { directionToRadians, playerType, terrainType, uiSettings } from "../src/prototypes";
import { type Beat, beatsFor, SHEETS } from "../src/view/beats";
import type { Viewport } from "../src/view/canvas";
import { hexCentre } from "../src/view/hexgrid";
import { drawMotion } from "../src/view/motiondraw";
import { createPlayer, type Motion } from "../src/view/player";

afterEach(() => {
	vi.useRealTimers();
	uiSettings.quickAnimation = false;
});

const PZ_IIA = 140, INFANTERIE = 115, LEFH18 = 92, TP7 = 273, PIECHOTA = 270, WZ97 = 264;

function hand(units: HandUnit[], terrain: Record<string, number> = {}): World {
	return handWorld({ rows: 10, cols: 10, units, terrain: (r, c) => terrain[r + "," + c] || terrainType.Clear }, undefined, { spotSide: 0 });
}

//The command played with the dice of a seed: its beats
function beats(w: World, cmd: Command, seed = 1): Beat[] {
	const before = { ...w, state: { ...w.state, rng: { game: seed, ai: 7 } } };
	const r = step(before, cmd);
	if ("refusal" in r) throw new Error(r.refusal.reason);
	return beatsFor(before, r.world, r.events);
}

const attack: Command = { type: "attack", unit: 0, target: 1 };
const last = <T>(list: T[]): T => list[list.length - 1];
const kinds = (b: Beat[]) => b.map((x) => x.kind + (x.kind === "move" ? "" : " " + x.at.row + "," + x.at.col));

test("A move: the unit along its path with its move method's sound; a move the side shown doesn't see, nothing", () => {
	const w = hand([{ eqid: PZ_IIA, owner: 0, row: 4, col: 3 }, { eqid: TP7, owner: 1, row: 9, col: 9 }]);
	const [move] = beats(w, { type: "move", unit: 0, to: { row: 2, col: 3 } });
	expect(move).toMatchObject({ kind: "move", unit: 0, icon: w.equipment[PZ_IIA].icon });
	expect(move.kind === "move" && move.path.map((p) => [p.row, p.col])).toEqual([[4, 3], [3, 3], [2, 3]]);
	expect(move.kind === "move" && move.sounds[0]).toBe("resources/sounds/move/track.wav");
	//(the enemy's tank far in the fog, a program's, moves unseen)
	w.state.turn.currentPlayer = 1;
	w.state.players[1].type = playerType.aiLocal;
	expect(beats(w, { type: "move", unit: 1, to: { row: 9, col: 7 } })).toEqual([]);
});

test("An attack: the support gun fires, then the attacker, then the defender firing back, each facing its target with its class's strip and sound", () => {
	const w = hand([{ eqid: PZ_IIA, owner: 0, row: 4, col: 3 }, { eqid: PIECHOTA, owner: 1, row: 4, col: 4, strength: 9, entrenchment: 4, experience: 200 },
		{ eqid: WZ97, owner: 1, row: 5, col: 5 }], { "4,4": terrainType.City });
	const b = beats(w, attack);
	expect(kinds(b)).toEqual(["fire 5,5", "fire 4,3", "fire 4,4"]);
	const [gun, tank, rifles] = b as Extract<Beat, { kind: "fire" | "explosion" }>[];
	expect([gun.sheets[0].file, gun.sounds[0], tank.sounds.length, rifles.sheets[0].file]).toEqual(["resources/animations/fire-gun.png",
		"resources/sounds/fire/gun.wav", 5, "resources/animations/fire-smallgun.png"]);
	expect([tank.facing, rifles.facing]).toEqual([directionTo(4, 3, 4, 4), directionTo(4, 4, 4, 3)]);
});

test("From range no return fire; a destroyed or surrendered unit explodes; a retreat moves the defender", () => {
	const far = hand([{ eqid: LEFH18, owner: 0, row: 4, col: 1 }, { eqid: TP7, owner: 1, row: 4, col: 4 }, { eqid: PZ_IIA, owner: 0, row: 4, col: 3 }]);
	expect(kinds(beats(far, attack))).toEqual(["fire 4,1"]);
	const weak = hand([{ eqid: INFANTERIE, owner: 0, row: 4, col: 3 }, { eqid: PIECHOTA, owner: 1, row: 4, col: 4, strength: 1 }]);
	const killed = [1, 2, 3, 4, 5].map((seed) => beats(weak, attack, seed)).find((b) => b.some((x) => x.kind === "explosion"))!;
	expect(kinds(killed)).toEqual(["fire 4,3", "explosion 4,4"]);
	const forest = { "4,4": terrainType.Forest };
	const retreats = hand([{ eqid: INFANTERIE, owner: 0, row: 4, col: 3 }, { eqid: PIECHOTA, owner: 1, row: 4, col: 4, strength: 6, entrenchment: 2 }], forest);
	const fell = Array.from({ length: 40 }, (_, i) => beats(retreats, attack, i + 1)).find((b) => b.some((x) => x.kind === "move"))!;
	expect(last(fell)).toMatchObject({ kind: "move", unit: 1 });
	const boxed = hand([{ eqid: INFANTERIE, owner: 0, row: 4, col: 3 }, { eqid: PIECHOTA, owner: 1, row: 4, col: 4, strength: 6, entrenchment: 2 },
		...adjacent(4, 4).filter((c) => !(c.row === 4 && c.col === 3)).map((c) => ({ eqid: PIECHOTA, owner: 1, ...c }))], forest);
	const gave = Array.from({ length: 40 }, (_, i) => beats(boxed, attack, i + 1)).find((b) => b.some((x) => x.kind === "explosion"))!;
	expect(last(kinds(gave))).toBe("explosion 4,4");
});

//A stage that records what the player asked of the map, its sounds and its picks
function stageOf(still = false) {
	const shown: (Motion | null)[] = [], hidden: (number | null)[] = [], sounds: string[] = [];
	let picks = 0;
	const stage = { pick: () => { picks++; return 0.99; }, show: (m: Motion | null) => { shown.push(m); }, hide: (id: number | null) => { hidden.push(id); },
		sound: (f: string) => { sounds.push(f); }, centre: (p: { row: number; col: number }) => hexCentre(p.row, p.col), still: () => still };
	return { stage, shown, hidden, sounds, picks: () => picks };
}

const fire: Beat = { kind: "fire", at: { row: 4, col: 3 }, facing: 4, sheets: SHEETS.slice(3, 4), sounds: ["a", "b"] };
const boom: Beat = { kind: "explosion", at: { row: 4, col: 4 }, facing: 0, sheets: SHEETS.slice(0, 3), sounds: ["x", "y", "z"] };
const walk: Beat = { kind: "move", unit: 7, icon: "pz.png", path: [{ row: 4, col: 3, visible: true }, { row: 3, col: 3, visible: false },
	{ row: 2, col: 3, visible: true }], sounds: ["m"] };

test("The player plays the beats one after the other at the old UI's pace, picks from the cosmetic stream, and calls done after the last", () => {
	vi.useFakeTimers();
	const s = stageOf(), player = createPlayer(s.stage);
	let done = 0;
	player.play([walk, fire, boom], () => done++);
	//the move: hidden from its hex, its sprite on the hexes the side sees, 5 steps of 30 ms a hex
	expect(s.hidden[0]).toBe(7);
	vi.advanceTimersByTime(2 * 5 * 30 - 1);
	expect(s.shown.filter((m) => m !== null && m.sprite !== null)).toHaveLength(5);
	expect(s.shown.filter((m) => m === null)).toHaveLength(5);
	//the shot: the last strip and sound picked (0.99), 5 frames 150 ms apart and 500 ms more; the explosion's 12 frames
	vi.advanceTimersByTime(1);
	expect(s.sounds).toEqual(["m", "b"]);
	vi.advanceTimersByTime(4 * 150 + 500);
	expect(s.sounds).toEqual(["m", "b", "z"]);
	expect(last(s.shown)).toBe(null);
	vi.advanceTimersByTime(1);
	expect(last(s.shown)).toMatchObject({ effect: { sheet: SHEETS[2], frame: 0, at: { row: 4, col: 4 } } });
	expect(done).toBe(0);
	vi.advanceTimersByTime(11 * 150 + 500 - 1);
	expect([done, s.picks(), last(s.shown), last(s.hidden)]).toEqual([1, 5, null, null]);
	//no beat: done at once
	player.play([], () => done++);
	expect(done).toBe(2);
});

test("Quick animations play faster; under reduced motion nothing moves on the map but the sounds keep the pace; stop drops the rest", () => {
	vi.useFakeTimers();
	uiSettings.quickAnimation = true;
	const quick = stageOf(), player = createPlayer(quick.stage);
	let done = 0;
	player.play([walk, fire], () => done++);
	vi.advanceTimersByTime(2 * 5 * 5 + 4 * 50 + 500);
	expect(done).toBe(1);
	const still = stageOf(true);
	createPlayer(still.stage).play([walk, fire], () => done++);
	vi.advanceTimersByTime(5000);
	expect([done, still.shown.every((m) => m === null), still.hidden.every((h) => h === null), still.sounds]).toEqual([2, true, true, ["m", "b"]]);
	const stopped = stageOf(), p = createPlayer(stopped.stage);
	p.play([fire, boom], () => done++);
	p.stop();
	vi.advanceTimersByTime(10000);
	expect([done, stopped.sounds, last(stopped.shown)]).toEqual([2, ["b"], null]);
});

test("A beat on the canvas: the moving unit's sprite mirrored past south to north, a shot's frame turned the way its unit fires", () => {
	const ops: [string, unknown[]][] = [];
	const ctx = new Proxy({}, { get: (_t, name) => (...args: unknown[]) => { ops.push([String(name), args]); } }) as unknown as CanvasRenderingContext2D;
	const vp: Viewport = { x: 0, y: 0, width: 600, height: 400, scale: 1, dpr: 1 };
	const img = { width: 720, height: 50 } as unknown as CanvasImageSource & { width: number; height: number };
	drawMotion(ctx, vp, { sprite: { icon: "pz.png", x: 100, y: 60, facing: 12 }, effect: { sheet: SHEETS[3], frame: 2, at: { row: 4, col: 4 }, facing: 4 } },
		() => img);
	expect(ops.filter(([op]) => op === "scale")).toEqual([["scale", [-1, 1]]]);
	const [unit, shot] = ops.filter(([op]) => op === "drawImage").map(([, a]) => a);
	expect([unit[1], unit[3]]).toEqual([80 * 4, 80]);
	expect([shot[1], shot[3]]).toEqual([300, 150]);
	expect(ops).toContainEqual(["rotate", [directionToRadians[4]]]);
	//(an image not loaded yet: nothing)
	ops.length = 0;
	drawMotion(ctx, vp, { sprite: { icon: "pz.png", x: 0, y: 0, facing: 2 }, effect: { sheet: SHEETS[3], frame: 0, at: { row: 1, col: 1 }, facing: 0 } }, () => null);
	expect(ops.filter(([op]) => op === "drawImage")).toEqual([]);
});
