//The store's turn (src/view/store.ts, review proposal 3): the status bar's cells, End turn and its question (#8), the
//turn reports (TurnBanner, CombatLog) with what the enemy's turn did, the dossier and the campaign's end, and the person's
//turn start
import { computed, signal } from "@preact/signals";
import type { GameEvent } from "../core/events";
import type { World } from "../core/types";
import { unitById, unitData } from "../core/world";
import type { GameHost } from "../host";
import { outcomeNames } from "../core/tables";
import type { ScenarioOutcome } from "../core/types";
import { campaignEndOf, dossierOf } from "./dossier";
import { combatLogOf, emptyLog, logStep, logTurnStart } from "./log";
import { endTurnRefusal, isYourTurn, prestigeText, statusOf, stillToAct, yourPlayer } from "./model";
import { unitsToAct } from "./mapview";
import { stableComputed } from "./stable";
import type { Core } from "./storecore";
import type { MapPart } from "./storemap";
import type { Notes } from "./storenotes";
import type { createStep } from "./storestep";
import { aiStatusOf, type EnemyTurn, firstUnitOf, noteEnemy, quietTurn, turnReportOf } from "./turn";

type Step = Pick<ReturnType<typeof createStep>, "showing">;

export function createTurn(core: Core, map: Pick<MapPart, "deployment">, step: Step, notes: Pick<Notes, "show">, host: Pick<GameHost, "world">) {
	const { world, select, look, dispatch } = core;
	//the units End turn warns of while it asks (#8)
	const asking = signal<string[] | null>(null);
	//what the enemy's turn did to the side shown (from a program's steps), and the short turn report open (TurnBanner)
	const enemy = signal<EnemyTurn>(quietTurn());
	const banner = signal(false);
	//the turn's log from the person's end of turn on, and the full turn report open (CombatLog)
	const log = signal(emptyLog());
	const logOpen = signal(false);
	//the dossier open (Dossier), or the campaign's end over it with what its close does (CampaignEnd)
	const dossierOpen = signal(false);
	const ending = signal<{ outcome: ScenarioOutcome, html: string, closed: () => void } | null>(null);

	const status = stableComputed(() => world.value === null ? null : statusOf(world.value));
	//(each a value of its own: the status bar's cells render again only when theirs changes)
	const side = computed(() => status.value === null ? -1 : status.value.side);
	const sideName = computed(() => status.value === null ? "" : status.value.sideName);
	const turn = computed(() => status.value === null ? "" : status.value.turn + "/" + status.value.maxTurns);
	const prestige = computed(() => status.value === null ? null : status.value.prestige);
	//(written as the HUD writes it: 3,056)
	const prestigeShown = computed(() => prestige.value === null ? null : prestigeText(prestige.value));
	const country = computed(() => status.value === null ? "" : status.value.country);
	const nation = computed(() => status.value === null ? null : status.value.nation);
	const date = computed(() => status.value === null ? "" : status.value.date);
	const weather = computed(() => status.value === null ? null : status.value.weather);
	const ground = computed(() => status.value === null ? null : status.value.ground);
	const rules = computed(() => status.value === null ? "" : status.value.rules);
	const endTurn = computed(() => world.value === null ? "No game is playing" : endTurnRefusal(world.value));
	const askingText = computed(() => asking.value === null ? null : stillToAct(asking.value));
	//the turn report while it is open; the program's turn in progress (the AI indicator)
	const report = stableComputed(() => world.value === null || !banner.value ? null : turnReportOf(world.value, enemy.value));
	const combatLog = stableComputed(() => world.value === null || !logOpen.value ? null : combatLogOf(world.value, log.value, enemy.value));
	const dossier = stableComputed(() => world.value === null || (!dossierOpen.value && ending.value === null) ? null : dossierOf(world.value));
	const campaignEnd = computed(() => ending.value === null ? null : campaignEndOf(ending.value.outcome, ending.value.html));
	const ai = stableComputed(() => world.value === null ? null : aiStatusOf(world.value));
	//(the status bar's turn report button: the person's report, none while a program plays)
	//(the report is there whenever the person has a side, turn.ts turnReportOf)
	const reportRefusal = computed(() => world.value === null || yourPlayer(world.value) === null ? "No report to show" : undefined);

	return {
		side, sideName, turn, prestige, prestigeShown, country, nation, date, weather, ground, rules, endTurn, asking, askingText, banner, report,
		ai, enemy, reportRefusal, combatLog, dossier, campaignEnd,

		//The person's turn ending: the enemy's starts quiet, the report goes
		endingTurn() {
			enemy.value = quietTurn();
			log.value = emptyLog();
			logOpen.value = false;
			banner.value = false;
		},

		//A step in the turn's log, before its beats play
		logStep(before: World, events: GameEvent[]) {
			log.value = logStep(log.value, before, world.value!, events);
		},

		//A new scenario's start: the last game's enemy turn not reported (#466: the old UI reset its combat log at a new
		//scenario and a load)
		reset() {
			log.value = emptyLog();
			enemy.value = quietTurn();
			logOpen.value = false;
			dossierOpen.value = false;
		},

		//Either report's Dossier: the campaign's record over them
		openDossier() {
			dossierOpen.value = true;
		},

		//Its close: at the campaign's end, what the game asked (the main menu)
		closeDossier() {
			const end = ending.value;
			dossierOpen.value = false;
			ending.value = null;
			if (end !== null) end.closed();
		},

		//The campaign's end (the screen's campaignEnd): the dossier under its outcome and closing words; with no campaign
		//player to show (no world), the outcome as a message, as before
		endCampaign(outcome: ScenarioOutcome, html: string, then: () => void) {
			if (world.value !== null && dossierOf(world.value) !== null) ending.value = { outcome, html, closed: then };
			else notes.show({ title: outcomeNames[outcome], html, at: null, ok: then });
		},

		//The full turn report (the short one's Turn report), in place of the short one; closed
		openLog() {
			banner.value = false;
			logOpen.value = true;
		},

		closeLog() {
			logOpen.value = false;
		},

		//What a turn's start did (the screen's turnEvents): its resupplies and reinforcements in the log
		logTurn(events: GameEvent[]) {
			const w = host.world();
			if (w !== null) log.value = logTurnStart(log.value, w, events);
		},

		//End turn: on at once when every unit has done what it can; else the question, with the units that can still
		//act (#8)
		askEndTurn() {
			const w = world.value;
			if (w === null || endTurn.value !== null || step.showing.value) return;
			const ready = unitsToAct(w);
			if (ready.length === 0) dispatch({ type: "endTurn" });
			else asking.value = ready.map((u) => unitData(w, u).name);
		},

		//The question's answer: the turn ended, or played on
		answerEndTurn(end: boolean) {
			asking.value = null;
			if (end) dispatch({ type: "endTurn" });
		},

		//A program's step shown: what it did to the side shown, for the next turn's report
		noteEnemy(events: GameEvent[]) {
			if (world.value !== null) enemy.value = noteEnemy(enemy.value, world.value, events);
		},

		//A person's turn starts (TurnStart): the short report under the status bar, and unless the reserve is being
		//deployed, the first ground unit selected and in the middle of the map
		startTurn() {
			const w = world.value;
			if (w === null || !isYourTurn(w)) return;
			banner.value = true;
			const first = map.deployment.value === null ? firstUnitOf(w) : null;
			if (first === null) return;
			select(first);
			const u = unitById(w, first)!;
			look({ row: u.row, col: u.col });
		},

		//The report's close (×), or the status bar's turn report button: closed, or open again
		showReport(open: boolean) {
			banner.value = open;
		},

		//The reports' Briefing (the short and the full one): the scenario's description in the message window, while one
		//of them is open
		briefing() {
			const w = world.value;
			if (w !== null && (report.value !== null || combatLog.value !== null)) notes.show({ title: w.data.name, html: w.data.description, at: null, ok: () => {}, briefing: true });
		},
	};
}
