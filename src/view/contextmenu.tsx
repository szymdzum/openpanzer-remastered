//The unit context menu (UnitContext, #346): the person's selected unit's actions in one row above its hex, each saying
//what it will do or, disabled, why it can't (#316). Hover, focus or a long press shows the arithmetic behind Supply
//and Reinforce beside the menu (.pm-ctxtip). What each says is the view model's (src/view/context.ts).
import { useState } from "preact/hooks";
import { Anchored } from "./anchored";
import { Button } from "./button";
import type { Point } from "./hexgrid";
import type { Breakdown, ContextAction } from "./context";
import { Icon } from "./icon";
import type { Store } from "./store";

const PLACES: ("above" | "below")[] = ["above", "below"];

//The press that shows the tooltip on touch, where nothing hovers: one at a time, the finger's
const LONG_PRESS = 500;
let pressing: ReturnType<typeof setTimeout> | null = null;

const release = () => {
	if (pressing !== null) clearTimeout(pressing);
	pressing = null;
};

function Tip({ tip, icon }: { tip: Breakdown, icon: ContextAction["icon"] }) {
	return (
		<div class="pm-tip pm-ctxtip" role="tooltip">
			<div class="hd"><Icon name={icon} size="sm" />{tip.title}</div>
			<div class="rows">
				{tip.rows.map((r) => [
					<span key={r.label} class={r.tone === "tot" ? "tot" : undefined}>{r.label}</span>,
					<span key={r.label + "="} class={r.tone === "tot" ? "v tot" : r.tone === "prestige" ? "v pm-prestige" : "v"}>{r.value}</span>,
				])}
			</div>
			{tip.alt !== null && <div class="alt">{tip.alt}</div>}
			<div class="warn"><Icon name="clock" size="sm" />{tip.warn}</div>
		</div>
	);
}

//One action: its button, and the hover, focus and long press that show its tooltip
function Action({ action, onPlay, onTip }: { action: ContextAction, onPlay: () => void, onTip: (on: boolean) => void }) {
	const show = () => onTip(true), hide = () => onTip(false);
	const press = (e: PointerEvent) => {
		release();
		if (e.pointerType === "touch") pressing = setTimeout(show, LONG_PRESS);
	};
	return (
		<span class="act" onMouseEnter={show} onMouseLeave={hide} onFocusIn={show} onFocusOut={hide} onPointerDown={press} onPointerUp={release}
			onPointerCancel={release}>
			<Button icon={action.icon} line={action.line} cost={action.cost} partial={action.partial}
				disabled={action.refusal === null ? undefined : action.refusal} onClick={onPlay}>{action.label}</Button>
		</span>
	);
}

//Above the hex at the given point of the screen, gap from its centre
//(above the hex, or below it when the hexes above hold a target or a stop of the move, #429)
export function UnitContextMenu({ store, at, gap, clear }: { store: Store, at: Point, gap: number, clear: Point[] }) {
	const [tipped, setTipped] = useState<string | null>(null);
	const menu = store.context.value;
	if (menu === null) return null;
	const tip = menu.actions.find((a) => a.label === tipped && a.tip !== null);
	return (
		<Anchored id="unit-context" hex={at} place={PLACES} clear={clear} gap={gap} class="pm-ctx" role="toolbar" label="Unit actions">
			{menu.actions.map((a) => [
				a.apart && <span key="sep" class="pm-sep" />,
				<Action key={a.label} action={a} onPlay={() => store.dispatch(a.command)}
					onTip={(on) => setTipped((now) => on ? a.label : now === a.label ? null : now)} />,
			])}
			{tip !== undefined && <Tip tip={tip.tip!} icon={tip.icon} />}
		</Anchored>
	);
}
