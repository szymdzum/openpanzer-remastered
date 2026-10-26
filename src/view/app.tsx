//The new UI's root under ?ui=new (#380): for now the map (#345), the HUD so far (#346: the status bar, the game menu,
//the unit context menu docked above the unit info at the bottom, as the old UI's), End turn and the message window, composed of the component library. The
//HUD (D3) and the windows (D5) replace them piece by piece. The components only read the
//store's signals and send its commands: what they show and why a control is off is the view model's.
import { IconSprite } from "./icon";
import { UnitContextMenu } from "./contextmenu";
import { UnitInfoPanel } from "./infopanel";
import { UnitCardPanel } from "./unitsheet";
import { UnitStrip } from "./unitstrip";
import { ReserveTray } from "./tray";
import { LogWindow } from "./logwindow";
import { MessageDialog } from "./message";
import { DossierWindow } from "./dossierwindow";
import { ShopWindow } from "./shopwindow";
import { MapView } from "./map";
import { EndTurn, EndTurnQuestion, Rail } from "./rail";
import { StatusBar } from "./statusbar";
import { AiIndicator, TurnBanner } from "./turnbanner";
import type { Store } from "./store";

export function App({ store }: { store: Store }) {
	return (
		<div class="pm pm-screen">
			<IconSprite />
			<MapView store={store} />
			<StatusBar store={store} />
			<Rail store={store} />
			<div class="pm-dock">
				<UnitContextMenu store={store} />
				<UnitInfoPanel store={store} />
			</div>
			<UnitCardPanel store={store} />
			<UnitStrip store={store} />
			<ReserveTray store={store} />
			<TurnBanner store={store} />
			<AiIndicator store={store} />
			<EndTurn store={store} />
			<EndTurnQuestion store={store} />
			<ShopWindow store={store} />
			<LogWindow store={store} />
			<DossierWindow store={store} />
			<MessageDialog store={store} />
		</div>
	);
}
