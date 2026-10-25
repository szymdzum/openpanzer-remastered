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
	//prestige, typed in Courier Prime after the caption, or at the end of the second line when there is one
	cost?: number,
	//the second line of a unit context button (UnitContext): what the action will do, "+5 ammo · +14 fuel"
	line?: string,
	//the prestige covers only part of it: the second line in low ("+1 of 2 · 28")
	partial?: boolean,
	//why the action can't be taken now (a Refusal): set, the button is disabled and shows it, as its
	//second line where it has one (the action stays in place with its reason), else as its title
	disabled?: string,
	onClick?: () => void,
	//the id the harness, the tests and the shortcuts find it by (handoff.md, Element map)
	id?: string,
};

//The second line under the caption: the effect and its cost, or the reason it can't be done
function SecondLine({ line, cost, partial, refusal }: { line: string, cost?: number, partial?: boolean, refusal?: string }) {
	if (refusal !== undefined) return <span class="n">{refusal}</span>;
	return <span class={partial ? "n part" : "n"}>{line}{cost !== undefined && <> · <span class="cost">{cost}</span></>}</span>;
}

//After the caption: the cost on the same line, or the second line, which takes the cost and the refusal
function After({ line, cost, partial, refusal }: { line?: string, cost?: number, partial?: boolean, refusal?: string }) {
	if (line === undefined) return cost === undefined ? null : <> <span class="cost">{cost}</span></>;
	//the space keeps the two lines apart in the button's accessible name
	return <>{" "}<SecondLine line={line} cost={cost} partial={partial} refusal={refusal} /></>;
}

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

export function Button({ children, variant, large, icon, label, cost, line, partial, disabled, onClick, id }: ButtonProps) {
	const iconOnly = children === undefined && cost === undefined;
	const classes = classesOf(variant, large, iconOnly);
	const off = disabled !== undefined;
	const ref = useTitle(line === undefined ? disabled : undefined);
	const small = !large && !iconOnly && line === undefined;
	//no handler when disabled: jsdom (and a synthetic click in some browsers) still fires one on a disabled button
	return (
		<button ref={ref} id={id} type="button" class={classes} aria-label={label} disabled={off} onClick={off ? undefined : onClick}>
			{icon && <Icon name={icon} size={small ? "sm" : undefined} />}
			{children}
			<After line={line} cost={cost} partial={partial} refusal={disabled} />
		</button>
	);
}
