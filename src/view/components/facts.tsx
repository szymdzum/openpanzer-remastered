//The patterns of facts and numbers the cards repeat: the facts row under a campaign, a scenario
//or a dossier, the unit's stat sheet, and the table of numbers by unit class (the dossier's
//casualties). Styled by src/view/components/facts.css.
import type { ComponentChildren } from "preact";
import { Icon, type IconName } from "./icon";

type Tone = "prestige" | "ok" | "low" | "critical";

type Fact = { label: string, value: ComponentChildren, tone?: Tone, id?: string };

//Four facts side by side, each a label over a typed value (CampaignSelect, ScenarioSelect, Dossier)
export function Facts({ facts, id }: { facts: Fact[], id?: string }) {
	return (
		<dl id={id} class="pm-facts">
			{facts.map((f) => (
				<div key={f.label}>
					<dt class="pm-label">{f.label}</dt>
					<dd id={f.id} class={f.tone ? "n pm-" + f.tone : "n"}>{f.value}</dd>
				</div>
			))}
		</dl>
	);
}

//The stat sheet of a unit: short names over typed numbers, four columns (unit info) or six (the tablet sheet, the dossier)
export function Stats({ stats, cols = 4 }: { stats: { name: string, value: ComponentChildren }[], cols?: 4 | 6 }) {
	return (
		<dl class={cols === 6 ? "pm-stats cols6" : "pm-stats"}>
			{stats.map((s) => <div key={s.name}><dt class="k">{s.name}</dt><dd class="n">{s.value}</dd></div>)}
		</dl>
	);
}

type Cell = { value: ComponentChildren, tone?: "muted" | "critical" };

type StatTableProps = {
	caption: string,
	//the id of the header row, where the harness finds the classes (#dossierClasses)
	headId?: string,
	columns: { label: string, icon?: IconName }[],
	rows: { label: string, cells: Cell[], id?: string }[],
};

//Numbers by class, a row per count: the dossier's destroyed and lost units. A zero is muted, a
//loss can be critical: the view model says which
export function StatTable({ caption, headId, columns, rows }: StatTableProps) {
	return (
		<table class="pm-table">
			<caption class="pm-label">{caption}</caption>
			<thead>
				<tr id={headId}><th scope="col"><span class="pm-sr">Count</span></th>{columns.map((c) => <th key={c.label} scope="col" class="pm-label">{c.icon && <Icon name={c.icon} size="sm" />}{c.label}</th>)}</tr>
			</thead>
			<tbody>
				{rows.map((r) => (
					<tr key={r.label} id={r.id}>
						<th scope="row" class="pm-label">{r.label}</th>
						{r.cells.map((c, i) => <td key={i} class={c.tone ? "pm-data " + c.tone : "pm-data"}>{c.value}</td>)}
					</tr>
				))}
			</tbody>
		</table>
	);
}
