//The unit context menu (UnitContext, #437): the person's selected unit's actions as the old UI's #unit-context, docked at
//the bottom in the middle above the unit info, clear of the map around the unit: a small icon button for each action it
//can take now, what it gives in its tooltip. What each says is the view model's (src/view/context.ts).
import { Icon } from "./icon";
import type { ActionKey } from "./model";
import { Panel } from "./panel";
import type { Store } from "./store";

//The key that plays each action (src/view/shortcuts.ts), for screen readers
const KEYS: Record<ActionKey, string> = { mount: "M", embark: "E", resupply: "S", reinforce: "R", overstrength: "O", undo: "U" };

export function UnitContextMenu({ store }: { store: Store }) {
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
