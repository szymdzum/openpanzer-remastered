//The save and load window: the names a save is given and the last three cloud saves remembered in the settings.
//Plain TypeScript.
import type { World } from "../../core/types";
import type { CloudSave } from "../../app/settings";

//Shown when a file didn't load
export const LOAD_ERROR = "Error loading game. Cannot parse save game data.";

//"(Campaign) Ciechanow Turn 4"
export function saveName(w: World): string {
	return (w.state.campaign !== null ? "(Campaign) " : "(Scenario) ") + w.data.name + " Turn " + w.state.turn.turn;
}

export function fileName(w: World, at: Date): string {
	return saveName(w) + " " + at.toDateString() + " " + at.toLocaleTimeString() + ".json";
}

//An id already there takes the new name, else the save is added last and the first of three is dropped
export function rememberCloudSave(saves: CloudSave[], name: string, id: string): CloudSave[] {
	if (saves.some((s) => s.id === id)) return saves.map((s) => s.id === id ? { name, id } : s);
	return [...saves.slice(saves.length > 2 ? 1 : 0), { name, id }];
}

//Three rows, the empty ones too (a click on one clears the field)
export function cloudRows(saves: CloudSave[]): CloudSave[] {
	return [0, 1, 2].map((i) => saves[i] || { name: "", id: "" });
}
