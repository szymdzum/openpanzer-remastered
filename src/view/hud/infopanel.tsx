//The unit card (UnitInfo, #346, #348 with #37): the one card of the selected unit, docked at the bottom, in two sizes.
//Hidden, the default: one line (docs/ui/components/UnitInfo), the sprite, flag, name, stars and formation, the four
//gauges each with what it means, the chips of what it can still do this turn, More and Next unit. Open, on More, over
//the map: who it is, its condition with what each gauge means, what it can still do this turn, what it hits and holds
//against each kind of enemy, and the band of what riding means. What it says is the view model's (src/view/hud/unitcard.ts,
//src/view/hud/unitline.ts), read by the unit's id (#404). Inspect unit (I) shows or hides it; Less, Esc or a click on the
//map fold it back to its line, and it never opens by itself
import { Icon, type IconName, Mark } from "../components/icon";
import { Stars } from "../components/meter";
import { useEscape } from "../components/panel";
import type { Store } from "../store/store";
import { frameStyle } from "./unitstrip";
import type { CardGauge, CardStat, RideBand, UnitCard } from "./unitcard";
import type { LeaderLine } from "./unitinfo";
import type { CardLine, LineChip, LineGauge } from "./unitline";

const hexes = (n: number) => n + (n === 1 ? " hex" : " hexes");
const width = (fill: number) => ({ width: `${Math.round(fill * 100)}%` });

function Name({ card, big = false }: { card: UnitCard, big?: boolean }) {
	//(a name longer than the card ends in an ellipsis, the whole name in its tooltip)
	return <div id="uName" class={big ? "name lg" : "name"} title={card.name}>{card.nation !== null && <span id="uSmallFlag"><Mark nation={card.nation} size="sm" /></span>}<span class="nm">{card.name}</span></div>;
}

//The leaders by name, each with what it gives as the game words it
function Leaders({ leaders }: { leaders: LeaderLine[] }) {
	if (leaders.length === 0) return <div class="ui-lead none">No leader yet</div>;
	return (
		<>
			{leaders.map((l) => (
				<div key={l.name} class="ui-lead">
					<Icon name={l.classLeader ? "info" : "leader"} size="sm" />
					<div><b>{l.name}</b>{l.classLeader && <span class="cl"> · class leader</span>}<span class="d">{l.description}</span></div>
				</div>
			))}
		</>
	);
}

//Who it is: sprite, flag, name, formation and country, its tags, its experience to the next star, its leaders
function Identity({ card }: { card: UnitCard }) {
	return (
		<div class="ui-col ui-id">
			<Name card={card} big />
			<Portrait line={card.line} big />
			<div>
				<div class="cls">{card.sub}</div>
				<div class="ui-tags">{card.tags.map((t, i) => <span key={t.text}>{i > 0 && " · "}{t.core ? <b>{t.text}</b> : t.text}</span>)}</div>
			</div>
			<div class="ui-xp" title={card.xp}>
				<Stars earned={card.stars} /><span class="n">{card.xp}</span>
				<span class="ui-bar" aria-hidden="true"><b style={width(card.toNextStar)} /></span>
			</div>
			<Leaders leaders={card.leaders} />
		</div>
	);
}

//A gauge of the open card: its label, its segments or bar, its value, and what it means
function Gauge({ g }: { g: CardGauge }) {
	return (
		<div class={g.state === null ? "ui-c" : "ui-c " + g.state}>
			<span class="k" title={g.tip ?? undefined}>{g.label}</span>
			<Track g={g} />
			<span class="v">{g.value}{g.of !== null && <small>{g.of}</small>}</span>
			<span class="say" title={g.sayTip ?? undefined}>{g.say}</span>
		</div>
	);
}

//Its condition and what it can still do this turn: the chips in words, ok when it can, dashed when it can't
function Condition({ card }: { card: UnitCard }) {
	return (
		<div class="ui-col ui-cond">
			<h3 class="ui-h"><span>Condition</span>{card.resupply && <span class="pm-stamp ui-stamp">Resupply</span>}</h3>
			{card.condition.map((g) => <Gauge key={g.label} g={g} />)}
			{card.chips.length > 0 && <>
				<h3 class="ui-h t">This turn</h3>
				<div class="ui-turn wide">
					{card.chips.map((c) => <span key={c.words} class={c.tone === null ? "ui-chip" : "ui-chip " + c.tone}><Icon name={c.icon} size="sm" />{c.words}</span>)}
				</div>
			</>}
		</div>
	);
}

//What it hits or holds against a kind of enemy: icon, name (what it means in its tooltip), bar and value
function Stat({ s }: { s: CardStat }) {
	return (
		<div class={s.tone === null ? "ui-m" : "ui-m " + s.tone} title={s.tip}>
			<Icon name={s.icon} size="sm" />
			<span class="k">{s.name}</span>
			{s.tone === "plus" || s.tone === "none" ? <span class="ui-bar empty" aria-hidden="true" />
				: <span class="ui-bar" aria-hidden="true"><b style={width(s.fill)} /></span>}
			<span class="v">{s.value}</span>
		</div>
	);
}

//Against the enemy: what it hits and holds, initiative, range, spotting, the bonuses in force and what they add to; its
//value in the corner
function Versus({ card }: { card: UnitCard }) {
	return (
		<div class="ui-col ui-vs">
			<h3 class="ui-h"><span>Against the enemy</span>
				<span class="ui-val" title="What the unit is worth, in prestige">Value <Icon name="prestige" size="sm" />{card.value}</span></h3>
			<div class="ui-two">
				<section aria-label="It hits"><h4>It hits</h4>{card.hits.map((s) => <Stat key={s.name} s={s} />)}</section>
				<section aria-label="It holds"><h4>It holds</h4>{card.holds.map((s) => <Stat key={s.name} s={s} />)}</section>
			</div>
			<div class="ui-foot">
				<span title={card.initiative.tip}><b>Initiative {card.initiative.value}</b></span>
				<span><b>Fires</b> {hexes(card.fires)}</span>
				<span><b>Sees</b> {hexes(card.sees)}</span>
				{card.bonuses.length > 0 && <span class="mods">{card.bonuses.map((b) => (
					<span key={b.text} title={b.tip}><span class="plus">{b.text}</span> <span class="to">{b.to}</span></span>
				))}</span>}
			</div>
		</div>
	);
}

//The band over the card while it rides: what riding does, what it can't get off from in critical
function Band({ band }: { band: RideBand }) {
	return (
		<div class="ui-ribbon">
			<Icon name="mount" size="sm" /><b>{band.on}</b>
			{band.items.map((i) => <span key={i.text} class={i.warn ? "warn" : undefined} title={i.tip ?? undefined}>{i.text}</span>)}
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

//A gauge's segments, or its bar when it has none
function Track({ g }: { g: LineGauge }) {
	return g.segs !== null
		? <span class="ui-segs" aria-hidden="true">{g.segs.map((k, i) => <i key={i} class={k} />)}</span>
		: <span class="ui-bar" aria-hidden="true"><b style={width(g.fill)} /></span>;
}

//A gauge of the line: its label with what it means, its segments or bar, its value
function LineGaugeView({ g }: { g: LineGauge }) {
	return (
		<div class={g.state === null ? "ui-g" : "ui-g " + g.state}>
			<span class="lab">{g.label}{g.say !== null && <em>{g.say}</em>}</span>
			<Track g={g} />
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

//The sprite, with its transport's under it when it rides; big on the open card
function Portrait({ line, big = false }: { line: CardLine, big?: boolean }) {
	return (
		<span class="ui-port">
			<span class={big ? "ui-spr" : "ui-spr sm"} aria-hidden="true" style={frameStyle(line.sprite)} />
			{line.rides !== null && <span class="ui-ride" title={"On its " + line.rides.name}>
				<span class={big ? "ui-spr sm" : "ui-spr xs"} style={frameStyle(line.rides.sprite)} /><span class="pm-sr">On its {line.rides.name}</span>
			</span>}
		</span>
	);
}

//The card hidden: one line
function Line({ card, store }: { card: UnitCard, store: Pick<Store, "shortcut" | "sizeCard"> }) {
	const line = card.line;
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
				<Act icon="chevron-down" up label="More" onClick={() => store.sizeCard("open")} />
				{card.next && <Act icon="arrow-right" label="Next unit" onClick={() => store.shortcut({ menu: "next" })} />}
			</span>
		</section>
	);
}

export function UnitInfoPanel({ store }: { store: Pick<Store, "card" | "cardSize" | "infoShown" | "shortcut" | "sizeCard"> }) {
	const card = store.card.value;
	const shown = card !== null && store.infoShown.value, open = store.cardSize.value === "open";
	useEscape(shown && open ? () => store.sizeCard("line") : undefined);
	if (!shown) return null;
	if (!open) return <Line card={card} store={store} />;
	return (
		<section id="unit-info" class="pm-panel pm-uinfo open" aria-label="Selected unit">
			{card.band !== null && <Band band={card.band} />}
			<Identity card={card} />
			<Condition card={card} />
			<Versus card={card} />
			<div class="ui-acts">
				<Act icon="chevron-down" label="Less" onClick={() => store.sizeCard("line")} />
				{card.next && <Act icon="arrow-right" label="Next unit" onClick={() => store.shortcut({ menu: "next" })} />}
			</div>
		</section>
	);
}
