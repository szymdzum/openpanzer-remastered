//The map's images by file, and the @2x files the map and the units are drawn from on high density screens.
import { uiSettings } from "../../app/settings";

export type Picture = HTMLImageElement;

//An image with the size it has once loaded, as the canvas draws it
export type Sized = CanvasImageSource & { width: number; height: number };

//Pixels per drawn pixel of the images that came from their @2x file (2); the others aren't in it (1)
const scales = new WeakMap<object, number>();

/** How many of the image's pixels make one of the map's: 2 for an image loaded from its @2x file. */
export const scaleOf = (img: object): number => scales.get(img) ?? 1;

/** The image's size in the map's pixels, the same whichever file it was loaded from. */
export function sizeOf(img: Sized): { width: number; height: number } {
	const k = scaleOf(img);
	return { width: img.width / k, height: img.height / k };
}

/** Draws the whole image from the map's origin at its size in the map's pixels. */
export function drawWhole(c: CanvasRenderingContext2D, img: Sized) {
	if (scaleOf(img) === 1) c.drawImage(img, 0, 0);
	else c.drawImage(img, 0, 0, img.width / scaleOf(img), img.height / scaleOf(img));
}

/**
 * 2 when the @2x files are used: the setting is on, useRetina is off (the page already runs at device pixels)
 * and the screen has 1.5 device pixels or more per pixel.
 */
export function hdScale(): number {
	if (!uiSettings.hdGraphics || uiSettings.useRetina) return 1;
	return (globalThis.devicePixelRatio || 1) >= 1.5 ? 2 : 1;
}

//The @2x file of a map or unit image, which scripts/upscale-assets.sh generates into public/hd/:
//resources/units/images/pa909.png -> /hd/units/images/pa909.webp. null for any other image
function hdPath(file: string): string | null {
	if (!file.startsWith("resources/maps/images/") && !file.startsWith("resources/units/images/")) return null;
	return "/hd/" + file.slice("resources/".length).replace(/\.png$/, ".webp");
}

/** The map's images by file: the terrain and the sprite strips, loaded once, then drawn. */
export class ImageCache {
	declare images: Map<string, Picture>;
	declare loaded: () => void;
	declare scale: number;

	constructor(loaded: () => void, scale = hdScale()) {
		this.images = new Map();
		this.loaded = loaded;
		this.scale = scale;
	}

	/** The image when it has loaded, else null and its load started (a file that fails stays not drawn). */
	get(file: string): Picture | null {
		const img = this.images.get(file);
		if (img !== undefined) return img.complete && img.width > 0 ? img : null;
		const fresh = new Image();
		fresh.onload = this.loaded;
		this.images.set(file, fresh);
		this.start(fresh, file);
		return null;
	}

	//(a map or unit image tries its @2x file first; a missing one falls back to the original, once: the image is
	//kept by the original file, so neither is asked for again)
	start(img: Picture, file: string) {
		const hd = this.scale > 1 ? hdPath(file) : null;
		if (hd === null) {
			img.src = file;
			return;
		}
		scales.set(img, 2);
		img.onerror = () => {
			scales.set(img, 1);
			img.onerror = null;
			img.src = file;
		};
		img.src = hd;
	}
}
