//The new UI's unit state components (src/view/meter.tsx) and tooltip (tooltip.tsx) in jsdom
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render, screen } from "@testing-library/preact";
import { Badge, Meter, Stars } from "../src/view/meter";
import { Tag } from "../docs/ui/live/tag";
import { Tooltip } from "../src/view/tooltip";

afterEach(cleanup);

describe("Meter", () => {
	test("a meter has its icon, label, typed value and a track filled to the fraction", () => {
		const { container } = render(<Meter icon="strength" label="Strength" value="10/10" fill={1} state="ok" />);
		const meter = container.querySelector(".pm-meter");
		expect(meter.className).toBe("pm-meter ok");
		expect(meter.querySelector("use")?.getAttribute("href")).toBe("#pm-strength");
		expect(meter.querySelector(".v")?.textContent).toBe("10/10");
		expect(meter.querySelector(".st")).toBeNull();
		expect((meter.querySelector(".track b") as HTMLElement).style.width).toBe("100%");
		expect(meter.querySelector(".track")?.getAttribute("aria-hidden")).toBe("true");
	});

	test("low and critical say so in a word, never by colour alone", () => {
		const { container } = render(<>
			<Meter icon="fuel" label="Fuel" value="18/50" fill={0.36} state="low" />
			<Meter icon="ammo" label="Ammo" value="1/8" fill={0.125} state="critical" />
			<Meter icon="entrench" label="Entrench" value="0" fill={0} />
		</>);
		const [fuel, ammo, entrench] = [...container.querySelectorAll(".pm-meter")];
		expect(fuel.className).toBe("pm-meter low");
		expect(fuel.textContent).toBe("FuelLow18/50");
		expect((fuel.querySelector(".track b") as HTMLElement).style.width).toBe("36%");
		expect(ammo.querySelector(".st")?.textContent).toBe("Critical");
		expect((ammo.querySelector(".track b") as HTMLElement).style.width).toBe("13%");
		expect(entrench.className).toBe("pm-meter");
	});

	test("stars: the earned ones bare, the others off, and the count in words", () => {
		const { container } = render(<Stars earned={2} />);
		const stars = container.querySelector(".pm-stars");
		expect(stars.querySelectorAll("svg")).toHaveLength(5);
		expect(stars.querySelectorAll(".off svg")).toHaveLength(3);
		expect(screen.getByText("Experience 2 of 5").className).toBe("pm-sr");
	});

	test("a strength badge in the side's colour, and a tag naming a state", () => {
		render(<>
			<Badge side="axis">10</Badge><Badge side="allied">8</Badge><Badge side="neutral">5</Badge>
			<Tag tone="low" icon="low">Low fuel</Tag><Tag>Core</Tag>
		</>);
		expect(screen.getByText("10").className).toBe("pm-badge");
		expect(screen.getByText("8").className).toBe("pm-badge allied");
		expect(screen.getByText("5").className).toBe("pm-badge neutral");
		const low = screen.getByText("Low fuel");
		expect(low.className).toBe("pm-tag pm-low");
		expect(low.querySelector("use")?.getAttribute("href")).toBe("#pm-low");
		expect(screen.getByText("Core").className).toBe("pm-tag");
	});
});

describe("Tooltip", () => {
	test("a tooltip has its title line and its pointer on the side facing what it explains", () => {
		render(<>
			<Tooltip id="gameToolTip" title="Janow" style={{ left: "920px" }}>City · held by Germany</Tooltip>
			<Tooltip side="left">Strategic map</Tooltip>
			<Tooltip side="above">Above</Tooltip>
		</>);
		const [hex, rail, above] = screen.getAllByRole("tooltip");
		expect(hex.id).toBe("gameToolTip");
		expect(hex.className).toBe("pm-tip");
		expect(hex.style.left).toBe("920px");
		expect(hex.querySelector(".hd")?.textContent).toBe("Janow");
		expect(rail.className).toBe("pm-tip right");
		expect(rail.querySelector(".hd")).toBeNull();
		expect(above.className).toBe("pm-tip above");
	});
});
