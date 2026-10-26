//The reserve tray (Deployment, #348): while the person deploys, their reserve docked at the bottom, the unit picked
//to place on a brass hex, Upgrade for the picked unit (the equipment window, on it) and Done to leave the rest for
//later. With the reserve not empty and nothing picked, a button picks
//its first unit again. What it says is the view model's (src/view/deploy.ts trayOf).
import { Button } from "./button";
import { Icon } from "./icon";
import { Badge } from "./meter";
import { Panel } from "./panel";
import type { Store } from "./store";
import { frameStyle } from "./unitstrip";

export function ReserveTray({ store }: { store: Store }) {
	const tray = store.tray.value, reserve = store.reserve.value;
	if (tray === null) {
		if (reserve.length === 0) return null;
		return <Panel class="pm-reserve"><Button icon="deploy" onClick={() => store.pick(reserve[0].index)}>Deploy · {reserve.length} in reserve</Button></Panel>;
	}
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
