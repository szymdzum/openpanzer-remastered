//The map (#345): the canvas the map is drawn on (src/view/mapdraw.ts) under a scrolling layer that takes
//the pointer, and over it the move path's tag (MovePath) and the selected unit's context menu (UnitContext, #346). A click selects, moves or attacks through the
//store (src/view/store.ts), which asks the view model (src/view/mapview.ts) what it does. The canvas is
//drawn again, once a frame at most, when what it shows changes: the world, the selection, the hovered
//hex, the scroll, the window's size, an image that loaded.
import { effect } from "@preact/signals";
import { useEffect, useRef, useState } from "preact/hooks";
import type { Position, World } from "../core/types";
import { sideOf } from "../core/world";
import { Anchored } from "./anchored";
import { UnitContextMenu } from "./contextmenu";
import type { Ghost } from "./deploy";
import { Icon } from "./icon";
import { cellAt, gridSize, hexCentre, type Point } from "./hexgrid";
import { fitViewport, toScreen, type Viewport } from "./canvas";
import { drawMap, type Images, type Scene } from "./mapdraw";
import type { Store } from "./store";
import { TOKENS } from "./tokens";

type Picture = HTMLImageElement;

//Where the map is on the screen (the screen's top left corner in the map's screen pixels) and its size there
type View = Point & { width: number; height: number };

//The map's images by file: the terrain and the sprite strips, loaded once, then drawn
class ImageCache {
	declare images: Map<string, Picture>;
	declare loaded: () => void;

	constructor(loaded: () => void) {
		this.images = new Map();
		this.loaded = loaded;
	}

	//The image when it has loaded, else null and its load started (a file that fails stays not drawn)
	get(file: string): Picture | null {
		const img = this.images.get(file);
		if (img !== undefined) return img.complete && img.width > 0 ? img : null;
		const fresh = new Image();
		fresh.onload = this.loaded;
		fresh.src = file;
		this.images.set(file, fresh);
		return null;
	}
}

//The strategic map fits the map under the status bar, so no objective hides behind it (StrategicMap): the
//bar's foot from the map's top, and a little air, 0 without a bar
function underStatusBar(scroller: HTMLElement): number {
	const bar = scroller.closest(".pm-screen")?.querySelector(".pm-status");
	if (bar === null || bar === undefined) return 0;
	return Math.max(0, bar.getBoundingClientRect().bottom - scroller.getBoundingClientRect().top) + TOKENS.px["space-1"];
}

//Draws the store's map on the canvas, at most once a frame, and takes the pointer on the layer over it:
//the hovered hex, a click on a hex. Attached while the map is on the page
class Painter {
	declare store: Store;
	declare cache: ImageCache;
	declare canvas: HTMLCanvasElement | null;
	declare scroller: HTMLElement | null;
	declare pending: boolean;
	declare onView: (view: View) => void;
	declare view: View;
	declare looked: { data: World["data"] | null; look: Position | null };

	constructor(store: Store, onView: (view: View) => void) {
		this.store = store;
		this.canvas = null;
		this.scroller = null;
		this.pending = false;
		this.onView = onView;
		this.view = { x: 0, y: 0, width: 0, height: 0 };
		this.looked = { data: null, look: null };
		this.cache = new ImageCache(() => this.request());
	}

	//On the page: drawn when what it shows changes, the pointer taken. Returns the detach
	attach(canvas: HTMLCanvasElement, scroller: HTMLElement): () => void {
		this.canvas = canvas;
		this.scroller = scroller;
		const s = this.store;
		const watch = effect(() => {
			//(read: a change to any of them draws again)
			void [s.world.value, s.units.value, s.selection.value, s.path.value, s.scale.value, s.fog.value, s.support.value, s.plaques.value,
				s.overview.value, s.deployment.value, s.ghost.value, s.hexGrid.value];
			this.request();
		});
		const redraw = () => this.request();
		const move = (e: MouseEvent) => s.hoverHex(this.cellOf(e));
		const leave = () => s.hoverHex(null);
		const click = (e: MouseEvent) => {
			const at = this.cellOf(e);
			if (at !== null) s.clickHex(at);
		};
		addEventListener("resize", redraw);
		scroller.addEventListener("mousemove", move);
		scroller.addEventListener("mouseleave", leave);
		scroller.addEventListener("click", click);
		void document.fonts?.ready.then(redraw);
		return () => {
			watch();
			removeEventListener("resize", redraw);
			scroller.removeEventListener("mousemove", move);
			scroller.removeEventListener("mouseleave", leave);
			scroller.removeEventListener("click", click);
			this.canvas = this.scroller = null;
		};
	}

	//The hex under the pointer, null off the map
	cellOf(e: MouseEvent): Position | null {
		const w = this.store.world.peek(), s = this.scroller;
		if (w === null || s === null) return null;
		const box = s.getBoundingClientRect(), vp = this.viewport(s);
		const p = { x: (e.clientX - box.left + vp.x) / vp.scale, y: (e.clientY - box.top + vp.y) / vp.scale };
		return cellAt(p, w.state.map.rows, w.state.map.cols);
	}

	request() {
		if (this.pending) return;
		this.pending = true;
		requestAnimationFrame(() => {
			this.pending = false;
			this.draw();
		});
	}

	//The map's size on the screen at a scale: its scale, or 1 for its own pixels
	size(scale = this.store.scale.peek()): { width: number; height: number } {
		const w = this.store.world.peek();
		return mapSize(w, w === null ? null : this.cache.get(w.data.image), scale);
	}

	//The screen's top left corner in the map's screen pixels: the scroll, less half the room left round a map
	//smaller than the screen, which is centred in it, as the old UI centres it
	origin(s: HTMLElement): Point {
		const size = this.size();
		return { x: s.scrollLeft - Math.max(0, (s.clientWidth - size.width) / 2), y: s.scrollTop - Math.max(0, (s.clientHeight - size.height) / 2) };
	}

	//The part of the map on the screen: what the scroll shows, or the whole map on the strategic map
	viewport(s: HTMLElement): Viewport {
		const dpr = devicePixelRatio || 1;
		if (this.store.strategic.peek()) return fitViewport(this.size(1), { width: s.clientWidth, height: s.clientHeight }, underStatusBar(s), dpr);
		const o = this.origin(s);
		return { x: o.x, y: o.y, width: s.clientWidth, height: s.clientHeight, scale: this.store.scale.peek(), dpr };
	}

	//Tells the component where the map is on the screen when that changed: the path's tag follows it
	report(vp: Viewport, size: { width: number; height: number }) {
		const v = this.view;
		if (vp.x === v.x && vp.y === v.y && size.width === v.width && size.height === v.height) return;
		this.view = { x: vp.x, y: vp.y, ...size };
		this.onView(this.view);
	}

	draw() {
		const w = this.store.world.peek(), canvas = this.canvas, s = this.scroller;
		if (canvas === null || s === null) return;
		const vp = this.viewport(s);
		this.report(vp, this.size());
		const width = Math.round(vp.width * vp.dpr), height = Math.round(vp.height * vp.dpr);
		if (canvas.width !== width || canvas.height !== height) {
			canvas.width = width;
			canvas.height = height;
		}
		const c = canvas.getContext("2d");
		if (c !== null && w !== null) drawMap(c, this.scene(w, this.size(1)), vp, (f) => this.image(f));
	}

	//A sprite or the terrain, once it has loaded
	image(file: string): ReturnType<Images> {
		return this.cache.get(file);
	}

	//What the canvas draws now, from the store
	scene(w: World, size: { width: number; height: number }): Scene {
		const s = this.store;
		return { terrain: this.image(w.data.image), size, rows: w.state.map.rows, cols: w.state.map.cols, grid: s.hexGrid.peek(), units: s.units.peek(),
			selection: s.selection.peek(), path: s.path.peek(), fog: s.fog.peek(), support: s.support.peek(), plaques: s.plaques.peek(),
			strategic: s.overview.peek(), deploy: s.deployment.peek(), ghost: s.ghost.peek() };
	}

	//Where the map looks, when the scenario or the look asked changes (not when the side's first unit moves): the
	//hex a program looks at, else the side's first unit
	follow(data: World["data"] | null, look: Position | null, start: Position | null) {
		if (this.looked.data === data && this.looked.look === look) return;
		this.looked = { data, look };
		const at = look !== null ? look : start;
		if (at !== null) this.lookAt(at);
	}

	//A hex in the middle of the screen
	lookAt(at: Position) {
		const s = this.scroller;
		if (s === null) return;
		const c = hexCentre(at.row, at.col), scale = this.store.scale.peek();
		s.scrollLeft = c.x * scale - s.clientWidth / 2;
		s.scrollTop = c.y * scale - s.clientHeight / 2;
	}
}

//The first unit of the side shown, where the map looks when a scenario starts
function firstOwnUnit(w: World): Position | null {
	const u = w.state.units.find((x) => x.row >= 0 && sideOf(w, x) === w.spotSide);
	return u === undefined ? null : { row: u.row, col: u.col };
}

//The map's size on the screen: the terrain image's (the grid's half hexes at its edges reach past it), or the
//grid's until it has loaded, at the map's scale
function mapSize(w: World | null, terrain: Picture | null, scale: number): { width: number; height: number } {
	if (w === null) return { width: 0, height: 0 };
	const size = terrain !== null ? terrain : gridSize(w.state.map.rows, w.state.map.cols);
	return { width: size.width * scale, height: size.height * scale };
}

//The move path's tag under its end (MovePath): what happens, then what it costs
function PathTag({ store, at }: { store: Store; at: Point }) {
	const path = store.path.value;
	if (path === null) return null;
	return (
		<Anchored hex={at} place="below" gap={14} class={path.stop ? "pm-pathtag stop" : "pm-pathtag"}>
			<output>{path.lines.map((l, i) => i === 0 ? <b key={i}>{l.text}</b> : <span key={i} class={l.tone || undefined}>{l.text}</span>)}</output>
		</Anchored>
	);
}

export function MapView({ store }: { store: Store }) {
	const canvas = useRef<HTMLCanvasElement>(null);
	const scroller = useRef<HTMLDivElement>(null);
	//(where the map is on the screen, after each draw that moved it: the tag follows, a terrain that loaded sizes the map)
	const [view, setView] = useState<View>({ x: 0, y: 0, width: 0, height: 0 });
	const [painter] = useState(() => new Painter(store, setView));
	const w = store.world.value, scale = store.scale.value, look = store.lookAt.value;

	useEffect(() => painter.attach(canvas.current!, scroller.current!), [painter]);

	//(the strategic map scrolls nothing: the scroll stays as it was for when it closes, map.css)
	const strategic = store.strategic.value;

	//A new scenario: the map looks at the side's first unit; a program's look at a hex (the tutorial's)
	const data = w === null ? null : w.data;
	const start = w === null ? null : firstOwnUnit(w);
	useEffect(() => painter.follow(data, look, start), [painter, data, look, start]);

	const terrain = w === null ? null : painter.cache.get(w.data.image);
	const size = mapSize(w, terrain, scale);
	const path = store.path.value;
	const end = path === null ? null : path.cells[path.cells.length - 1];
	const ghost = store.ghost.value;
	//(the selected unit's actions above its hex, UnitContext)
	const menu = store.context.value;
	const vp = { x: view.x, y: view.y, width: 0, height: 0, scale, dpr: 1 };
	return (
		<div class={strategic ? "pm-mapview strategic" : "pm-mapview"}>
			<canvas ref={canvas} class="pm-mapview-canvas" aria-hidden="true" />
			<div ref={scroller} class="pm-mapview-scroll" role="application" aria-label={strategic ? "Strategic map" : "Map"}
				onScroll={() => painter.request()}>
				<div class="pm-mapview-area" style={{ inlineSize: size.width + "px", blockSize: size.height + "px" }} />
			</div>
			{end !== null && <PathTag store={store} at={toScreen(hexCentre(end.row, end.col), vp)} />}
			{menu !== null && <UnitContextMenu store={store} at={toScreen(hexCentre(menu.at.row, menu.at.col), vp)}
				gap={TOKENS.px["hex-h"] / 2 * scale + 4} />}
			{ghost !== null && <PlaceTag ghost={ghost} at={toScreen(hexCentre(ghost.row, ghost.col), vp)} gap={TOKENS.px["hex-w"] / 2 * scale + 6} />}
		</div>
	);
}

//The placing tag beside the hovered hex (Deployment): what a click does, how the unit lands, that it stays there
function PlaceTag({ ghost, at, gap }: { ghost: Ghost; at: Point; gap: number }) {
	return (
		<Anchored hex={at} place="beside" gap={gap} class="pm-placetag">
			<output><span class="t"><Icon name="deploy" size="sm" />{ghost.title}</span><span class="s">{ghost.note}</span></output>
		</Anchored>
	);
}
