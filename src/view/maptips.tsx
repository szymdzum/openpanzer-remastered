//What the map shows over itself beside the path's tag and the context menu (Tooltips, #346): the hex tooltip
//(#gameToolTip) beside a hex the pointer rests on, or a finger holds, and the pins over the side playing's units low on
//fuel or out of ammo. What they say is the view model's (src/view/hextip.ts); the map places them.
import type { Point } from "./hexgrid";
import { Anchored } from "./anchored";
import { Button } from "./button";
import { Icon, Mark } from "./icon";
import type { HexTip, Pin } from "./hextip";

//At the hex's centre on the screen, gap from it; OK closes it where a finger opened it (screen.css shows OK on touch)
export function HexTooltip({ tip, at, gap, onClose }: { tip: HexTip, at: Point, gap: number, onClose: () => void }) {
	return (
		<Anchored id="gameToolTip" tip hex={at} place="beside" gap={gap} role="tooltip">
			<div class="hd"><Icon name="scenario" size="sm" />{tip.name}<span class="grow" />{tip.nation !== null && <Mark nation={tip.nation} size="sm" />}</div>
			<div class="pm-muted">{tip.line}</div>
			<dl class="facts">{tip.rows.map(([k, v]) => [<dt key={k}>{k}</dt>, <dd key={k + "="} class="pm-data">{v}</dd>])}</dl>
			<div class="ok"><Button id="gameToolTipOk" onClick={onClose}>OK</Button></div>
		</Anchored>
	);
}

//The pins, each above its unit's hex (where: its hex's centre on the screen), a unit's second over its first
export function Pins({ pins, where }: { pins: Pin[], where: (pin: Pin) => Point }) {
	return (
		<>
			{pins.map((p, i) => {
				const at = where(p), second = i > 0 && pins[i - 1].unit === p.unit;
				return (
					<span key={p.unit + p.icon} class={"pm-pin " + p.tone + (second ? " second" : "")} style={{ left: at.x + "px", top: at.y + "px" }}>
						<Icon name={p.icon} size="sm" />{p.word}
					</span>
				);
			})}
		</>
	);
}
