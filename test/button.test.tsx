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
		expect(button.hasAttribute("disabled")).toBe(true);
		expect(button.title).toBe("The unit has moved");
		fireEvent.click(button);
		expect(onClick).not.toHaveBeenCalled();
	});

	test("a context button says what it will do in a second line, the cost at its end", () => {
		render(<Button icon="reinforce" line="+2" cost={56}>Reinforce</Button>);
		const button = screen.getByRole("button", { name: "Reinforce +2 · 56" });
		expect(button.querySelector("svg")?.getAttribute("class")).toBe("i");
		expect(button.querySelector(".n")?.className).toBe("n");
		expect(button.querySelector(".n .cost")?.textContent).toBe("56");
	});

	test("a second line the prestige covers only in part is marked part", () => {
		render(<Button icon="reinforce" line="+1 of 2" cost={28} partial>Reinforce</Button>);
		expect(screen.getByRole("button", { name: "Reinforce +1 of 2 · 28" }).querySelector(".n")?.className).toBe("n part");
	});

	test("a refused context button stays, with the reason as its second line and no title", () => {
		render(<Button icon="reinforce" line="+2" cost={56} disabled="needs 28">Reinforce</Button>);
		const button = screen.getByRole("button", { name: "Reinforce needs 28" });
		expect(button.hasAttribute("disabled")).toBe(true);
		expect(button.querySelector(".n")?.textContent).toBe("needs 28");
		expect(button.querySelector(".cost")).toBeNull();
		expect(button.hasAttribute("title")).toBe(false);
	});

	test("a signal read in the parent renders the button again when it changes, and a lifted refusal leaves no title", async () => {
		//how the view model will reach the components (docs/ui/PLAN.md): a Refusal lifted, the button comes on
		const refusal = signal<string | undefined>("Not your turn");
		function EndTurn() {
			return <Button variant="primary" large disabled={refusal.value}>End turn</Button>;
		}
		render(<EndTurn />);
		const button = screen.getByRole("button", { name: "End turn" });
		expect(button.hasAttribute("disabled")).toBe(true);
		expect(button.title).toBe("Not your turn");
		await act(() => { refusal.value = undefined; });
		expect(button.hasAttribute("disabled")).toBe(false);
		expect(button.hasAttribute("title")).toBe(false);
	});
});
