//The equipment window (Equipment, #348): buy new units and upgrade or sell the one chosen, opened with B or the rail's
//Buy and upgrade. From the top: the title, the country button and the prestige; the class tabs; the sort and the
//models in service; the picked model's stats, and its transport; the action bar with the prices. What it says and why a button is off is the view model's (src/view/shop.ts).
import { Button } from "./button";
import { Icon, Mark } from "./icon";
import { Scrim, useEscape, Window } from "./panel";
import type { Shop } from "./shop";
import { SORTS, type SortKey } from "./shop";
import type { ShopAct } from "./shopstate";
import type { Store } from "./store";
import { SegmentedControl, Tabs } from "./tabs";
import { frameStyle } from "./unitstrip";

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

function Detail({ shop, store }: { shop: Shop, store: Pick<Store, "shopTransport"> }) {
	const p = shop.picked;
	if (p === null) return <aside class="detail"><p class="pm-muted">Pick a model to see what it brings.</p></aside>;
	return (
		<aside class="detail" aria-label={p.name}>
			<div class="top"><span class="spr" aria-hidden="true" style={frameStyle(p.sprite)} /><div><h2 class="pm-title">{p.name}</h2><div class="pm-muted line">{p.line}</div></div></div>
			<table class="pm-cmp">
				<thead>
					<tr><th class="hdr" scope="col">Stat</th><th class="hdr n" scope="col">{p.name}</th><td class="hdr" aria-hidden="true" /></tr>
				</thead>
				<tbody>
					{p.compare.map((c) => (
						<tr key={c.name}>
							<th scope="row">{c.name}</th><td class="n">{c.value}</td>
							<td class="bar" aria-hidden="true"><b style={{ width: `${Math.round(c.fill * 100)}%` }} /></td>
						</tr>
					))}
				</tbody>
			</table>
			{shop.transports.length > 0 && (
				<div id="eqTransportList" class="transport">
					<span class="pm-label">Transport</span>
					<SegmentedControl label="Transport" value={String(shop.transports.find((t) => t.on)!.eqid)} onChange={(v) => store.shopTransport(+v)}
						options={shop.transports.map((t) => ({ value: String(t.eqid), label: t.name }))} />
				</div>
			)}
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
	"shopReverse" | "shopSort" | "shopTransport">;
export function ShopWindow({ store }: { store: ShopWindowReads }) {
	const shop = store.shop.value;
	useEscape(shop === null ? undefined : store.closeShop);
	if (shop === null) return null;
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
				<Tabs id="eqSelClass" label="Unit class" selected={String(shop.uclass)} onSelect={(c) => store.shopClass(+c)}
					tabs={shop.tabs.map((t) => ({ id: String(t.uclass), label: t.label, icon: t.icon }))} />
				<div class="body">
					<div class="list"><Tools shop={shop} store={store} /><Models shop={shop} store={store} /></div>
					<Detail shop={shop} store={store} />
				</div>
			</Window>
		</>
	);
}
