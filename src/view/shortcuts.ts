//The keyboard shortcuts: the keys the original game read (reference/src/ui.js handleKeyboard), by physical key
//(KeyboardEvent.code, so a French or German layout plays the same) and Escape by its name. The store does what each
//says
import type { ActionKey } from "./store/model";

//The rail's buttons and the map's keys: I, B, H, A, Z, L, the next and previous unit, Escape; Options, the start menu,
//is the rail's button and Escape's with no unit selected
export type MenuKey = "inspect" | "buy" | "hex" | "air" | "zoom" | "options" | "labels" | "next" | "previous" | "escape";

export type Shortcut = { menu: MenuKey } | { unit: ActionKey };

const KEYS: Record<string, Shortcut> = {
	KeyI: { menu: "inspect" }, KeyB: { menu: "buy" }, KeyH: { menu: "hex" }, KeyA: { menu: "air" }, KeyZ: { menu: "zoom" },
	KeyL: { menu: "labels" }, KeyN: { menu: "next" }, KeyP: { menu: "previous" },
	KeyM: { unit: "mount" }, KeyE: { unit: "embark" }, KeyS: { unit: "resupply" }, KeyR: { unit: "reinforce" },
	KeyO: { unit: "overstrength" }, KeyU: { unit: "undo" },
};

//What a key does, null for nothing: not while a field takes the typing, nor with a modifier (the browser's own
//shortcuts), nor a key held down. Escape that a window took (it closes the top window) is the window's
export function shortcutOf(e: KeyboardEvent): Shortcut | null {
	const typing = e.target instanceof HTMLElement && e.target.closest("input, textarea, select, [contenteditable]") !== null;
	if (typing || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return null;
	if (e.key === "Escape" || e.key === "Esc") return e.defaultPrevented ? null : { menu: "escape" };
	return KEYS[e.code] || null;
}
