//The one button of the new UI (docs/ui/components/Button): the markup and classes of its card,
//styled by src/view/button.css. It only renders: the caller says what it does and why it can't,
//the view model decides both.
import type { ComponentChildren } from "preact";
import { useLayoutEffect, useRef } from "preact/hooks";
import { Icon, type IconName } from "./icon";

type ButtonProps = {
	children?: ComponentChildren,
	//brass, one per view (End turn, Buy new, Play, OK); ghost for toolbars inside panels; danger for Disband and Sell
	variant?: "primary" | "ghost" | "danger",
	//52px tall: End turn and the start-menu items
	large?: boolean,
	icon?: IconName,
	//an icon-only button has no caption: the label names it for screen readers
	label?: string,
	//prestige, typed in Courier Prime after the caption
	cost?: number,
	//why the action can't be taken now (a Refusal): set, the button is disabled and shows it as its title
	disabled?: string,
	//else a hint the pointer shows as its title (the old start menu's new game buttons said what they start there)
	title?: string,
	onClick?: () => void,
	//the id the harness, the tests and the shortcuts find it by (handoff.md, Element map)
	id?: string,
};

//Preact clears a title by setting it to "", which leaves an empty attribute behind: set and
//remove it here so a lifted refusal leaves no trace
function useTitle(title: string | undefined) {
	const ref = useRef<HTMLButtonElement>(null);
	useLayoutEffect(() => {
		if (title === undefined) ref.current.removeAttribute("title");
		else ref.current.title = title;
	}, [title]);
	return ref;
}

//The card's classes: its variant, large, icon-only
function classesOf(variant: ButtonProps["variant"], large: boolean | undefined, iconOnly: boolean) {
	return ["pm-btn", variant, large && "lg", iconOnly && "icon"].filter(Boolean).join(" ");
}

export function Button({ children, variant, large, icon, label, cost, disabled, title, onClick, id }: ButtonProps) {
	const iconOnly = children === undefined && cost === undefined;
	const classes = classesOf(variant, large, iconOnly);
	const off = disabled !== undefined;
	const ref = useTitle(off ? disabled : title);
	const small = !large && !iconOnly;
	//no handler when disabled: jsdom (and a synthetic click in some browsers) still fires one on a disabled button
	return (
		<button ref={ref} id={id} type="button" class={classes} aria-label={label} disabled={off} onClick={off ? undefined : onClick}>
			{icon && <Icon name={icon} size={small ? "sm" : undefined} />}
			{children}
			{cost !== undefined && <> <span class="cost">{cost}</span></>}
		</button>
	);
}
