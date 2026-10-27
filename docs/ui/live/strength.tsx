//The segmented strength bar of the odds preview (CombatOdds, AttackPreview): ten segments, the
//kept ones in the side's colour, the losses dashed in critical, the losses to support fire hatched.
//Styled by strength.css beside it.

type StrengthBarProps = {
	side: "axis" | "allied",
	//strength before the fight and after it, from the engine's estimate
	before: number,
	after: number,
	//how many of the losses come from the guns behind the target
	support?: number,
	//the segments: a unit's full strength
	of?: number,
};

//The typed "10 → 4" next to it says the same: the bar is hidden from screen readers
export function StrengthBar({ side, before, after, support = 0, of = 10 }: StrengthBarProps) {
	//in order: what's kept, what the target's fire costs, what support fire costs, what the unit doesn't have
	const kind = (i: number) => i < after ? "keep " + side : i < before - support ? "loss" : i < before ? "sup" : undefined;
	const segments = Array.from({ length: of }, (_, i) => <i key={i} class={kind(i)} />);
	return <span class="pm-strength" aria-hidden="true">{segments}</span>;
}
