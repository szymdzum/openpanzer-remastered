//Plays a step's beats (src/view/beats.ts, #347) one after the other at the old UI's pace (src/animation.ts, src/render.ts
//MoveAnimation): a move 5 steps a hex, 30 ms each (5 with quick animations); a shot or an explosion a frame every 150 ms
//(50), the next beat 500 ms after its last frame. What to draw at each moment goes to the map (show), the moving unit is
//hidden from its hex meanwhile (hide), and each beat's sound plays. The sprite strip and the sound of each beat are
//picked from the cosmetic stream (pick), never the game's or the AI's. Under prefers-reduced-motion nothing moves on
//the map: the sounds keep the pace. done is called when the last beat ends, at once for none
import type { PathStep } from "../core/events";
import type { Position, UnitId } from "../core/types";
import { uiSettings } from "../app/settings";
import type { Beat, Sheet } from "./beats";

//What the map draws over the units while a beat plays: the moving unit's sprite at a point of the map (its pixels), a
//frame of a shot or an explosion on a hex
export interface Motion {
	sprite: { icon: string; x: number; y: number; facing: number } | null;
	effect: { sheet: Sheet; frame: number; at: Position; facing: number } | null;
}

export interface Stage {
	pick: () => number; //a number in [0, 1) of the cosmetic stream
	show: (m: Motion | null) => void;
	hide: (unit: UnitId | null) => void;
	sound: (file: string) => void;
	centre: (p: Position) => { x: number; y: number }; //a hex's centre in the map's pixels
	still: () => boolean; //prefers-reduced-motion
	gone?: (unit: UnitId) => void; //a unit an explosion destroys, off the map once the blast covers it
}

const STEPS = 5, GAP = 500;
const stepMs = () => uiSettings.quickAnimation ? 5 : 30;
const frameMs = () => uiSettings.quickAnimation ? 50 : 150;

const pickOf = <T>(list: T[], r: number): T => list[Math.floor(r * list.length)];

//The facing from one hex to the next along a path, the 16 directions of the sprites
function facingTo(a: { x: number; y: number }, b: { x: number; y: number }): number {
	const angle = Math.atan2(b.x - a.x, b.y - a.y); //0 south, counter clockwise
	return (Math.round(angle / (Math.PI / 8)) + 16) % 16;
}

export function createPlayer(stage: Stage) {
	let timers: ReturnType<typeof setTimeout>[] = [];
	const later = (ms: number, f: () => void) => { timers.push(setTimeout(f, ms)); };

	//A unit along its path: hidden on its hex, its sprite drawn on the hexes the side shown sees it pass. Its length
	function move(b: Extract<Beat, { kind: "move" }>, still: boolean): number {
		stage.sound(pickOf(b.sounds, stage.pick()));
		const step = stepMs(), path: PathStep[] = b.path;
		if (!still) stage.hide(b.unit);
		for (let i = 0; i + 1 < path.length; i++) {
			const a = stage.centre(path[i]), z = stage.centre(path[i + 1]), facing = facingTo(a, z);
			for (let s = 0; s < STEPS; s++)
				later((i * STEPS + s) * step, () => stage.show(still || !path[i].visible ? null
					: { sprite: { icon: b.icon, x: a.x + (z.x - a.x) * s / STEPS, y: a.y + (z.y - a.y) * s / STEPS, facing }, effect: null }));
		}
		return Math.max(0, path.length - 1) * STEPS * step;
	}

	//A shot or an explosion: a frame at a time on its hex. Its length, with the gap before the next
	function burst(b: Extract<Beat, { kind: "fire" | "explosion" }>, still: boolean): number {
		const sheet = pickOf(b.sheets, stage.pick());
		stage.sound(pickOf(b.sounds, stage.pick()));
		const frame = frameMs();
		for (let f = 0; f < sheet.frames; f++)
			later(f * frame, () => stage.show(still ? null : { sprite: null, effect: { sheet, frame: f, at: b.at, facing: b.facing } }));
		//(the destroyed unit goes once the blast covers it, a third of the way in, so the one turns into the other)
		if (b.kind === "explosion" && stage.gone !== undefined) later(Math.floor(sheet.frames / 3) * frame, () => stage.gone!(b.unit));
		//(the last frame shown its time, then gone)
		later(sheet.frames * frame, () => stage.show(null));
		return (sheet.frames - 1) * frame + GAP;
	}

	//The beats from the i-th on, each told as it starts (started), then done
	function from(beats: Beat[], i: number, done: () => void, started: (i: number) => void) {
		if (i >= beats.length) {
			stage.show(null);
			stage.hide(null);
			timers = [];
			done();
			return;
		}
		started(i);
		const b = beats[i], still = stage.still();
		const length = b.kind === "move" ? move(b, still) : burst(b, still);
		later(length, () => {
			stage.hide(null);
			from(beats, i + 1, done, started);
		});
	}

	return {
		play(beats: Beat[], done: () => void, started: (i: number) => void = () => {}) {
			from(beats, 0, done, started);
		},
		//The beats left go unplayed and their done isn't called: a new scenario's start
		stop() {
			for (const t of timers) clearTimeout(t);
			timers = [];
			stage.show(null);
			stage.hide(null);
		},
	};
}

//The page's sounds, each file loaded once; none when the unit sounds are muted (the variant is picked all the same)
export function pageSounds(): (file: string) => void {
	const loaded = new Map<string, HTMLAudioElement>();
	return (file: string) => {
		if (uiSettings.muteUnitSounds) return;
		let a = loaded.get(file);
		if (a === undefined) {
			a = new Audio(file);
			loaded.set(file, a);
		}
		a.currentTime = 0;
		//(a browser that won't play before the person has touched the page plays nothing)
		void a.play().catch(() => {});
	};
}
