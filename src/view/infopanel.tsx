//The unit info panel (UnitInfo, #346): everything about the selected unit, in three columns: its identity (flag, name,
//class, core or auxiliary, experience, leader), its supply meters and its full stat sheet. What it says is the view
//model's (src/view/unitinfo.ts unitInfoOf); Inspect unit (I) shows or hides it. The leader's tooltip opens on hover,
//focus or a tap, above the panel, never over the unit's name. Unit card opens the full sheet (UnitCard).
import { useState } from "preact/hooks";
import { Stats } from "./facts";
import { Icon, Mark } from "./icon";
import { Meter, Stars } from "./meter";
import type { Store } from "./store";
import { Tooltip } from "./tooltip";
import type { LeaderLine } from "./unitinfo";

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

//Below 1280px wide the stat sheet waits behind Stats (HudLaptop): the screen's container query shows the button
export function UnitInfoPanel({ store }: { store: Store }) {
	const [stats, setStats] = useState(false);
	const info = store.info.value;
	if (info === null || !store.infoShown.value) return null;
	return (
		<section id="unit-info" class="pm-panel pm-info" aria-label="Selected unit">
			<div id="statsRowTop">
				<div id="uName" class="name">{info.nation !== null && <span id="uSmallFlag"><Mark nation={info.nation} size="sm" /></span>}{info.name}</div>
				<div class="cls">{info.line}</div>
				<Stars earned={info.stars} />
				<Leader key={info.id} leaders={info.leaders} />
				<button type="button" class="pm-btn ghost card-open" aria-controls="unit-card" onClick={() => store.openCard()}>Unit card</button>
				<button type="button" class="pm-btn ghost stats-toggle" aria-pressed={stats} aria-controls="statsRowContainer"
					onClick={() => setStats(!stats)}>Stats</button>
			</div>
			<div>
				{info.meters.map((m) => <Meter key={m.label} icon={m.icon} label={m.label} value={m.value} fill={m.fill} state={m.state} />)}
			</div>
			<div id="statsRowContainer" class="sheet">
				<div id="statsRow"><Stats stats={info.stats} /></div>
			</div>
		</section>
	);
}
