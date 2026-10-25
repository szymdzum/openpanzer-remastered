//The one button of the new UI (docs/ui/components/Button): the markup and classes of its card,
//styled by docs/ui/components/bundle.css. It only renders: the caller says what it does and
//why it can't, the view model decides both.
import type { ComponentChildren } from "preact";

type ButtonProps = {
	children?: ComponentChildren,
	//brass, one per view (End turn, Buy new, Play, OK); ghost for toolbars inside panels; danger for Disband and Sell
	variant?: "primary" | "ghost" | "danger",
	//52px tall: End turn and the start-menu items
	large?: boolean,
	//an id in the icon sprite, without its #
	icon?: string,
	//an icon-only button has no caption: the label names it for screen readers
	label?: string,
	//prestige, typed in Courier Prime after the caption
	cost?: number,
	//why the action can't be taken now (a Refusal): set, the button is disabled and shows it as its title
	disabled?: string,
	onClick?: () => void,
};

export function Button({ children, variant, large, icon, label, cost, disabled, onClick }: ButtonProps) {
	const iconOnly = children === undefined && cost === undefined;
	const classes = ["pm-btn", variant, large && "lg", iconOnly && "icon"].filter(Boolean).join(" ");
	const off = disabled !== undefined;
	//no handler when disabled: jsdom (and a synthetic click in some browsers) still fires one on a disabled button
	return (
		<button type="button" class={classes} aria-label={label} title={disabled} disabled={off} onClick={off ? undefined : onClick}>
			{icon && <svg class={large || iconOnly ? "i" : "i sm"} aria-hidden="true"><use href={"#" + icon} /></svg>}
			{children}
			{cost !== undefined && <> <span class="cost">{cost}</span></>}
		</button>
	);
}
