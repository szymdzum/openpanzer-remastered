//A beat as the map's canvas draws it (#347): the moving unit's sprite where the player has it (src/view/player.ts), a
//frame of a shot or an explosion on its hex, turned the way the unit fires (the strips face north). At the map's scale,
//over the units and the preview
import { directionToRadians } from "../prototypes";
import { atMap, type Viewport } from "./canvas";
import { hexCentre } from "./hexgrid";
import { type Images, SPRITE_RAISE } from "./mapdraw";
import type { Motion } from "./player";

//A sprite strip has nine facings from south to north; the other seven are the strip's mirrored. Its centre a little
//above the point, as the map draws a unit on its hex
function blitUnit(c: CanvasRenderingContext2D, img: NonNullable<ReturnType<Images>>, at: { x: number; y: number }, facing: number) {
	const frameW: number = img.width / 9, frameH: number = img.height, flip = facing > 8;
	c.save();
	c.translate(Math.floor(at.x), Math.floor(at.y - SPRITE_RAISE));
	if (flip) c.scale(-1, 1);
	c.drawImage(img, frameW * (flip ? 16 - facing : facing), 0, frameW, frameH, -frameW / 2, -frameH / 2, frameW, frameH);
	c.restore();
}

export function drawMotion(c: CanvasRenderingContext2D, vp: Viewport, m: Motion, images: Images) {
	atMap(c, vp);
	if (m.sprite !== null) {
		const img = images(m.sprite.icon);
		if (img !== null) blitUnit(c, img, m.sprite, m.sprite.facing);
	}
	if (m.effect === null) return;
	const sheet = images(m.effect.sheet.file);
	if (sheet === null) return;
	const width = m.effect.sheet.width, height: number = sheet.height, o = hexCentre(m.effect.at.row, m.effect.at.col);
	c.save();
	//(on the unit's sprite, not below it at the hex's centre)
	c.translate(o.x, o.y - SPRITE_RAISE);
	c.rotate(directionToRadians[m.effect.facing]);
	c.drawImage(sheet, width * m.effect.frame, 0, width, height, -width / 2, -height / 2, width, height);
	c.restore();
}
