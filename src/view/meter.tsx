//A unit's state (docs/ui/components/Meter): supply meters, experience stars, the strength badge
//and the tag that names a state in words. Styled by src/view/meter.css.
import type { ComponentChildren } from "preact";
import { Icon, type IconName } from "./icon";

//ok, low and critical: the view model's verdict, never the colour alone (each low or critical
//meter also says it in a word)
export type Supply = "ok" | "low" | "critical";

const WORDS: Record<Supply, string | undefined> = { ok: undefined, low: "Low", critical: "Critical" };

type MeterProps = {
	icon: IconName,
	label: string,
	//typed as the game has it: "18/50"
	value: string,
	//how full the track is, 0 to 1
	fill: number,
	//no state for a meter that has none (entrenchment)
	state?: Supply,
};

export function Meter({ icon, label, value, fill, state }: MeterProps) {
	const word = state && WORDS[state];
	return (
		<div class={state ? "pm-meter " + state : "pm-meter"}>
			<Icon name={icon} size="sm" />
			<span>{label}{word && <span class="st">{word}</span>}</span>
			<span class="v">{value}</span>
			<span class="track" aria-hidden="true"><b style={{ width: `${Math.round(fill * 100)}%` }} /></span>
		</div>
	);
}

//Experience: one star per 100 XP, five in all, earned ones in brass
export function Stars({ earned }: { earned: number }) {
	const stars = [0, 1, 2, 3, 4].map((i) => i < earned
		? <Icon key={i} name="star" size="sm" />
		: <span key={i} class="off"><Icon name="star" size="sm" /></span>);
	return <span class="pm-stars">{stars}<span class="pm-sr">Experience {earned} of 5</span></span>;
}

//The strength badge: the HTML form of the canvas counter, in the side's colour
export function Badge({ side, children }: { side: "axis" | "allied" | "neutral", children: ComponentChildren }) {
	return <span class={side === "axis" ? "pm-badge" : "pm-badge " + side}>{children}</span>;
}

//A state in words for lists and tooltips: "Low fuel", "No ammo"
export function Tag({ tone, icon, children }: { tone?: Supply, icon?: IconName, children: ComponentChildren }) {
	return <span class={tone ? "pm-tag pm-" + tone : "pm-tag"}>{icon && <Icon name={icon} size="sm" />}{children}</span>;
}
