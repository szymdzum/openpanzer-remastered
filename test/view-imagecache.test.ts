// @vitest-environment node
//The map's image cache (src/view/map/imagecache.ts, #462) with a stand-in for the browser's Image that records the files
//it is asked for: the @2x files of the map and the units on a high density screen, the fall back to the original, and
//a sprite drawn at half its pixel size
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ImageCache, hdScale } from "../src/view/map/imagecache";
import { uiSettings } from "../src/app/settings";
import { drawMap, type Images, type Scene } from "../src/view/map/mapdraw";
import { handWorld } from "./coreworld";
import { mapUnits } from "../src/view/map/mapview";

class FakeImage {
	static asked: string[] = [];
	complete = false;
	width = 0;
	height = 0;
	onload: (() => void) | null = null;
	onerror: (() => void) | null = null;
	#src = "";
	get src() { return this.#src; }
	set src(v: string) {
		this.#src = v;
		FakeImage.asked.push(v);
	}
	//the file arrives (its size set) or fails
	finish(size: { width: number; height: number } | null) {
		this.complete = true;
		if (size === null) this.onerror?.();
		else {
			Object.assign(this, size);
			this.onload?.();
		}
	}
}

const MAP = "resources/maps/images/map_12.png", UNIT = "resources/units/images/pa909.png", FLAGS = "resources/ui/flags.png";

beforeEach(() => {
	FakeImage.asked = [];
	vi.stubGlobal("Image", FakeImage);
});
afterEach(() => {
	vi.unstubAllGlobals();
	uiSettings.hdGraphics = true;
	uiSettings.useRetina = false;
});

test("With high resolution on a 2x screen the map and units load their @2x file (#462)", () => {
	const cache = new ImageCache(() => undefined, 2);
	for (const file of [MAP, UNIT, FLAGS]) cache.get(file);
	expect(FakeImage.asked).toEqual(["/hd/maps/images/map_12.webp", "/hd/units/images/pa909.webp", FLAGS]);
});

test("A missing @2x file falls back to the original once, and neither is asked for again (#462)", () => {
	const cache = new ImageCache(() => undefined, 2);
	expect(cache.get(UNIT)).toBeNull();
	const img = cache.images.get(UNIT) as unknown as FakeImage;
	img.finish(null);
	expect(FakeImage.asked).toEqual(["/hd/units/images/pa909.webp", UNIT]);
	img.finish(null); //the original fails too: nothing more is asked
	cache.get(UNIT);
	cache.get(UNIT);
	expect(FakeImage.asked).toHaveLength(2);
});

test("With the setting off or on a 1x screen only the original is requested (#462)", () => {
	const flat = new ImageCache(() => undefined, 1);
	flat.get(MAP);
	flat.get(UNIT);
	expect(FakeImage.asked).toEqual([MAP, UNIT]);
	vi.stubGlobal("devicePixelRatio", 2);
	expect(hdScale()).toBe(2);
	uiSettings.hdGraphics = false;
	expect(hdScale()).toBe(1);
	uiSettings.hdGraphics = true;
	uiSettings.useRetina = true;
	expect(hdScale()).toBe(1);
	uiSettings.useRetina = false;
	vi.stubGlobal("devicePixelRatio", 1);
	expect(hdScale()).toBe(1);
});

test("An @2x image is drawn at half its pixel size, so the layout is the same (#462)", () => {
	const w = handWorld({ rows: 10, cols: 10, units: [{ eqid: 140, owner: 0, row: 4, col: 1, facing: 12 }] }, undefined, { spotSide: 0 });
	const icon = mapUnits(w, false, 0)[0].icon;
	const drawn = (cache: ImageCache, sheet: { width: number; height: number }, terrain: { width: number; height: number }) => {
		const calls: unknown[][] = [];
		const ctx = new Proxy({}, {
			get: (_t, name) => (...args: unknown[]) => {
				if (name === "drawImage") calls.push(args);
				return name === "measureText" ? { width: 10 } : undefined;
			},
			set: () => true,
		}) as unknown as CanvasRenderingContext2D;
		const images: Images = (f) => cache.get(f);
		for (const [file, size] of [[icon, sheet], [MAP, terrain]] as const) {
			cache.get(file);
			(cache.images.get(file) as unknown as FakeImage).finish(size);
		}
		const scene: Scene = { terrain: images(MAP), size: { width: 600, height: 600 }, rows: 10, cols: 10, grid: false, units: mapUnits(w, false, 0),
			selection: null, path: null, fog: null, support: null, plaques: [], strategic: null, deploy: null, ghost: null };
		drawMap(ctx, scene, { x: 0, y: 0, width: 600, height: 400, scale: 1, dpr: 1 }, images);
		return { map: calls[0].slice(1), frame: calls.find((a) => a.length === 9)!.slice(1) };
	};
	const hd = drawn(new ImageCache(() => undefined, 2), { width: 1440, height: 100 }, { width: 1200, height: 1200 });
	expect(hd.map).toEqual([0, 0, 600, 600]);
	expect(hd.frame).toEqual([4 * 160, 0, 160, 100, expect.any(Number), expect.any(Number), 80, 50]); //facing 12: frame 4 mirrored
	const flat = drawn(new ImageCache(() => undefined, 1), { width: 720, height: 50 }, { width: 600, height: 600 });
	expect(flat.map).toEqual([0, 0]); //(drawn whole, as it is)
	expect(flat.frame).toEqual([4 * 80, 0, 80, 50, expect.any(Number), expect.any(Number), 80, 50]);
});
