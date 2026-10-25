//The Theme setting (docs/ui/handoff.md, Theme switch): Paper, Blackout, or the system's. Only the
//data-theme attribute changes: every colour is a custom property of tokens.css, so nothing redraws.
export type Theme = "paper" | "blackout" | "system";

const DARK = "(prefers-color-scheme: dark)";

//Sets data-theme on the root and, for System, follows the system as it changes; returns the stop
export function applyTheme(setting: Theme, root: HTMLElement = document.documentElement): () => void {
	const system = matchMedia(DARK);
	const set = () => {
		root.dataset.theme = setting === "blackout" || (setting === "system" && system.matches) ? "blackout" : "paper";
	};
	set();
	if (setting !== "system") return () => {};
	system.addEventListener("change", set);
	return () => system.removeEventListener("change", set);
}
