//The new UI's Button (src/view/button.tsx) in jsdom: what it renders and when it calls its handler
import { afterEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { signal } from "@preact/signals";
import { Button } from "../src/view/button";

afterEach(cleanup);

describe("Button", () => {
	test("renders its caption, icon and cost with the card's classes", () => {
		render(<Button variant="primary" icon="depot" cost={276}>Buy new</Button>);
		const button = screen.getByRole("button", { name: "Buy new 276" });
		expect(button.className).toBe("pm-btn primary");
		expect(button.querySelector("svg.i.sm use")?.getAttribute("href")).toBe("#pm-depot");
		expect(button.querySelector(".cost")?.textContent).toBe("276");
		expect(button.hasAttribute("disabled")).toBe(false);
		expect(button.hasAttribute("title")).toBe(false);
	});

	test("an icon-only button is square and named by its label", () => {
		render(<Button icon="close" label="Close" />);
		const button = screen.getByRole("button", { name: "Close" });
		expect(button.className).toBe("pm-btn icon");
		expect(button.querySelector("svg")?.getAttribute("class")).toBe("i");
	});

	test("a large button has the lg class and a full-size icon", () => {
		render(<Button variant="primary" large icon="end-turn">End turn</Button>);
		const button = screen.getByRole("button", { name: "End turn" });
		expect(button.className).toBe("pm-btn primary lg");
		expect(button.querySelector("svg")?.getAttribute("class")).toBe("i");
	});

	test("a click calls the handler", () => {
		const onClick = vi.fn();
		render(<Button onClick={onClick}>Back</Button>);
		fireEvent.click(screen.getByRole("button", { name: "Back" }));
		expect(onClick).toHaveBeenCalledTimes(1);
	});

	test("disabled, it shows the reason as its title and a click does nothing", () => {
		const onClick = vi.fn();
		render(<Button variant="danger" disabled="The unit has moved" onClick={onClick}>Disband</Button>);
		const button = screen.getByRole("button", { name: "Disband" });
		//(aria-disabled, so the keyboard still reaches it and its reason, #497)
		expect(button.getAttribute("aria-disabled")).toBe("true");
		expect(button.title).toBe("The unit has moved");
		fireEvent.click(button);
		expect(onClick).not.toHaveBeenCalled();
	});

	test("its hint is its title while it is on; off, the reason takes its place", () => {
		const { rerender } = render(<Button title="Play a single scenario">Scenarios</Button>);
		const button = screen.getByRole("button", { name: "Scenarios" });
		expect(button.title).toBe("Play a single scenario");
		rerender(<Button title="Play a single scenario" disabled="Not yet">Scenarios</Button>);
		expect(button.title).toBe("Not yet");
	});

	test("a signal read in the parent renders the button again when it changes, and a lifted refusal leaves no title", async () => {
		//how the view model reaches the components (docs/ui/PLAN.md): a Refusal lifted, the button comes on
		const refusal = signal<string | undefined>("Not your turn");
		function EndTurn() {
			return <Button variant="primary" large disabled={refusal.value}>End turn</Button>;
		}
		render(<EndTurn />);
		const button = screen.getByRole("button", { name: "End turn" });
		expect(button.getAttribute("aria-disabled")).toBe("true");
		expect(button.title).toBe("Not your turn");
		await act(() => { refusal.value = undefined; });
		expect(button.hasAttribute("aria-disabled")).toBe(false);
		expect(button.hasAttribute("title")).toBe(false);
	});
});
