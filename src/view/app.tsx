//The UI's root: the map, the HUD (status bar, game menu, the unit context menu docked above the unit info),
//End turn, the windows, the message window and the start menu over them all. The components only read the store's
//signals and send its commands: what they show and why a control is off is the view model's.
import { IconSprite } from "./components/icon";
import { UnitContextMenu } from "./components/contextmenu";
import { UnitInfoPanel } from "./hud/infopanel";
import { UnitStrip } from "./hud/unitstrip";
import { DeployButton, ReserveTray } from "./hud/tray";
import { LogWindow } from "./windows/logwindow";
import { MessageDialog } from "./hud/message";
import { StartMenu } from "./windows/startmenu";
import { SettingsWindow } from "./windows/settingswindow";
import { DossierWindow } from "./windows/dossierwindow";
import { ShopWindow } from "./windows/shopwindow";
import { MapView } from "./map/map";
import { EndTurn, EndTurnQuestion, Rail } from "./hud/rail";
import { StatusBar } from "./hud/statusbar";
import { AiIndicator, TurnBanner } from "./hud/turnbanner";
import type { Store } from "./store/store";
import { useEffect, useRef } from "preact/hooks";

//The room the dock takes at the screen's bottom, kept in the store: the map scrolls past it
function useDockHeight(store: Pick<Store, "dockHeight">) {
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
			<div class="pm-corner">
				<DeployButton store={store} />
				<EndTurn store={store} />
			</div>
			<EndTurnQuestion store={store} />
			<ShopWindow store={store} />
			<LogWindow store={store} />
			<DossierWindow store={store} />
			<MessageDialog store={store} />
			<StartMenu store={store} />
			{store.menu.value.window === "settings" && <SettingsWindow store={store} />}
		</div>
	);
}
