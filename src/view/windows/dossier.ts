//The dossier's view model: only what the game keeps (the Dossier card's table), from the core's World. The campaign
//player's dossier counts units by class (destroyed, core lost, auxiliary lost) and lists the scenarios by outcome.
//At the campaign's end the same window opens under the outcome's stamp and the closing words.
import { campaignPlayer } from "../../core/campaign";
import { newDossier } from "../../core/draft";
import type { World } from "../../core/types";
import type { ScenarioOutcome } from "../../core/types";
import { unitClass } from "../../core/tables";
import type { IconName } from "../components/icon";
import { classIcon, countryName, prestigeText } from "../store/model";

//A zero is muted, a loss above zero critical
export interface Count {
	value: number;
	tone?: "muted" | "critical";
}

export interface ClassTable {
	columns: { label: string, icon: IconName }[];
	rows: { label: string, id: string, cells: Count[] }[];
}

//A medal with no scenario won yet is drawn faded
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
	defeats: string[]; //the scenarios lost: no medal
}

//The eight classes the table counts, in the order of its columns
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

//Null outside a campaign
export function dossierOf(w: World): DossierView | null {
	const c = w.state.campaign;
	if (c === null) return null;
	const id = campaignPlayer(w.state, c), p = w.state.players[id];
	if (p === undefined) return null;
	//(one not set up yet is shown empty, #403)
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

//The stamp's colour repeats its words (ok or critical); `html` is the campaign's closing words, verbatim
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
