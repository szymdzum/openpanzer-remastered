//The new UI's settings controls and text field (src/view/controls.tsx) in jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { Input, Slider, Toggle } from "../src/view/controls";

afterEach(cleanup);

describe("Toggle", () => {
	test("a switch named by its label, checked or not, and a click asks for the other state", () => {
		const onChange = vi.fn();
		render(<><Toggle label="Quick animations" checked onChange={onChange} /><Toggle label="Fog of war" checked={false} onChange={onChange} /></>);
		const quick = screen.getByRole("switch", { name: "Quick animations" });
		expect(quick.className).toBe("pm-toggle");
		expect(quick.getAttribute("aria-checked")).toBe("true");
		expect(quick.querySelector(".track")).not.toBeNull();
		fireEvent.click(quick);
		expect(onChange).toHaveBeenLastCalledWith(false);
		fireEvent.click(screen.getByRole("switch", { name: "Fog of war" }));
		expect(onChange).toHaveBeenLastCalledWith(true);
	});

	test("a click on the setting row's label toggles it too", () => {
		const onChange = vi.fn();
		render(<div class="pm-setting"><label htmlFor="mute" class="t">Mute sounds</label><Toggle id="mute" checked={false} onChange={onChange} /></div>);
		fireEvent.click(screen.getByText("Mute sounds"));
		expect(onChange).toHaveBeenCalledWith(true);
		expect(screen.getByRole("switch", { name: "Mute sounds" }).id).toBe("mute");
	});

	test("a disabled switch does nothing", () => {
		const onChange = vi.fn();
		render(<Toggle label="Locked" checked disabled onChange={onChange} />);
		const locked = screen.getByRole("switch", { name: "Locked" });
		expect(locked.hasAttribute("disabled")).toBe(true);
		fireEvent.click(locked);
		expect(onChange).not.toHaveBeenCalled();
	});
});

describe("Slider", () => {
	test("a range named by its label, the brass fill up to the value and the value typed beside it", () => {
		const onInput = vi.fn();
		render(<Slider label="Interface scale" min={0.5} max={3} step={0.1} value={1} text="1.0×" onInput={onInput} />);
		const range = screen.getByRole("slider", { name: "Interface scale" });
		expect(range.className).toBe("pm-range");
		expect(range.style.getPropertyValue("--val")).toBe("20%");
		expect(range.getAttribute("aria-valuetext")).toBe("1.0×");
		expect(range.nextElementSibling?.className).toBe("val");
		expect(range.nextElementSibling?.textContent).toBe("1.0×");
		fireEvent.input(range, { target: { value: "1.5" } });
		expect(onInput).toHaveBeenCalledWith(1.5);
	});
});

describe("Input", () => {
	test("a text field named by its label; an invalid one is marked so for the eye and for screen readers", () => {
		const onInput = vi.fn();
		render(<><Input id="cloudid" label="Cloud save id" value="" placeholder="e.g. 7f3a" onInput={onInput} /><Input label="Bad" value="x" invalid onInput={onInput} /></>);
		const field = screen.getByRole("textbox", { name: "Cloud save id" });
		expect(field.className).toBe("pm-input");
		expect(field.id).toBe("cloudid");
		expect(field.getAttribute("placeholder")).toBe("e.g. 7f3a");
		expect(field.hasAttribute("aria-invalid")).toBe(false);
		fireEvent.input(field, { target: { value: "7f3a" } });
		expect(onInput).toHaveBeenCalledWith("7f3a");
		const bad = screen.getByRole("textbox", { name: "Bad" });
		expect(bad.className).toBe("pm-input err");
		expect(bad.getAttribute("aria-invalid")).toBe("true");
	});
});
