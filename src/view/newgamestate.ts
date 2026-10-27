//The new campaign's and the new scenario's windows as signals (CampaignSelect, ScenarioSelect, #349): the campaign and
//its difficulty picked, the description shown (the campaign's, the difficulty help's or its flow's), the scenario
//picked and the sides the AI plays (the settings' isAI, which the old window changed in place and which are saved
//when the scenario starts). What they show is src/view/newgame.ts's; the starts are the host's.
import { computed, type Signal, signal } from "@preact/signals";
import type { World } from "../core/types";
import type { GameHost } from "../host";
import { uiSettings } from "../prototypes";
import { MENU_CLOSED, type MenuState } from "./menus";
import { campaignAtOpen, campaignRows, campaignView, DIFFICULTY_HELP, FIRST_DIFFICULTY, scenarioAtOpen, scenarioGroups, scenarioView,
	settleAI } from "./newgame";

//What the windows ask of the host: the starts, and a campaign's flow (none in the tests of the map and the HUD)
export type NewGameHost = Partial<Pick<GameHost, "startScenario" | "startCampaign" | "campaignFlow">>;

type NewGameInputs = {
	host: NewGameHost,
	world: Signal<World | null>,
	menu: Signal<MenuState>,
	//the game's lists (campaignlist.js, scenariolist.js), read when a window opens
	lists: () => { campaigns: CampaignListEntry[], scenarios: ScenarioListEntry[] },
};

export function createNewGame({ host, world, menu, lists }: NewGameInputs) {
	const campaignPick = signal(0);
	const difficulty = signal(FIRST_DIFFICULTY);
	//the help's or the flow's text in place of the campaign's description, until another campaign is picked
	const campaignText = signal<string | null>(null);
	const scenarioPick = signal<number | null>(null);
	//(the settings' AI sides changed in place: counted, so the window shows them again)
	const aiChanged = signal(0);

	const campaign = computed(() => {
		if (menu.value.window !== "campaign") return null;
		const { campaigns } = lists(), view = campaignView(campaigns, campaignPick.value);
		return { rows: campaignRows(campaigns), picked: String(campaignPick.value), view, difficulty: difficulty.value,
			description: campaignText.value === null ? view.description : campaignText.value };
	});
	const scenario = computed(() => {
		if (menu.value.window !== "scenario") return null;
		const { scenarios } = lists(), at = scenarioPick.value;
		void aiChanged.value;
		return { groups: scenarioGroups(scenarios), picked: at === null ? undefined : String(at),
			view: at === null ? null : scenarioView(scenarios, at, uiSettings.isAI) };
	});

	const pickCampaign = (index: number) => {
		campaignPick.value = index;
		campaignText.value = null;
	};
	const pickScenario = (index: number) => {
		settleAI(lists().scenarios, index, uiSettings.isAI);
		scenarioPick.value = index;
		aiChanged.value++;
	};

	return {
		campaign, scenario, pickCampaign, pickScenario,

		//A window opening: the campaign or the scenario played picked (a scenario the list hasn't leaves the one before)
		openNewGame(window: "campaign" | "scenario") {
			const { campaigns, scenarios } = lists();
			if (window === "campaign") pickCampaign(campaignAtOpen(campaigns, world.value));
			else {
				const at = scenarioAtOpen(scenarios, world.value);
				if (at !== null) pickScenario(at);
			}
		},

		pickDifficulty(value: number) {
			difficulty.value = value;
		},

		//The help button and the flow button: their text in the description
		difficultyHelp() {
			campaignText.value = DIFFICULTY_HELP;
		},

		campaignFlow() {
			if (host.campaignFlow) host.campaignFlow(campaignPick.value, (html) => { campaignText.value = html; });
		},

		//A side of the scenario played by the AI, or by a person
		toggleAI(id: number) {
			uiSettings.isAI[id] = uiSettings.isAI[id] ? 0 : 1;
			aiChanged.value++;
		},

		//Play: the campaign or the scenario picked started on the host, the start menu closed
		playCampaign() {
			menu.value = MENU_CLOSED;
			if (host.startCampaign) host.startCampaign(campaignPick.value, difficulty.value);
		},

		playScenario() {
			const at = scenarioPick.value;
			if (at === null) return;
			const e = lists().scenarios[at] as Exclude<ScenarioListEntry, [string]>;
			menu.value = MENU_CLOSED;
			if (host.startScenario) host.startScenario(e[0], e[2]);
		},
	};
}
