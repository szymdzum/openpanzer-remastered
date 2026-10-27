//The live gallery (docs/ui/live/gallery.tsx, docs/ui/live.html) in jsdom: every card with components
//renders in both themes, with no id twice and a name on every control
import { afterEach, describe, expect, test } from "vitest";
import { act, cleanup, screen } from "@testing-library/preact";
import { render } from "preact";
import { LIVE, mountGallery } from "../docs/ui/live/gallery";

afterEach(cleanup);

describe("Gallery", () => {
	const root = document.createElement("div");
	document.body.append(root);
	afterEach(() => render(null, root));

	test.each(Object.keys(LIVE))("%s renders in Paper and Blackout", async (card) => {
		await act(() => mountGallery(root, card));
		const themes = [...root.querySelectorAll<HTMLElement>("section.pm")].map((s) => s.dataset.theme);
		expect(themes).toEqual(["paper", "blackout"]);
		expect(root.querySelector("svg#pm-sprite")).not.toBeNull();
		const ids = [...root.querySelectorAll("[id]")].map((e) => e.id);
		expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
		for (const role of ["button", "switch", "tab", "radio", "slider", "textbox", "group", "dialog", "table"])
			expect(screen.queryAllByRole(role, { name: /\S/ }).length, role).toBe(screen.queryAllByRole(role).length);
	});

	test("a card without components says so", async () => {
		await act(() => mountGallery(root, "HudDesktop"));
		expect(root.textContent).toBe("No component of this card is built yet.");
	});
});
