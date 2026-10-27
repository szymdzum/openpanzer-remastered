//The dossier (Dossier, CampaignEnd, #348): the campaign's record in a window, opened from either turn report's Dossier
//button, and at the campaign's end the same window under the outcome's stamp and the campaign's closing words, with
//Main menu. What it says is the view model's (src/view/dossier.ts): only what the game keeps.
import { safeHtml } from "./html";
import { Button } from "./button";
import { Facts, StatTable } from "./facts";
import { Scrim, Stamp, useEscape } from "./panel";
import type { DossierView, Medal } from "./dossier";
import type { Store } from "./store";

//A medal on a generic ribbon with a star, gold, silver or bronze (principles.md, Iconography): never a period decoration.
//Its colours are the screen's (screen.css .pm-medal)
export function MedalMark({ outcome, size = 1 }: { outcome: Medal["outcome"], size?: number }) {
	return (
		<svg class={"pm-medal " + outcome} width={64 * size} height={96 * size} viewBox="0 0 64 96" aria-hidden="true">
			<path class="rb" d="M14 0h36v34L32 46 14 34z" /><path class="rw" d="M24 0h16v40l-8 6-8-6z" /><path class="rr" d="M29 0h6v44l-3 2-3-2z" />
			<circle class="disc" cx="32" cy="66" r="24" /><circle class="ring" cx="32" cy="66" r="17" />
			<path class="star" d="M32 53l3.8 7.8 8.6 1.2-6.2 6 1.5 8.5L32 72.5l-7.7 4 1.5-8.5-6.2-6 8.6-1.2z" />
		</svg>
	);
}

function Medals({ d }: { d: DossierView }) {
	return (
		<div class="record">
			<div class="pm-label">Campaign medal record</div>
			<div id="dossierMedals" class="medals">
				{d.medals.map((m) => (
					<div key={m.outcome} class={m.count === 0 ? "medal none" : "medal"}>
						<MedalMark outcome={m.outcome} />
						<span class="pm-label">{m.label} · {m.count}</span>
						{m.names.map((n, i) => <span key={i} class="name">{n}</span>)}
					</div>
				))}
			</div>
			{d.defeats.length > 0 && <p class="defeats"><span class="pm-label">Lost</span> {d.defeats.join(" · ")}</p>}
		</div>
	);
}

export function DossierWindow({ store }: { store: Store }) {
	const d = store.dossier.value, end = store.campaignEnd.value;
	const close = d === null ? undefined : () => store.closeDossier();
	useEscape(close);
	if (d === null) return null;
	return (
		<>
			<Scrim />
			<dialog open id="dossier" class={end === null ? "pm-window pm-dossier" : "pm-window pm-dossier end"} aria-modal="true" aria-labelledby="dossierTitle">
				<div class="hd">
					<div><div id="dossierCampaign" class="pm-label">{d.title}</div><h1 id="dossierTitle" class="pm-display">{end === null ? "Dossier" : end.title}</h1></div>
					<span class="grow" />
					<Button id="dossierCloseBut" icon="close" label="Close" onClick={close} />
				</div>
				<div class="bd">
					{end !== null && <div class="outcome"><Stamp large ok={end.won}>{end.stamp}</Stamp><div id="dossierInfo" class="pm-typed" dangerouslySetInnerHTML={{ __html: safeHtml(end.html) }} /></div>}
					<Facts facts={[{ label: "Scenarios", value: d.played }, { label: "Enemy destroyed", value: d.destroyed },
						{ label: "Units lost", value: d.lost, tone: d.lost > 0 ? "critical" : undefined },
						{ label: end === null ? "Prestige" : "Final prestige", value: d.prestige, tone: "prestige" }]} />
					<div id="dossierCasualties">
						<StatTable caption="Campaign casualties by class" headId="dossierClasses" columns={d.table.columns} rows={d.table.rows} />
					</div>
					<Medals d={d} />
				</div>
				{end !== null && <div class="ft"><span class="grow" /><Button variant="primary" large onClick={close}>Main menu</Button></div>}
			</dialog>
		</>
	);
}
