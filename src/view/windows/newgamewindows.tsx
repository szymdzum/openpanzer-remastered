//The new campaign's and the new scenario's windows over the start menu (CampaignSelect, ScenarioSelect, #349), with what
//the old windows had. A campaign: the list of campaigns, its description, its country, its difficulty with the help
//button, its scenarios and starting prestige; Play, Back and the campaign's flow. A scenario: the list under its group
//headers, its description, each side's countries with whether the AI plays them; Play and Back. Esc closes the start
//menu, as the old Options did.
import { safeHtml } from "../html";
import { Fragment } from "preact";
import { useLayoutEffect, useRef } from "preact/hooks";
import { Button } from "../components/button";
import { Facts } from "../components/facts";
import { Icon, Mark } from "../components/icon";
import { List } from "../components/list";
import { Window } from "../components/panel";
import { DIFFICULTIES } from "./newgame";
import type { ScenarioPlayer } from "./newgame";
import type { Store } from "../store/store";
import { SegmentedControl } from "../components/tabs";
import { Toggle } from "../components/controls";

//The focus on the row picked when a window opens, the list scrolled to it: the menus are keyboard-first. (By a ref: the
//old UI's markup, set aside on the page, has the same ids)
function useFocusPicked() {
	const ref = useRef<HTMLDivElement>(null);
	useLayoutEffect(() => {
		const list = ref.current!;
		(list.querySelector<HTMLInputElement>("input:checked") || list.querySelector<HTMLInputElement>("input"))!.focus();
	}, []);
	return ref;
}

const DIFFICULTY_OPTIONS = DIFFICULTIES.map((d) => ({ value: String(d.value), label: d.name }));

//What CampaignWindow reads of the store
type CampaignWindowReads = Pick<Store, "campaign" | "campaignFlow" | "difficultyHelp" | "menuBack" | "pickCampaign" |
	"pickDifficulty" | "playCampaign">;
export function CampaignWindow({ store }: { store: CampaignWindowReads }) {
	const c = store.campaign.value!;
	const pick = useFocusPicked();
	const v = c.view;
	return (
		<Window id="smCamp" class="pm-pick" title="Campaigns"
			footer={<>
				<Button id="smCFlowBut" variant="ghost" icon="map" onClick={() => store.campaignFlow()}>Campaign flow</Button>
				<span class="grow" />
				<Button id="smCBackBut" onClick={() => store.menuBack()}>Back</Button>
				<Button id="smCPlayBut" variant="primary" large icon="play" onClick={() => store.playCampaign()}>Play</Button>
			</>}>
			<div ref={pick} id="smCampSel" class="pick">
				<List label="Campaigns" groups={[{ rows: c.rows }]} selected={c.picked} onSelect={(id) => store.pickCampaign(Number(id))} />
			</div>
			<div class="detail">
				<h2 class="pm-title">{v.title}</h2>
				<Facts id="smCampInfo" facts={[
					{ label: "Country", id: "smCampCountry", value: <>{v.nation && <Mark nation={v.nation} size="sm" />}{v.country}</> },
					{ label: "Scenarios", id: "smCampScenarios", value: v.scenarios },
					{ label: "Start prestige", id: "smCampPrestige", tone: "prestige", value: <><Icon name="prestige" size="sm" />{v.prestige}</> }]} />
				<div id="smCampDif" class="difficulty">
					<span class="pm-label">Difficulty</span>
					<SegmentedControl label="Difficulty" options={DIFFICULTY_OPTIONS} value={String(c.difficulty)} onChange={(d) => store.pickDifficulty(Number(d))} />
					<Button id="smCampDifHelp" variant="ghost" icon="help" label="Difficulty help" onClick={() => store.difficultyHelp()} />
				</div>
				<div id="smCampDesc" class="desc pm-typed" dangerouslySetInnerHTML={{ __html: safeHtml(c.description) }} />
			</div>
		</Window>
	);
}

function Player({ store, p }: { store: Pick<Store, "toggleAI">, p: ScenarioPlayer }) {
	return (
		<div class="player">
			{p.nation && <Mark nation={p.nation} />}
			<span class="who">{p.country}</span>
			<span class="pm-label">AI</span>
			<Toggle id={"ai" + p.id} label={p.country + " played by the AI"} checked={p.ai} onChange={() => store.toggleAI(p.id)} />
		</div>
	);
}

export function ScenarioWindow({ store }: { store: Pick<Store, "menuBack" | "pickScenario" | "playScenario" | "scenario" | "toggleAI"> }) {
	const s = store.scenario.value!;
	const pick = useFocusPicked();
	const v = s.view;
	return (
		<Window id="smScen" class="pm-pick" title="Scenarios"
			footer={<>
				<span class="grow" />
				<Button id="smSBackBut" onClick={() => store.menuBack()}>Back</Button>
				<Button id="smSPlayBut" variant="primary" large icon="play" disabled={v === null ? "Pick a scenario" : undefined}
					onClick={() => store.playScenario()}>Play</Button>
			</>}>
			<div ref={pick} id="smScenSel" class="pick">
				<List label="Scenarios" groups={s.groups} selected={s.picked} onSelect={(id) => store.pickScenario(Number(id))} />
			</div>
			{v !== null && (
				<div class="detail">
					<h2 class="pm-title">{v.title}</h2>
					<div id="smScenPlayers" class="pm-vs">
						{v.sides.map((side, i) => (
							<Fragment key={side.name}>
								{i === 1 && <span id="smVS" class="pm-label">VS</span>}
								<div id={"smSide" + i} class={i === 0 ? "side axis" : "side allied"}>
									<span class="pm-label">{side.name}</span>
									{side.players.map((p) => <Player key={p.id} store={store} p={p} />)}
								</div>
							</Fragment>
						))}
					</div>
					<div id="smScenDesc" class="desc pm-typed" dangerouslySetInnerHTML={{ __html: safeHtml(v.description) }} />
				</div>
			)}
		</Window>
	);
}
