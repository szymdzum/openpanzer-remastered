//The game menu (GameMenu, #346): the rail on the right with the game's own buttons, End turn in the corner with its
//question when units can still act (#8), and every keyboard shortcut the old UI reads (src/view/shortcuts.ts). What
//each does is the store's; a window a button opens that the new UI doesn't have yet keeps the button, off with why.
import { useEffect, useState } from "preact/hooks";
import { Button } from "./button";
import { Icon, type IconName } from "./icon";
import { Scrim, Window } from "./panel";
import { shortcutOf } from "./shortcuts";
import type { Store } from "./store";

//(Buy opens the unit list and the equipment window, Options the start menu: D5 and D6)
const NOT_YET = "Not in the new UI yet";

type RailButtonProps = {
	id: string,
	icon: IconName,
	label: string,
	//the key that does the same, in the tooltip and for screen readers
	keyName: string,
	//a toggle: on, off; none for a button that only does something
	pressed?: boolean,
	//the fold button: whether the middle group is open, and its id
	expanded?: boolean,
	controls?: string,
	//the word on touch, where the rail shows labels, when it isn't the label
	caption?: string,
	disabled?: string,
	onClick?: () => void,
	//the pointer or the focus on it (the button, the hint it shows), or off it (null)
	onHint?: (hint: Hint | null) => void,
};

//The rail's tooltip (#uiToolTip): a button's label and its key, beside it at its middle
type Hint = { label: string, keyName: string, y: number };

//A rail button: an icon, its label shown on touch (screen.css), its label and key in the rail's tooltip, or why it is off
function RailButton({ id, icon, label, keyName, pressed, expanded, controls, caption, disabled, onClick, onHint }: RailButtonProps) {
	const on = pressed === true || expanded === true;
	const hint = (e: Event) => {
		const b = e.currentTarget as HTMLElement;
		onHint?.({ label, keyName, y: b.offsetTop + b.offsetHeight / 2 });
	};
	const off = () => onHint?.(null);
	return (
		<button id={id} type="button" class={on ? "pm-btn icon is-on" : "pm-btn icon"} aria-label={label} aria-pressed={pressed}
			aria-expanded={expanded} aria-controls={controls} aria-keyshortcuts={keyName === "Esc" ? "Escape" : keyName || undefined}
			title={disabled === undefined ? undefined : `${label}: ${disabled}`} disabled={disabled !== undefined}
			onClick={disabled === undefined ? onClick : undefined} onMouseEnter={hint} onFocus={hint} onMouseLeave={off} onBlur={off}>
			<Icon name={icon} /><span class="lab">{caption || label}</span>
		</button>
	);
}

//The tooltip beside the rail, its pointer on the button (Tooltips: desktop only, the rail shows labels on touch)
function RailTip({ hint }: { hint: Hint }) {
	return (
		<div id="uiToolTip" class="pm-tip right pm-railtip" role="tooltip" style={{ top: hint.y + "px" }}>
			<b>{hint.label}</b>{hint.keyName !== "" && <> <span class="pm-muted pm-data">{hint.keyName}</span></>}
		</div>
	);
}

export function Rail({ store }: { store: Store }) {
	const open = store.railOpen.value;
	const [hint, setHint] = useState<Hint | null>(null);
	const key = (name: Parameters<Store["shortcut"]>[0]) => () => store.shortcut(name);
	//Every key the game reads, wherever the focus is but in a field (shortcutOf)
	useEffect(() => {
		const down = (e: KeyboardEvent) => {
			const sc = shortcutOf(e);
			if (sc === null) return;
			e.preventDefault();
			store.shortcut(sc);
		};
		addEventListener("keydown", down);
		return () => removeEventListener("keydown", down);
	}, [store]);
	return (
		<nav id="menu" class="pm-rail" aria-label="Game menu">
			<div class="group">
				<RailButton onHint={setHint} id="inspectunit" icon="info" label="Inspect unit" keyName="I" onClick={key({ menu: "inspect" })} />
			</div>
			{open && (
				<div id="slidemenu" class="group">
					<RailButton onHint={setHint} id="buy" icon="depot" label="Buy and upgrade" keyName="B" disabled={NOT_YET} />
					<RailButton onHint={setHint} id="hex" icon="grid" label="Hex grid" keyName="H" pressed={store.hexGrid.value} onClick={key({ menu: "hex" })} />
					<RailButton onHint={setHint} id="air" icon="air" label="Air layer" keyName="A" pressed={store.airMode.value} onClick={key({ menu: "air" })} />
					<RailButton onHint={setHint} id="zoom" icon="map" label="Strategic map" keyName="Z" pressed={store.strategic.value} onClick={key({ menu: "zoom" })} />
					<RailButton onHint={setHint} id="options" icon="menu" label="Options" keyName="Esc" disabled={NOT_YET} />
				</div>
			)}
			<div class="group">
				<RailButton onHint={setHint} id="mainmenu" icon="chevron-down" label={open ? "Hide menu" : "Show menu"} caption={open ? "Less" : "More"} keyName=""
					expanded={open} controls="slidemenu" onClick={() => store.toggleRail()} />
			</div>
			{hint !== null && <RailTip hint={hint} />}
		</nav>
	);
}

//The brass button in the corner, the HUD's one primary action: off with its reason when it isn't the person's turn
export function EndTurn({ store }: { store: Store }) {
	const refusal = store.endTurn.value;
	return (
		<div id="endturn" class="pm-endturn">
			<Button variant="primary" large icon="end-turn" disabled={refusal === null ? undefined : refusal}
				onClick={() => store.askEndTurn()}>End turn</Button>
		</div>
	);
}

//End turn's question while units can still act (#8): which ones, then end the turn or play on (Esc plays on)
export function EndTurnQuestion({ store }: { store: Store }) {
	const text = store.askingText.value;
	if (text === null) return null;
	const back = () => store.answerEndTurn(false);
	return (
		<>
			<Scrim />
			<Window id="endturn-question" class="pm-message" title="End turn" onClose={back}
				footer={<><span class="grow" /><Button onClick={back}>Keep playing</Button><Button variant="primary" onClick={() => store.answerEndTurn(true)}>End turn</Button></>}>
				<p>{text}</p>
			</Window>
		</>
	);
}
