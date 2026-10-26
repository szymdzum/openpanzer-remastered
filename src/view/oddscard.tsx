//The odds card (CombatOdds, #347): before an attack, what each side will lose, the one word that sums it up, why, what
//happens next and what attacks or cancels, beside the target away from the attacker. What it says is the view model's
//(src/view/odds.ts); the map places it. #gameToolTip in odds mode (handoff.md)
import type { Point } from "./hexgrid";
import { Anchored } from "./anchored";
import { Icon, Mark } from "./icon";
import type { Odds } from "./odds";
import { StrengthBar } from "./strength";

export function OddsCard({ odds, at, gap }: { odds: Odds, at: Point, gap: number }) {
	return (
		<Anchored id="gameToolTip" class="pm-odds" hex={at} place={odds.away === "right" ? "beside" : "before"} gap={gap} role="tooltip">
			<div class="head"><Icon name={odds.icon} size="sm" /><span class="t">{odds.verb} {odds.target}</span>
				{odds.nation !== null && <Mark nation={odds.nation} size="sm" />}</div>
			<div class="where">{odds.where}</div>
			<div class="vs">
				{odds.bars.map((b) => [
					<span key={b.who + "n"}>{b.name} <span class="pm-muted">· {b.who}</span></span>,
					<span key={b.who + "v"} class="pm-data">{b.before} → {b.after}</span>,
					<StrengthBar key={b.who + "b"} side={b.side} before={b.before} after={b.after} support={b.support} of={b.of} />,
				])}
			</div>
			<div class={"verdict " + odds.verdict.tone}><Icon name={odds.verdict.icon} size="sm" />{odds.verdict.word}</div>
			{odds.reasons.length > 0 && (
				<div class="why">
					{odds.reasons.map((r) => (
						<div key={r.text}>
							<Icon name={r.icon} size="sm" />
							<span class={r.key ? "key" : undefined}>{r.text}</span>
							{!r.key && <span class={r.tone === "" ? "fx" : "fx " + r.tone}>{r.effect}</span>}
						</div>
					))}
				</div>
			)}
			{odds.next.length > 0 && <div class="next">{odds.next.map((t) => <span key={t.text} class={t.tone === "" ? "pm-tag" : "pm-tag " + t.tone}>{t.text}</span>)}</div>}
			{odds.advice !== null && <div class="advice">{odds.advice}</div>}
			<div class="commit">{odds.commit}</div>
		</Anchored>
	);
}
