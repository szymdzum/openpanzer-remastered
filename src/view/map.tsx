//The map (#345): the canvas the map is drawn on (src/view/mapdraw.ts) under a scrolling layer that takes
//the pointer, and the move path's tag (MovePath) over it. A click selects, moves or attacks through the
//store (src/view/store.ts), which asks the view model (src/view/mapview.ts) what it does. The canvas is
//drawn again, once a frame at most, when what it shows changes: the world, the selection, the hovered
//hex, the scroll, the window's size, an image that loaded.
import { effect } from "@preact/signals";
import { useEffect, useRef, useState } from "preact/hooks";
import type { Position, World } from "../core/types";
import { sideOf } from "../core/world";
import { Anchored } from "./anchored";
import { cellAt, gridSize, hexCentre, type Point } from "./hexgrid";
import { drawMap, type Images, toScreen, type Viewport } from "./mapdraw";
import type { Store } from "./store";

type Picture = HTMLImageElement;

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

//The hex grid setting (Settings, D6), off until then
let hexGrid = false;
export function setHexGrid(on: boolean) {
	hexGrid = on;
}

//Draws the store's map on the canvas, at most once a frame, and takes the pointer on the layer over it:
//the hovered hex, a click on a hex. Attached while the map is on the page
class Painter {
	declare store: Store;
	declare cache: ImageCache;
	declare canvas: HTMLCanvasElement | null;
	declare scroller: HTMLElement | null;
	declare pending: boolean;
	declare onImage: () => void;
	declare looked: { data: World["data"] | null; look: Position | null };

	constructor(store: Store, onImage: () => void) {
		this.store = store;
		this.canvas = null;
		this.scroller = null;
		this.pending = false;
		this.onImage = onImage;
		this.looked = { data: null, look: null };
		this.cache = new ImageCache(() => {
			this.request();
			this.onImage();
		});
	}

	//On the page: drawn when what it shows changes, the pointer taken. Returns the detach
	attach(canvas: HTMLCanvasElement, scroller: HTMLElement): () => void {
		this.canvas = canvas;
		this.scroller = scroller;
		const s = this.store;
		const watch = effect(() => {
			//(read: a change to any of them draws again)
			void [s.world.value, s.units.value, s.selection.value, s.path.value, s.scale.value];
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
		const box = s.getBoundingClientRect(), scale = this.store.scale.peek();
		const p = { x: (e.clientX - box.left + s.scrollLeft) / scale, y: (e.clientY - box.top + s.scrollTop) / scale };
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

	viewport(s: HTMLElement): Viewport {
		return { x: s.scrollLeft, y: s.scrollTop, width: s.clientWidth, height: s.clientHeight, scale: this.store.scale.peek(),
			dpr: devicePixelRatio || 1 };
	}

	draw() {
		const w = this.store.world.peek(), canvas = this.canvas, s = this.scroller;
		if (canvas === null || s === null) return;
		const vp = this.viewport(s);
		const width = Math.round(vp.width * vp.dpr), height = Math.round(vp.height * vp.dpr);
		if (canvas.width !== width || canvas.height !== height) {
			canvas.width = width;
			canvas.height = height;
		}
		const c = canvas.getContext("2d");
		if (c === null || w === null) return;
		const images: Images = (file) => this.cache.get(file);
		drawMap(c, { terrain: images(w.data.image), rows: w.state.map.rows, cols: w.state.map.cols, grid: hexGrid,
			units: this.store.units.peek(), selection: this.store.selection.peek(), path: this.store.path.peek() }, vp, images);
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

//The map's size on the screen: the terrain image's, or the grid's until it has loaded, at the map's scale
function mapSize(w: World | null, terrain: Picture | null, scale: number): { width: number; height: number } {
	if (w === null) return { width: 0, height: 0 };
	const grid = gridSize(w.state.map.rows, w.state.map.cols);
	const width = Math.max(grid.width, terrain === null ? 0 : terrain.width);
	const height = Math.max(grid.height, terrain === null ? 0 : terrain.height);
	return { width: width * scale, height: height * scale };
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
	const [scroll, setScroll] = useState({ x: 0, y: 0 });
	//(an image that loaded may change the map's size: rendered again)
	const [, setImages] = useState(0);
	const [painter] = useState(() => new Painter(store, () => setImages((n) => n + 1)));
	const w = store.world.value, scale = store.scale.value, look = store.lookAt.value;

	useEffect(() => painter.attach(canvas.current!, scroller.current!), [painter]);

	//A new scenario: the map looks at the side's first unit; a program's look at a hex (the tutorial's)
	const data = w === null ? null : w.data;
	const start = w === null ? null : firstOwnUnit(w);
	useEffect(() => painter.follow(data, look, start), [painter, data, look, start]);

	const terrain = w === null ? null : painter.cache.get(w.data.image);
	const size = mapSize(w, terrain, scale);
	const path = store.path.value;
	const end = path === null ? null : path.cells[path.cells.length - 1];
	const vp = { x: scroll.x, y: scroll.y, width: 0, height: 0, scale, dpr: 1 };
	return (
		<div class="pm-mapview">
			<canvas ref={canvas} class="pm-mapview-canvas" aria-hidden="true" />
			<div ref={scroller} class="pm-mapview-scroll" role="application" aria-label="Map" onScroll={(e) => {
				const s = e.currentTarget;
				setScroll({ x: s.scrollLeft, y: s.scrollTop });
				painter.request();
			}}>
				<div class="pm-mapview-area" style={{ inlineSize: size.width + "px", blockSize: size.height + "px" }} />
			</div>
			{end !== null && <PathTag store={store} at={toScreen(hexCentre(end.row, end.col), vp)} />}
		</div>
	);
}
