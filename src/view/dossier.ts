//The dossier's view model (Dossier, CampaignEnd, #348): only what the game keeps (the Dossier card's table). The
//campaign player's dossier counts units by class, enemy units destroyed and core and auxiliary units lost, over the
//whole campaign, and lists its scenarios by outcome; the old dossier (UIBuilder.showDossier) showed the counts of its
//eight classes and a medal for each outcome with the scenarios won so. At the campaign's end the same window opens under
//the outcome's stamp and the campaign's closing words (UIBuilder.showCampaignEnd). From the core's World and nothing else
import { campaignPlayer } from "../core/campaign";
import { newDossier } from "../core/draft";
import type { World } from "../core/types";
import type { ScenarioOutcome } from "../core/types";
import { unitClass } from "../core/tables";
import type { IconName } from "./icon";
import { classIcon, countryName, prestigeText } from "./model";

//A count of the class table: a zero muted, a loss above zero critical
export interface Count {
	value: number;
	tone?: "muted" | "critical";
}

//The table of counts by class: a column per class, a row per count, with the ids the old dossier had
export interface ClassTable {
	columns: { label: string, icon: IconName }[];
	rows: { label: string, id: string, cells: Count[] }[];
}

//A medal of the record: its outcome, how many scenarios won so and their names (none yet: drawn faded)
export interface Medal {
	outcome: Exclude<ScenarioOutcome, "lose">;
	label: string;
	count: number;
	names: string[];
}

export interface DossierView {
	title: string; //"Germany campaign"
	destroyed: number;
	lost: number;
	played: number; //the scenarios with an outcome
	prestige: string;
	table: ClassTable;
	medals: Medal[];
	defeats: string[]; //the scenarios lost: no medal (the old dossier listed them)
}

//The old dossier's eight classes (UIBuilder.eqClassButtons), in its order
const CLASSES: [number, string][] = [[unitClass.infantry, "Infantry"], [unitClass.tank, "Tank"], [unitClass.recon, "Recon"],
	[unitClass.antiTank, "Anti-tank"], [unitClass.artillery, "Artillery"], [unitClass.airDefence, "Air defence"],
	[unitClass.fighter, "Fighter"], [unitClass.tacticalBomber, "Bomber"]];
const MEDALS: [Medal["outcome"], string][] = [["briliant", "Brilliant"], ["victory", "Victory"], ["tactical", "Tactical"]];

function tableOf(count: (k: "killed" | "lostcore" | "lostaux", uclass: number) => number): ClassTable {
	const row = (label: string, id: string, k: "killed" | "lostcore" | "lostaux", loss: boolean) => ({ label, id, cells: CLASSES.map(([uclass]): Count => {
		const value = count(k, uclass);
		return value === 0 ? { value, tone: "muted" } : loss ? { value, tone: "critical" } : { value };
	}) });
	return { columns: CLASSES.map(([uclass, label]) => ({ label, icon: classIcon(uclass)! })),
		rows: [row("Destroyed", "dossierDestroyed", "killed", false), row("Core lost", "dossierLostCore", "lostcore", true),
			row("Auxiliary lost", "dossierLostAux", "lostaux", true)] };
}

const sum = (counts: { [uclass: number]: number } | undefined) => Object.values(counts || {}).reduce((n, c) => n + (+c || 0), 0);

//The campaign player's dossier, null outside a campaign (the old window opened only in one)
export function dossierOf(w: World): DossierView | null {
	const c = w.state.campaign;
	if (c === null) return null;
	const id = campaignPlayer(w.state, c), p = w.state.players[id];
	if (p === undefined) return null;
	//(one not set up yet shown empty, as the old window did, #403)
	const d = p.dossier.units !== undefined ? p.dossier : newDossier();
	const units = d.units!, outcomes = d.outcomes || {};
	const count = (k: "killed" | "lostcore" | "lostaux", uclass: number) => +(units[k]?.[uclass] ?? 0);
	return {
		title: countryName(w, p.country) + " campaign", destroyed: sum(units.killed), lost: sum(units.lostcore) + sum(units.lostaux),
		played: Object.values(outcomes).reduce((n, list) => n + list.length, 0), prestige: prestigeText(p.prestige),
		table: tableOf(count),
		medals: MEDALS.map(([outcome, label]) => ({ outcome, label, count: (outcomes[outcome] || []).length, names: outcomes[outcome] || [] })),
		defeats: outcomes.lose || [],
	};
}

//The campaign's end over the dossier: its title, the stamp's words (its colour repeats them, ok or critical) and the
//campaign's closing words, verbatim
export interface CampaignEndView {
	title: string;
	stamp: string;
	won: boolean;
	html: string;
}

export function campaignEndOf(outcome: ScenarioOutcome, html: string): CampaignEndView {
	const won = outcome !== "lose";
	return { title: won ? "Campaign victory" : "Campaign defeat", stamp: won ? "Mission accomplished" : "Relieved of command", won, html };
}
