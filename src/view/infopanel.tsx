//The unit card (UnitInfo, #346, #348 with #37): the one card of the selected unit, docked at the bottom, in three sizes.
//A strip: the name and the supply, for when the card would hide the map's last rows. One row: its identity (sprite,
//flag, name, formation, tags, stars, leader, views), its condition, the short stat sheet, and its buttons. Unfolded: the
//sheet gives way to a band above the row, over the map: every stat with its bar, move, range, spotting and value, the
//experience and the leaders. It says what the old unit info window said and no more (#441); what is the view model's
//(src/view/unitcard.ts), read by the unit's id (#404). Inspect unit (I) shows or hides it; Esc folds it back to its row.
//The leader's tooltip opens on hover, focus or a tap, above the card, never over the unit's name.
import { useState } from "preact/hooks";
import { Stats } from "./facts";
import { Icon, type IconName, Mark } from "./icon";
import { Meter, Stars } from "./meter";
import { useEscape } from "./panel";
import type { Store } from "./store";
import { SegmentedControl } from "./tabs";
import { Tooltip } from "./tooltip";
import { frameStyle } from "./unitstrip";
import type { CardSize, CardStat, CardView, UnitCard } from "./unitcard";
import type { LeaderLine } from "./unitinfo";

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

//A button that sizes the card: a chevron points the way the card goes, a bar folds it to the strip
function Size({ store, to, label }: { store: Pick<Store, "sizeCard">, to: CardSize, label: string }) {
	return <Act icon={to === "strip" ? "minus" : "chevron-down"} up={to === "full" || label === "Show"} label={label} onClick={() => store.sizeCard(to)} />;
}

//The strip: the name and strength, fuel and ammo in one line
function Strip({ card, store }: { card: UnitCard, store: Pick<Store, "sizeCard"> }) {
	return (
		<section id="unit-info" class="pm-panel pm-uinfo strip" aria-label="Selected unit">
			<Name card={card} />
			{card.condition.slice(0, 3).map((m) => (
				<span key={m.label} class={m.state === undefined ? "ui-mini" : "ui-mini " + m.state} title={m.label}>
					<Icon name={m.icon} size="sm" /><span class="pm-sr">{m.label} </span>{m.value}
				</span>
			))}
			<Size store={store} to="row" label="Show" />
		</section>
	);
}

//Below 1280px wide the row keeps its identity and condition; the sheet waits in the unfolded band (HudLaptop)
export function UnitInfoPanel({ store }: { store: Pick<Store, "card" | "cardSize" | "infoShown" | "shortcut" | "sizeCard" | "viewCard"> }) {
	const card = store.card.value;
	const shown = card !== null && store.infoShown.value, size = store.cardSize.value;
	useEscape(shown && size === "full" ? () => store.sizeCard("row") : undefined);
	if (!shown) return null;
	if (size === "strip") return <Strip card={card} store={store} />;
	const full = size === "full";
	return (
		<section id="unit-info" class={full ? "pm-panel pm-uinfo open" : "pm-panel pm-uinfo"} aria-label="Selected unit">
			{full && <Details card={card} />}
			<Identity card={card} store={store} />
			<div class="ui-meters">
				{card.condition.map((m) => <Meter key={m.label} icon={m.icon} label={m.label} value={m.value} fill={m.fill} state={m.state} />)}
			</div>
			{!full && <div id="statsRowContainer" class="sheet"><div id="statsRow"><Stats stats={card.sheet} /></div></div>}
			<div class="ui-acts">
				{full ? <Size store={store} to="row" label="Less" /> : <Size store={store} to="full" label="More" />}
				<Size store={store} to="strip" label="Hide" />
				{card.next && <Act icon="arrow-right" label="Next unit" onClick={() => store.shortcut({ menu: "next" })} />}
			</div>
		</section>
	);
}
