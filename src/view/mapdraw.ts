//The map's canvas (#345): the terrain, the hex grid, the fog, the air rings, the move area, the zones, the
//targets, the support fire, the selection, the move path, the units and their markers, the plaques, in the
//MapOverlays card's order. It draws what the map's view model (src/view/mapview.ts, mapinfo.ts) computed and decides nothing. Colours and line widths are the tokens'
//(src/view/tokens.ts), the same in both themes.
//
//The canvas is the size of the screen, at the device's pixels (sharp on HiDPI, #31), and draws the part of
//the map in view. The terrain and the sprites scale with the map (ZoomLevels); everything drawn on top
//keeps its screen size: a line's path is laid out at the map's scale, then stroked at the screen's, so its
//width is the token's in screen pixels, and the markers and the path's ring are drawn at screen points.
import { addEdge, addHex, addHexesInView, atMap, atScreen, fillHexes, nearView, sideColour, strokeLine, toScreen, type Viewport, withAlpha } from "./canvas";
import { hexCentre, type Point } from "./hexgrid";
import type { Plaque, Support } from "./mapinfo";
import type { Marker, MapUnit, Path, Selection } from "./mapview";
import type { Deployment, Ghost } from "./deploy";
import { drawDeployZone, drawFog, drawHatch, drawPlaceOutline, drawPlaques, drawSupport, drawZones } from "./overlays";
import type { Strategic } from "./strategic";
import { drawStrategic } from "./strategicdraw";
import { TOKENS } from "./tokens";

const MAP = TOKENS.map, PX = TOKENS.px;

//What the canvas draws
export interface Scene {
	terrain: CanvasImageSource | null;
	size: { width: number; height: number }; //the map's, in its own pixels: nothing is drawn past it
	rows: number;
	cols: number;
	grid: boolean; //the hex grid setting
	units: MapUnit[];
	selection: Selection | null;
	path: Path | null;
	fog: Uint8Array | null; //1 on each hex the side shown doesn't see (src/view/mapinfo.ts)
	support: Support | null; //the guns that fire if the hovered target is attacked
	plaques: Plaque[];
	flags?: string; //the flag strip the plaques' flags come from (src/view/mapinfo.ts flagStrip); none drawn without it
	strategic: Strategic | null; //the strategic map instead of the rest, the map fit to the window (src/view/strategic.ts)
	deploy: Deployment | null; //the deployment zone while a reserve unit is picked (src/view/deploy.ts)
	ghost: Ghost | null; //the picked reserve unit on the hovered hex where a click places it
	//The old map's two settings (#464): the hexes of the units of the player whose turn it is tinted (Mark own units on
	//map), the enemy's strength plates in red (Mark enemy strength in red); both off when not given
	marks?: { own: boolean; enemy: boolean };
}

//A sprite strip or the bridge by its file, null until it has loaded
export type Images = (file: string) => (CanvasImageSource & { width: number; height: number }) | null;

//The bridge drawn instead of a ground unit on a bridge of its side
export const BRIDGE = "resources/units/images/bridg.png";

function drawGrid(c: CanvasRenderingContext2D, vp: Viewport, rows: number, cols: number) {
	addHexesInView(c, vp, rows, cols, () => true);
	atScreen(c, vp);
	c.globalAlpha = 0.35;
	c.strokeStyle = MAP["hex-shadow"];
	c.lineWidth = 1;
	c.stroke();
	c.globalAlpha = 1;
}

//The move area's tint, the one outline round it, the targets and the selected hex
function drawSelection(c: CanvasRenderingContext2D, vp: Viewport, sel: Selection, support: Support | null) {
	const unseen = new Set(sel.unseen.map((h) => h.row * 65536 + h.col));
	fillHexes(c, vp, sel.area.filter((h) => !unseen.has(h.row * 65536 + h.col)), MAP["hex-move"], 0.16);
	drawHatch(c, vp, sel.unseen);
	if (sel.outline.length > 0) {
		atMap(c, vp);
		c.beginPath();
		for (const e of sel.outline) addEdge(c, e);
		c.lineCap = "round";
		strokeLine(c, vp, MAP["hex-move"], PX["hex-move-width"], PX["hex-move-width"] + 2);
	}
	drawZones(c, vp, sel.zones);
	fillHexes(c, vp, sel.targets, MAP["hex-target"], 0.12);
	if (sel.targets.length > 0) {
		atMap(c, vp);
		c.beginPath();
		for (const t of sel.targets) addHex(c, t);
		c.lineCap = "butt";
		strokeLine(c, vp, MAP["hex-target"], PX["hex-target-width"], PX["hex-target-width"] + 2.6, [5, 3]);
	}
	if (support !== null) drawSupport(c, vp, support);
	atMap(c, vp);
	c.beginPath();
	addHex(c, sel.at);
	strokeLine(c, vp, MAP["hex-select"], PX["hex-select-width"], PX["hex-shadow-width"]);
}

//A part of the path, seen or not: dotted where the side sees the hexes, dashed past the edge of what it sees
function pathPart(c: CanvasRenderingContext2D, vp: Viewport, path: Path, seen: boolean) {
	atMap(c, vp);
	c.beginPath();
	let any = false;
	for (let i = 1; i < path.cells.length; i++) {
		const a = path.cells[i - 1], b = path.cells[i];
		if ((a.seen && b.seen) !== seen) continue;
		const p = hexCentre(a.row, a.col), q = hexCentre(b.row, b.col);
		c.moveTo(p.x, p.y);
		c.lineTo(q.x, q.y);
		any = true;
	}
	if (any) strokeLine(c, vp, MAP["hex-move"], 2.5, 5, seen ? [1, 6] : [6, 4]);
}

function circle(c: CanvasRenderingContext2D, p: Point, r: number) {
	c.beginPath();
	c.arc(p.x, p.y, r, 0, Math.PI * 2);
}

//The ring at the end with the moves left (light: the unit can move again), or the stop square of an enemy zone
function drawPathEnd(c: CanvasRenderingContext2D, end: Point, path: Path) {
	if (path.stop) {
		c.lineWidth = 4;
		c.globalAlpha = 0.6;
		c.strokeStyle = MAP["hex-shadow"];
		c.strokeRect(end.x - 7, end.y - 7, 14, 14);
		c.globalAlpha = 1;
		c.fillStyle = MAP["hex-target"];
		c.fillRect(end.x - 7, end.y - 7, 14, 14);
		c.lineWidth = 1.6;
		c.strokeStyle = MAP["hex-move"];
		c.strokeRect(end.x - 7, end.y - 7, 14, 14);
		c.fillStyle = MAP.glint;
		c.fillRect(end.x - 3.5, end.y - 1, 7, 2);
		return;
	}
	circle(c, end, 10);
	c.globalAlpha = 0.55;
	c.fillStyle = MAP["hex-shadow"];
	c.fill();
	c.globalAlpha = 1;
	circle(c, end, 8.5);
	c.fillStyle = path.again ? MAP["hex-move"] : MAP["hex-select"];
	c.fill();
	c.lineWidth = 1.4;
	c.strokeStyle = MAP["hex-shadow"];
	c.stroke();
	c.font = "bold 11px " + TOKENS.fonts.mono;
	c.textAlign = "center";
	c.textBaseline = "middle";
	c.fillStyle = MAP["hex-shadow"];
	c.fillText(String(path.left), end.x, end.y + 0.5);
}

//The move path (MovePath): the route from hex centre to hex centre, a dot on each hex passed, its end
function drawPath(c: CanvasRenderingContext2D, vp: Viewport, path: Path) {
	c.lineCap = "round";
	pathPart(c, vp, path, true);
	pathPart(c, vp, path, false);
	atScreen(c, vp);
	for (const cell of path.cells.slice(1, -1)) {
		circle(c, toScreen(hexCentre(cell.row, cell.col), vp), 2.6);
		c.fillStyle = MAP["hex-move"];
		c.fill();
		c.lineWidth = 1.2;
		c.strokeStyle = MAP["hex-shadow"];
		c.stroke();
	}
	const last = path.cells[path.cells.length - 1];
	drawPathEnd(c, toScreen(hexCentre(last.row, last.col), vp), path);
}

//The old map's marks (#464), none when the scene doesn't give them
const NO_MARKS = { own: false, enemy: false };
const marksOf = (scene: Scene) => scene.marks === undefined ? NO_MARKS : scene.marks;

//Mark own units on map (#464): the hexes of the units of the player whose turn it is tinted, as the old map's ownunit
//hexes were
function drawOwnTint(c: CanvasRenderingContext2D, vp: Viewport, units: MapUnit[], on: boolean) {
	if (on) fillHexes(c, vp, units.filter((u) => u.current), MAP["map-axis"], 0.3);
}

//The air ring round each aircraft on top in the air layer (AirLayer): a light fill and a dashed line at screen size
function drawAirRings(c: CanvasRenderingContext2D, vp: Viewport, units: MapUnit[]) {
	const lifted = units.filter((u) => u.lifted);
	if (lifted.length === 0) return;
	fillHexes(c, vp, lifted, MAP["hex-air-fill"], 1);
	atMap(c, vp);
	c.beginPath();
	for (const u of lifted) addHex(c, u);
	atScreen(c, vp);
	c.setLineDash([4, 3]);
	c.strokeStyle = MAP["hex-air"];
	c.lineWidth = PX["hex-air-width"];
	c.stroke();
	c.setLineDash([]);
}

//How far an aircraft on top in the air layer is lifted, and its shadow on the ground, in the map's pixels (AirLayer)
const LIFT = 4, SHADOW = { y: 9, blur: 2, alpha: 0.45 };
//How far a unit's sprite stands above its hex's centre: a moving sprite and an explosion on it are drawn there too
export const SPRITE_RAISE = 8;

//A unit's sprite: the strip has nine facings from south to north, the other seven are mirrored. Drawn at the
//map's scale, its centre a little above the hex's to leave room for the marker. The other layer's unit is
//dimmed to 75% (unit-under-alpha) when under another on a shared hex; an aircraft on top in the air layer is lifted, its shadow on the ground under it (a canvas
//shadow is in the device's pixels, whatever the transform)
function drawSprite(c: CanvasRenderingContext2D, vp: Viewport, u: MapUnit, images: Images) {
	const img = images(u.bridge ? BRIDGE : u.icon);
	if (img === null) return;
	const w = img.width / 9, h = img.height, o = hexCentre(u.row, u.col);
	const mirror = u.facing > 8, frame = mirror ? 16 - u.facing : u.facing;
	const x = Math.floor(o.x - w / 2), y = Math.floor(o.y - h / 2 - SPRITE_RAISE - (u.lifted ? LIFT : 0));
	c.save();
	if (u.dim) c.globalAlpha = PX["unit-under-alpha"];
	if (u.lifted) {
		const px = vp.scale * vp.dpr;
		c.shadowColor = withAlpha(MAP.shade, SHADOW.alpha);
		c.shadowOffsetY = SHADOW.y * px;
		c.shadowBlur = SHADOW.blur * px;
	}
	if (mirror) {
		c.translate(x + w / 2, 0);
		c.scale(-1, 1);
		c.translate(-(x + w / 2), 0);
	}
	c.drawImage(img, w * frame, 0, w, h, x, y, w, h);
	c.restore();
}

//The picked reserve unit on the hex where a click places it, at 55% (Deployment)
function drawGhost(c: CanvasRenderingContext2D, vp: Viewport, g: Ghost, images: Images) {
	c.save();
	c.globalAlpha = 0.55;
	drawSprite(c, vp, { id: -1, row: g.row, col: g.col, icon: g.icon, facing: g.facing, side: -1, bridge: false, marker: null, dim: false, chip: null,
		lifted: false, current: false }, images);
	c.restore();
}

//An arrow: the unit can still move
function drawMoveMark(c: CanvasRenderingContext2D, x: number, y: number) {
	c.lineWidth = 1.3;
	c.strokeStyle = MAP.glint;
	c.beginPath();
	c.moveTo(x - 3, y); c.lineTo(x + 2.5, y);
	c.moveTo(x, y - 2.5); c.lineTo(x + 2.8, y); c.lineTo(x, y + 2.5);
	c.stroke();
}

//A crosshair: the unit can still fire; crossed out in red without ammo
function drawFireMark(c: CanvasRenderingContext2D, x: number, y: number, noAmmo: boolean) {
	c.lineWidth = 1;
	c.strokeStyle = noAmmo ? MAP["hex-target"] : MAP.glint;
	c.beginPath();
	c.arc(x, y, 2.2, 0, Math.PI * 2);
	c.moveTo(x, y - 3.6); c.lineTo(x, y - 2.4); c.moveTo(x, y + 2.4); c.lineTo(x, y + 3.6);
	c.moveTo(x - 3.6, y); c.lineTo(x - 2.4, y); c.moveTo(x + 2.4, y); c.lineTo(x + 3.6, y);
	if (noAmmo) { c.moveTo(x - 3, y + 3); c.lineTo(x + 3, y - 3); }
	c.stroke();
}

//What the unit can still do, on the plate's left: an arrow to move, a crosshair to fire
function drawReadiness(c: CanvasRenderingContext2D, m: Marker, right: number, y: number) {
	const fire = m.canFire || m.noAmmo;
	const marks = (m.canMove ? 1 : 0) + (fire ? 1 : 0);
	if (marks === 0) return;
	const w = marks * 8 + 2, x = right - w - 1;
	c.globalAlpha *= 0.75;
	c.fillStyle = MAP["hex-shadow"];
	c.fillRect(x, y + 1, w, 9);
	c.globalAlpha /= 0.75;
	if (m.canMove) drawMoveMark(c, x + 5, y + 5.5);
	if (fire) drawFireMark(c, x + 5 + (m.canMove ? 8 : 0), y + 5.5, m.noAmmo);
}

//The strength plate in the side's colour: square for the side shown's units, pointed ends for the enemy's, in red with
//the old map's Mark enemy strength in red (#464)
function drawPlate(c: CanvasRenderingContext2D, m: Marker, side: number, x: number, y: number, w: number, enemyRed: boolean) {
	c.beginPath();
	if (m.own) c.rect(x, y, w, 11);
	else {
		c.moveTo(x - 2, y + 5.5); c.lineTo(x + 2, y); c.lineTo(x + w - 2, y);
		c.lineTo(x + w + 2, y + 5.5); c.lineTo(x + w - 2, y + 11); c.lineTo(x + 2, y + 11);
		c.closePath();
	}
	c.fillStyle = enemyRed && !m.own ? MAP["map-critical"] : sideColour(side);
	c.fill();
	c.globalAlpha *= 0.75;
	c.strokeStyle = MAP.shade;
	c.lineWidth = 1;
	c.stroke();
	c.globalAlpha /= 0.75;
	//(revealed by its fire from a hex the side doesn't see: a dotted outline, known to be there and no more)
	if (m.revealed) {
		c.setLineDash([1.5, 1.5]);
		c.strokeStyle = MAP.glint;
		c.stroke();
		c.setLineDash([]);
	}
	c.font = "bold 9px " + TOKENS.fonts.ui;
	c.textAlign = "center";
	c.textBaseline = "middle";
	c.fillStyle = MAP.glint;
	c.fillText(String(m.strength), x + w / 2, y + 6);
}

//Experience bars right of the plate, then the hits taken this turn: the defence they cost later attacks
function drawRight(c: CanvasRenderingContext2D, m: Marker, x: number, y: number) {
	if (m.bars > 0) {
		c.globalAlpha *= 0.75;
		c.fillStyle = MAP["hex-shadow"];
		c.fillRect(x, y + 10 - m.bars * 2.2, 7, m.bars * 2.2 + 1);
		c.globalAlpha /= 0.75;
		c.fillStyle = MAP["hex-select"];
		for (let b = 0; b < m.bars; b++) c.fillRect(x + 1, y + 8.6 - b * 2.2, 5, 1.4);
		x += 9;
	}
	if (m.hits === 0) return;
	const text = "−" + m.hits * 2;
	c.font = "bold 8px " + TOKENS.fonts.mono;
	const w = Math.ceil(c.measureText(text).width) + 4;
	c.fillStyle = MAP["map-critical"];
	c.fillRect(x, y, w, 11);
	c.strokeStyle = MAP.shade;
	c.lineWidth = 0.5;
	c.strokeRect(x, y, w, 11);
	c.textAlign = "start";
	c.textBaseline = "middle";
	c.fillStyle = MAP.glint;
	c.fillText(text, x + 2, y + 6);
}

//A sandbag per entrenchment level, under the plate
function drawSandbags(c: CanvasRenderingContext2D, levels: number, cx: number, y: number) {
	const left = cx - (levels * 6 - 1) / 2;
	c.lineWidth = 0.5;
	c.strokeStyle = MAP["map-edge"];
	c.fillStyle = MAP["map-sandbag"];
	for (let i = 0; i < levels; i++) {
		c.beginPath();
		c.roundRect(left + i * 6, y, 5, 3, 1.5);
		c.fill();
		c.stroke();
	}
}

//The marker under a unit at screen size (MapOverlays), the plate's top centre at p
function drawMarker(c: CanvasRenderingContext2D, u: MapUnit, m: Marker, enemyRed: boolean, p: Point) {
	const text = String(m.strength), w = text.length * 5 + 6;
	const x = Math.round(p.x - w / 2), y = Math.round(p.y);
	c.save();
	if (m.done) c.globalAlpha = 0.45;
	drawReadiness(c, m, x - (m.own ? 0 : 2), y);
	drawPlate(c, m, u.side, x, y, w, enemyRed);
	drawRight(c, m, x + w + (m.own ? 2 : 4), y);
	if (m.entrenchment > 0) drawSandbags(c, m.entrenchment, x + w / 2, y + 12);
	c.restore();
}

//The strength chip of a unit drawn under another on a shared hex: a small plate in its side's colour, up and
//right of the hex's centre, at screen size, where the top unit's sprite and marker leave room
function drawChip(c: CanvasRenderingContext2D, side: number, strength: number, p: Point) {
	const text = String(strength), w = text.length * 5 + 5, x = Math.round(p.x + 12), y = Math.round(p.y - 22);
	c.fillStyle = sideColour(side);
	c.fillRect(x, y, w, 10);
	c.strokeStyle = MAP.shade;
	c.lineWidth = 1;
	c.strokeRect(x, y, w, 10);
	c.font = "bold 8px " + TOKENS.fonts.ui;
	c.textAlign = "center";
	c.textBaseline = "middle";
	c.fillStyle = MAP.glint;
	c.fillText(text, x + w / 2, y + 5.5);
}

//The chips of the units drawn under another
function drawChips(c: CanvasRenderingContext2D, vp: Viewport, units: MapUnit[]) {
	for (const u of units)
		if (u.chip !== null) drawChip(c, u.side, u.chip, toScreen(hexCentre(u.row, u.col), vp));
}

//The canvas cleared (a copy of the ground put back when given), then the map's own pixels clipped: the grid's half hexes
//at the edges reach past the map image, the fog and the overlays stop at its edge
function begin(c: CanvasRenderingContext2D, scene: Scene, vp: Viewport, ground: CanvasImageSource | null = null) {
	c.setTransform(1, 0, 0, 1, 0, 0);
	c.clearRect(0, 0, vp.width * vp.dpr, vp.height * vp.dpr);
	c.imageSmoothingEnabled = false;
	if (ground !== null) c.drawImage(ground, 0, 0);
	c.save();
	atMap(c, vp);
	c.beginPath();
	c.rect(0, 0, scene.size.width, scene.size.height);
	c.clip();
}

//The grid and the fog over the terrain
function drawGroundMarks(c: CanvasRenderingContext2D, scene: Scene, vp: Viewport) {
	if (scene.grid) drawGrid(c, vp, scene.rows, scene.cols);
	if (scene.fog !== null) drawFog(c, vp, scene.fog, scene.rows, scene.cols);
}

//The flag strip the scene's plaques draw from, once it has loaded; none without one
const flagsImage = (scene: Scene, images: Images) => scene.flags === undefined ? null : images(scene.flags);

//Everything over the ground, in the card's order
function drawOverGround(c: CanvasRenderingContext2D, scene: Scene, vp: Viewport, images: Images) {
	//(only the units and the plaques that can show on the screen, in their order)
	const near = nearView(vp), units = scene.units.filter(near), plaques = scene.plaques.filter(near);
	const marks = marksOf(scene);
	drawOwnTint(c, vp, units, marks.own);
	drawAirRings(c, vp, units);
	if (scene.deploy !== null) drawDeployZone(c, vp, scene.deploy);
	if (scene.ghost !== null) drawPlaceOutline(c, vp, scene.ghost);
	if (scene.selection !== null) drawSelection(c, vp, scene.selection, scene.support);
	if (scene.path !== null) drawPath(c, vp, scene.path);
	//(the plaques beneath the units: a name never covers one, #438)
	drawPlaques(c, vp, plaques, flagsImage(scene, images));
	atMap(c, vp);
	for (const u of units) drawSprite(c, vp, u, images);
	if (scene.ghost !== null) drawGhost(c, vp, scene.ghost, images);
	atScreen(c, vp);
	for (const u of units)
		if (u.marker !== null) drawMarker(c, u, u.marker, marks.enemy, toScreen({ x: hexCentre(u.row, u.col).x, y: hexCentre(u.row, u.col).y + 12 }, vp));
	drawChips(c, vp, units);
}

//The whole map in view, cleared first
export function drawMap(c: CanvasRenderingContext2D, scene: Scene, vp: Viewport, images: Images) {
	begin(c, scene, vp);
	//(the strategic map shrinks the terrain: smoothed, not pixelated; then only its chips and objectives)
	c.imageSmoothingEnabled = scene.strategic !== null;
	if (scene.terrain !== null) c.drawImage(scene.terrain, 0, 0);
	if (scene.strategic !== null) {
		drawStrategic(c, vp, scene.strategic, images(scene.strategic.flags));
		c.restore();
		return;
	}
	drawGroundMarks(c, scene, vp);
	drawOverGround(c, scene, vp, images);
	c.restore();
}

//The map in two parts, for the layers the map keeps (src/view/layers.ts): the ground (the terrain, the grid and the fog),
//then the rest over a copy of it. Together they draw what drawMap draws, pixel for pixel: the rest sets every state it
//draws with, so it doesn't matter that the ground was drawn on another canvas. Not for the strategic map
export function drawGround(c: CanvasRenderingContext2D, scene: Scene, vp: Viewport) {
	begin(c, scene, vp);
	if (scene.terrain !== null) c.drawImage(scene.terrain, 0, 0);
	drawGroundMarks(c, scene, vp);
	c.restore();
}

export function drawOnGround(c: CanvasRenderingContext2D, ground: CanvasImageSource, scene: Scene, vp: Viewport, images: Images) {
	begin(c, scene, vp, ground);
	drawOverGround(c, scene, vp, images);
	c.restore();
}
