//The turn report: the turn's five reports under its summary, over a scrim, opened with the short report's Turn
//report. An entry pressed brings its hex to the middle of the map. Briefing shows the scenario's description; the
//close button, Continue or Esc closes it. What it says is the view model's (log.ts).
import { Button } from "../components/button";
import { Icon } from "../components/icon";
import type { LogEntry, Words } from "./log";
import { Scrim, Window } from "../components/panel";
import type { Store } from "../store/store";
import { frameStyle } from "../hud/unitstrip";

function Sentence({ words }: { words: Words }) {
	return <span class="txt">{words.map((w, i) => typeof w === "string" ? w : <b key={i}>{w.b}</b>)}</span>;
}

function Entry({ e, onPick }: { e: LogEntry, onPick: () => void }) {
	return (
		<button type="button" class={e.destroyed ? "pm-entry lost" : "pm-entry"} onClick={onPick}>
			{e.sprite !== null ? <span class="spr" aria-hidden="true" style={frameStyle(e.sprite)} />
				: <span class="ico" aria-hidden="true"><Icon name={e.icon!} /></span>}
			<Sentence words={e.words} />
		</button>
	);
}

export function LogWindow({ store }: { store: Pick<Store, "briefing" | "closeLog" | "combatLog" | "look" | "openDossier"> }) {
	const log = store.combatLog.value;
	if (log === null) return null;
	const close = () => store.closeLog();
	const footer = (
		<>
			<span class="grow" />
			<Button icon="info" onClick={() => store.briefing()}>Briefing</Button>
			{log.campaign && <Button icon="medal" onClick={() => store.openDossier()}>Dossier</Button>}
			<Button variant="primary" onClick={close}>Continue</Button>
		</>
	);
	return (
		<>
			<Scrim />
			<Window id="combatLog" class="pm-log" title={log.title} sub={log.label} onClose={close} footer={footer}>
				<div class="summary">
					<div><span class="pm-label">Objectives left</span><span class="n">{log.objectives}</span></div>
					<div><span class="pm-label">{log.lead === null ? "Turns to win" : "Turns to " + log.lead.name}</span>
						<span class="n">{log.lead === null ? "–" : log.lead.left}</span>{log.others !== "" && <span class="pm-muted more">{log.others}</span>}</div>
					<div><span class="pm-label">Score</span><span class="n">{log.score}</span></div>
					<div><span class="pm-label">Prestige</span><span class="n pm-prestige">{log.prestige} <span class="u">+{log.next}</span></span></div>
				</div>
				{log.sections.map((s) => (
					<section key={s.title} aria-label={s.title}>
						<h2 class="sec"><Icon name={s.icon} size="sm" />{s.title}</h2>
						{s.entries.length === 0 ? <p class="pm-muted quiet">All quiet on this front</p>
							: s.entries.map((e, i) => <Entry key={i} e={e} onPick={() => store.look(e.at)} />)}
					</section>
				))}
			</Window>
		</>
	);
}
