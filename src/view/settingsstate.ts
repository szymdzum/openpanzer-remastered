//The settings window as signals (Settings, #349): the old list's values in uiSettings, changed in place as the old window
//changed them, and what they change on the new UI at once (the interface's width and scale, the map's scale, the world
//the fog of war and the labels are read from). Its OK saves them on the host, applies the interface scale a switch
//suggested, reloads the page when a switch needs it, and goes back to the start menu.
import { computed, type Signal, signal } from "@preact/signals";
import type { GameHost } from "../host";
import { uiSettings } from "../prototypes";
import { menuBack, type MenuState } from "./menus";
import { SLIDERS, type SliderSetting, sliderText, type ToggleKey, toggleSetting, TOGGLES } from "./settings";

//What the window asks of the host: the settings saved (none in the tests of the map and the HUD)
export type SettingsHost = Partial<Pick<GameHost, "saveSettings">>;

type SettingsInputs = {
	host: SettingsHost,
	menu: Signal<MenuState>,
	//the map's scale the map is drawn at, and the world read again (the fog of war, the labels)
	scale: Signal<number>,
	refresh: () => void,
	//the page reloaded (none without a page)
	reload?: () => void,
};

export function createSettings({ host, menu, scale, refresh, reload }: SettingsInputs) {
	//The interface's scale and width as the page applies them (src/view/screen.tsx), from the settings saved
	const uiScale = signal(Number(uiSettings.uiScale));
	const uiWidth = signal(Number(uiSettings.uiSize));
	//(the settings changed in place: counted, so the window shows them again)
	const changed = signal(0);
	//a switch's reload and suggested interface scale, until the window closes
	let needReload = false;
	const suggested = signal<number | null>(null);

	const valueOf = (s: SliderSetting) => s.key === "uiScale" && suggested.value !== null ? suggested.value : Number(uiSettings[s.key]);
	const settings = computed(() => {
		if (menu.value.window !== "settings") return null;
		void changed.value;
		return {
			sliders: SLIDERS.map((s) => {
				const value = valueOf(s);
				return { key: s.key, title: s.title, step: s.step, min: s.min(uiSettings), max: s.max, value, text: sliderText(value) };
			}),
			toggles: TOGGLES.map((t) => ({ key: t.key, title: t.title, on: Boolean(uiSettings[t.key]) })),
		};
	});

	const setScale = (v: number) => {
		uiSettings.uiScale = v;
		uiScale.value = v;
	};

	return {
		settings, uiScale, uiWidth,

		//A slider moved: applied at once, as the old window's buttons applied it
		slide(key: SliderSetting["key"], v: number) {
			if (key === "uiSize") {
				uiSettings.uiSize = v;
				uiWidth.value = v;
			} else if (key === "uiScale") {
				suggested.value = null;
				setScale(v);
			} else {
				uiSettings.zoomLevel = v;
				uiSettings.mapZoom = v !== 1;
				scale.value = v;
			}
			changed.value++;
		},

		toggleSetting(key: ToggleKey) {
			const t = toggleSetting(uiSettings, key, typeof devicePixelRatio === "number" ? devicePixelRatio : 1);
			needReload ||= t.reload;
			if (t.scale !== null) suggested.value = t.scale;
			changed.value++;
			refresh();
		},

		//OK: the suggested scale applied, the settings saved, the page reloaded when a switch needs it, else the start menu
		closeSettings() {
			if (suggested.value !== null) setScale(suggested.value);
			suggested.value = null;
			if (host.saveSettings) host.saveSettings();
			menu.value = menuBack();
			if (needReload && reload) reload();
		},
	};
}
