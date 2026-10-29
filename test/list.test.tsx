//The new UI's selectable list (src/view/components/list.tsx) in jsdom: a radio group of rows under their group names
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { List } from "../src/view/components/list";

afterEach(cleanup);

const CAMPAIGNS = [
	{ name: "Axis", rows: [
		{ id: "fw", title: "Fall Weiss 8 Armee", meta: "1939 · 4 scenarios", nation: "de", value: "2,000" },
		{ id: "ak", title: "Mussolini's Afrika Korps", nation: "it" },
	] },
	{ name: "Allied", rows: [{ id: "gpw", title: "The Great Patriotic War", meta: "1942–1945 · 20 scenarios", nation: "su" }] },
] as const;

describe("List", () => {
	test("a named group of rows by side, one checked, each named by its title", () => {
		render(<List label="Campaigns" groups={CAMPAIGNS.map((g) => ({ name: g.name, rows: [...g.rows] }))} selected="fw" onSelect={() => {}} />);
		expect(screen.getByRole("group", { name: "Campaigns" }).className).toBe("pm-list");
		expect(screen.getByRole("group", { name: "Axis" }).querySelectorAll(".pm-row")).toHaveLength(2);
		const picked = screen.getByRole("radio", { name: "Fall Weiss 8 Armee 1939 · 4 scenarios 2,000" }) as HTMLInputElement;
		expect(picked.checked).toBe(true);
		const row = picked.closest(".pm-row");
		expect(row.className).toBe("pm-row");
		expect(row.querySelector("svg.mark use")?.getAttribute("href")).toBe("#pm-flag-de");
		expect(row.querySelector(".t")?.textContent).toBe("Fall Weiss 8 Armee");
		expect(row.querySelector(".m")?.textContent).toBe("1939 · 4 scenarios");
		expect(row.querySelector(".r")?.textContent).toBe("2,000");
		const other = screen.getByRole("radio", { name: "Mussolini's Afrika Korps" }) as HTMLInputElement;
		expect(other.checked).toBe(false);
		expect(other.closest(".pm-row").className).toBe("pm-row");
		expect(other.closest(".pm-row").querySelector(".m")).toBeNull();
		//one radio group: the arrows move through every group's rows
		expect(new Set(screen.getAllByRole("radio").map((r) => (r as HTMLInputElement).name)).size).toBe(1);
	});

	test("rows without a group name sit in the list itself", () => {
		render(<List label="Saved games" groups={[{ rows: [{ id: "a", title: "Turn 3" }] }]} selected={undefined} onSelect={() => {}} />);
		expect(screen.getAllByRole("group")).toHaveLength(1);
		expect((screen.getByRole("radio", { name: "Turn 3" }) as HTMLInputElement).checked).toBe(false);
	});

	test("picking a row, by a click on it or its title, selects it", () => {
		const onSelect = vi.fn();
		render(<List label="Campaigns" groups={CAMPAIGNS.map((g) => ({ name: g.name, rows: [...g.rows] }))} selected="fw" onSelect={onSelect} />);
		fireEvent.click(screen.getByText("The Great Patriotic War"));
		expect(onSelect).toHaveBeenCalledWith("gpw");
	});
});
