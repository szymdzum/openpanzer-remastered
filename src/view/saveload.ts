//The save and load window (SaveLoad, #349): the names the old window gave a save (src/uibuilder.ts gameStateButton,
//onCloudSaved) and the last three cloud saves it remembered in the settings (fillCloudSavesList). Plain TypeScript.
import type { World } from "../core/types";
import type { CloudSave } from "../prototypes";

//What the old window wrote when a file didn't load
export const LOAD_ERROR = "Error loading game. Cannot parse save game data.";

//The game a save holds, as the old window named it: "(Campaign) Ciechanow Turn 4"
export function saveName(w: World): string {
	return (w.state.campaign !== null ? "(Campaign) " : "(Scenario) ") + w.data.name + " Turn " + w.state.turn.turn;
}

//A file's name: the save's name and when it was saved
export function fileName(w: World, at: Date): string {
	return saveName(w) + " " + at.toDateString() + " " + at.toLocaleTimeString() + ".json";
}

//The cloud saves after one more: an id already there takes the new name, else the save is added last, the first of three
//dropped
export function rememberCloudSave(saves: CloudSave[], name: string, id: string): CloudSave[] {
	if (saves.some((s) => s.id === id)) return saves.map((s) => s.id === id ? { name, id } : s);
	return [...saves.slice(saves.length > 2 ? 1 : 0), { name, id }];
}

//The list's three rows, the empty ones too (a click on one clears the field, as the old empty rows did)
export function cloudRows(saves: CloudSave[]): CloudSave[] {
	return [0, 1, 2].map((i) => saves[i] || { name: "", id: "" });
}
