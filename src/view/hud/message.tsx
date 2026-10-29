//The message dialog: a scenario's briefing as a typed order sheet, the full window with its stamp; every other message
//(a notice, the tutorial's orders, an error) the same window at its short width without the stamp. The game waits for
//its one button, so it has no close and Esc doesn't take it away. Messages come one at a time (the store's notes).
import { safeHtml } from "../html";
import { Button } from "../components/button";
import { Dialog, Scrim, Stamp } from "../components/panel";
import type { Store } from "../store/store";
import { briefingLabelOf } from "../turn";

export function MessageDialog({ store }: { store: Pick<Store, "close" | "menu" | "note" | "world"> }) {
	const note = store.note.value, w = store.world.value;
	//(set aside while the settings are open)
	if (note === null || store.menu.value.window === "settings") return null;
	const brief = note.briefing === true && w !== null ? briefingLabelOf(w) : null;
	return (
		<>
			<Scrim />
			<Dialog id="ui-message" class={brief !== null ? "pm-window pm-message" : "pm-window pm-message notice"} labelledBy="title" shown={note}>
				<div class="hd">
					<div>{brief !== null && <div class="pm-label">{brief}</div>}<h1 id="title" class="pm-display">{note.title}</h1></div>
					<span class="grow" />
					{brief !== null && <Stamp large>Secret</Stamp>}
				</div>
				<div id="message" class="bd pm-typed" dangerouslySetInnerHTML={{ __html: safeHtml(note.html) }} />
				<div class="ft">
						<span class="grow" />
					<Button id="uiokbut" variant="primary" large={brief !== null} onClick={() => store.close()}>{brief !== null ? "Understood" : "Continue"}</Button>
				</div>
			</Dialog>
		</>
	);
}
