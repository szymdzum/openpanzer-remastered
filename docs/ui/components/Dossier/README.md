The end-of-scenario dossier in a campaign: the outcome stamp and medal, the campaign's text for the outcome, the key numbers, the units destroyed and lost by class, and the medal record across the campaign. It shows only what the game keeps.

**What the game keeps.** The campaign player's dossier (`PlayerDossier`, `src/legacy/map.ts`; `Dossier` in `src/legacy/state.ts`) counts units by class: enemy units destroyed, core units lost and auxiliary units lost. It carries over from scenario to scenario, so the counts are the whole campaign's. It also lists the scenario names by outcome. The rest of the card comes from the scenario and the campaign file:

| On the card | From |
| --- | --- |
| Outcome stamp and medal | the outcome (`lose`, `tactical`, `victory`, `briliant`) |
| The typed paragraph (`#dossierInfo`) | the campaign's text for the outcome, verbatim (`Campaign.getOutcomeText`, `src/legacy/campaign.ts`), typos included |
| Turns used | the turn the scenario ended on and its last turn; the turns that give each outcome are the scenario's `turns` |
| Prestige awarded | the outcome's prestige in the campaign file, added at the scenario's end (`playerAtHQ`, `src/core/campaign.ts`) |
| Enemy destroyed, units lost | the sums of the dossier's counts |
| Casualties by class (`#dossierCasualties`) | the dossier's counts for the eight classes the old dossier shows (`UIBuilder.eqClassButtons`): infantry, tank, recon, anti-tank, artillery, air defence, fighter and bomber |
| Medal record (`#dossierMedals`) | the number of scenarios per outcome, and their names |
| Next | the scenario the outcome leads to, its name and date |

The game keeps no casualties in strength points, no prestige earned in the scenario, and no names or places of the units lost, so the card shows none. Keeping more is a core change of its own, with its test, before a card shows it.

- **Medals.** There are three tiers. Brilliant is gold, Victory is silver and Tactical is bronze. All are drawn as SVG on a generic ribbon with a star, never a period German decoration. They replace the raster `ui/dossier/*.png`. A defeat has no medal.
- **Outcome.** The stamp names the outcome in words. The medal never carries it alone.
- **Medal record.** Medals not yet earned in the campaign are shown at 45% opacity.
- **Zeros** in the class table are in `ink-muted`; losses above zero in `critical`.
- Keep `#dossier`, `#dossierTitle`, `#dossierCampaign`, `#dossierInfo`, `#dossierCasualties`, `#dossierClasses`, `#dossierDestroyed`, `#dossierLostCore`, `#dossierLostAux`, `#dossierMedals` and `#dossierCloseBut`.
