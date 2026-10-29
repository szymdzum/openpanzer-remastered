//The unit card (UnitInfo, #346, #348 with #37): the one card of the selected unit, docked at the bottom, in two sizes.
//Hidden, the default: one line (docs/ui/components/UnitInfo), the sprite, flag, name, stars and formation, the four
//gauges each with what it means, the chips of what it can still do this turn, More and Next unit. Unfolded, on More:
//the port's card for now (the open card is the next step of #37), its identity (tags, leader, views), its condition and
//a band above them, over the map: every stat with its bar, move, range, spotting and value, the experience and the
//leaders. What it says is the view model's (src/view/unitcard.ts, src/view/unitline.ts), read by the unit's id (#404).
//Inspect unit (I) shows or hides it; Less and Esc fold it back to its line. The leader's tooltip opens on hover, focus
//or a tap, above the card, never over the unit's name.
import { useState } from "preact/hooks";
import { Icon, type IconName, Mark } from "./icon";
import { Meter, Stars } from "./meter";
import { useEscape } from "./panel";
import type { Store } from "./store";
import { SegmentedControl } from "./tabs";
import { Tooltip } from "./tooltip";
import { frameStyle } from "./unitstrip";
import type { CardStat, CardView, UnitCard } from "./unitcard";
import type { LeaderLine } from "./unitinfo";
import type { CardLine, LineChip, LineGauge } from "./unitline";

const VIEW_NAMES: Record<CardView, string> = { unit: "Unit", transport: "Transport", carrier: "Carrier" };

//The leader's name in brass, and its tooltip: both leaders as the game words them
function Leader({ leaders }: { leaders: LeaderLine[] }) {
	const [open, setOpen] = useState(false);
	if (leaders.length === 0) return <div class="leader">No leader yet</div>;
	const show = () => setOpen(true), hide = () => setOpen(false);
	return (
		<>
			<button type="button" class="leader has" aria-describedby="uLeaderTip" aria-expanded={open} onMouseEnter={show} onMouseLeave={hide}
				onFocus={show} onBlur={hide} onClick={() => setOpen(!open)}>
				<Icon name="leader" size="sm" />{leaders[0].name}
			</button>
			<div id="uLeaderTip" class="pm-info-tip" hidden={!open}>
				<Tooltip side="above">
					{leaders.map((l) => (
						<div key={l.name}>
							<div class="hd"><Icon name={l.classLeader ? "info" : "leader"} size="sm" />{l.name}{l.classLeader && <span class="pm-muted"> · class leader</span>}</div>
							<div>{l.description}</div>
						</div>
					))}
				</Tooltip>
			</div>
		</>
	);
}

function Name({ card }: { card: UnitCard }) {
	return <div id="uName" class="name">{card.nation !== null && <span id="uSmallFlag"><Mark nation={card.nation} size="sm" /></span>}{card.name}</div>;
}

function Identity({ card, store }: { card: UnitCard, store: Pick<Store, "viewCard"> }) {
	return (
		<div id="statsRowTop" class="ui-id">
			<div class="ui-spr" aria-hidden="true" style={frameStyle(card.sprite)} />
			<div>
				<Name card={card} />
				<div class="cls">{card.sub}</div>
			</div>
			<div class="ui-tags">
				{card.tags.slice(1).map((t) => <span key={t.text} class={t.core ? "pm-tag ui-core" : "pm-tag"}>{t.text}</span>)}
			</div>
			<Stars earned={card.stars} />
			<Leader key={card.unit} leaders={card.leaders} />
			{card.views.length > 1 && <SegmentedControl label="Show" value={card.view} onChange={(v) => store.viewCard(v)}
				options={card.views.map((v) => ({ value: v, label: VIEW_NAMES[v] }))} />}
		</div>
	);
}

function Stat({ s }: { s: CardStat }) {
	return (
		<div class="ui-stat">
			<span class="k">{s.name}</span>
			<span class="bar" aria-hidden="true"><b style={{ width: `${Math.round(s.fill * 100)}%` }} /></span>
			<span class="v">{s.value}</span>
		</div>
	);
}

//The unfolded band: attack, defence, the figures, the experience and the leaders
function Details({ card }: { card: UnitCard }) {
	return (
		<div id="unit-card" class="ui-more">
			<section aria-label="Attack"><h3>Attack</h3>{card.attack.map((s) => <Stat key={s.name} s={s} />)}</section>
			<section aria-label="Defence"><h3>Defence</h3>{card.defence.map((s) => <Stat key={s.name} s={s} />)}</section>
			<section aria-label="Figures" class="ui-four">
				{card.figures.map((f) => (
					<div key={f.label}>
						<span class="pm-label">{f.label}</span>
						<span class={f.prestige ? "big pm-prestige" : "big"}>{f.value}</span>
					</div>
				))}
			</section>
			<section aria-label="Experience and leaders">
				<h3>Experience</h3>
				<p class="ui-xp">{card.xp}</p>
				{card.leaders.map((l) => (
					<div key={l.name} class="ui-ab">
						<Icon name={l.classLeader ? "info" : "leader"} size="sm" />
						<div><b>{l.name}</b><p>{l.description}</p></div>
					</div>
				))}
			</section>
		</div>
	);
}

//A small icon button at the card's edge: the card's room goes to the unit, not to its controls. The name is its label
//and its tooltip
function Act({ icon, up = false, label, onClick }: { icon: IconName, up?: boolean, label: string, onClick: () => void }) {
	return (
		<button type="button" class={up ? "pm-btn ghost icon ui-act up" : "pm-btn ghost icon ui-act"} aria-label={label} title={label}
			onClick={onClick}><Icon name={icon} size="sm" /></button>
	);
}

//A gauge of the line: its label with what it means, its segments or bar, its value
function LineGaugeView({ g }: { g: LineGauge }) {
	return (
		<div class={g.state === null ? "ui-g" : "ui-g " + g.state}>
			<span class="lab">{g.label}{g.say !== null && <em>{g.say}</em>}</span>
			{g.segs !== null
				? <span class="ui-segs" aria-hidden="true">{g.segs.map((k, i) => <i key={i} class={k} />)}</span>
				: <span class="ui-bar" aria-hidden="true"><b style={{ width: `${Math.round(g.fill * 100)}%` }} /></span>}
			<span class="v">{g.value}{g.of !== null && <small>{g.of}</small>}</span>
		</div>
	);
}

//What it can still do this turn: an icon and a number, the words in its tooltip and for screen readers
function Chip({ c }: { c: LineChip }) {
	return (
		<span class={c.tone === null ? "ui-chip" : "ui-chip " + c.tone} title={c.words}>
			<Icon name={c.icon} size="sm" />{c.count !== null && <span class="n" aria-hidden="true">{c.count}</span>}
			{c.unit !== null && <span class="u" aria-hidden="true">{c.unit}</span>}
			<span class="pm-sr">{c.words}</span>
		</span>
	);
}

//The sprite, with its transport's under it when it rides
function Portrait({ line }: { line: CardLine }) {
	return (
		<span class="ui-port">
			<span class="ui-spr sm" aria-hidden="true" style={frameStyle(line.sprite)} />
			{line.rides !== null && <span class="ui-ride" title={"On its " + line.rides.name}>
				<span class="ui-spr xs" style={frameStyle(line.rides.sprite)} /><span class="pm-sr">On its {line.rides.name}</span>
			</span>}
		</span>
	);
}

//The card hidden: one line
function Line({ card, line, store }: { card: UnitCard, line: CardLine, store: Pick<Store, "shortcut" | "sizeCard"> }) {
	return (
		<section id="unit-info" class="pm-panel pm-uinfo line" aria-label="Selected unit">
			<Portrait line={line} />
			<div class="ui-who">
				<Name card={card} />
				<div class="ui-sub"><Stars earned={card.stars} /><span>{line.formation}</span></div>
			</div>
			{line.gauges.map((g) => <LineGaugeView key={g.label} g={g} />)}
			{line.chips.length > 0 && <span class="ui-turn">{line.chips.map((c) => <Chip key={c.words} c={c} />)}</span>}
			<span class="ui-acts">
				<Act icon="chevron-down" up label="More" onClick={() => store.sizeCard("full")} />
				{card.next && <Act icon="arrow-right" label="Next unit" onClick={() => store.shortcut({ menu: "next" })} />}
			</span>
		</section>
	);
}

//The card unfolded over the map, until the open card (#37)
export function UnitInfoPanel({ store }: { store: Pick<Store, "card" | "cardSize" | "infoShown" | "shortcut" | "sizeCard" | "viewCard"> }) {
	const card = store.card.value;
	const shown = card !== null && store.infoShown.value, full = store.cardSize.value === "full";
	useEscape(shown && full ? () => store.sizeCard("line") : undefined);
	if (!shown) return null;
	if (!full && card.line !== null) return <Line card={card} line={card.line} store={store} />;
	return (
		<section id="unit-info" class="pm-panel pm-uinfo open" aria-label="Selected unit">
			<Details card={card} />
			<Identity card={card} store={store} />
			<div class="ui-meters">
				{card.condition.map((m) => <Meter key={m.label} icon={m.icon} label={m.label} value={m.value} fill={m.fill} state={m.state} />)}
			</div>
			<div class="ui-acts">
				<Act icon="chevron-down" label="Less" onClick={() => store.sizeCard("line")} />
				{card.next && <Act icon="arrow-right" label="Next unit" onClick={() => store.shortcut({ menu: "next" })} />}
			</div>
		</section>
	);
}
