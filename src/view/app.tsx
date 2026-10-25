//The new UI's root under ?ui=new (#380): for now the map (#345), the status bar's side, turn and prestige,
//the selected unit with its actions, End turn and the message window, composed of the component library. The
//HUD (D3) and the windows (D5) replace them piece by piece. The components only read the
//store's signals and send its commands: what they show and why a control is off is the view model's.
import { Button } from "./button";
import { Icon, IconSprite } from "./icon";
import { List } from "./list";
import { MapView } from "./map";
import { Panel, Scrim, Window } from "./panel";
import type { Store } from "./store";

//(a refusal for the Button: undefined when the action can be taken)
const off = (refusal: string | null) => refusal === null ? undefined : refusal;

function StatusBar({ store }: { store: Store }) {
	const prestige = store.prestige.value;
	return (
		<Panel class="pm-status">
			<div class="row">
				<span class={store.side.value === 1 ? "pm-side allied" : "pm-side"}>{store.sideName.value}<span class="chip" aria-hidden="true" /></span>
				<span class="pm-sep" />
				<span class="cell"><span class="pm-label">Turn</span>{store.turn.value}</span>
				<span class="grow" />
				{prestige !== null && <span class="cell pm-prestige" title="Prestige"><Icon name="prestige" size="sm" />{prestige}</span>}
			</div>
			<MapLine store={store} />
		</Panel>
	);
}

//The status line: on the strategic map how to leave it (StrategicMap); while deploying what a click does (Deployment);
//else the layer shown first (AirLayer), then a refusal or the selected unit
function MapLine({ store }: { store: Store }) {
	const unit = store.unit.value, air = store.airMode.value, deploy = store.deployment.value;
	if (store.strategic.value)
		return <output class="msg"><b>Strategic map</b><span>{air ? "air layer" : "ground layer"} · click a place to zoom in there</span></output>;
	if (deploy !== null && store.refused.value === null)
		return <output class="msg"><b>Deploy</b><span>{deploy.unit.name} · click a brass hex to place it · {deploy.waiting} in reserve</span></output>;
	return (
		<output class="msg">
			{air && <b>Air layer</b>}
			{store.refused.value !== null ? <span>{store.refused.value}</span>
				: unit !== null && <span><b>{unit.name}</b> {unit.className} · strength {unit.strength} · {unit.moves} moves left</span>}
		</output>
	);
}

//The selected unit's actions, each off with its reason (the unit context's, D3, with their amounts)
function UnitActions({ store }: { store: Store }) {
	const unit = store.unit.value;
	if (unit === null || !unit.own) return null;
	return (
		<Panel class="pm-actions" label={unit.name}>
			{unit.actions.map((a) => <Button key={a.label} disabled={off(a.refusal)} onClick={() => store.dispatch(a.command)}>{a.label}</Button>)}
		</Panel>
	);
}

//The units waiting in the reserve, until the reserve tray (Deployment, D5): one picked to place on the map, or
//none to play on, the reserve kept for later
function Reserve({ store }: { store: Store }) {
	const reserve = store.reserve.value, picked = store.deployment.value;
	if (reserve.length === 0) return null;
	if (picked === null)
		return <Panel class="pm-reserve"><Button icon="deploy" onClick={() => store.pick(reserve[0].index)}>Deploy · {reserve.length} in reserve</Button></Panel>;
	return (
		<Panel class="pm-reserve">
			<List label="Reserve" groups={[{ rows: reserve.map((r) => ({ id: String(r.index), title: r.name, value: r.strength })) }]}
				selected={String(picked.unit.index)} onSelect={(id) => store.pick(Number(id))} />
			<Button onClick={() => store.pick(null)}>Done</Button>
		</Panel>
	);
}

function EndTurn({ store }: { store: Store }) {
	return (
		<div id="endturn" class="pm-endturn">
			<Button variant="primary" large icon="end-turn" disabled={off(store.endTurn.value)}
				onClick={() => store.dispatch({ type: "endTurn" })}>End turn</Button>
		</div>
	);
}

//The open message, over the rest: the scenario's briefing, the game's outcome, the tutorial's orders
function Message({ store }: { store: Store }) {
	const note = store.note.value;
	if (note === null) return null;
	return (
		<>
			<Scrim />
			<Window id="ui-message" class="pm-message" title={note.title}
				footer={<><span class="grow" /><Button variant="primary" onClick={() => store.close()}>OK</Button></>}>
				<div class="pm-typed" dangerouslySetInnerHTML={{ __html: note.html }} />
			</Window>
		</>
	);
}

export function App({ store }: { store: Store }) {
	return (
		<div class="pm pm-screen">
			<IconSprite />
			<MapView store={store} />
			<StatusBar store={store} />
			<UnitActions store={store} />
			<Reserve store={store} />
			<EndTurn store={store} />
			<Message store={store} />
		</div>
	);
}
