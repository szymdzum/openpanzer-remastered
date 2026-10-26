//The new UI's root under ?ui=new (#380): for now the map (#345), the HUD so far (#346: the status bar, the game menu,
//the unit context menu docked above the unit info at the bottom, as the old UI's), End turn and the message window, composed of the component library. The
//HUD (D3) and the windows (D5) replace them piece by piece. The components only read the
//store's signals and send its commands: what they show and why a control is off is the view model's.
import { IconSprite } from "./icon";
import { UnitContextMenu } from "./contextmenu";
import { UnitInfoPanel } from "./infopanel";
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
import { useEffect, useRef } from "preact/hooks";

//The room the dock takes at the screen's bottom, kept in the store: the map scrolls past it (#453)
function useDockHeight(store: Store) {
	const dock = useRef<HTMLDivElement>(null), height = store.dockHeight;
	useEffect(() => {
		const el = dock.current!;
		if (typeof ResizeObserver !== "function") return undefined;
		//(its height and the gap under it, which it sits above the screen's bottom by)
		const watch = new ResizeObserver(() => { height.value = el.offsetHeight + (parseFloat(getComputedStyle(el).bottom) || 0); });
		watch.observe(el);
		return () => watch.disconnect();
	}, [height]);
	return dock;
}

export function App({ store }: { store: Store }) {
	const dock = useDockHeight(store);
	return (
		<div class="pm pm-screen">
			<IconSprite />
			<MapView store={store} />
			<StatusBar store={store} />
			<Rail store={store} />
			<div ref={dock} class="pm-dock">
				<UnitContextMenu store={store} />
				<UnitInfoPanel store={store} />
			</div>
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
