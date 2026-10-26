//The message dialog (MessageDialog, #348): a scenario's briefing as a typed order sheet, the full window with its stamp,
//the side's flag and the day at its foot; every other message (the game's notices, the tutorial's orders, an error) the
//same window at its short width without the stamp. Its one button acknowledges it; the game waits for it, so it has no
//close and Esc doesn't take it away. Messages come one at a time (the store's notes).
import { Button } from "./button";
import { Mark } from "./icon";
import { Scrim, Stamp } from "./panel";
import type { Store } from "./store";
import { briefingLineOf } from "./turn";

export function MessageDialog({ store }: { store: Store }) {
	const note = store.note.value, w = store.world.value;
	if (note === null) return null;
	const brief = note.briefing === true && w !== null ? briefingLineOf(w) : null;
	return (
		<>
			<Scrim />
			<dialog open id="ui-message" class={brief !== null ? "pm-window pm-message" : "pm-window pm-message notice"} aria-modal="true" aria-labelledby="title">
				<div class="hd">
					<div>{brief !== null && <div class="pm-label">{brief.label}</div>}<h1 id="title" class="pm-display">{note.title}</h1></div>
					<span class="grow" />
					{brief !== null && <Stamp large>Secret</Stamp>}
				</div>
				<div id="message" class="bd pm-typed" dangerouslySetInnerHTML={{ __html: note.html }} />
				<div class="ft">
					{brief !== null && <span class="pm-muted from">{brief.nation !== null && <Mark nation={brief.nation} size="sm" />}{brief.line}</span>}
					<span class="grow" />
					<Button id="uiokbut" variant="primary" large={brief !== null} onClick={() => store.close()}>{brief !== null ? "Understood" : "Continue"}</Button>
				</div>
			</dialog>
		</>
	);
}
