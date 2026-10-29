//The combat's results over the map (CombatResults, #347): a loss chip right of each fighter's strength plate and one
//stamp above the unit it concerns, from the view model (src/view/results.ts); the map places them. They stay 2.5 s (1 s
//with quick animations), then fade (combat.css: none under prefers-reduced-motion) and go
import { useEffect, useState } from "preact/hooks";
import type { Position } from "../core/types";
import { uiSettings } from "../app/settings";
import type { Point } from "./hexgrid";
import type { Results } from "./results";
import { TOKENS } from "./tokens";

const MS = TOKENS.ms;

//Shown, then fading, then gone: each new result starts again
function useFade(results: Results, gone: () => void): boolean {
	const [fading, setFading] = useState(false);
	useEffect(() => {
		setFading(false);
		const hold = uiSettings.quickAnimation ? MS["motion-hold-quick"] : MS["motion-hold"];
		const fade = setTimeout(() => setFading(true), hold);
		const end = setTimeout(gone, hold + MS["motion-fade"]);
		return () => {
			clearTimeout(fade);
			clearTimeout(end);
		};
	}, [results, gone]);
	return fading;
}

//where: a hex's centre on the screen; half: half a hex's height there
export function ResultMarks({ results, where, half, gone }: { results: Results, where: (p: Position) => Point, half: number, gone: () => void }) {
	const fading = useFade(results, gone), stamp = results.stamp;
	return (
		<div class={fading ? "pm-results fading" : "pm-results"} aria-hidden="true">
			{results.chips.map((c) => {
				const p = where(c.at);
				return (
					<span key={c.at.row + "," + c.at.col} class={c.loss === 0 ? "pm-hit none" : "pm-hit"} style={{ left: p.x + 12 + "px", top: p.y + 18 + "px" }}>
						{c.loss === 0 ? "0" : "−" + c.loss}{c.note !== null && <small>{c.note}</small>}
					</span>
				);
			})}
			{stamp !== null && (
				<span class={"pm-event " + stamp.tone} style={{ left: where(stamp.at).x + "px", top: where(stamp.at).y - half - 14 + "px" }}>
					{stamp.word}{stamp.extra !== null && <b>{stamp.extra}</b>}
				</span>
			)}
		</div>
	);
}
