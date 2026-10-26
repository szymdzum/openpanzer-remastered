//The new UI's root under ?ui=new (#380): for now the map (#345), the HUD so far (#346: the status bar, the game menu,
//the unit info; the context menu is the map's), End turn and the message window, composed of the component library. The
//HUD (D3) and the windows (D5) replace them piece by piece. The components only read the
//store's signals and send its commands: what they show and why a control is off is the view model's.
import { Button } from "./button";
import { IconSprite } from "./icon";
import { UnitInfoPanel } from "./infopanel";
import { UnitCardPanel } from "./unitsheet";
import { List } from "./list";
import { MapView } from "./map";
import { Panel, Scrim, Window } from "./panel";
import { EndTurn, EndTurnQuestion, Rail } from "./rail";
import { StatusBar } from "./statusbar";
import { AiIndicator, TurnBanner } from "./turnbanner";
import type { Store } from "./store";

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
			<Rail store={store} />
			<UnitInfoPanel store={store} />
			<UnitCardPanel store={store} />
			<Reserve store={store} />
			<TurnBanner store={store} />
			<AiIndicator store={store} />
			<EndTurn store={store} />
			<EndTurnQuestion store={store} />
			<Message store={store} />
		</div>
	);
}
