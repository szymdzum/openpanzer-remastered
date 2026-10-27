//The settings as signals (#349, review A5): one signal per key of uiSettings, behind the key itself. The engine, the game's
//state and the harness keep reading and writing uiSettings as before, and every write reaches the UI at once: the settings
//window, the map's scale, the interface's scale and width, the plaques, the AI's sides, the cloud saves. The keys stay
//where they were (each is redefined in place), so the settings saved and read back are the same JSON.
//A list setting (isAI, lastCloudSave) changes when a new list is written; a write into the list in place reaches the UI
//only when something else changes (the game's state restores them in place, before the UI is made)
import { type ReadonlySignal, signal } from "@preact/signals";
import { type UISettings, uiSettings } from "../prototypes";

export type SettingSignals = { readonly [K in keyof UISettings]: ReadonlySignal<UISettings[K]> };

//(once per settings object: the stores of a page, and of the tests, share them)
const made = new WeakMap<UISettings, SettingSignals>();

export function settingSignals(settings: UISettings = uiSettings): SettingSignals {
	let signals = made.get(settings);
	if (signals === undefined) {
		signals = behindKeys(settings);
		made.set(settings, signals);
	}
	return signals;
}

function behindKeys(settings: UISettings): SettingSignals {
	const signals: Record<string, ReadonlySignal<unknown>> = {};
	for (const key of Object.keys(settings)) {
		const value = signal<unknown>(settings[key as keyof UISettings]);
		Object.defineProperty(settings, key, { get: () => value.value, set: (v: unknown) => { value.value = v; }, enumerable: true,
			configurable: true });
		signals[key] = value;
	}
	return signals as SettingSignals;
}
