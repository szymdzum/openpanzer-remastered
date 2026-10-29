//The equipment window (Equipment, #348): buy new units and upgrade or sell the one chosen, opened with B or the rail's
//Buy and upgrade. From the top: the title, the country button and the prestige; the person's units, a card pressed the
//one to upgrade (the old unit list above the window, #512); the class tabs; the sort and the
//models in service; the picked model's stats on foot and mounted, and its transports with what each gives; the action
//bar with the prices. What it says and why a button is off is the view model's (src/view/shop.ts).
import { Fragment } from "preact";
import { Button } from "./button";
import { Icon, Mark } from "./icon";
import { Scrim, useEscape, Window } from "./panel";
import type { Shop, ShopUnits, Transport } from "./shop";
import { SORTS, type SortKey } from "./shop";
import type { ShopAct } from "./shopstate";
import type { Store } from "./store";
import { SegmentedControl, TabPanel, Tabs } from "./tabs";
import { Card, frameStyle } from "./unitstrip";

//The units on the map, or the reserve while deploying, as the old list over the window showed them
function Units({ list, store }: { list: ShopUnits, store: Pick<Store, "shopUnit" | "side"> }) {
	const side = store.side.value === 1 ? "allied" : "axis";
	return (
		<section class="units pm-strip" aria-label={list.reserve ? "Your reserve" : "Your units"}>
			<div class="cards">
				{list.units.map((u) => <Card key={u.id} u={u} side={side} onPick={() => store.shopUnit(u.id)} />)}
			</div>
		</section>
	);
}

//The card's four sorts as its segmented control, the old window's others in a list beside it
const SHOWN = SORTS.slice(0, 4), OTHERS = SORTS.slice(4);

function Tools({ shop, store }: { shop: Shop, store: Pick<Store, "shopReverse" | "shopSort"> }) {
	const other = OTHERS.some((s) => s.key === shop.sort);
	return (
		<div class="tools">
			<span class="pm-label">Sort</span>
			<SegmentedControl label="Sort by" value={other ? ("" as SortKey) : shop.sort} onChange={(k) => store.shopSort(k)}
				options={SHOWN.map((s) => ({ value: s.key, label: s.label }))} />
			<select class="pm-input sortmore" aria-label="Sort by another stat" value={other ? shop.sort : ""}
				onChange={(e) => store.shopSort((e.currentTarget as HTMLSelectElement).value as SortKey)}>
				<option value="" disabled>More…</option>
				{OTHERS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
			</select>
			<Button id="eqSortOrderBut" icon="sort" label={shop.reverse ? "Sort ascending" : "Sort descending"} onClick={store.shopReverse} />
		</div>
	);
}

function Models({ shop, store }: { shop: Shop, store: Pick<Store, "shopModel"> }) {
	const picked = shop.picked === null ? -1 : shop.picked.eqid;
	return (
		<div id="eqUnitList" class="pm-grid">
			{shop.models.map((m) => (
				<button key={m.eqid} type="button" class={m.eqid === picked ? "pm-card is-on" : "pm-card"} aria-pressed={m.eqid === picked}
					aria-label={`${m.name}${m.current ? ", current" : ""}, ${m.cost} prestige, from ${m.year}`} onClick={() => store.shopModel(m.eqid)}>
					<span class="yr">{m.year}</span>
					{m.current && <span class="cur">Current</span>}
					<span class="spr" aria-hidden="true" style={frameStyle(m.sprite)} />
					<span class="nm">{m.name}</span>
					<span class="meta"><span class="c">{m.cost}</span>{m.stat !== null && <span>{m.stat}</span>}</span>
				</button>
			))}
		</div>
	);
}

//Two stats a line, each on foot and, with a transport picked, mounted: what gets better and worse at a glance
function Stats({ p }: { p: NonNullable<Shop["picked"]> }) {
	const mounted = p.rides !== null, pairs = [];
	for (let i = 0; i < p.compare.length; i += 2) pairs.push(p.compare.slice(i, i + 2));
	const head = <><th class="hdr" scope="col">Stat</th><th class="hdr" scope="col">{mounted ? "Foot" : "Value"}</th>{mounted && <th class="hdr" scope="col">Mounted</th>}</>;
	return (
		<table class={mounted ? "pm-mount" : "pm-mount solo"}>
			<thead><tr>{head}{head}</tr></thead>
			<tbody>
				{pairs.map((pair) => (
					<tr key={pair[0].name}>
						{pair.map((c) => (
							<Fragment key={c.name}>
								<th scope="row">{c.name}</th><td class="n">{c.value}</td>
								{mounted && <td class={c.change === "up" ? "n m up" : c.change === "down" ? "n m dn" : c.mounted === "–" ? "n m off" : "n m"}>{c.mounted}</td>}
							</Fragment>
						))}
					</tr>
				))}
			</tbody>
		</table>
	);
}

//A transport's row says what it gives; its name for screen readers says it all in words
function transportName(t: Transport): string {
	const g = t.gives;
	if (g === null) return `${t.name}, on foot`;
	return `${t.name}, ${t.ground}, ${g.cost} prestige, ${g.moves} moves, ${g.fuel === 0 ? "no fuel" : `fuel ${g.fuel}`}, defence ${g.def}`;
}

//The transports that carry the model, each a row with what it gives; the one picked, pressed again, is none (the old window)
function Transports({ shop, store }: { shop: Shop, store: Pick<Store, "shopTransport"> }) {
	return (
		<fieldset id="eqTransportList" class="transport" aria-label="Transport">
			<div class="trh" aria-hidden="true"><span class="pm-label">Transport</span><span>Cost</span><span>Moves</span><span>Fuel</span><span>Def</span></div>
			<div class="trl">
				{shop.transports.map((t) => {
					const g = t.gives;
					return (
						<button key={t.eqid} type="button" class={t.on ? "tr is-on" : "tr"} aria-pressed={t.on} aria-label={transportName(t)}
							onClick={() => store.shopTransport(t.eqid)}>
							<span class="ts" aria-hidden="true" style={t.sprite === null ? undefined : frameStyle(t.sprite)} />
							<span class="nm"><b>{t.name}</b><span>{t.ground}</span></span>
							<span class="v c">{g === null ? "–" : "+" + g.cost}</span>
							<span class="v">{g === null ? "–" : g.moves}</span>
							<span class="v">{g === null ? "–" : g.fuel === 0 ? "—" : g.fuel}</span>
							<span class="v">{g === null ? "–" : g.def}</span>
						</button>
					);
				})}
			</div>
		</fieldset>
	);
}

function Detail({ shop, store }: { shop: Shop, store: Pick<Store, "shopTransport"> }) {
	const p = shop.picked;
	if (p === null) return <aside class="detail"><p class="pm-muted">Pick a model to see what it brings.</p></aside>;
	return (
		<aside class="detail" aria-label={p.name}>
			<div class="top">
				{p.rides === null ? <span class="spr" aria-hidden="true" style={frameStyle(p.sprite)} /> : (
					<div class="duo" aria-hidden="true">
						<span class="spr" style={frameStyle(p.sprite)} /><span class="plus">+</span><span class="spr" style={frameStyle(p.rides.sprite)} />
					</div>
				)}
				<div><h2 class="pm-title">{p.name}</h2><div class="pm-muted line">{p.line}{p.rides !== null && <> · rides a <b>{p.rides.name}</b></>}</div></div>
			</div>
			<Stats p={p} />
			{shop.transports.length > 0 && <Transports shop={shop} store={store} />}
			{p.rule !== null && <p class="rule">{p.rule}</p>}
		</aside>
	);
}

//A price worth showing: none for a button that has nothing to price
const priced = (a: { cost: number }) => a.cost > 0 ? a.cost : undefined;

function Actions({ shop, store }: { shop: Shop, store: Pick<Store, "shopAct"> }) {
	const act = (a: ShopAct) => () => store.shopAct(a);
	return (
		<>
			<span>{shop.target === null ? "Buying new units" : <>Upgrading <b>{shop.target}</b></>}</span>
			<span class="grow" />
			{shop.split !== null && <span class="after">Unit <b>{shop.split.unit}</b> + {shop.split.transport} <b>{shop.split.cost}</b></span>}
			{shop.sell !== null && <Button id="eqSellBut" icon="coin" cost={shop.sell.cost} disabled={shop.sell.refusal ?? undefined} onClick={act("sell")}>Sell</Button>}
			{shop.upgrade !== null && <Button id="eqUpgradeBut" icon="upgrade" cost={priced(shop.upgrade)}
				disabled={shop.upgrade.refusal ?? undefined} onClick={act("upgrade")}>Upgrade</Button>}
			<Button id="eqNewBut" variant="primary" icon="depot" cost={priced(shop.buy)}
				disabled={shop.buy.refusal ?? undefined} onClick={act("buy")}>Buy new</Button>
		</>
	);
}

//What ShopWindow reads of the store
type ShopWindowReads = Pick<Store, "closeShop" | "shop" | "shopAct" | "shopClass" | "shopCountry" | "shopModel" |
	"shopReverse" | "shopSort" | "shopTransport" | "shopUnit" | "shopUnits" | "side">;
export function ShopWindow({ store }: { store: ShopWindowReads }) {
	const shop = store.shop.value, units = store.shopUnits.value;
	useEscape(shop === null ? undefined : store.closeShop);
	if (shop === null || units === null) return null;
	const tools = (
		<>
			<button id="eqSelCountryButton" type="button" class="pm-btn" disabled={!shop.country.many}
				aria-label={shop.country.many ? `Country: ${shop.country.name}, show the next` : `Country: ${shop.country.name}`} onClick={store.shopCountry}>
				{shop.country.nation !== null && <Mark nation={shop.country.nation} size="sm" />}{shop.country.name}
				{shop.country.many && <Icon name="chevron-down" size="sm" />}
			</button>
			<span id="currentPrestige" class="pm-prestige pm-data prestige" title="Prestige"><Icon name="prestige" />{shop.prestige}</span>
			<Button id="eqCloseBut" icon="close" label="Close" onClick={store.closeShop} />
		</>
	);
	return (
		<>
			<Scrim />
			<Window id="equipment" class="pm-eq" title="Equipment" sub={shop.title} stamp="Requisition" tools={tools} 
				footer={<div id="eqActionsContainer" class="actions"><Actions shop={shop} store={store} /></div>}>
				<Units list={units} store={store} />
				<Tabs id="eqSelClass" label="Unit class" selected={String(shop.uclass)} onSelect={(c) => store.shopClass(+c)}
					tabs={shop.tabs.map((t) => ({ id: String(t.uclass), label: t.label, icon: t.icon }))} />
				<TabPanel of="eqSelClass" selected={String(shop.uclass)} class="body">
					<div class="list"><Tools shop={shop} store={store} /><Models shop={shop} store={store} /></div>
					<Detail shop={shop} store={store} />
				</TabPanel>
			</Window>
		</>
	);
}
