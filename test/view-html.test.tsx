//The game's texts shown as HTML (#486): a scenario's briefing, the host's messages, the tutorial's orders, the
//campaign's end (test/view-dossier.test.tsx) and the start menu's descriptions keep the tags the game's own texts use, and nothing a save written
//by someone else could bring: a save file and a cloud save carry the scenario's description
import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { smallGame, smallGameData } from "./smallgame";
import { newScreen } from "../src/view/screen";
import { safeHtml } from "../src/view/html";
import { worldOf } from "../src/legacy/mirror";
import { classicRules } from "../src/core/rules";
import { readSave, SAVE_VERSION } from "../src/app/save";
import { CURRENCY_ICON } from "../src/app/settings";
import { DIFFICULTY_HELP } from "../src/view/windows/newgame";
import type { GameHost } from "../src/app/host";

afterEach(() => {
	cleanup();
	document.body.innerHTML = "";
});

const SCRIPT = `Hold the bridge.<br><img src=x onerror="window.pwned = 1"><script>window.pwned = 2</script>`
	+ `<b onclick="window.pwned = 3">Now</b><a href="javascript:window.pwned = 4">here</a><iframe src="https://example.com"></iframe>`
	+ `<span class="statsGlyph" style="background: url(https://example.com/x.png)">?</span>`;

//A save as a file or a gist holds it, its scenario's description the crafted one, loaded, then shown by the screen
function loadedWorld(description: string) {
	const saved = smallGameData();
	saved.data.description = description;
	const read = readSave(JSON.stringify({ version: SAVE_VERSION, rules: "classic", ...saved }))!;
	expect(read.save.data.description).toBe(description);
	return worldOf(smallGame(undefined, { data: read.save.data, state: read.save.state }).scenario, null,
		{ spotSide: 0, noFOW: false, rules: classicRules });
}

//What can run script or reach out of the game in a piece of the page
function unsafe(root: Element): string[] {
	const found: string[] = [];
	for (const e of root.querySelectorAll("*")) {
		if (["SCRIPT", "IFRAME", "A", "OBJECT", "EMBED", "STYLE"].includes(e.tagName)) found.push(e.tagName);
		for (const a of e.attributes)
			if (a.name.startsWith("on") || /url\(|javascript:/i.test(a.value) || (a.name === "src" && !a.value.startsWith("resources/")))
				found.push(e.tagName + " " + a.name);
	}
	return found;
}

test("A loaded save's briefing shows its text without the script it carries (#486)", async () => {
	const w = loadedWorld(SCRIPT);
	const root = document.createElement("div");
	document.body.append(root);
	const host = { world: () => w, command: vi.fn(), won: vi.fn(), play: vi.fn(), holdForMessage: vi.fn(), messageClosed: vi.fn() };
	await act(() => { newScreen(host as unknown as GameHost, root).showScenario(); });
	const message = document.querySelector("#message")!;
	expect(unsafe(message)).toEqual([]);
	expect(message.textContent).toBe("Hold the bridge.Nowhere?");
	expect(message.querySelectorAll("br").length).toBe(1);
});

test("The host's messages and the tutorial's orders keep only the game's tags (#486)", async () => {
	const root = document.createElement("div");
	document.body.append(root);
	const host = { world: (): null => null, command: vi.fn(), won: vi.fn(), play: vi.fn(), holdForMessage: vi.fn(), messageClosed: vi.fn() };
	let s: ReturnType<typeof newScreen>;
	await act(() => { s = newScreen(host as unknown as GameHost, root); });
	await act(() => { s.message("VICTORY", SCRIPT); });
	expect(unsafe(document.querySelector("#message")!)).toEqual([]);
	await act(() => { fireEvent.click(screen.getByRole("button", { name: "Continue" })); });
	await act(() => { s.view({ type: "message", text: SCRIPT, at: { row: 1, col: 2 } }); });
	expect(unsafe(document.querySelector("#message")!)).toEqual([]);
});

//The game's own texts come out as they went in: what they use is the allow-list
test("The game's own texts keep their tags: line breaks, bold, the tutorial's glyphs, the prestige icon (#486)", () => {
	const shown = (html: string) => {
		const { container } = render(<div dangerouslySetInnerHTML={{ __html: safeHtml(html) }} />);
		const out = container.firstElementChild!.innerHTML;
		cleanup();
		return out;
	};
	const glyph = "the movement range <span class='statsGlyph' style='float:none;'>?</span> is 3, 150&nbsp;" + CURRENCY_ICON;
	const expected = "the movement range <span class=\"statsGlyph\" style=\"float:none;\">?</span> is 3, 150&nbsp;"
		+ "<img src=\"resources/ui/dialogs/equipment/images/currency.png\">";
	expect(shown(glyph)).toBe(expected);
	expect(shown("<br/><br/>The Axis won with a final score of <b>12</b> &amp; more")).toBe("<br><br>The Axis won with a final score of <b>12</b> &amp; more");
	expect(shown(DIFFICULTY_HELP)).toBe(DIFFICULTY_HELP);
	expect(shown(SCRIPT)).toBe("Hold the bridge.<br><b>Now</b>here<span class=\"statsGlyph\">?</span>");
});
