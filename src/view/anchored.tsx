//A panel anchored to a hex (principles.md, Layout): the move path's tag below its end, the hex tooltip and the
//placing tag beside their hex. The map code gives the hex's centre on the screen; the panel
//measures itself and stays inside the screen, space-3 from its edges.
import type { AriaRole, ComponentChildren } from "preact";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { TOKENS } from "./tokens";

type Point = { x: number, y: number };
type Size = { width: number, height: number };

//the gap from the screen's edges
const EDGE = TOKENS.px["space-3"];

const clamp = (v: number, low: number, high: number) => Math.max(low, Math.min(v, high));

//The top left corner that keeps a box of this size on the screen: a box larger than the screen
//keeps its top left edge in view
export function clampToScreen(at: Point, size: Size, screen: Size, edge = EDGE): Point {
	return {
		x: clamp(at.x, edge, screen.width - edge - size.width),
		y: clamp(at.y, edge, screen.height - edge - size.height),
	};
}

type Place = "above" | "below" | "beside" | "before";

//Before the clamp: centred above or below the hex, or right of it (beside) or left of it (before) and centred on it, `gap`
//away from its centre
export function placeBy(hex: Point, size: Size, place: Place, gap: number): Point {
	if (place === "beside") return { x: hex.x + gap, y: hex.y - size.height / 2 };
	if (place === "before") return { x: hex.x - gap - size.width, y: hex.y - size.height / 2 };
	return { x: hex.x - size.width / 2, y: place === "above" ? hex.y - gap - size.height : hex.y + gap };
}

type AnchoredProps = {
	//the hex's centre, in the pixels of the screen the panel is placed on
	hex: Point,
	place: Place,
	//from the hex's centre to the panel's edge: half a hex at the map's zoom, and some air
	gap: number,
	//the screen's own class next to pm-panel: pm-pathtag, pm-placetag
	class?: string,
	role?: AriaRole,
	label?: string,
	children?: ComponentChildren,
	//the id the harness, the tests and the shortcuts find it by (#unit-context)
	id?: string,
	//a tooltip with its pointer (#gameToolTip) instead of a HUD panel
	tip?: boolean,
};

//Hidden for the one layout pass it takes to measure itself, then placed before the browser paints
export function Anchored({ hex: { x, y }, place, gap, class: extra, role, label, children, id, tip }: AnchoredProps) {
	const ref = useRef<HTMLDivElement>(null);
	const [at, setAt] = useState<Point | null>(null);
	useLayoutEffect(() => {
		const box = ref.current;
		const screen = (box.offsetParent as HTMLElement | null) ?? document.documentElement;
		const size = { width: box.offsetWidth, height: box.offsetHeight };
		const next = clampToScreen(placeBy({ x, y }, size, place, gap), size, { width: screen.clientWidth, height: screen.clientHeight });
		setAt((old) => old && old.x === next.x && old.y === next.y ? old : next);
	//new content may change the panel's size: measured again with it
	}, [x, y, place, gap, children]);
	const style = at ? { left: at.x + "px", top: at.y + "px" } : { visibility: "hidden" };
	const base = tip ? "pm-tip" : "pm-panel";
	return <div ref={ref} id={id} class={extra ? base + " " + extra : base} style={style} role={role} aria-label={label}>{children}</div>;
}
