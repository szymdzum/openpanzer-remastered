//What the campaign and scenario windows show of the game's lists. Plain TypeScript on the lists it is given
//(campaignlist.js, scenariolist.js) and the settings' AI sides.
import type { World } from "../../core/types";
import { countryNames, difficultyType } from "../../legacy/prototypes";
import { sideNames } from "../../core/tables";
import type { Nation } from "../components/icon";
import { nationOf } from "../store/model";

//Tactical is picked at first
export const DIFFICULTIES: { value: number, name: string }[] = [
	{ value: difficultyType.historical, name: "Historical" }, { value: difficultyType.tactical, name: "Tactical" },
	{ value: difficultyType.operational, name: "Operational" }];
export const FIRST_DIFFICULTY = difficultyType.tactical;

//Shown in the campaign's description when the difficulty help button is pressed
export const DIFFICULTY_HELP = "Historical - Highest difficulty<br>Tactical - Medium difficulty +20% starting prestige, +10% starting prestige per turn, +20% extra turns, -20% score.<br>Operational - Lowest difficulty + 50% starting prestige, +25% starting prestige per turn, +50% extra turns. -50% score";

//The id is the row's index in the game's list
export interface PickRow {
	id: string;
	title: string;
}

export function campaignRows(list: CampaignListEntry[]): PickRow[] {
	return list.map((c, i) => ({ id: String(i), title: c.title }));
}

//The campaign picked when the window opens: the one played, by its title, else the first
export function campaignAtOpen(list: CampaignListEntry[], w: World | null): number {
	const c = w === null ? null : w.state.campaign;
	const at = c === null || list[c.id] === undefined ? -1 : list.findIndex((e) => e.title === list[c.id].title);
	return Math.max(at, 0);
}

export interface CampaignView {
	title: string;
	country: string;
	nation: Nation | null;
	scenarios: number;
	//the list's starting prestige (not the difficulty's)
	prestige: number;
	//its description, HTML
	description: string;
}

export function campaignView(list: CampaignListEntry[], index: number): CampaignView {
	const c = list[index], country = countryNames[c.eqp][c.flag];
	return { title: c.title, country, nation: nationOf(country), scenarios: c.scenarios, prestige: c.prestige, description: c.desc };
}

//The groups sit under the list's headers (its entries of one element)
export function scenarioGroups(list: ScenarioListEntry[]): { name?: string, rows: PickRow[] }[] {
	const groups: { name?: string, rows: PickRow[] }[] = [];
	list.forEach((e, i) => {
		if (e.length === 1) groups.push({ name: e[0], rows: [] });
		else {
			if (groups.length === 0) groups.push({ rows: [] });
			groups[groups.length - 1].rows.push({ id: String(i), title: e[1] });
		}
	});
	return groups;
}

//The scenario picked when the window opens: the one played, by its name; null when the list hasn't it
export function scenarioAtOpen(list: ScenarioListEntry[], w: World | null): number | null {
	if (w === null) return null;
	const at = list.findIndex((e) => e.length > 1 && e[1].trim() === w.data.name.trim());
	return at < 0 ? null : at;
}

export interface ScenarioPlayer {
	id: number;
	country: string;
	nation: Nation | null;
	//played by the AI (the settings' isAI)
	ai: boolean;
}

export interface ScenarioView {
	title: string;
	//its description, HTML
	description: string;
	sides: { name: string, players: ScenarioPlayer[] }[];
}

export function scenarioView(list: ScenarioListEntry[], index: number, isAI: number[]): ScenarioView {
	const e = list[index] as Exclude<ScenarioListEntry, [string]>;
	const sides = [e[3], e[4]].map((players, s) => ({ name: sideNames[s], players: players.map((p) => {
		const country = countryNames[e[5]][p.country];
		return { id: p.id, country, nation: nationOf(country), ai: Boolean(isAI[p.id]) };
	}) }));
	return { title: e[1], description: e[2], sides };
}

//A scenario picked: its players' AI settings kept, a truthy one made 1 (the tutorial's 2)
export function settleAI(list: ScenarioListEntry[], index: number, isAI: number[]) {
	const e = list[index] as Exclude<ScenarioListEntry, [string]>;
	for (const p of [...e[3], ...e[4]])
		if (isAI[p.id]) isAI[p.id] = 1;
}
