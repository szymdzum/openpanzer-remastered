// @vitest-environment node
//The map's ground kept as a layer while the hex grid is on (src/view/map/layers.ts, review proposal 7), on canvases that record
//what they are told: drawn once while the scroll, the scale and the fog stay, again when one changes and the view stands
//still, never during a scroll; let go with the grid, on the strategic map and past the memory budget. That the layer
//gives the same pixels as drawMap was checked in Chrome (the pull request has the numbers): jsdom draws nothing
import { expect, test } from "vitest";
import { type Frame, LAYER_BUDGET, MapLayers } from "../src/view/map/layers";
import type { Images, Scene } from "../src/view/map/mapdraw";
import type { Sized } from "../src/view/map/imagecache";

type Fake = { width: number; height: number; getContext: () => CanvasRenderingContext2D };

//A canvas whose context logs what it drew (the terrain, the layer, a sprite) and its clears
function fakeCanvas(name: string, log: string[], width = 0, height = 0): Fake {
	const canvas: Fake & { name: string } = { name, width, height, getContext: () => ctx };
	const ctx = new Proxy({} as Record<string | symbol, unknown>, {
		get(target, prop) {
			if (prop === "canvas") return canvas;
			if (prop in target) return target[prop];
			return (...args: unknown[]) => {
				if (prop === "drawImage") log.push(name + " <- " + (args[0] as { name: string }).name);
				if (prop === "clearRect") log.push(name + " cleared");
				return prop === "measureText" ? { width: 10 } : undefined;
			};
		},
		set(target, prop, value) {
			target[prop] = value;
			return true;
		},
	}) as unknown as CanvasRenderingContext2D;
	return canvas;
}

const terrain = { name: "terrain", width: 600, height: 500 } as unknown as Sized;
const sprite = { name: "sprite", width: 540, height: 50 } as unknown as ReturnType<Images>;
const images: Images = () => sprite;
const beat = (c: CanvasRenderingContext2D) => { c.drawImage(sprite as CanvasImageSource, 0, 0); };

function frame(over: Partial<Frame> = {}, scene: Partial<Scene> = {}): Frame {
	return { scene: { terrain, size: { width: 600, height: 500 }, rows: 4, cols: 4, grid: true, units: [], selection: null, path: null, fog: null,
		support: null, plaques: [], strategic: null, deploy: null, ghost: null, ...scene },
	vp: { x: 0, y: 0, width: 400, height: 300, scale: 1, dpr: 1 }, images, over: null, motion: null, ...over };
}

function setup(width = 400, height = 300) {
	const log: string[] = [], made: Fake[] = [];
	const main = fakeCanvas("main", log, width, height);
	const layers = new MapLayers(() => {
		const c = fakeCanvas("ground", log);
		made.push(c);
		return c as unknown as HTMLCanvasElement;
	});
	const draw = (f: Frame) => {
		log.length = 0;
		layers.draw(main.getContext(), f);
		return [...log];
	};
	return { draw, made, layers };
}

const direct = ["main cleared", "main <- terrain"], copied = ["main cleared", "main <- ground"];

test("With the grid on the ground is drawn once the view stands still, then copied while the scroll, the scale and the fog stay", () => {
	const { draw } = setup();
	const f = frame();
	//(the first frame: no view before it, drawn as before)
	expect(draw(f)).toEqual(direct);
	expect(draw(f)).toEqual(["ground cleared", "ground <- terrain", ...copied]);
	//(the pointer moved, a beat played: the same ground)
	expect(draw({ ...f, scene: { ...f.scene, units: [] }, motion: beat })).toEqual([...copied, "main <- sprite"]);
	//A scroll: each frame as before; the view still again, the ground drawn again
	for (const x of [8, 16, 24]) expect(draw(frame({ vp: { ...f.vp, x } }))).toEqual(direct);
	expect(draw(frame({ vp: { ...f.vp, x: 24 } }))).toEqual(["ground cleared", "ground <- terrain", ...copied]);
	//The fog, the scale, the device's pixels: drawn again
	const vp = { ...f.vp, x: 24 };
	expect(draw(frame({ vp }, { fog: new Uint8Array(16) }))).toEqual(["ground cleared", "ground <- terrain", ...copied]);
	for (const changed of [{ ...vp, scale: 2 }, { ...vp, dpr: 2 }]) {
		draw(frame({ vp: changed }));
		expect(draw(frame({ vp: changed }))).toEqual(["ground cleared", "ground <- terrain", ...copied]);
	}
});

test("Without the grid, on the strategic map and past the budget the map is drawn as before and the layer let go", () => {
	const { draw, made, layers } = setup();
	draw(frame());
	draw(frame());
	expect(made.length).toBe(1);
	expect(draw(frame({}, { grid: false }))).toEqual(direct);
	expect([made[0].width, made[0].height]).toEqual([0, 0]);
	draw(frame());
	draw(frame());
	expect(draw(frame({}, { strategic: { flags: "", chips: [], plaques: [] } }))).toEqual(direct);
	expect(made[1].width).toBe(0);
	draw(frame());
	draw(frame());
	layers.release();
	expect(made[2].width).toBe(0);
	const side = Math.ceil(Math.sqrt(LAYER_BUDGET)) + 1;
	const huge = setup(side, side), vp = { x: 0, y: 0, width: side, height: side, scale: 1, dpr: 1 };
	huge.draw(frame({ vp }));
	expect(huge.draw(frame({ vp, motion: beat }))).toEqual([...direct, "main <- sprite"]);
	expect(huge.made).toEqual([]);
});
