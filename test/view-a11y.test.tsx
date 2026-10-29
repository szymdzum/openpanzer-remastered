//The windows and controls for keyboard and screen-reader users (#497, docs/ui/handoff.md's accessibility checklist,
//review P10-P13): a window takes the focus, keeps Tab inside and gives the focus back; a disabled control's reason is
//reachable; the status line doesn't announce the hex under the pointer; the tabs name the panel they control
import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { Dialog, Window } from "../src/view/components/panel";
import { Button } from "../src/view/components/button";
import { TabPanel, Tabs } from "../src/view/components/tabs";
import { StatusBar } from "../src/view/hud/statusbar";
import { MessageDialog } from "../src/view/hud/message";
import { createStore } from "../src/view/store/store";
import { handWorld } from "./coreworld";

afterEach(() => {
	cleanup();
	document.body.innerHTML = "";
});

//A window opened from a button, and closed again
function Opener() {
	const [open, setOpen] = useState(false);
	return (
		<>
			<button type="button" onClick={() => setOpen(true)}>Equipment</button>
			{open && <Window title="Equipment" onClose={() => setOpen(false)}>
				<Button>Buy</Button><Button variant="primary">Deploy</Button>
			</Window>}
		</>
	);
}

test("A window takes the focus when it opens, on its primary control, keeps Tab inside, and gives it back when it closes (#497)", async () => {
	render(<Opener />);
	const opener = screen.getByRole("button", { name: "Equipment" });
	opener.focus();
	await act(() => { fireEvent.click(opener); });
	const dialog = screen.getByRole("dialog");
	expect(document.activeElement).toBe(screen.getByRole("button", { name: "Deploy" }));
	//(Tab past the last control comes back to the first, Shift+Tab from the first goes to the last)
	const close = screen.getByRole("button", { name: "Close" }), deploy = screen.getByRole("button", { name: "Deploy" });
	fireEvent.keyDown(deploy, { key: "Tab" });
	expect(document.activeElement).toBe(close);
	fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
	expect(document.activeElement).toBe(deploy);
	expect(dialog.contains(document.activeElement)).toBe(true);
	await act(() => { fireEvent.click(close); });
	expect(screen.queryByRole("dialog")).toBeNull();
	expect(document.activeElement).toBe(opener);
});

//A control that takes the focus itself when it shows, as the start menu's windows' first controls do
function Focused() {
	const ref = useRef<HTMLInputElement>(null);
	useLayoutEffect(() => { ref.current!.focus(); }, []);
	return <input ref={ref} aria-label="Cloud id" />;
}

test("A window keeps a focus its own control took, lets Tab move inside it, and leaves the focus where the person put it on close (#497)", async () => {
	const outside = document.createElement("button");
	document.body.append(outside);
	const { rerender } = render(<Window title="Save" onClose={() => {}}><Focused /><Button>Load</Button></Window>);
	const field = screen.getByRole("textbox", { name: "Cloud id" });
	expect(document.activeElement).toBe(field);
	//(Tab between two controls: the browser's, not prevented; any other key: nothing)
	expect(fireEvent.keyDown(field, { key: "Tab" })).toBe(true);
	expect(fireEvent.keyDown(field, { key: "Enter" })).toBe(true);
	//(the focus moved out of the window before it closed: it stays there)
	outside.focus();
	rerender(<></>);
	expect(document.activeElement).toBe(outside);
	//A window with nothing to focus: Tab is the browser's; closed, the focus goes back where it was, if that is still there
	outside.focus();
	const { rerender: again } = render(<Dialog class="pm-window" labelledBy="t"><h1 id="t">Briefing</h1></Dialog>);
	expect(fireEvent.keyDown(screen.getByRole("dialog"), { key: "Tab" })).toBe(true);
	outside.remove();
	again(<></>);
	expect(document.activeElement).toBe(document.body);
});

test("A message takes the focus on its button when it shows (#497)", async () => {
	const store = createStore({ world: () => null, command: vi.fn(), won: vi.fn() });
	render(<MessageDialog store={store} />);
	await act(() => { store.show({ title: "Orders", html: "Hold the bridge", at: null, ok: () => {} }); });
	expect(document.activeElement).toBe(screen.getByRole("button", { name: "Continue" }));
	//A new message in the window already open, after the focus went elsewhere (a scenario's briefing after the start
	//menu's windows closed, the lead's playtest of #498): it takes the focus again
	(document.activeElement as HTMLElement).blur();
	await act(() => { store.clear(); store.show({ title: "Briefing", html: "Spain, 1936", at: null, ok: () => {} }); });
	expect(document.activeElement).toBe(screen.getByRole("button", { name: "Continue" }));
});

//What the browser's Tab stops at (the lead's playtest of #498): not a button's icon (an SVG <use href>), not a radio of a
//group but its checked one; Tab past the last stop and Shift+Tab past the first stay in the window
test("Tab wraps at the window's real first and last stops: past a button with an icon, and back from a group's checked radio (#497)", () => {
	render(
		<Dialog class="pm-window" labelledBy="t">
			<h1 id="t">Scenarios</h1>
			<fieldset><input type="radio" name="s" aria-label="A" /><input type="radio" name="s" aria-label="B" checked /></fieldset>
			<Button variant="primary" icon="play">Play</Button>
		</Dialog>);
	const play = screen.getByRole("button", { name: "Play" }), picked = screen.getByRole("radio", { name: "B" });
	play.focus();
	expect(fireEvent.keyDown(play, { key: "Tab" })).toBe(false);
	expect(document.activeElement).toBe(picked);
	expect(fireEvent.keyDown(picked, { key: "Tab", shiftKey: true })).toBe(false);
	expect(document.activeElement).toBe(play);
});

test("A disabled button can be reached by the keyboard, says it is disabled and why (its title, its description), and does nothing (#497)", () => {
	const onClick = vi.fn();
	render(<Button variant="primary" disabled="Not your turn" onClick={onClick}>End turn</Button>);
	const b = screen.getByRole("button", { name: "End turn" });
	expect([b.hasAttribute("disabled"), b.getAttribute("aria-disabled"), b.title]).toEqual([false, "true", "Not your turn"]);
	b.focus();
	expect(document.activeElement).toBe(b);
	fireEvent.click(b);
	fireEvent.keyDown(b, { key: "Enter" });
	expect(onClick).not.toHaveBeenCalled();
});

test("The status line doesn't announce the hex under the pointer; a refusal it does (#497)", async () => {
	const w = handWorld({ rows: 6, cols: 6, units: [{ eqid: 140, owner: 0, row: 2, col: 2 }] }, undefined, { spotSide: 0 });
	const store = createStore({ world: () => w, command: () => ({ ok: false, refusal: { reason: "not enough prestige" } }), won: vi.fn() });
	store.refresh();
	render(<StatusBar store={store} />);
	await act(() => { store.hoverHex({ row: 2, col: 2 }); });
	const line = document.querySelector("output.msg")!;
	const hex = line.querySelector("span")!;
	expect(hex.textContent).not.toBe("");
	expect(hex.getAttribute("aria-live")).toBe("off");
	await act(() => { store.dispatch({ type: "buy", eqid: 1, transport: 0 }); });
	expect(line.querySelector("span")!.getAttribute("aria-live")).toBeNull();
});

test("The tabs name the panel they control, and the panel the tab it shows (#497)", () => {
	render(<>
		<Tabs id="classes" label="Unit class" selected="tank" onSelect={() => {}} tabs={[{ id: "inf", label: "Infantry" }, { id: "tank", label: "Tank" }]} />
		<TabPanel of="classes" selected="tank">The tanks</TabPanel>
	</>);
	const tabs = screen.getAllByRole("tab"), panel = screen.getByRole("tabpanel");
	expect(tabs.map((t) => [t.id, t.getAttribute("aria-controls")])).toEqual([["classes-inf", "classes-panel"], ["classes-tank", "classes-panel"]]);
	expect([panel.id, panel.getAttribute("aria-labelledby"), panel.textContent]).toEqual(["classes-panel", "classes-tank", "The tanks"]);
	expect(screen.getByRole("tabpanel", { name: "Tank" })).toBe(panel);
});

//A control the page doesn't show (display: none by its CSS) is no Tab stop: the browser says so (checkVisibility, which jsdom
//lacks: stubbed here)
test("Tab wraps at the last control the page shows, not at one its CSS hides (#497)", () => {
	const shows = vi.fn(function(this: HTMLElement) { return this.id !== "hidden"; });
	Object.defineProperty(HTMLElement.prototype, "checkVisibility", { value: shows, configurable: true });
	try {
		render(<Dialog class="pm-window" labelledBy="t"><h1 id="t">Save</h1><Button>Load</Button><Button>Save</Button><Button id="hidden">Later</Button></Dialog>);
		const save = screen.getByRole("button", { name: "Save" });
		save.focus();
		expect(fireEvent.keyDown(save, { key: "Tab" })).toBe(false);
		expect(document.activeElement).toBe(screen.getByRole("button", { name: "Load" }));
	} finally {
		delete (HTMLElement.prototype as { checkVisibility?: unknown }).checkVisibility;
	}
});
