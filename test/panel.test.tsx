//The new UI's containers (src/view/components/panel.tsx) in jsdom: the HUD panel, the window, the scrim and the stamp
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { Panel, Scrim, Stamp, Window } from "../src/view/components/panel";
import { Button } from "../src/view/components/button";

afterEach(cleanup);

describe("Panel", () => {
	test("a HUD panel is placed over the map, or in the flow with static, with the screen's class and name", () => {
		render(<>
			<Panel class="pm-ctx" role="toolbar" label="Unit actions" style={{ left: "410px" }}>Actions</Panel>
			<Panel static>Note</Panel>
		</>);
		const bar = screen.getByRole("toolbar", { name: "Unit actions" });
		expect(bar.className).toBe("pm-panel pm-ctx");
		expect(bar.style.left).toBe("410px");
		expect(screen.getByText("Note").className).toBe("pm-panel static");
	});

	test("a stamp is critical by default, ok or large on demand", () => {
		render(<><Stamp>Secret</Stamp><Stamp large ok>Brilliant victory</Stamp></>);
		expect(screen.getByText("Secret").className).toBe("pm-stamp");
		expect(screen.getByText("Brilliant victory").className).toBe("pm-stamp lg ok");
	});

	test("a click on the scrim is the caller's", () => {
		const onClick = vi.fn();
		const { container } = render(<Scrim onClick={onClick} />);
		const scrim = container.querySelector(".pm-scrim");
		expect(scrim.getAttribute("aria-hidden")).toBe("true");
		fireEvent.click(scrim);
		expect(onClick).toHaveBeenCalledTimes(1);
	});
});

describe("Window", () => {
	test("a window is a dialog named by its title, with its header, body and footer", () => {
		render(
			<Window title="Window title" stamp="Secret" sub="Ciechanow" footer={<Button variant="primary">OK</Button>}>
				Body
			</Window>,
		);
		const dialog = screen.getByRole("dialog", { name: "Window title" });
		expect(dialog.className).toBe("pm-window");
		expect(dialog.getAttribute("aria-modal")).toBe("true");
		expect(dialog.querySelector(".hd h1.pm-display")?.textContent).toBe("Window title");
		expect(dialog.querySelector(".hd .sub")?.textContent).toBe("Ciechanow");
		expect(dialog.querySelector(".hd .pm-stamp")?.textContent).toBe("Secret");
		expect(dialog.querySelector(".bd")?.textContent).toBe("Body");
		expect(dialog.querySelector(".ft button")?.textContent).toBe("OK");
		//no close button without a handler
		expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
	});

	test("without a footer there is none; a title in title type, the grip and tools where they go", () => {
		render(<Window title="Pz IIA" heading="title" lead={<i>flag</i>} grip={<b>grip</b>} tools={<span>stars</span>} static>Body</Window>);
		const dialog = screen.getByRole("dialog", { name: "Pz IIA" });
		expect(dialog.className).toBe("pm-window static");
		expect(dialog.querySelector(".ft")).toBeNull();
		expect(dialog.querySelector("h1")?.className).toBe("pm-title");
		expect(dialog.firstElementChild?.textContent).toBe("grip");
		expect(dialog.querySelector(".hd")?.firstElementChild?.textContent).toBe("flag");
		expect(dialog.querySelector(".hd .grow + span")?.textContent).toBe("stars");
	});

	test("the close button and Esc close it", () => {
		const onClose = vi.fn();
		render(<Window title="Equipment" onClose={onClose}>Body</Window>);
		fireEvent.click(screen.getByRole("button", { name: "Close" }));
		fireEvent.keyDown(document, { key: "Escape" });
		fireEvent.keyDown(document, { key: "Enter" });
		expect(onClose).toHaveBeenCalledTimes(2);
	});

	test("Esc closes only the top window, the last opened, and the one under it after", () => {
		const closed: string[] = [];
		function Two({ top }: { top: boolean }) {
			return <>
				<Window title="Equipment" onClose={() => closed.push("Equipment")}>Body</Window>
				{top && <Window title="Message" onClose={() => closed.push("Message")}>Body</Window>}
			</>;
		}
		const { rerender } = render(<Two top />);
		fireEvent.keyDown(document, { key: "Escape" });
		expect(closed).toEqual(["Message"]);
		rerender(<Two top={false} />);
		fireEvent.keyDown(document, { key: "Escape" });
		expect(closed).toEqual(["Message", "Equipment"]);
	});

	test("a window that loses its handler, or closes, no longer takes Esc", () => {
		const onClose = vi.fn();
		const { rerender, unmount } = render(<Window title="Dossier" onClose={onClose}>Body</Window>);
		rerender(<Window title="Dossier">Body</Window>);
		fireEvent.keyDown(document, { key: "Escape" });
		rerender(<Window title="Dossier" onClose={onClose}>Body</Window>);
		unmount();
		fireEvent.keyDown(document, { key: "Escape" });
		expect(onClose).not.toHaveBeenCalled();
	});

	test("a new handler from the parent keeps the window where it is in the stack", () => {
		const closed: string[] = [];
		function Two({ round }: { round: number }) {
			return <>
				<Window title="Equipment" onClose={() => closed.push("Equipment " + round)}>Body</Window>
				<Window title="Message" onClose={() => closed.push("Message " + round)}>Body</Window>
			</>;
		}
		const { rerender } = render(<Two round={1} />);
		rerender(<Two round={2} />);
		fireEvent.keyDown(document, { key: "Escape" });
		expect(closed).toEqual(["Message 2"]);
	});
});
