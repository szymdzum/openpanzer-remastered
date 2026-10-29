//The unit context menu (#unit-context, as the original game's): a small icon button for each action the person's
//selected unit can take now, what it gives in its tooltip, docked at the bottom in the middle above the unit info.
//What each says is the view model's (src/view/store/context.ts).
import { Icon } from "./icon";
import type { ActionKey } from "../store/model";
import { Panel } from "./panel";
import type { Store } from "../store/store";

//The key that plays each action (src/view/shortcuts.ts), for screen readers
const KEYS: Record<ActionKey, string> = { mount: "M", embark: "E", resupply: "S", reinforce: "R", overstrength: "O", undo: "U" };

export function UnitContextMenu({ store }: { store: Pick<Store, "context" | "dispatch"> }) {
	const menu = store.context.value;
	if (menu === null || menu.actions.length === 0) return null;
	return (
		<Panel id="unit-context" class="pm-ctx" role="toolbar" label="Unit actions">
			{menu.actions.map((a) => (
				<button key={a.key} type="button" class="pm-btn icon" title={a.tip} aria-label={a.tip} aria-keyshortcuts={KEYS[a.key]}
					onClick={() => store.dispatch(a.command)}>
					<Icon name={a.icon} />
				</button>
			))}
		</Panel>
	);
}
