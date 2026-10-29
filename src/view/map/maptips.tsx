//The pins over the side playing's units low on fuel or out of ammo. What they say is the view model's (hextip.ts);
//the map places them.
import type { Point } from "./hexgrid";
import { Icon } from "../components/icon";
import type { Pin } from "./hextip";

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
