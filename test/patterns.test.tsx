//The new UI's patterns in jsdom: the facts row, the stat sheet and table (src/view/facts.tsx), the
//strength bar (docs/ui/live/strength.tsx), the panel anchored to a hex (anchored.tsx) and the bottom sheet (docs/ui/live/sheet.tsx)
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { Facts, StatTable, Stats } from "../src/view/facts";
import { StrengthBar } from "../docs/ui/live/strength";
import { Anchored, clampToScreen, placeBy } from "../src/view/anchored";
import { BottomSheet } from "../docs/ui/live/sheet";

afterEach(cleanup);

describe("Facts and stats", () => {
	test("the facts row: a label over each typed value, its tone and id on the value", () => {
		const { container } = render(<Facts id="smCampInfo" facts={[
			{ label: "Scenarios", value: "4", id: "smCampScenarios" },
			{ label: "Starting prestige", value: "2,400", tone: "prestige" },
		]} />);
		const facts = container.querySelector("dl.pm-facts");
		expect(facts.id).toBe("smCampInfo");
		expect([...facts.querySelectorAll("dt.pm-label")].map((d) => d.textContent)).toEqual(["Scenarios", "Starting prestige"]);
		const [scenarios, prestige] = [...facts.querySelectorAll("dd")];
		expect(scenarios.className).toBe("n");
		expect(scenarios.id).toBe("smCampScenarios");
		expect(prestige.className).toBe("n pm-prestige");
	});

	test("the stat sheet: names over numbers, in four columns or six", () => {
		const stats = [{ name: "Soft atk", value: 5 }, { name: "Hard atk", value: 3 }];
		const { container } = render(<><Stats stats={stats} /><Stats stats={stats} cols={6} /></>);
		const [four, six] = [...container.querySelectorAll("dl")];
		expect(four.className).toBe("pm-stats");
		expect(six.className).toBe("pm-stats cols6");
		expect(four.querySelector("dt.k")?.textContent).toBe("Soft atk");
		expect(four.querySelector("dd.n")?.textContent).toBe("5");
	});

	test("the stat table: column and row headers, the cells with their tone", () => {
		render(<StatTable caption="Campaign casualties by class"
			columns={[{ label: "Infantry", icon: "infantry" }, { label: "Tank" }]}
			rows={[{ label: "Destroyed", id: "dossierDestroyed", cells: [{ value: 14 }, { value: 0, tone: "muted" }] }, { label: "Core lost", cells: [{ value: 1, tone: "critical" }, { value: 0 }] }]} />);
		const table = screen.getByRole("table", { name: "Campaign casualties by class" });
		expect(table.className).toBe("pm-table");
		expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Count", "Infantry", "Tank"]);
		expect(screen.getByRole("columnheader", { name: "Infantry" }).querySelector("use")?.getAttribute("href")).toBe("#pm-infantry");
		expect(screen.getAllByRole("rowheader").map((h) => h.textContent)).toEqual(["Destroyed", "Core lost"]);
		expect(screen.getByRole("rowheader", { name: "Destroyed" }).closest("tr").id).toBe("dossierDestroyed");
		expect(screen.getAllByRole("cell").map((c) => c.className)).toEqual(["pm-data", "pm-data muted", "pm-data critical", "pm-data"]);
	});
});

describe("StrengthBar", () => {
	const segments = (el: Element) => [...el.querySelectorAll("i")].map((i) => i.getAttribute("class") ?? "");

	test("ten segments: kept in the side's colour, then the losses, then the support fire's, then what the unit doesn't have", () => {
		const { container } = render(<><StrengthBar side="axis" before={10} after={4} support={1} /><StrengthBar side="allied" before={8} after={7} /></>);
		const [mine, theirs] = [...container.querySelectorAll(".pm-strength")];
		expect(mine.getAttribute("aria-hidden")).toBe("true");
		expect(segments(mine)).toEqual([...Array(4).fill("keep axis"), ...Array(5).fill("loss"), "sup"]);
		expect(segments(theirs)).toEqual([...Array(7).fill("keep allied"), "loss", "", ""]);
	});
});

describe("Anchored", () => {
	const size = { width: 300, height: 100 };
	const screenSize = { width: 1366, height: 768 };

	test("placed centred above or below the hex, or beside it and centred on it", () => {
		expect(placeBy({ x: 500, y: 400 }, size, "above", 30)).toEqual({ x: 350, y: 270 });
		expect(placeBy({ x: 500, y: 400 }, size, "beside", 40)).toEqual({ x: 540, y: 350 });
		expect(placeBy({ x: 500, y: 400 }, size, "before", 40)).toEqual({ x: 160, y: 350 });
		expect(placeBy({ x: 500, y: 400 }, size, "below", 14)).toEqual({ x: 350, y: 414 });
	});

	test("clamped to the screen, space-3 from its edges", () => {
		expect(clampToScreen({ x: 350, y: 270 }, size, screenSize)).toEqual({ x: 350, y: 270 });
		expect(clampToScreen({ x: -40, y: -10 }, size, screenSize)).toEqual({ x: 12, y: 12 });
		expect(clampToScreen({ x: 1200, y: 700 }, size, screenSize)).toEqual({ x: 1054, y: 656 });
		//larger than the screen: its top left edge stays in view
		expect(clampToScreen({ x: 100, y: 0 }, { width: 2000, height: 100 }, screenSize)).toEqual({ x: 12, y: 12 });
	});

	test("the panel measures itself and takes its place on the screen", () => {
		const offset = (name: "offsetWidth" | "offsetHeight", value: number) => vi.spyOn(HTMLElement.prototype, name, "get").mockReturnValue(value);
		offset("offsetWidth", 300);
		offset("offsetHeight", 100);
		vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(1366);
		vi.spyOn(document.documentElement, "clientHeight", "get").mockReturnValue(768);
		try {
			render(<Anchored hex={{ x: 1300, y: 400 }} place="above" gap={30} class="pm-ctx" role="toolbar" label="Unit actions">Supply</Anchored>);
			const bar = screen.getByRole("toolbar", { name: "Unit actions" });
			expect(bar.className).toBe("pm-panel pm-ctx");
			expect(bar.style.left).toBe("1054px");
			expect(bar.style.top).toBe("270px");
			expect(bar.style.visibility).toBe("");
		} finally {
			vi.restoreAllMocks();
		}
	});

	test("without the screen's class it is a plain panel", () => {
		render(<Anchored hex={{ x: 0, y: 0 }} place="beside" gap={0}>Odds</Anchored>);
		expect(screen.getByText("Odds").className).toBe("pm-panel");
	});
});

describe("BottomSheet", () => {
	const sheet = (onClose: () => void) => render(
		<BottomSheet id="unit-info" title="Pz IIA" sub="1st Panzer · Tank" height={640} onClose={onClose}>Stats</BottomSheet>,
	);

	test("a window along the bottom over a scrim, named by its unit, with a grip and a close button", () => {
		const { container } = sheet(() => {});
		const dialog = screen.getByRole("dialog", { name: "Pz IIA" });
		expect(dialog.className).toBe("pm-window pm-sheet");
		expect(dialog.id).toBe("unit-info");
		expect(dialog.style.height).toBe("640px");
		expect(dialog.querySelector("h1")?.className).toBe("pm-title");
		expect(dialog.firstElementChild?.className).toBe("grip");
		expect(container.querySelector(".pm-scrim")).not.toBeNull();
		expect(screen.getByRole("button", { name: "Close" })).not.toBeNull();
	});

	test("its height is its content's without one", () => {
		render(<BottomSheet title="Pz IIA" onClose={() => {}}>Stats</BottomSheet>);
		expect(screen.getByRole("dialog").style.height).toBe("");
	});

	test("a tap on the scrim closes it", () => {
		const onClose = vi.fn();
		const { container } = sheet(onClose);
		fireEvent.click(container.querySelector(".pm-scrim"));
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	test("the grip dragged down far enough closes it; a short drag springs back", () => {
		const onClose = vi.fn();
		sheet(onClose);
		const dialog = screen.getByRole("dialog");
		const grip = dialog.querySelector(".grip");
		fireEvent.pointerDown(grip, { clientY: 500, pointerId: 1 });
		fireEvent.pointerMove(grip, { clientY: 540, pointerId: 1 });
		expect(dialog.style.transform).toBe("translateY(40px)");
		fireEvent.pointerUp(grip, { clientY: 540, pointerId: 1 });
		expect(onClose).not.toHaveBeenCalled();
		expect(dialog.style.transform).toBe("");
		fireEvent.pointerDown(grip, { clientY: 500, pointerId: 1 });
		fireEvent.pointerMove(grip, { clientY: 420, pointerId: 1 });
		expect(dialog.style.transform).toBe("");
		fireEvent.pointerMove(grip, { clientY: 620, pointerId: 1 });
		fireEvent.pointerUp(grip, { clientY: 620, pointerId: 1 });
		expect(onClose).toHaveBeenCalledTimes(1);
		//a move or a release without a press does nothing
		fireEvent.pointerMove(grip, { clientY: 900, pointerId: 1 });
		fireEvent.pointerUp(grip, { clientY: 900, pointerId: 1 });
		expect(onClose).toHaveBeenCalledTimes(1);
		expect(dialog.style.transform).toBe("");
	});
});
