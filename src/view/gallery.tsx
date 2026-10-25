//The live gallery (docs/ui/index.html, docs/ui/live.html): each card's components, the real ones,
//in Paper and Blackout side by side, with the card's own examples. Not part of the game: only the
//design viewer under `npm run dev` and its test load it.
import type { ComponentChildren } from "preact";
import { render } from "preact";
import { useId, useState } from "preact/hooks";
import { Anchored } from "./anchored";
import { Button } from "./button";
import { Input, Slider, Toggle } from "./controls";
import { Facts, StatTable, Stats } from "./facts";
import { Icon, IconSprite, Mark, type IconName, type Nation } from "./icon";
import { List } from "./list";
import { Badge, Meter, Stars, Tag } from "./meter";
import { Panel, Window } from "./panel";
import { BottomSheet } from "./sheet";
import { ICONS, NATION_MARKS } from "./sprite";
import { StrengthBar } from "./strength";
import { SegmentedControl, Tabs } from "./tabs";
import { Tooltip } from "./tooltip";

const row = { display: "flex", gap: "var(--space-3)", alignItems: "center", flexWrap: "wrap" };
const column = { display: "grid", gap: "var(--space-4)" };

function ButtonCard() {
	return (
		<div style={column}>
			<div style={row}>
				<Button variant="primary" large icon="end-turn">End turn</Button>
				<Button variant="primary" icon="depot" cost={276}>Buy new</Button>
				<Button icon="upgrade" cost={60}>Upgrade</Button>
				<Button>Back</Button>
				<Button icon="close" label="Close" />
				<Button variant="ghost" icon="help">Help</Button>
				<Button variant="danger" icon="disband">Disband</Button>
			</div>
			<div style={row}>
				<span class="pm-label" style={{ width: "72px" }}>Refused</span>
				<Button disabled="The unit has moved">Disabled</Button>
				<Button variant="primary" disabled="Not your turn">Primary off</Button>
			</div>
		</div>
	);
}

function PanelCard() {
	return (
		<div style={row}>
			<Panel static style={{ width: "300px", padding: "var(--space-4) 20px" }}>
				<div class="pm-label">HUD panel</div>
				<p style={{ marginTop: "6px" }}>Opaque <b>panel</b> with a line-strong edge, an inner ruled line and a static shadow. No blur over the map.</p>
			</Panel>
			<Window static style={{ width: "500px" }} title="Window title" stamp="Secret" onClose={() => {}}
				footer={<><span class="grow" /><Button>Back</Button><Button variant="primary">OK</Button></>}>
				<span class="pm-muted">Body. The header, body and footer are separated by ruled lines.</span>
			</Window>
		</div>
	);
}

const CLASSES: { id: string, label: string, icon: IconName, count: number }[] = [
	{ id: "infantry", label: "Infantry", icon: "infantry", count: 12 }, { id: "tank", label: "Tank", icon: "tank", count: 8 },
	{ id: "recon", label: "Recon", icon: "recon", count: 6 }, { id: "antitank", label: "Anti-tank", icon: "antitank", count: 7 },
	{ id: "artillery", label: "Artillery", icon: "artillery", count: 5 }, { id: "antiair", label: "Anti-air", icon: "antiair", count: 4 },
	{ id: "fighter", label: "Fighter", icon: "fighter", count: 3 }, { id: "bomber", label: "Bomber", icon: "bomber", count: 2 },
	{ id: "naval", label: "Naval", icon: "naval", count: 0 },
];

function TabsCard() {
	const [unitClass, setUnitClass] = useState("tank");
	const [list, setList] = useState("campaigns");
	return (
		<div style={{ ...column, margin: "0 calc(-1 * var(--space-6))" }}>
			<Tabs label="Unit class" tabs={CLASSES.map((c) => ({ ...c, disabled: c.count === 0 }))} selected={unitClass} onSelect={setUnitClass} />
			<Tabs text label="New game" selected={list} onSelect={setList} tabs={[
				{ id: "campaigns", label: "Campaigns", icon: "campaign" },
				{ id: "scenarios", label: "Scenarios", icon: "scenario" },
				{ id: "saves", label: "Saved games", icon: "load" },
			]} />
		</div>
	);
}

function SegmentedCard() {
	const [sort, setSort] = useState("cost");
	const [difficulty, setDifficulty] = useState("tactical");
	const [theme, setTheme] = useState("paper");
	const [transport, setTransport] = useState("self");
	return (
		<div style={row}>
			<SegmentedControl label="Sort by" value={sort} onChange={setSort} options={[
				{ value: "cost", label: "Cost" }, { value: "soft", label: "Soft atk" }, { value: "hard", label: "Hard atk" }, { value: "def", label: "Defence" },
			]} />
			<SegmentedControl label="Difficulty" value={difficulty} onChange={setDifficulty} options={[
				{ value: "historical", label: "Historical" }, { value: "tactical", label: "Tactical" }, { value: "operational", label: "Operational" },
			]} />
			<SegmentedControl label="Theme" value={theme} onChange={setTheme} options={[
				{ value: "paper", label: "Paper", icon: "fair" }, { value: "blackout", label: "Blackout", icon: "overcast" }, { value: "system", label: "System" },
			]} />
			<SegmentedControl label="Transport" value={transport} onChange={setTransport} options={[
				{ value: "self", label: "Self-propelled" }, { value: "opel", label: "Opel Blitz", disabled: true },
			]} />
		</div>
	);
}

function ToggleCard() {
	const [quick, setQuick] = useState(true);
	const [fog, setFog] = useState(false);
	const [mute, setMute] = useState(false);
	//once per theme: each has its own row
	const muteId = useId();
	return (
		<div style={{ ...row, gap: "40px" }}>
			<Toggle label="Quick animations" checked={quick} onChange={setQuick} />
			<Toggle label="Disable fog of war" checked={fog} onChange={setFog} />
			<Toggle label="Locked" checked disabled onChange={() => {}} />
			<div class="pm-setting" style={{ minWidth: "320px" }}>
				<label class="t" htmlFor={muteId}>Mute sounds</label>
				<Toggle id={muteId} checked={mute} onChange={setMute} />
			</div>
		</div>
	);
}

function SliderCard() {
	const [scale, setScale] = useState(1);
	const [mapScale, setMapScale] = useState(1.4);
	const [cloud, setCloud] = useState("");
	return (
		<div style={{ display: "grid", gap: "var(--space-1)", maxWidth: "620px" }}>
			<div class="pm-setting"><span class="t">Interface scale</span>
				<Slider label="Interface scale" min={0.5} max={3} step={0.1} value={scale} text={scale.toFixed(1) + "×"} onInput={setScale} /></div>
			<div class="pm-setting"><span class="t">Game map scale</span>
				<Slider label="Game map scale" min={1} max={3} step={0.1} value={mapScale} text={mapScale.toFixed(1) + "×"} onInput={setMapScale} /></div>
			<div class="pm-setting"><span class="t">Cloud save id (Input)</span>
				<Input label="Cloud save id" value={cloud} placeholder="e.g. 7f3a19" invalid={cloud === "bad"} onInput={setCloud} /></div>
		</div>
	);
}

function ListCard() {
	const [selected, setSelected] = useState("fw");
	const prestige = (n: string) => <span class="pm-data pm-prestige">{n}</span>;
	return (
		<div style={{ maxWidth: "520px" }}>
			<List label="Campaigns" selected={selected} onSelect={setSelected} groups={[
				{ name: "Axis", rows: [
					{ id: "fw", title: "Fall Weiss 8 Armee", meta: "1939 · 4 scenarios", nation: "de", value: prestige("2,000") },
					{ id: "ak", title: "Mussolini's Afrika Korps", meta: "1940–1945 · 31 scenarios", nation: "it", value: prestige("2,000") },
				] },
				{ name: "Allied", rows: [
					{ id: "gpw", title: "The Great Patriotic War", meta: "1942–1945 · 20 scenarios", nation: "su", value: prestige("4,000") },
				] },
			]} />
		</div>
	);
}

const LEVELS: [number, string][] = [[0, "Green"], [2, "Experienced"], [5, "Elite"]];

function MeterCard() {
	return (
		<div style={{ ...row, gap: "40px", alignItems: "flex-start" }}>
			<div style={{ width: "180px" }}>
				<Meter icon="strength" label="Strength" value="10/10" fill={1} state="ok" />
				<Meter icon="fuel" label="Fuel" value="18/50" fill={0.36} state="low" />
				<Meter icon="ammo" label="Ammo" value="1/8" fill={0.12} state="critical" />
				<Meter icon="entrench" label="Entrench" value="0" fill={0} />
			</div>
			<div style={{ display: "grid", gap: "14px" }}>
				{LEVELS.map(([stars, name]) => <div key={name}><Stars earned={stars} /> <span class="pm-muted" style={{ marginLeft: "8px" }}>{name}</span></div>)}
			</div>
			<div style={{ display: "grid", gap: "12px" }}>
				<span style={row}><Badge side="axis">10</Badge><Badge side="allied">8</Badge><Badge side="neutral">5</Badge></span>
				<span style={row}><Tag tone="low" icon="low">Low fuel</Tag><Tag tone="critical" icon="critical">No ammo</Tag></span>
			</div>
		</div>
	);
}

const NATIONS: [Nation, string][] = [["de", "Germany (Axis)"], ["it", "Italy"], ["pl", "Poland"], ["su", "Soviet Union"], ["gb", "Great Britain"], ["us", "United States"], ["fr", "France"]];

function IconsCard() {
	const cell = { display: "grid", justifyItems: "center", gap: "6px", padding: "10px 2px 8px", background: "var(--panel-raised)", border: "1px solid var(--line)" };
	return (
		<div style={column}>
			<div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: "var(--space-1)" }}>
				{(Object.keys(ICONS) as IconName[]).map((name) => (
					<div key={name} style={cell}><Icon name={name} size="lg" /><span class="pm-data pm-muted" style={{ fontWeight: 400 }}>{name}</span></div>
				))}
			</div>
			<div style={row}>
				{NATIONS.map(([nation, name]) => <span key={nation} style={row}><Mark nation={nation} size="lg" />{name}</span>)}
			</div>
			<span class="pm-muted">{Object.keys(ICONS).length} icons, {Object.keys(NATION_MARKS).length} nation marks</span>
		</div>
	);
}

function TooltipsCard() {
	return (
		<div style={{ position: "relative", height: "220px" }}>
			<Tooltip title={<><Icon name="scenario" size="sm" />Janow<span class="grow" /><Mark nation="de" size="sm" /></>} style={{ left: "20px", top: "10px", width: "300px" }}>
				<div class="pm-muted">City · held by Germany</div>
			</Tooltip>
			<Tooltip side="left" style={{ left: "380px", top: "10px", whiteSpace: "nowrap" }}><b>Strategic map</b> <span class="pm-muted pm-data">Z</span></Tooltip>
			<Tooltip side="above" style={{ left: "380px", top: "90px" }}>Above its anchor</Tooltip>
		</div>
	);
}

//A stage the anchored panels are placed on: its own size is the screen they are clamped to
function Stage({ height, children }: { height: number, children: ComponentChildren }) {
	return <div style={{ position: "relative", height: height + "px", overflow: "hidden", background: "var(--panel-sunken)", border: "1px solid var(--line)" }}>{children}</div>;
}

function Hex({ x, y }: { x: number, y: number }) {
	return <span style={{ position: "absolute", left: x - 6 + "px", top: y - 6 + "px", width: "12px", height: "12px", border: "3px solid var(--hex-select)" }} />;
}

function UnitContextCard() {
	return (
		<Stage height={200}>
			<Hex x={300} y={150} />
			<Anchored hex={{ x: 300, y: 150 }} place="above" gap={30} class="pm-ctx" role="toolbar" label="Unit actions">
				<Button icon="resupply" line="+5 ammo · +14 fuel">Supply</Button>
				<Button icon="reinforce" line="+1 of 2" cost={28} partial>Reinforce</Button>
				<span class="pm-sep" />
				<Button icon="undo" disabled="revealed units" line="to 10,18">Undo move</Button>
			</Anchored>
			{/* clamped: a hex at the right edge keeps its menu on the stage */}
			<Hex x={880} y={150} />
			<Anchored hex={{ x: 880, y: 150 }} place="above" gap={30} class="pm-ctx" role="toolbar" label="Unit actions at the edge">
				<Button icon="resupply" disabled="moved" line="+5 ammo">Supply</Button>
				<Button icon="reinforce" disabled="needs 28" line="+2" cost={56}>Reinforce</Button>
			</Anchored>
		</Stage>
	);
}

function CombatOddsCard() {
	return (
		<Stage height={150}>
			<Hex x={120} y={75} />
			<Anchored hex={{ x: 120, y: 75 }} place="beside" gap={40} class="pm-odds v2" role="tooltip">
				<div class="vs">
					<span>Pz IIA <span class="pm-muted">· yours</span></span><span class="pm-data">10 → 4</span>
					<StrengthBar side="axis" before={10} after={4} support={1} />
					<span>38 Piechota <span class="pm-muted">· Polish</span></span><span class="pm-data">9 → 8</span>
					<StrengthBar side="allied" before={9} after={8} />
				</div>
			</Anchored>
		</Stage>
	);
}

function DossierCard() {
	const counts = (values: number[]) => values.map((v) => ({ value: v, tone: v === 0 ? "muted" as const : undefined }));
	return (
		<div style={{ ...column, maxWidth: "860px" }}>
			<Facts facts={[
				{ label: "Turns used", value: "18/25" }, { label: "Prestige awarded", value: "+1,000", tone: "prestige" },
				{ label: "Enemy destroyed", value: "34" }, { label: "Units lost", value: "3", tone: "critical" },
			]} />
			<StatTable caption="Campaign casualties by class"
				columns={CLASSES.slice(0, 8).map((c) => ({ label: c.label, icon: c.icon }))}
				rows={[
					{ label: "Destroyed", cells: counts([14, 6, 3, 4, 5, 2, 0, 1]) },
					{ label: "Core lost", cells: [{ value: 0, tone: "muted" }, { value: 1, tone: "critical" }, ...counts([0, 0, 0, 0, 0, 0])] },
				]} />
		</div>
	);
}

const STATS = [["Soft atk", 5], ["Hard atk", 3], ["Air atk", 0], ["Naval atk", 1], ["Gnd def", 7], ["Air def", 8], ["Close def", 2], ["Initiative", 7]] as const;

function UnitInfoCard() {
	return (
		<div style={{ ...row, alignItems: "flex-start" }}>
			<div style={{ width: "300px" }}><Stats stats={STATS.map(([name, value]) => ({ name, value }))} /></div>
			<div style={{ width: "460px" }}><Stats cols={6} stats={STATS.slice(0, 6).map(([name, value]) => ({ name, value }))} /></div>
		</div>
	);
}

function TabletUnitInfoCard() {
	const [open, setOpen] = useState(true);
	return (
		<Stage height={360}>
			<div style={{ padding: "var(--space-4)" }}><Button onClick={() => setOpen(true)}>Open the sheet</Button></div>
			{open && (
				<BottomSheet title="Pz IIA" lead={<Mark nation="de" size="lg" />} sub="1st Panzer · Tank · Core · 120 XP" tools={<Stars earned={1} />}
					height={260} onClose={() => setOpen(false)}>
					<Meter icon="fuel" label="Fuel" value="18/50" fill={0.36} state="low" />
				</BottomSheet>
			)}
		</Stage>
	);
}

//The cards with components of their own, by the card's name in docs/ui/components
export const LIVE: Record<string, () => ComponentChildren> = {
	Button: ButtonCard, Panel: PanelCard, Tabs: TabsCard, SegmentedControl: SegmentedCard, Toggle: ToggleCard,
	Slider: SliderCard, ListRow: ListCard, Meter: MeterCard, Icons: IconsCard, Tooltips: TooltipsCard,
	UnitContext: UnitContextCard, CombatOdds: CombatOddsCard, Dossier: DossierCard, UnitInfo: UnitInfoCard, TabletUnitInfo: TabletUnitInfoCard,
};

function Themes({ card }: { card: string }) {
	const Card = LIVE[card];
	if (!Card) return <p class="pm-muted">No component of this card is built yet.</p>;
	return <>
		{(["paper", "blackout"] as const).map((theme) => (
			<section key={theme} data-theme={theme} class="pm" style={{ padding: "var(--space-6)", background: "var(--panel)" }} aria-label={theme === "paper" ? "Paper" : "Blackout"}>
				<Card />
			</section>
		))}
	</>;
}

//docs/ui/live.html?card=Button: the card's components in both themes, under the icon sprite
export function mountGallery(root: HTMLElement, card: string) {
	render(<><IconSprite /><Themes card={card} /></>, root);
}
