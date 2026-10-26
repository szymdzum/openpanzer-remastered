//The unit list (UnitList, #348): the person's units on the map as a strip of cards under the status bar, opened with
//the status bar's Unit list button. A card pressed selects its unit and brings it to the middle of the map. What each
//card says is the view model's (src/view/unitlist.ts). The close button or Esc closes it.
import { Button } from "./button";
import { Icon } from "./icon";
import { Badge } from "./meter";
import { useEscape } from "./panel";
import type { Store } from "./store";
import type { ListUnit } from "./unitlist";

//The sprite strip's third frame (nine side by side), as the card draws it
const FRAME = 2;
export const frameStyle = (sprite: string) => ({ backgroundImage: `url(${sprite})`, backgroundSize: "900% 100%", backgroundPositionX: `${FRAME / 8 * 100}%` });

//A card's name for screen readers: what the icons and the dimming say
function nameOf(u: ListUnit): string {
	const low = [u.fuel !== null && "low fuel", u.ammo !== null && "low ammo"].filter(Boolean);
	return [u.name + (u.sub === "" ? "" : " " + u.sub), "strength " + u.strength, ...low].join(", ");
}

function Card({ u, side, onPick }: { u: ListUnit, side: "axis" | "allied", onPick: () => void }) {
	return (
		<button type="button" class={u.selected ? "pm-ucard is-on" : u.moved ? "pm-ucard is-done" : "pm-ucard"} aria-pressed={u.selected}
			aria-label={nameOf(u)} onClick={onPick}>
			<Badge side={side}>{u.strength}</Badge>
			{(u.fuel !== null || u.ammo !== null) && (
				<span class="flags" aria-hidden="true">
					{u.fuel !== null && <span class={"pm-" + u.fuel}><Icon name="fuel" /></span>}
					{u.ammo !== null && <span class={"pm-" + u.ammo}><Icon name="ammo" /></span>}
				</span>
			)}
			<span class="spr" aria-hidden="true" style={frameStyle(u.sprite)} />
			<span class="nm">{u.name}</span>
			<span class="pm-muted sub">{u.sub}</span>
		</button>
	);
}

export function UnitStrip({ store }: { store: Store }) {
	const list = store.unitList.value;
	useEscape(list === null ? undefined : store.toggleList);
	if (list === null) return null;
	const side = store.side.value === 1 ? "allied" : "axis";
	return (
		<section id="container-unitlist" class="pm-panel pm-unitlist" aria-label="Your units">
			<div class="hd">
				<span class="pm-label">Units</span><span class="pm-data">{list.units.length}</span>
				<span class="pm-muted note">{list.moved} moved · {list.low} low on supply</span>
				<span class="grow" />
				<Button icon="close" label="Close" onClick={store.toggleList} />
			</div>
			<div id="hscroll-unitlist" class="pm-strip">
				<div id="unitlist" class="cards">
					{list.units.map((u) => <Card key={u.id} u={u} side={side} onPick={() => store.listPick(u.id)} />)}
				</div>
			</div>
		</section>
	);
}
