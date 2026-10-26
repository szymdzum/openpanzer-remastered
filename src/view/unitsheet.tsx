//The unit card (UnitCard, #348 with #37): the full sheet of one unit beside the map, opened from the unit info panel.
//What it says is the view model's (src/view/unitcard.ts); its views (the unit, its transport, its carrier) and Next unit
//are the old unit info window's buttons. The close button or Esc closes it.
import { Button } from "./button";
import { Icon, Mark } from "./icon";
import { Meter } from "./meter";
import { useEscape } from "./panel";
import type { Store } from "./store";
import { SegmentedControl } from "./tabs";
import type { CardStat, CardView, UnitCard } from "./unitcard";

const VIEW_NAMES: Record<CardView, string> = { unit: "Unit", transport: "Transport", carrier: "Carrier" };

//The sprite strip's third frame, at twice its size (the strip has nine frames side by side)
const FRAME = 2;

function Header({ card }: { card: UnitCard }) {
	return (
		<header class="uc-hd">
			<div class="uc-spr" aria-hidden="true"
				style={{ backgroundImage: `url(${card.sprite})`, backgroundSize: "900% 100%", backgroundPositionX: `${FRAME / 8 * 100}%` }} />
			<div>
				<div class="uc-name">{card.nation !== null && <Mark nation={card.nation} size="sm" />}{card.name}</div>
				<div class="uc-sub">{card.sub}</div>
				<div class="uc-tags">
					{card.tags.map((t) => <span key={t.text} class={t.core ? "pm-tag uc-core" : "pm-tag"}>{t.icon !== null && <Icon name={t.icon} size="sm" />}{t.text}</span>)}
				</div>
			</div>
		</header>
	);
}

function Experience({ card }: { card: UnitCard }) {
	const bars = [0, 1, 2, 3, 4].map((i) => <i key={i} class={i < card.bars ? "on" : undefined} />);
	return (
		<div class="uc-xp">
			<span class="uc-bars" aria-hidden="true">{bars}</span>
			<span><b>{card.bars === 1 ? "1 bar" : card.bars + " bars"}</b> · {card.xp}</span>
		</div>
	);
}

function Stat({ s }: { s: CardStat }) {
	return (
		<div class="uc-stat">
			<span class="k">{s.name}</span>
			<span class="bar" aria-hidden="true"><b style={{ width: `${Math.round(s.fill * 100)}%` }} /></span>
			<span class="v">{s.value}</span>
			<span class="h">{s.note}</span>
		</div>
	);
}

function Body({ card }: { card: UnitCard }) {
	return (
		<>
			<section class="uc-sec" aria-label="Condition">
				<h3>Condition</h3>
				{card.condition.map((m) => <Meter key={m.label} icon={m.icon} label={m.label} value={m.value} fill={m.fill} state={m.state}
					note={m.note !== null && <span class="uc-note">{m.note}</span>} />)}
			</section>
			<section class="uc-sec uc-two">
				<div><h3>Attack</h3>{card.attack.map((s) => <Stat key={s.name} s={s} />)}</div>
				<div><h3>Defence</h3>{card.defence.map((s) => <Stat key={s.name} s={s} />)}</div>
			</section>
			<section class="uc-four">
				{card.figures.map((f) => (
					<div key={f.label}>
						<span class="pm-label">{f.label}</span>
						<span class={f.prestige ? "big pm-prestige" : "big"}>{f.value}</span>
						<span class="h">{f.note}</span>
					</div>
				))}
			</section>
			{card.leaders.length > 0 && (
				<section class="uc-sec">
					<h3>Leader</h3>
					{card.leaders.map((l) => (
						<div key={l.name} class="uc-ab">
							<Icon name={l.classLeader ? "info" : "leader"} size="sm" />
							<div><b>{l.name}</b><p>{l.description}</p></div>
						</div>
					))}
				</section>
			)}
		</>
	);
}

export function UnitCardPanel({ store }: { store: Store }) {
	const card = store.card.value;
	const close = card === null ? undefined : store.closeCard;
	useEscape(close);
	if (card === null) return null;
	return (
		<article id="unit-card" class="pm-unitcard" aria-label={card.name + ", " + card.sub}>
			<div class="uc-tools">
				{card.views.length > 1 && <SegmentedControl label="Show" value={card.view} onChange={(v) => store.viewCard(v)}
					options={card.views.map((v) => ({ value: v, label: VIEW_NAMES[v] }))} />}
				<span class="grow" />
				{card.next && <Button variant="ghost" onClick={() => store.shortcut({ menu: "next" })}>Next unit</Button>}
				<Button icon="close" label="Close" onClick={store.closeCard} />
			</div>
			<Header card={card} />
			<Experience card={card} />
			<Body card={card} />
		</article>
	);
}
