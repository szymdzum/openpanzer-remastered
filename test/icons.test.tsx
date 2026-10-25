//The new UI's icons (src/view/icon.tsx, sprite.ts) in jsdom: the sprite is the Icons card's, and an icon is a <use> of it
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render } from "@testing-library/preact";
import { Icon, IconSprite, Mark } from "../src/view/icon";
import { ICONS, NATION_MARKS } from "../src/view/sprite";

afterEach(cleanup);

//docs/ui/components/bundle.js, run as the cards run it, without a page to mount on
function cardSprite() {
	const page = { window: {} as { PM?: { icons: object, nationMarks: object } }, document: { body: null as null, addEventListener() {} } };
	vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../docs/ui/components/bundle.js"), "utf8"), page);
	return page.window.PM;
}

describe("Icons", () => {
	test("the sprite has the Icons card's icons and nation marks, path for path", () => {
		const card = cardSprite();
		expect({ ...ICONS }).toEqual({ ...card.icons });
		expect({ ...NATION_MARKS }).toEqual({ ...card.nationMarks });
	});

	test("the sprite is one hidden svg with a symbol per icon and mark", () => {
		const { container } = render(<IconSprite />);
		const sprite = container.querySelector("svg#pm-sprite");
		expect(sprite.getAttribute("aria-hidden")).toBe("true");
		expect(sprite.querySelectorAll("symbol")).toHaveLength(Object.keys(ICONS).length + Object.keys(NATION_MARKS).length);
		const stroked = sprite.querySelector("symbol#pm-end-turn");
		expect(stroked.getAttribute("stroke")).toBe("currentColor");
		expect(stroked.namespaceURI).toBe("http://www.w3.org/2000/svg");
		expect(sprite.querySelector("symbol#pm-flag-de").hasAttribute("stroke")).toBe(false);
	});

	test("an icon is a hidden <use> of its symbol, sized by its class", () => {
		const { container } = render(<><Icon name="fuel" /><Icon name="ammo" size="sm" /><Mark nation="pl" size="lg" /><Mark nation="de" /></>);
		const [fuel, ammo, pl, de] = [...container.querySelectorAll("svg")];
		expect(fuel.getAttribute("class")).toBe("i");
		expect(fuel.getAttribute("aria-hidden")).toBe("true");
		expect(fuel.querySelector("use").getAttribute("href")).toBe("#pm-fuel");
		expect(ammo.getAttribute("class")).toBe("i sm");
		expect(pl.getAttribute("class")).toBe("mark lg");
		expect(pl.querySelector("use").getAttribute("href")).toBe("#pm-flag-pl");
		expect(de.getAttribute("class")).toBe("mark");
	});
});
