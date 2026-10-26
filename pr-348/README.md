# Screenshots for issue 348 (the windows on the new UI)

Not for merging. Taken with headless Chrome over the DevTools protocol (`cdp.mjs` here) against the dev server at the top of the stack (`d5-dossier`).

**Staging:**
- Each scene is staged by a script in the page that mostly presses the new UI's own buttons.
- The campaign scenes reach the game through its own module (`import("/src/session.ts")`), as a dev-console script would: they start Fall Weiss with `game.host.newCampaign(0, 1)`.
- The dossier and campaign-end scenes write a dossier into the session's state.
- The campaign-end scenes call the screen's `campaignEnd` directly.

## Unit card (PR 434)

The tutorial's Pz IIA, picked in the unit list, then Unit card in the unit info.

The card's render: UnitCard.

<img src="https://github.com/szymdzum/openpanzer-remastered/blob/main/docs/ui/renders/UnitCard.webp?raw=true" width="640">

| | Paper | Blackout |
|---|---|---|
| unitcard, 1366 | <img src="unitcard-paper-1366.webp" width="640"> | <img src="unitcard-blackout-1366.webp" width="640"> |
| unitcard, 1920 | <img src="unitcard-paper-1920.webp" width="640"> | <img src="unitcard-blackout-1920.webp" width="640"> |

## Unit list (PR 435)

The tutorial, the status bar's Unit list, the fifth card pressed.

The card's render: UnitList.

<img src="https://github.com/szymdzum/openpanzer-remastered/blob/main/docs/ui/renders/UnitList.webp?raw=true" width="640">

| | Paper | Blackout |
|---|---|---|
| unitlist, 1366 | <img src="unitlist-paper-1366.webp" width="640"> | <img src="unitlist-blackout-1366.webp" width="640"> |
| unitlist, 1920 | <img src="unitlist-paper-1920.webp" width="640"> | <img src="unitlist-blackout-1920.webp" width="640"> |

## Equipment (PR 435)

The tutorial's Pz IIA, then B, then the Pz IVC picked: Upgrade 158, Sell 180, Buy new off for prestige.

The card's render: Equipment.

<img src="https://github.com/szymdzum/openpanzer-remastered/blob/main/docs/ui/renders/Equipment.webp?raw=true" width="640">

| | Paper | Blackout |
|---|---|---|
| equipment, 1366 | <img src="equipment-paper-1366.webp" width="640"> | <img src="equipment-blackout-1366.webp" width="640"> |
| equipment, 1920 | <img src="equipment-paper-1920.webp" width="640"> | <img src="equipment-blackout-1920.webp" width="640"> |

## Deployment's reserve tray (PR 439)

Fall Weiss's first scenario, three tanks bought in the new equipment window, then Deploy.

The card's render: Deployment.

<img src="https://github.com/szymdzum/openpanzer-remastered/blob/main/docs/ui/renders/Deployment.webp?raw=true" width="640">

| | Paper | Blackout |
|---|---|---|
| deploy, 1366 | <img src="deploy-paper-1366.webp" width="640"> | <img src="deploy-blackout-1366.webp" width="640"> |
| deploy, 1920 | <img src="deploy-paper-1920.webp" width="640"> | <img src="deploy-blackout-1920.webp" width="640"> |

## Message dialog (PR 440)

The tutorial's briefing as the page opens.

The card's render: MessageDialog.

<img src="https://github.com/szymdzum/openpanzer-remastered/blob/main/docs/ui/renders/MessageDialog.webp?raw=true" width="640">

| | Paper | Blackout |
|---|---|---|
| briefing, 1366 | <img src="briefing-paper-1366.webp" width="640"> | <img src="briefing-blackout-1366.webp" width="640"> |
| briefing, 1920 | <img src="briefing-paper-1920.webp" width="640"> | <img src="briefing-blackout-1920.webp" width="640"> |

## Turn report (PR 440)

Fall Weiss's first scenario, End turn, Poland's turn played, then Turn report in the short report.

The card's render: CombatLog.

<img src="https://github.com/szymdzum/openpanzer-remastered/blob/main/docs/ui/renders/CombatLog.webp?raw=true" width="640">

| | Paper | Blackout |
|---|---|---|
| log, 1366 | <img src="log-paper-1366.webp" width="640"> | <img src="log-blackout-1366.webp" width="640"> |
| log, 1920 | <img src="log-paper-1920.webp" width="640"> | <img src="log-blackout-1920.webp" width="640"> |

## Dossier (PR 442)

Fall Weiss's first scenario, the campaign player's dossier staged, then Dossier in the short report.

The card's render: Dossier.

<img src="https://github.com/szymdzum/openpanzer-remastered/blob/main/docs/ui/renders/Dossier.webp?raw=true" width="640">

| | Paper | Blackout |
|---|---|---|
| dossier, 1366 | <img src="dossier-paper-1366.webp" width="640"> | <img src="dossier-blackout-1366.webp" width="640"> |
| dossier, 1920 | <img src="dossier-paper-1920.webp" width="640"> | <img src="dossier-blackout-1920.webp" width="640"> |

## Campaign end (PR 442)

Fall Weiss with a dossier staged, then the screen's campaignEnd called with the campaign's own texts.

The card's render: CampaignEnd.

<img src="https://github.com/szymdzum/openpanzer-remastered/blob/main/docs/ui/renders/CampaignEnd.webp?raw=true" width="640">

| | Paper | Blackout |
|---|---|---|
| campaignend, 1366 | <img src="campaignend-paper-1366.webp" width="640"> | <img src="campaignend-blackout-1366.webp" width="640"> |
| campaignend, 1920 | <img src="campaignend-paper-1920.webp" width="640"> | <img src="campaignend-blackout-1920.webp" width="640"> |
| campaigndefeat, 1366 | <img src="campaigndefeat-paper-1366.webp" width="640"> | <img src="campaigndefeat-blackout-1366.webp" width="640"> |
| campaigndefeat, 1920 | <img src="campaigndefeat-paper-1920.webp" width="640"> | <img src="campaigndefeat-blackout-1920.webp" width="640"> |
