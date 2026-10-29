//The settings window as signals: the values in uiSettings, changed there; each is a signal (src/view/uisettings.ts),
//so what they change follows at once (the interface's width and scale, the map's scale, the plaques and marks; the
//world the fog of war is read from is read again). Its OK saves them on the host, applies the interface scale a
//switch suggested, reloads the page when a switch needs it, and goes back to the start menu.
import { computed, type Signal, signal } from "@preact/signals";
import type { GameHost } from "../../app/host";
import { uiSettings } from "../../app/settings";
import { menuBack, type MenuState } from "./menus";
import { SLIDERS, type SliderSetting, sliderText, type ToggleKey, toggleSetting, TOGGLES } from "./settings";
import { settingSignals } from "../uisettings";

//What the window asks of the host: the settings saved (none in the tests of the map and the HUD)
export type SettingsHost = Partial<Pick<GameHost, "saveSettings">>;

type SettingsInputs = {
	host: SettingsHost,
	menu: Signal<MenuState>,
	//the world read again (the fog of war)
	refresh: () => void,
	//the page reloaded (none without a page)
	reload?: () => void,
};

export function createSettings({ host, menu, refresh, reload }: SettingsInputs) {
	const setting = settingSignals();
	//a switch's reload and suggested interface scale, until the window closes
	let needReload = false;
	const suggested = signal<number | null>(null);

	const valueOf = (s: SliderSetting) => s.key === "uiScale" && suggested.value !== null ? suggested.value : Number(setting[s.key].value);
	const settings = computed(() => {
		if (menu.value.window !== "settings") return null;
		return {
			sliders: SLIDERS.map((s) => {
				const value = valueOf(s);
				return { key: s.key, title: s.title, step: s.step, min: s.min(uiSettings), max: s.max, value, text: sliderText(value) };
			}),
			toggles: TOGGLES.map((t) => ({ key: t.key, title: t.title, on: Boolean(setting[t.key].value) })),
		};
	});

	return {
		settings,
		//The interface's scale and width as the page applies them (src/view/screen.tsx), and the map's scale
		uiScale: setting.uiScale, uiWidth: setting.uiSize, scale: setting.zoomLevel,

		//A slider moved: applied at once
		slide(key: SliderSetting["key"], v: number) {
			if (key === "uiScale") suggested.value = null;
			uiSettings[key] = v;
		},

		toggleSetting(key: ToggleKey) {
			const t = toggleSetting(uiSettings, key, typeof devicePixelRatio === "number" ? devicePixelRatio : 1);
			needReload ||= t.reload;
			if (t.scale !== null) suggested.value = t.scale;
			refresh();
		},

		//OK: the suggested scale applied, the settings saved, the page reloaded when a switch needs it, else the start menu
		closeSettings() {
			if (suggested.value !== null) uiSettings.uiScale = suggested.value;
			suggested.value = null;
			if (host.saveSettings) host.saveSettings();
			menu.value = menuBack();
			if (needReload && reload) reload();
		},
	};
}
