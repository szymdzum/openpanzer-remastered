//A selectable list (docs/ui/components/ListRow): campaigns, scenarios, saved games. Rows grouped
//under label headers (by side), one selected. Styled by src/view/list.css.
//
//The card says listbox and options; the rows are a radio group instead, which the browser gives
//the same meaning and the arrow keys for free: one choice among many, the arrows move it (and
//the focus) through every group's rows, Tab leaves the list.
import type { ComponentChildren } from "preact";
import { useId } from "preact/hooks";
import { Mark, type Nation } from "./icon";

type Row = {
	id: string,
	title: string,
	//the small line under the title: "1939 · 4 scenarios"
	meta?: string,
	nation?: Nation,
	//right-aligned: the starting prestige, a date
	value?: ComponentChildren,
};

type Group = { name?: string, rows: Row[] };

type ListProps = {
	label: string,
	groups: Group[],
	selected: string | undefined,
	onSelect: (id: string) => void,
};

function ListRow({ name, row, on, onSelect }: { name: string, row: Row, on: boolean, onSelect: () => void }) {
	return (
		<label class={on ? "pm-row is-on" : "pm-row"}>
			<input class="pm-sr" type="radio" name={name} value={row.id} checked={on} onChange={onSelect} />
			{row.nation && <Mark nation={row.nation} />}
			{/* the spaces keep the title, the meta line and the value apart in the row's name */}
			<span><span class="t">{row.title}</span>{row.meta !== undefined && <>{" "}<br /><span class="m">{row.meta}</span></>}</span>
			{row.value !== undefined && <>{" "}<span class="r">{row.value}</span></>}
		</label>
	);
}

export function List({ label, groups, selected, onSelect }: ListProps) {
	const name = useId();
	const rows = (g: Group) => g.rows.map((row) => <ListRow key={row.id} name={name} row={row} on={row.id === selected} onSelect={() => onSelect(row.id)} />);
	return (
		<fieldset class="pm-list" aria-label={label}>
			{groups.map((g, i) => g.name === undefined ? rows(g) : (
				<fieldset key={i} class="pm-group">
					<legend class="group">{g.name}</legend>
					{rows(g)}
				</fieldset>
			))}
		</fieldset>
	);
}
