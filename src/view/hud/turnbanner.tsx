//The start of a turn (TurnStart, TurnBanner, #346): the short turn report under the status bar (#combatLog), and the
//AI indicator while a program plays (Tooltips). What they say is the view model's (src/view/turn.ts); the report
//closes on its ×, Esc or the first click on the map, and the status bar's turn report button opens it again.
import { Button } from "../components/button";
import { Icon, Mark } from "../components/icon";
import type { Store } from "../store/store";
import type { TurnReport } from "../turn";

//The turns to win: the best outcome still open first in bold, the others after it, or the last turn's stake; under it
//the scenario's track, the turns played in the side's colour, a tick for each deadline, a passed one struck through
function TurnsToWin({ report }: { report: TurnReport }) {
	const lead = report.lead;
	return (
		<div class={report.last !== null ? "cell vic crit" : "cell vic"}>
			<span class="pm-label">{report.last !== null ? "Last turn" : "Turns to win"}</span>
			<span class="w">{report.last !== null ? report.last : lead === null ? "No outcome left to win"
				: <><b>{lead.left}</b> for {lead.name}{report.others !== "" && " · " + report.others}</>}</span>
			<div class="track" aria-hidden="true">
				<span class="past" style={{ width: report.past * 100 + "%" }} />
				{report.tiers.map((t) => <span key={t.label} class={t.gone ? "tier gone" : "tier"} style={{ left: t.at * 100 + "%" }}><i />{t.label}</span>)}
				<span class="now" style={{ left: report.past * 100 + "%" }} />
			</div>
		</div>
	);
}

export function TurnBanner({ store }: { store: Pick<Store, "briefing" | "openDossier" | "openLog" | "report" | "showReport"> }) {
	const report = store.report.value;
	if (report === null) return null;
	return (
		<section id="combatLog" class={report.last !== null ? "pm-panel pm-turn last" : "pm-panel pm-turn"} aria-label={report.title}>
			<div class="hd">
				<div><div class="pm-label">{report.label}</div><h2 class="pm-display">{report.title}</h2></div>
				<span class="grow" />
				<Button icon="info" label="Briefing" onClick={() => store.briefing()} />
				{report.campaign && <Button icon="medal" label="Dossier" onClick={() => store.openDossier()} />}
				<Button variant="ghost" icon="close" label="Close" onClick={() => store.showReport(false)} />
			</div>
			<div class="grid">
				<div class="cell obj"><span class="pm-label">Objectives</span><span class="n">{report.objectives}<span class="u"> left</span></span></div>
				<TurnsToWin report={report} />
				<div class="cell"><span class="pm-label">Prestige</span><span class="n pm-prestige">{report.prestige}<span class="u"> +{report.next} next</span></span></div>
				<div class="cell"><span class="pm-label">Ground</span><span class="n sm"><Icon name={report.ground.icon} size="sm" />{report.ground.word}</span></div>
			</div>
			<div class="ft">
				<span class="pm-label">Enemy turn</span>
				{report.enemy.map((e) => <span key={e.text} class="ev"><span class={"pm-" + e.tone}><Icon name="attack" size="sm" /></span>{e.text}</span>)}
				<span class="grow" />
				<Button icon="document" onClick={() => store.openLog()}>Turn report</Button>
			</div>
		</section>
	);
}

//"Poland is moving · 14 of 38 units", with a blinking dot in the side's colour (it stops under prefers-reduced-motion): the
//Allies' rust, the Axis's field grey
export function AiIndicator({ store }: { store: Pick<Store, "ai"> }) {
	const ai = store.ai.value;
	if (ai === null) return null;
	return (
		<output id="aiStatus" class={ai.side === 0 ? "pm-ai axis" : "pm-ai"}>
			{ai.nation !== null && <Mark nation={ai.nation} size="sm" />}
			<span class="dot" aria-hidden="true" />
			{ai.country} is moving · {ai.acted} of {ai.units} units
		</output>
	);
}
