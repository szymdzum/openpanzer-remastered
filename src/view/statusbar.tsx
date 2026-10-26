//The status bar (StatusBar, #346): the one always-visible strip of game state. The top row has the side whose turn
//it is (its flag, its country and a chip in the side's colour), the turn, the date, the weather and the ground, the
//rules the game plays (#317), the person's prestige, and the unit list and turn report buttons; the second row is
//the status line. What each cell says is the view model's (src/view/model.ts statusOf), carried by the store.
import { Button } from "./button";
import { Icon, Mark } from "./icon";
import { Panel } from "./panel";
import type { Store } from "./store";

//The unit list button opens the strip of the person's units (UnitList); the turn report button opens the short report
//again (TurnStart)

export function StatusBar({ store }: { store: Store }) {
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
//else the layer shown first (AirLayer), then a refusal, the last combat's news (CombatResults) or the selected unit
function MapLine({ store }: { store: Store }) {
	const air = store.airMode.value, deploy = store.deployment.value;
	if (store.strategic.value)
		return <output class="msg"><b>Strategic map</b><span>{air ? "air layer" : "ground layer"} · click a place to zoom in there</span></output>;
	if (deploy !== null && store.refused.value === null)
		return <output class="msg"><b>Deploy</b><span>{deploy.unit.name} · click a brass hex to place it · {deploy.waiting} in reserve</span></output>;
	return <output class="msg">{air && <b>Air layer</b>}<Said store={store} /></output>;
}

//A refusal, else the last combat's news, else the selected unit
function Said({ store }: { store: Store }) {
	const unit = store.unit.value, news = store.news.value;
	if (store.refused.value !== null) return <span>{store.refused.value}</span>;
	if (news !== null) return <span><b>{news.name}</b> {news.text}</span>;
	return unit === null ? null
		: <span><b>{unit.name}</b> {unit.className} · {unit.moves} of {unit.movpoints} moves left · hex {unit.at.row},{unit.at.col}{unit.place !== "" && " · " + unit.place}</span>;
}
