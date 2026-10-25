//Tabs and the segmented control (docs/ui/components/Tabs, SegmentedControl): a choice of view
//inside a window, and a row of options that apply at once. Styled by src/view/tabs.css.
import { Icon, type IconName } from "./icon";

//The arrow keys of the ARIA tabs pattern: the next or previous enabled tab, wrapping round, Home
//and End for the ends. A disabled tab is skipped, never removed: its place doesn't move
function roveTo(key: string, from: number, enabled: boolean[]): number | undefined {
	const n = enabled.length;
	let at: number;
	let step: number;
	if (key === "Home") [at, step] = [-1, 1];
	else if (key === "End") [at, step] = [n, -1];
	else if (key === "ArrowLeft" || key === "ArrowRight") [at, step] = [from, key === "ArrowRight" ? 1 : -1];
	else return undefined;
	for (let i = 0; i < n; i++) {
		at = (at + step + n) % n;
		if (enabled[at]) return at;
	}
	return undefined;
}

type Tab<T extends string> = {
	id: T,
	label: string,
	icon?: IconName,
	//the number of models in the class, top right of an icon tab
	count?: number,
	//a class with no models stays in its place, disabled, so the order never shifts
	disabled?: boolean,
};

type TabsProps<T extends string> = {
	tabs: Tab<T>[],
	selected: T,
	onSelect: (id: T) => void,
	//text tabs, 44px tall (the new-game lists), instead of the 88×56 icon tabs (the equipment classes)
	text?: boolean,
	label?: string,
	id?: string,
};

//role="tablist" with the arrow keys of the ARIA tabs pattern: the focus and the selection move together
export function Tabs<T extends string>({ tabs, selected, onSelect, text, label, id }: TabsProps<T>) {
	const enabled = tabs.map((t) => !t.disabled);
	const onKeyDown = (e: KeyboardEvent, from: number) => {
		const to = roveTo(e.key, from, enabled);
		if (to === undefined) return;
		e.preventDefault();
		onSelect(tabs[to].id);
		((e.currentTarget as HTMLElement).parentElement.children[to] as HTMLElement).focus();
	};
	return (
		<div id={id} class={text ? "pm-tabs text" : "pm-tabs"} role="tablist" aria-label={label}>
			{tabs.map((t, i) => {
				const on = t.id === selected;
				return (
					<button key={t.id} type="button" class="pm-tab" role="tab" aria-selected={on}
						tabIndex={on ? 0 : -1} disabled={t.disabled} onClick={() => onSelect(t.id)} onKeyDown={(e) => onKeyDown(e, i)}>
						{t.icon && <Icon name={t.icon} size={text ? "sm" : undefined} />}
						{t.label}
						{/* the space keeps the count apart from the caption in the tab's name */}
						{t.count !== undefined && <>{" "}<span class="n">{t.count}</span></>}
					</button>
				);
			})}
		</div>
	);
}

type Segment<T extends string> = { value: T, label: string, icon?: IconName, disabled?: boolean };

//Mutually exclusive options that apply immediately: sort, difficulty, theme, transport. Each is a
//toggle button (aria-pressed) in a labelled fieldset (a group); an unavailable one stays in place, disabled
export function SegmentedControl<T extends string>({ label, options, value, onChange }: {
	label: string,
	options: Segment<T>[],
	value: T,
	onChange: (value: T) => void,
}) {
	return (
		<fieldset class="pm-seg" aria-label={label}>
			{options.map((o) => {
				const on = o.value === value;
				return (
					<button key={o.value} type="button" aria-pressed={on} disabled={o.disabled} onClick={() => onChange(o.value)}>
						{o.icon && <Icon name={o.icon} size="sm" />}
						{o.label}
					</button>
				);
			})}
		</fieldset>
	);
}
