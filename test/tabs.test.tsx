//The new UI's tabs and segmented control (src/view/tabs.tsx) in jsdom: their roles, states and keys
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { SegmentedControl, Tabs } from "../src/view/tabs";

afterEach(cleanup);

const CLASSES = [
	{ id: "inf", label: "Infantry", icon: "infantry", count: 12 },
	{ id: "tank", label: "Tank", icon: "tank", count: 8 },
	{ id: "recon", label: "Recon", icon: "recon", count: 6 },
	{ id: "naval", label: "Naval", icon: "naval", count: 0, disabled: true },
] as const;

describe("Tabs", () => {
	test("icon tabs: a tablist of tabs with their counts, the selected one marked and the only Tab stop", () => {
		render(<Tabs id="eqSelClass" label="Unit class" tabs={[...CLASSES]} selected="tank" onSelect={() => {}} />);
		const list = screen.getByRole("tablist", { name: "Unit class" });
		expect(list.id).toBe("eqSelClass");
		expect(list.className).toBe("pm-tabs");
		const tank = screen.getByRole("tab", { name: "Tank 8" });
		expect(tank.className).toBe("pm-tab");
		expect(tank.getAttribute("aria-selected")).toBe("true");
		expect(tank.tabIndex).toBe(0);
		expect(tank.querySelector("svg")?.getAttribute("class")).toBe("i");
		const infantry = screen.getByRole("tab", { name: "Infantry 12" });
		expect(infantry.getAttribute("aria-selected")).toBe("false");
		expect(infantry.tabIndex).toBe(-1);
		//a class with no models stays in its place, disabled
		expect(screen.getByRole("tab", { name: "Naval 0" }).hasAttribute("disabled")).toBe(true);
	});

	test("text tabs are the text variant with small icons and no counts", () => {
		render(<Tabs text tabs={[{ id: "c", label: "Campaigns", icon: "campaign" }, { id: "s", label: "Scenarios" }]} selected="c" onSelect={() => {}} />);
		expect(screen.getByRole("tablist").className).toBe("pm-tabs text");
		expect(screen.getByRole("tab", { name: "Campaigns" }).querySelector("svg")?.getAttribute("class")).toBe("i sm");
		expect(screen.getByRole("tab", { name: "Scenarios" }).querySelector(".n")).toBeNull();
	});

	test("a click selects a tab", () => {
		const onSelect = vi.fn();
		render(<Tabs tabs={[...CLASSES]} selected="tank" onSelect={onSelect} />);
		fireEvent.click(screen.getByRole("tab", { name: "Recon 6" }));
		expect(onSelect).toHaveBeenCalledWith("recon");
	});

	test("the arrow keys move the selection and the focus, wrapping round and skipping a disabled tab", () => {
		const onSelect = vi.fn();
		render(<Tabs tabs={[...CLASSES]} selected="recon" onSelect={onSelect} />);
		const recon = screen.getByRole("tab", { name: "Recon 6" });
		fireEvent.keyDown(recon, { key: "ArrowRight" });
		expect(onSelect).toHaveBeenLastCalledWith("inf");
		expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Infantry 12" }));
		fireEvent.keyDown(recon, { key: "ArrowLeft" });
		expect(onSelect).toHaveBeenLastCalledWith("tank");
		fireEvent.keyDown(recon, { key: "End" });
		expect(onSelect).toHaveBeenLastCalledWith("recon");
		fireEvent.keyDown(recon, { key: "Home" });
		expect(onSelect).toHaveBeenLastCalledWith("inf");
		fireEvent.keyDown(recon, { key: "a" });
		expect(onSelect).toHaveBeenCalledTimes(4);
	});

	test("with every tab disabled, the arrows go nowhere", () => {
		const onSelect = vi.fn();
		render(<Tabs tabs={[{ id: "a", label: "A", disabled: true }]} selected="a" onSelect={onSelect} />);
		fireEvent.keyDown(screen.getByRole("tab", { name: "A" }), { key: "ArrowRight" });
		expect(onSelect).not.toHaveBeenCalled();
	});
});

describe("SegmentedControl", () => {
	const THEMES = [
		{ value: "paper", label: "Paper", icon: "fair" },
		{ value: "blackout", label: "Blackout", icon: "overcast" },
		{ value: "system", label: "System", disabled: true },
	] as const;

	test("a labelled group of pressed and unpressed buttons, an unavailable one disabled in its place", () => {
		render(<SegmentedControl label="Theme" options={[...THEMES]} value="paper" onChange={() => {}} />);
		const group = screen.getByRole("group", { name: "Theme" });
		expect(group.className).toBe("pm-seg");
		const paper = screen.getByRole("button", { name: "Paper" });
		expect(paper.className).toBe("");
		expect(paper.getAttribute("aria-pressed")).toBe("true");
		expect(paper.querySelector("svg")?.getAttribute("class")).toBe("i sm");
		expect(screen.getByRole("button", { name: "Blackout" }).getAttribute("aria-pressed")).toBe("false");
		expect(screen.getByRole("button", { name: "System" }).hasAttribute("disabled")).toBe(true);
	});

	test("a click picks an option", () => {
		const onChange = vi.fn();
		render(<SegmentedControl label="Theme" options={[...THEMES]} value="paper" onChange={onChange} />);
		fireEvent.click(screen.getByRole("button", { name: "Blackout" }));
		expect(onChange).toHaveBeenCalledWith("blackout");
	});
});
