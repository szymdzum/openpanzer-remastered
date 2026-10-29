//The save and load window as signals (SaveLoad, #349): the cloud id field (its value and placeholder, which the cloud saves
//write their progress and errors into, as they wrote the old #cloudid), the last file saved, the load error, and the
//last cloud saves kept in the settings. The saves and loads are the host's; a game loaded closes the start menu.
import { computed, type Signal, signal } from "@preact/signals";
import type { World } from "../core/types";
import type { CloudReport } from "../app/storage";
import type { GameHost } from "../app/host";
import { uiSettings } from "../prototypes";
import { MENU_CLOSED, menuBack, type MenuState } from "./menus";
import { cloudRows, fileName, LOAD_ERROR, rememberCloudSave, saveName } from "./saveload";
import { settingSignals } from "./uisettings";

//What the window asks of the host (none in the tests of the map and the HUD)
export type SaveLoadHost = Partial<Pick<GameHost, "exportGame" | "loadGame" | "saveToCloud" | "loadFromCloud" | "saveSettings">>;

type SaveLoadInputs = {
	host: SaveLoadHost,
	world: Signal<World | null>,
	menu: Signal<MenuState>,
	//a file of the page's to download: its name and its text (none without a page)
	download?: (name: string, text: string) => void,
};

//The field the old window prefilled: the last cloud save's id
const lastCloudId = () => uiSettings.lastCloudSave.length > 0 ? uiSettings.lastCloudSave[uiSettings.lastCloudSave.length - 1].id : "";

export function createSaveLoad({ host, world, menu, download }: SaveLoadInputs) {
	const cloudId = signal(lastCloudId());
	const placeholder = signal("Enter numeric ID to Load from Cloud");
	const lastFile = signal("none");
	const loadError = signal("");
	const lastCloudSave = settingSignals().lastCloudSave;
	//How a cloud save or load goes: the field shows it, an error's hint as its placeholder
	const report: CloudReport = (text, hint) => {
		cloudId.value = text;
		if (hint !== undefined) placeholder.value = hint;
	};

	const saveLoad = computed(() => {
		if (menu.value.window !== "saveload") return null;
		return { cloudId: cloudId.value, placeholder: placeholder.value, lastFile: lastFile.value, error: loadError.value,
			recent: cloudRows(lastCloudSave.value) };
	});

	//A game loaded: the start menu closed, the game shown under it
	const loaded = () => {
		loadError.value = "";
		menu.value = MENU_CLOSED;
	};

	return {
		saveLoad,

		saveToFile() {
			const w = world.value;
			if (w === null || !host.exportGame || !download) return;
			const name = fileName(w, new Date());
			download(name, host.exportGame());
			lastFile.value = name;
		},

		loadFile(file: Blob) {
			if (host.loadGame) host.loadGame(file, loaded, () => { loadError.value = LOAD_ERROR; });
		},

		//The cloud save remembered once saved, the settings saved, the field showing the last one's id
		saveToCloud() {
			const w = world.value;
			if (w === null || !host.saveToCloud) return;
			const name = saveName(w);
			host.saveToCloud(cloudId.value, report, (error, id) => {
				if (error) return;
				uiSettings.lastCloudSave = rememberCloudSave(uiSettings.lastCloudSave, name, id!);
				if (host.saveSettings) host.saveSettings();
				cloudId.value = lastCloudId();
			});
		},

		loadFromCloud() {
			if (host.loadFromCloud) host.loadFromCloud(cloudId.value, report, loaded);
		},

		//The field typed in, or a recent save's row picked (an empty row clears it)
		setCloudId(id: string) {
			cloudId.value = id;
		},

		//OK: the start menu, the load error gone
		closeSaveLoad() {
			loadError.value = "";
			menu.value = menuBack();
		},
	};
}
