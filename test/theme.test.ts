//The Theme setting (src/view/theme.ts): data-theme on the root, and System following the system
import { afterEach, describe, expect, test, vi } from "vitest";
import { applyTheme } from "../src/view/theme";

//jsdom has no matchMedia: a system whose dark mode the test turns on and off
function system(dark: boolean) {
	const listeners = new Set<() => void>();
	const media = {
		matches: dark,
		addEventListener: (_: string, f: () => void) => listeners.add(f),
		removeEventListener: (_: string, f: () => void) => listeners.delete(f),
	};
	vi.stubGlobal("matchMedia", (query: string) => {
		expect(query).toBe("(prefers-color-scheme: dark)");
		return media;
	});
	return {
		listeners,
		turn(on: boolean) {
			media.matches = on;
			for (const f of listeners) f();
		},
	};
}

describe("Theme", () => {
	afterEach(() => vi.unstubAllGlobals());

	test("Paper and Blackout set their theme whatever the system's", () => {
		const root = document.createElement("div");
		const os = system(true);
		applyTheme("paper", root);
		expect(root.dataset.theme).toBe("paper");
		applyTheme("blackout", root)();
		expect(root.dataset.theme).toBe("blackout");
		expect(os.listeners.size).toBe(0);
	});

	test("System follows the system's dark mode as it changes, until stopped", () => {
		const root = document.createElement("div");
		const os = system(false);
		const stop = applyTheme("system", root);
		expect(root.dataset.theme).toBe("paper");
		os.turn(true);
		expect(root.dataset.theme).toBe("blackout");
		stop();
		os.turn(false);
		expect(root.dataset.theme).toBe("blackout");
	});

	test("the root is the page's by default", () => {
		system(false);
		applyTheme("blackout");
		expect(document.documentElement.dataset.theme).toBe("blackout");
		delete document.documentElement.dataset.theme;
	});
});
