//The reserve tray: while the person deploys, their reserve docked at the bottom, the unit picked to place on a brass
//hex, Upgrade for the picked unit (the equipment window, on it) and Done to leave the rest for later (map/deploy.ts)
import { Button } from "../components/button";
import { Icon } from "../components/icon";
import { Badge } from "../components/meter";
import type { Store } from "../store/store";
import { frameStyle } from "./unitstrip";

export function ReserveTray({ store }: { store: Pick<Store, "openShop" | "pick" | "side" | "tray"> }) {
	const tray = store.tray.value;
	if (tray === null) return null;
	const side = store.side.value === 1 ? "allied" : "axis", picked = tray.units.find((u) => u.picked)!;
	return (
		<section id="container-unitlist" class="pm-panel pm-unitlist pm-deploy" aria-label="Reserve">
			<div class="hd">
				<Icon name="deploy" />
				<span class="pm-label">Deploy</span>
				<span class="grow" />
				<Button icon="upgrade" onClick={() => store.openShop({ index: picked.index })}>Upgrade</Button>
				<Button variant="ghost" onClick={() => store.pick(null)}>Done</Button>
			</div>
			<div id="hscroll-unitlist" class="pm-strip">
				<div id="unitlist" class="cards">
					{tray.units.map((u) => (
						<button key={u.index} type="button" class={u.picked ? "pm-ucard is-on" : "pm-ucard"} aria-pressed={u.picked}
							aria-label={`${u.name}, strength ${u.strength}`} onClick={() => store.pick(u.index)}>
							<Badge side={side}>{u.strength}</Badge>
							<span class="spr" aria-hidden="true" style={frameStyle(u.sprite)} />
							<span class="nm">{u.name}</span>
						</button>
					))}
				</div>
			</div>
		</section>
	);
}

//With units still in reserve and the tray closed: over End turn, the reminder before the turn ends, its count on a
//brass plate; a click picks the first of them again
export function DeployButton({ store }: { store: Pick<Store, "pick" | "reserve" | "tray"> }) {
	const reserve = store.reserve.value, n = reserve.length;
	if (store.tray.value !== null || n === 0) return null;
	return (
		<button type="button" class="pm-btn pm-deploynow" aria-label={`Deploy · ${n} in reserve`}
			title={n === 1 ? "1 unit in reserve" : `${n} units in reserve`} onClick={() => store.pick(reserve[0].index)}>
			<Icon name="deploy" size="sm" />Deploy<span class="n" aria-hidden="true">{n}</span>
		</button>
	);
}
