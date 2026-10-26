//The containers everything sits in (docs/ui/components/Panel): the HUD panel over the map, the
//modal window with its header, body and footer, the flat scrim under it and the rubber stamp.
//Styled by src/view/panel.css.
import type { AriaRole, ComponentChildren, CSSProperties } from "preact";
import { useId, useLayoutEffect } from "preact/hooks";
import { Button } from "./button";

type Place = {
	//in the page's flow instead of placed over the map (the card's .static)
	static?: boolean,
	//the screen's own class next to the component's (pm-ctx, pm-status...)
	class?: string,
	//left and top from the map code, or the screen's layout
	style?: CSSProperties,
};

function classes(base: string, place: Place) {
	return [base, place.static && "static", place.class].filter(Boolean).join(" ");
}

//A HUD panel: opaque over the map, never translucent (principles.md, Color)
export function Panel({ children, role, label, id, ...place }: Place & {
	children?: ComponentChildren,
	role?: AriaRole,
	label?: string,
	//the id the harness, the tests and the shortcuts find it by (handoff.md, Element map)
	id?: string,
}) {
	return <div id={id} class={classes("pm-panel", place)} style={place.style} role={role} aria-label={label}>{children}</div>;
}

export function Stamp({ children, large, ok }: { children: ComponentChildren, large?: boolean, ok?: boolean }) {
	return <span class={["pm-stamp", large && "lg", ok && "ok"].filter(Boolean).join(" ")}>{children}</span>;
}

//The dimming under a modal window, a flat colour: a click on it is the caller's (the bottom sheet closes)
export function Scrim({ onClick }: { onClick?: () => void }) {
	//the keyboard closes the window with Esc instead: the scrim is no control of its own
	return <div class="pm-scrim" aria-hidden="true" onClick={onClick} />;
}

type WindowProps = Place & {
	title: ComponentChildren,
	//window titles are display type; a sheet over the map names its unit in title type
	heading?: "display" | "title",
	//a mark before the title (a unit's flag)
	lead?: ComponentChildren,
	//a line under the title, in small muted type
	sub?: ComponentChildren,
	//at most one per window, for flavour only (principles.md, Content)
	stamp?: string,
	//the rest of the header, before the close button
	tools?: ComponentChildren,
	children?: ComponentChildren,
	footer?: ComponentChildren,
	//set, the header has a close button and Esc closes the window
	onClose?: () => void,
	//above the header: the bottom sheet's grip
	grip?: ComponentChildren,
	id?: string,
};

//The open windows that close on Esc, the last opened on top: Esc closes the top window
//(handoff.md), wherever the focus is
const closers: { id: string, close: () => void }[] = [];

function onEscape(e: KeyboardEvent) {
	if (e.key !== "Escape" || closers.length === 0) return;
	e.preventDefault();
	closers[closers.length - 1].close();
}

//A window's handler, in its place in the stack: a parent's new closure doesn't bring it to the top
function setCloser(id: string, close: (() => void) | undefined) {
	const at = closers.findIndex((c) => c.id === id);
	if (close && at >= 0) closers[at] = { id, close };
	else if (close) closers.push({ id, close });
	else if (at >= 0) closers.splice(at, 1);
	if (closers.length === 0) document.removeEventListener("keydown", onEscape);
	else document.addEventListener("keydown", onEscape); //the same listener twice is added once
}

function useEscape(onClose: (() => void) | undefined) {
	const id = useId();
	useLayoutEffect(() => setCloser(id, onClose), [id, onClose]);
	useLayoutEffect(() => () => setCloser(id, undefined), [id]);
}

//A modal window: equipment, combat log, dossier, messages, the start menu's windows. A <dialog>
//shown open in place (not showModal's top layer): the z-index tokens stack it with the HUD
export function Window({ title, heading = "display", lead, sub, stamp, tools, children, footer, onClose, grip, id, ...place }: WindowProps) {
	const titleId = useId();
	useEscape(onClose);
	const name = <h1 id={titleId} class={heading === "display" ? "pm-display" : "pm-title"}>{title}</h1>;
	return (
		<dialog open id={id} class={classes("pm-window", place)} style={place.style} aria-modal="true" aria-labelledby={titleId}>
			{grip}
			<div class="hd">
				{lead}
				{sub === undefined ? name : <div>{name}<div class="sub">{sub}</div></div>}
				{stamp && <Stamp>{stamp}</Stamp>}
				<span class="grow" />
				{tools}
				{onClose && <Button icon="close" label="Close" onClick={onClose} />}
			</div>
			<div class="bd">{children}</div>
			{footer !== undefined && <div class="ft">{footer}</div>}
		</dialog>
	);
}
