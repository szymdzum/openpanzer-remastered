//The map's ground kept as a layer while the hex grid is on. The grid is about 2,300 hex paths at 1920 by 1080, ten
//times the rest of a frame; the ground (the terrain, the grid and the fog) changes with the scroll, the scale, the
//screen's size, the world's fog and the grid, not with the pointer or a beat. So while it stays, a frame puts back a
//copy of it and draws the rest over it. Measured in headless Chrome (the pull request has the numbers), a copy of the
//screen costs what drawing the terrain does: without the grid a layer saves nothing, and the scenery under a beat
//(everything but the moving sprite) would save only the units and their markers, a tenth of a frame, for a second
//canvas. Neither is kept.
//The layer is drawn again when anything it is drawn from changed, and only once the view stands still: during a scroll
//each frame is drawn as before, without the copy. The map's colours are the same in both themes (src/view/tokens.ts),
//so a theme changes no layer.
//Memory: 4 bytes a device pixel, 8 MB for 1920 by 1080, 33 MB at a device pixel ratio of 2, held while the grid is on.
//A screen larger than LAYER_BUDGET is drawn as before, without it.
import type { Viewport } from "./canvas";
import { drawGround, drawMap, drawOnGround, type Images, type Scene } from "./mapdraw";

//(a 4K screen at 1x, or 1920 by 1080 at 2x: 33 MB)
export const LAYER_BUDGET = 3840 * 2160;

//over: the attack cursor and a retreat's trail; motion: the beat playing; both none on the strategic map
export interface Frame {
	scene: Scene;
	vp: Viewport;
	images: Images;
	over: ((c: CanvasRenderingContext2D) => void) | null;
	motion: ((c: CanvasRenderingContext2D) => void) | null;
}

const sameKey = (a: readonly unknown[] | null, b: readonly unknown[]) => a !== null && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));

const viewKey = (vp: Viewport) => [vp.x, vp.y, vp.width, vp.height, vp.scale, vp.dpr];
const groundKey = (f: Frame) => [...viewKey(f.vp), f.scene.terrain, f.scene.size.width, f.scene.size.height, f.scene.rows, f.scene.cols,
	f.scene.fog];

export class MapLayers {
	declare make: () => HTMLCanvasElement | null;
	declare ground: HTMLCanvasElement | null;
	//what the ground was drawn from, and the view of the frame before
	declare key: readonly unknown[] | null;
	declare view: readonly unknown[] | null;

	constructor(make: () => HTMLCanvasElement | null) {
		this.make = make;
		this.ground = null;
		this.key = null;
		this.view = null;
	}

	//A frame on the map's canvas, the same pixels as drawn without the layer
	draw(c: CanvasRenderingContext2D, f: Frame) {
		const width = c.canvas.width, height = c.canvas.height, view = viewKey(f.vp), still = sameKey(this.view, view);
		this.view = view;
		if (f.scene.strategic !== null || !f.scene.grid || width * height > LAYER_BUDGET) this.release();
		else {
			const g = this.groundFor(f, width, height, still);
			if (g !== null) {
				drawOnGround(c, g, f.scene, f.vp, f.images);
				this.finish(c, f);
				return;
			}
		}
		drawMap(c, f.scene, f.vp, f.images);
		this.finish(c, f);
	}

	//The ground as the frame has it: kept, or drawn again when the view stands still; null to draw the frame without it
	groundFor(f: Frame, width: number, height: number, still: boolean): HTMLCanvasElement | null {
		const key = groundKey(f);
		if (this.ground !== null && this.ground.width === width && this.ground.height === height && sameKey(this.key, key)) return this.ground;
		if (!still) return null;
		if (this.ground === null) this.ground = this.make();
		const gc = this.ground === null ? null : this.ground.getContext("2d");
		if (gc === null) return null;
		this.ground!.width = width;
		this.ground!.height = height;
		drawGround(gc, f.scene, f.vp);
		this.key = key;
		return this.ground;
	}

	finish(c: CanvasRenderingContext2D, f: Frame) {
		if (f.over !== null) f.over(c);
		if (f.motion !== null) f.motion(c);
	}

	//The layer let go (the grid off, the strategic map, the map off the page)
	release() {
		if (this.ground !== null) this.ground.width = this.ground.height = 0;
		this.ground = null;
		this.key = null;
	}
}
