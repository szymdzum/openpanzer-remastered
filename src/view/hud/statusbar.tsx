//The status bar (StatusBar, #346): the one always-visible strip of game state. The top row has the side whose turn
//it is (its flag, its country and a chip in the side's colour), the turn, the date, the weather and the ground, the
//rules the game plays (#317), the person's prestige, and the unit list and turn report buttons; the second row is
//the status line. What each cell says is the view model's (src/view/store/model.ts statusOf), carried by the store.
import { Button } from "../components/button";
import { Icon, Mark } from "../components/icon";
import { Panel } from "../components/panel";
import type { Store } from "../store/store";

//The unit list button opens the strip of the person's units (UnitList); the turn report button opens the short report
//again (TurnStart)

//What StatusBar reads of the store
type StatusBarReads = Pick<Store, "airMode" | "banner" | "country" | "date" | "deployment" | "ground" | "located" |
	"nation" | "news" | "prestigeShown" | "refused" | "reportRefusal" | "rules" | "shopRefusal" | "showReport" |
	"side" | "sideName" | "strategic" | "toggleList" | "turn" | "weather">;
export function StatusBar({ store }: { store: StatusBarReads }) {
	const prestige = store.prestigeShown.value, nation = store.nation.value, weather = store.weather.value, ground = store.ground.value;
	return (
		<Panel id="statusbar" class="pm-status">
			<div class="row">
				<span class={store.side.value === 1 ? "pm-side allied" : "pm-side"}>
					{nation !== null && <Mark nation={nation} size="sm" />}{store.country.value}<span class="pm-sr"> · {store.sideName.value}</span>
					<span class="chip" aria-hidden="true" />
				</span>
				<span class="pm-sep" />
				<span class="cell"><span class="pm-label">Turn</span>{store.turn.value}</span>
				<span class="cell">{store.date.value}</span>
				{weather !== null && <span class="cell" title="Weather"><Icon name={weather.icon} size="sm" />{weather.word}</span>}
				{ground !== null && <span class="cell" title="Ground"><Icon name={ground.icon} size="sm" />{ground.word}</span>}
				<span class="cell" title="The rules this game plays"><span class="pm-label">Rules</span>{store.rules.value}</span>
				<span class="grow" />
				{prestige !== null && <span class="cell pm-prestige" title="Prestige"><Icon name="prestige" size="sm" />{prestige}</span>}
				<Button id="statusBarButton" icon="unit-list" label="Unit list" disabled={store.shopRefusal.value} onClick={() => store.toggleList()} />
				<Button id="combatLogButton" icon="document" label="Turn report" disabled={store.reportRefusal.value}
					onClick={() => store.showReport(!store.banner.value)} />
			</div>
			<MapLine store={store} />
		</Panel>
	);
}

//The status line: on the strategic map how to leave it (StrategicMap); while deploying what a click does (Deployment);
//else the layer shown first (AirLayer), then a refusal, the last combat's news (CombatResults) or the hex under the
//pointer, as the old UI's #locmsg told it
function MapLine({ store }: { store: Pick<Store, "airMode" | "deployment" | "located" | "news" | "refused" | "strategic"> }) {
	const air = store.airMode.value, deploy = store.deployment.value;
	if (store.strategic.value)
		return <output class="msg"><b>Strategic map</b><span>{air ? "air layer" : "ground layer"} · click a place to zoom in there</span></output>;
	if (deploy !== null && store.refused.value === null)
		return <output class="msg"><b>Deploy</b><span>{deploy.unit.name} · click a brass hex to place it · {deploy.waiting} in reserve</span></output>;
	return <output class="msg">{air && <b>Air layer</b>}<Said store={store} /></output>;
}

//A refusal, else the last combat's news, else the hex under the pointer: the unit on it, then the place. The line is a
//live region; the hex changes at every hex the pointer crosses, so it isn't announced (#497)
function Said({ store }: { store: Pick<Store, "located" | "news" | "refused"> }) {
	const at = store.located.value, news = store.news.value;
	if (store.refused.value !== null) return <span>{store.refused.value}</span>;
	if (news !== null) return <span><b>{news.name}</b> {news.text}</span>;
	return at === null ? null : <span aria-live="off">{at.unit !== null && <><b>{at.unit}</b> · </>}{at.text}</span>;
}
