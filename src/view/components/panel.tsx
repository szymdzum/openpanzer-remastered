//The containers everything sits in (docs/ui/components/Panel): the HUD panel over the map, the
//modal window with its header, body and footer, the flat scrim under it and the rubber stamp.
//Styled by src/view/components/panel.css.
import type { AriaRole, ComponentChildren, CSSProperties, RefObject } from "preact";
import { useId, useLayoutEffect, useRef } from "preact/hooks";
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

export function useEscape(onClose: (() => void) | undefined) {
	const id = useId();
	useLayoutEffect(() => setCloser(id, onClose), [id, onClose]);
	useLayoutEffect(() => () => setCloser(id, undefined), [id]);
}

//What the keyboard can reach in a window: its controls, the disabled ones too (they say why, #497)
const FOCUSABLE = "a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]";

//A radio the browser's Tab skips: one of a group that has another checked
function skippedRadio(e: HTMLElement, dialog: HTMLElement): boolean {
	if (!(e instanceof HTMLInputElement) || e.type !== "radio" || e.checked) return false;
	return [...dialog.querySelectorAll<HTMLInputElement>("input[type=radio]")].some((r) => r.name === e.name && r.checked);
}

//The window's Tab stops, in their order, as the browser's Tab finds them: not an icon's <use href> or a negative
//tabindex, nothing hidden, one radio a group
const focusables = (dialog: HTMLElement) => [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((e) => e.tabIndex >= 0
	&& !e.closest("[hidden]") && (typeof e.checkVisibility !== "function" || e.checkVisibility()) && !skippedRadio(e, dialog));

//The control a window gives the focus to when it opens: its primary action that can be taken, else its first control
function firstControl(dialog: HTMLElement): HTMLElement | undefined {
	return dialog.querySelector<HTMLElement>(".pm-btn.primary:not([aria-disabled=\"true\"])") ?? focusables(dialog)[0];
}

//Tab past a window's last control comes back to its first, Shift+Tab from the first goes to the last: the focus stays
//in the window while it is open, as aria-modal says
function keepTab(e: KeyboardEvent, dialog: HTMLElement) {
	if (e.key !== "Tab") return;
	const all = focusables(dialog);
	if (all.length === 0) return;
	const edge = e.shiftKey ? all[0] : all[all.length - 1];
	if (document.activeElement !== edge && dialog.contains(document.activeElement)) return;
	e.preventDefault();
	(e.shiftKey ? all[all.length - 1] : all[0]).focus();
}

//A modal window's focus (#497, handoff.md's checklist): it takes the focus when it opens (unless one of its own
//controls already took it, as the start menu's windows do), keeps it while open, and gives it back to where it was when
//it closes. shown: what the window shows, when it shows something new without closing (the message window's next
//message): it takes the focus again if the focus went elsewhere meanwhile. Returns the window's ref
function useModalFocus<T extends HTMLElement>(shown: unknown): RefObject<T> {
	const ref = useRef<T>(null);
	useLayoutEffect(() => {
		const dialog = ref.current!, before = document.activeElement as HTMLElement | null;
		return () => {
			//(back where it was, unless the focus moved on outside the window, or that place left the page)
			const now = document.activeElement;
			if (before !== null && before.isConnected && (now === null || now === document.body || dialog.contains(now))) before.focus();
		};
	}, []);
	useLayoutEffect(() => {
		const dialog = ref.current!;
		if (!dialog.contains(document.activeElement)) firstControl(dialog)?.focus();
	}, [shown]);
	return ref;
}

//A modal <dialog> shown open in place (not showModal's top layer: the z-index tokens stack it with the HUD), with its
//focus (useModalFocus): the windows below, the message and the dossier. shown: what it shows, when that can change
//while it stays open (the message window's message)
export function Dialog({ id, class: cls, labelledBy, style, shown, children }: { id?: string, class: string, labelledBy: string,
	style?: CSSProperties, shown?: unknown, children: ComponentChildren }) {
	const ref = useModalFocus<HTMLDialogElement>(shown);
	return (
		<dialog ref={ref} open id={id} class={cls} style={style} aria-modal="true" aria-labelledby={labelledBy}
			onKeyDown={(e) => keepTab(e, e.currentTarget)}>
			{children}
		</dialog>
	);
}

//A modal window: equipment, combat log, dossier, messages, the start menu's windows. A Dialog with a header, body and
//footer
export function Window({ title, heading = "display", lead, sub, stamp, tools, children, footer, onClose, grip, id, ...place }: WindowProps) {
	const titleId = useId();
	useEscape(onClose);
	const name = <h1 id={titleId} class={heading === "display" ? "pm-display" : "pm-title"}>{title}</h1>;
	return (
		<Dialog id={id} class={classes("pm-window", place)} style={place.style} labelledBy={titleId}>
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
		</Dialog>
	);
}
