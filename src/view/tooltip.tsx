//A tooltip (docs/ui/components/Tooltips): a panel with a pointer, beside what it explains. The
//caller places it and shows it (hover, or a long press on touch: nothing relies on hover alone).
//Styled by src/view/tooltip.css.
import type { ComponentChildren, CSSProperties } from "preact";

type TooltipProps = {
	//the bold first line: a place, a unit, a button's name
	title?: ComponentChildren,
	children?: ComponentChildren,
	//where the tip is from what it explains, its pointer on the facing edge: right of it (a hex), left
	//of it (a rail button), or above it
	side?: "right" | "left" | "above",
	style?: CSSProperties,
	id?: string,
};

const POINTERS = { right: "pm-tip", left: "pm-tip right", above: "pm-tip above" };

export function Tooltip({ title, children, side = "right", style, id }: TooltipProps) {
	return (
		<div id={id} class={POINTERS[side]} role="tooltip" style={style}>
			{title !== undefined && <div class="hd">{title}</div>}
			{children}
		</div>
	);
}
