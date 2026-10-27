# The new UI against the old: what is ported, what is cut

Every piece of the new UI's game screen (`?ui=new`, src/view/) beside the old UI's piece that does the same, with a
verdict under the 1:1 port rule (PLAN.md, "A 1:1 port of the old UI" and "The map stays quiet; a window may be
rich"). Written on 2026-10-26, after the owner's playtest of D3-D5 (#441, #437, #438).

- **port**: the old UI has it. The new UI keeps the same content and behaviour in the new look; where the two differ
  today, the row says how.
- **cut**: the old UI has nothing like it. It goes now and may come back after the switch (D8), one addition at a time.
- **owner decides**: unclear; one sentence says why. A piece from a ROADMAP issue the plan put in a phase (#7, #8, #32,
  #37, #62...) is here unless the issues settle it. These rows are left as they are.

The old UI's stylesheet, game/css/ui.css, is one minified line: its rows name the selector.

## The map during play

| Piece | What it shows, when | Old UI | Verdict |
|---|---|---|---|
| Terrain, hex grid (src/view/mapdraw.ts:46 `drawGrid`) | the map image, the grid with H | src/render.ts:333 | port |
| Unit sprites, markers (mapdraw.ts:181, 320: strength plate, readiness, experience, entrenchment, hits) | always | src/render.ts:338-360, the plate and the readiness at :900-960, the supply tags at :1020 | port |
| Shared hex: the other layer dimmed with a strength chip (mapdraw.ts:349 `drawChips`) | a hex with a ground and an air unit | the old map draws only the layer shown (render.ts:340 `hex.getUnit(!airMode)`) | owner decides: it draws no floating element, but the old map hid the other unit |
| Air rings round lifted aircraft (mapdraw.ts:159) | the air layer | the air layer's own hex style (render.ts:352-355 `hexstyle.airunit`) | port |
| Selected unit's hex, move area, targets (mapdraw.ts:57 `drawSelection`) | a unit selected | render.ts:243-247 current, :362-370 `hexstyle.move`, `movespotted`, `attack` | port |
| Unseen move hexes hatched (src/view/overlays.ts:24 `drawHatch`) | a ground unit selected | render.ts:363-366: unspotted move hexes drawn in their own style (`move` against `movespotted`) | port |
| Fog wash on unseen hexes (overlays.ts:16 `drawFog`) | always, fog of war on | none: the old map shows the fog only by the units it hides | owner decides: it covers nothing, but the old map has no wash |
| Enemy zone bars on the move area's edges (overlays.ts:91 `drawZones`) | a unit selected | none | owner decides: drawn on hex edges and covering nothing, it tells a rule the old map left to the player |
| Move path line, its end ring or stop square (mapdraw.ts:106, 141) | the pointer on a hex of the move area | none (#32, in D2) | owner decides: #441 keeps the path line where the old UI draws one, and the old UI draws none |
| Move path's label, "takes Llucmacanes · +150 prestige · 1 left" (src/view/map.tsx:271 `PathTag`) | with the path | none | **cut** (#441) |
| Attack cursor: crosshair and the two losses (src/view/attackdraw.ts:130 `drawGlance`) | the pointer on a target | render.ts:385 `drawCursor`, :753 `generateAttackCursor`: the crosshair, both flags, the attacker's losses and the defender's, from `calculateCombatResults` (the support fire included); on touch the same image drawn on the target hex (render.ts:373) | port: the numbers become the old cursor's (`combatResult`, src/core/combat.ts:353); the glyph beside them (rugged, overrun, support, no return fire) is cut |
| Grey "can't attack" badges and their reason (attackdraw.ts:60 `drawBlocked`) | a unit selected, an enemy in range it can't attack | none | **cut** (#441) |
| Odds card (src/view/oddscard.tsx, src/view/odds.ts:308 `oddsOf`) | after a 400 ms rest on a target, Shift, a first tap | none | **cut** (#441); a finger's first tap on a target attacks again, as the old UI did |
| Support fire arcs and "support fire" tags (overlays.ts:107, 176) | the pointer on a target guns protect | none (#7, in D4) | owner decides: from #7, which the issues above don't settle |
| Hex tooltip (src/view/maptips.tsx:11 `HexTooltip`, src/view/hextip.ts) | after a 700 ms rest on any hex, a long press | `#gameToolTip` exists (game/index.html, src/uibuilder.ts:1020) but the old UI opens it only for the tutorial's orders (src/ui.ts:1622); the hex under the pointer is told in the status bar (src/ui.ts:1350 `updateStatusBarLocation`) | **cut** (#441); what it says goes to the status bar (below) |
| Town and objective plaques (overlays.ts:212 `drawPlaques`, src/view/mapinfo.ts:52) | always, until L | the small tooltips over flagged hexes (src/ui.ts:1636 `addSmallToolTips`, src/uibuilder.ts:1035): the objective's name or "Objective"; the other towns' names only with *Show optional objectives tooltips*; L removes them (src/ui.ts:327) | port of the look (#438): at the foot of the hex, beneath the units, quieter. The prestige on them and the towns shown by default are #62's (D2): owner decides |
| Pins over units low on supply (maptips.tsx:23 `Pins`, hextip.ts:77 `pinsOf`) | the side playing's units, until L | "No Ammo" and "No Fuel" small tooltips (src/ui.ts:1672-1676: `unitLowAmmo(unit, 1)`, `unitLowFuel(unit, 1)`) | port: today they say "Low fuel" under a quarter of the tank; the old UI's "No fuel" at its own line is the port, not done in this round |
| Transport pins on airfields and ports | — | the small tooltips with the air and naval transports (src/ui.ts:1656-1663) | port, missing: not drawn yet |
| A hex's flag and the objective's box | always | the flag at the foot of the hex, a box round an objective's (render.ts:288-330) | port: the plaque at the foot stands for them, its owner's bar for the flag, its star for the box (#438) |
| Deployment zone (overlays.ts:59 `drawDeployZone`) | while deploying | render.ts:250 `hexstyle.deploy` | port |
| Deployment ghost, the unit drawn on the hovered hex (mapdraw.ts:205 `drawGhost`) | while deploying | none | cut, not done in this round |
| Placing tag beside the hovered hex (map.tsx:357 `PlaceTag`) | while deploying | none: the status line says what a click does | cut, not done in this round |
| Combat results: loss over each fighter, one word (src/view/resultmarks.tsx, src/view/results.ts) | after a combat, 2.5 s | the bouncing labels (src/ui.ts:698 `uiShowAlert`, src/dom.ts:311): the losses, Rugged Defense, OverRun, Attack Stopped, New Leader | port; the chip's note under the loss and the retreat's dashed trail (attackdraw.ts:49) have no old counterpart: cut, not done in this round |
| Animations and sounds (src/view/motiondraw.ts, src/view/beats.ts) | each step | src/render.ts:427-470, src/ui.ts:562 | port |
| Strategic map (src/view/strategic.ts:32, src/view/strategicdraw.ts) | Z | render.ts:254-285, src/ui.ts:1550 `uiToggleMapZoom` | port |

## HUD

| Piece | What it shows, when | Old UI | Verdict |
|---|---|---|---|
| Status bar, top row (src/view/statusbar.tsx:13): flag, country, side chip, turn | always | `#statusmsg` (src/ui.ts:1452 `uiTurnInfo`): "Germany Turn: 3/12" and the scenario's name; `#weathermsg`: weather and ground glyphs | port |
| Status bar: the date and the prestige | always | none in the status bar: the turn log's header says them (src/uicombatlog.ts:99) | owner decides: the bar covers no hex, and the old UI showed both one click away |
| Status bar: the rules played (#317) | always | none | owner decides: #317 closed with it, in D3 |
| Status bar: Unit list and Turn report buttons | always | `#statusBarButton`, `#combatLogButton` (game/index.html) | port |
| Status line (statusbar.tsx:41 `MapLine`): a refusal, the last combat's news, else the selected unit "3 of 5 moves left · hex 4,7" | always | `#locmsg` (src/ui.ts:1350 `updateStatusBarLocation`, called on every mouse move, src/ui.ts:260): the hovered hex's unit, its name, the transports there, its terrain, "/Road" and "(row,col)" | port: the hex under the pointer, as `#locmsg` says it, takes the selected unit's line (#441). The refusal and the strategic map's and deployment's lines stay; the combat news is the bouncing labels' text, kept until the next command |
| Rail (src/view/rail.tsx:63): Inspect unit, Buy, Hex grid, Air layer, Strategic map, Options, fold | always | `#menu`, `#slidemenu` (src/uibuilder.ts, the main menu buttons) | port |
| Rail tooltip (rail.tsx:55) | hover | the buttons' titles | port |
| End turn (rail.tsx:103) | always | the end turn button, which asks for a second tap (src/ui.ts:681 `askEndTurnConfirmation`) | port |
| End turn's question, the units that can still act (rail.tsx:114, src/view/mapview.ts:108 `unitsToAct`) | End turn with units left to act | none (#8, in D3) | owner decides; its count fixed to the units that can move or have a target (#436), as asked |
| Unit context menu (src/view/contextmenu.tsx:53, src/view/context.ts) | a unit selected, above its hex, every action with a second line, disabled ones with their reason, a sum tooltip | `#unit-context` (src/ui.ts:742 `updateUnitContextWindow`; game/css/ui.css `#unit-context`: fixed at the bottom centre, above the unit info): one small round icon button per action the unit can take now, in the order Mount, Embark, Resupply, Reinforce, Overstrength, Undo, the title as the tooltip | port (#437): docked at the bottom centre, icons only, only the actions it can take, what each gives in its tooltip. The disabled states, their reasons (#316) and the sum tooltip are cut |
| Unit card at the bottom (src/view/infopanel.tsx:135, src/view/unitcard.ts) | a unit selected, I | `#unit-info` (src/ui.ts:820 `updateUnitInfoWindow`): name, ordinal, class, core, leader, every stat, the transport, carrier, leader and next buttons | port, one card in three sizes (#441), saying what the old window said and no more. One row: identity, condition, the short sheet, Next unit, and the views as the old transport and carrier buttons. More unfolds a band over the map: every stat with its bar, move, range, spotting and value, the leaders in full. Hide leaves a strip of the name and supply, clear of the map's last rows. The side card that said it all again is gone, as asked |
| Short turn report under the status bar (src/view/turnbanner.tsx:27, src/view/turn.ts:97) | a person's turn starts, until the first click on the map | the short combat log (src/uicombatlog.ts:55 `showCombatLog`, at most 175 px): the turn, the scenario and its date, objectives left, the turns to each outcome, score, prestige and the next turn's, weather and ground, the lines of the units that fought, Show Turn Summary, Dossier, the briefing | port; the turns track and the "Enemy turn" chips are the look of those lines. The score and the weather are missing: not done in this round |
| AI indicator (turnbanner.tsx:57): "Poland is moving · 14 of 38 units" | a program plays | `#statusbar-extension` (src/uibuilder.ts:851 `showAIStatus`): "Computer turn in progress" | port; the count of units is cut, not done in this round |
| Keyboard shortcuts (src/view/shortcuts.ts) | always | src/ui.ts:275 `handleKeyboard`: M E S R O U, N P, A H B I Z L, Esc | port; Shift's odds card goes with the card |

## Windows

| Piece | What it shows, when | Old UI | Verdict |
|---|---|---|---|
| Unit list (src/view/unitstrip.tsx:39, src/view/unitlist.ts:70) | the status bar's button | `#container-unitlist` (src/ui.ts:711, :1394 `uiAddUnitBox`): sprite, name, can move, can fire, low supply | port; its header count, "2 moved · 1 low on supply", is cut |
| Equipment window (src/view/shopwindow.tsx:106, src/view/shop.ts:282) | B, the rail's Buy | `#equipment` (src/ui.ts:1054 `updateEquipmentWindow`, :1297): eight classes, 14 sorts, country, models with their costs, transports, Buy, Upgrade, Sell, the prestige | port; the models' count on each class tab, the detail column's deltas against the unit's own stats and the footer's "prestige left after" are cut |
| Reserve tray while deploying (src/view/tray.tsx:12, src/view/deploy.ts:67) | a scenario or turn with units in reserve | the deployment list (src/ui.ts:1529 `uiShowDeploymentWindow`) | port; its "N of M placed" and the card's note are cut |
| Turn report window (src/view/logwindow.tsx:31, src/view/log.ts:226) | the short report's Turn report | the extended combat log (src/uicombatlog.ts:55-87): its header, then combat, objectives, resupply, reinforcements, leaders, a line per unit | port; it gets a scrim like the other windows, as asked. The hint "Select an entry to centre the map on it" and each entry's result column (a loss in critical, Full, a star) are cut |
| Message dialog (src/view/message.tsx) | a message, a briefing | `#ui-message` (src/uibuilder.ts:973 `UIBuilder.message`): title, text, OK | port; the briefing's foot, the side's flag with "Germany · 1 September 1939", is cut |
| Dossier and campaign end (src/view/dossierwindow.tsx:40, src/view/dossier.ts) | the reports' Dossier, a campaign's end | `#dossier` (src/uibuilder.ts:1159 `showDossier`, :1119 `showCampaignEnd`): casualties by class, the medals | port |
| End turn's question (rail.tsx:114) | see the HUD | — | owner decides (see the HUD) |

## Menus (D6, #349)

| Piece | What it shows, when | Old UI | Verdict |
|---|---|---|---|
| Start menu (src/view/startmenu.tsx, src/view/menus.ts) | over the first scenario's briefing, from Options (the rail's, Esc with no unit selected), at a game's end | `#startmenu`, `#smMain` (src/uibuilder.ts:176 `buildStartMenu`, src/ui.ts:1721 `startMenuButton`, :1874 `options`): the six photographs, the logo with the version and four links, New Game, Settings, Save / Load, Continue Game, the credits | port: the wordmark in place of the raster logo. The card's "Operational command · Remastered" label, its photograph credit, Continue only with a save and its scenario and turn, the counts on the entries and New game's entries always shown are cut |
| New Game panel (startmenu.tsx) | the start menu's New Game | `#smNewGame`: Campaigns, Scenarios, Tutorial, their descriptions in their titles | port; the descriptions stay hints, as the card's always-shown descriptions and the tutorial's "Minorca · 1939" are cut. Load game in the panel is cut: Save / Load is the main window's |

## What this round changes

The pull requests that follow this page, each on the one before:

1. The unit context menu as the old `#unit-context` (#437, #429).
2. Attacking as the old cursor: the odds card and the badges go (#441).
3. The hex tooltip off the map, its hex in the status line; the move path's label goes (#441).
4. The plaques at the foot of their hexes, beneath the units, quieter (#438).
5. End turn's question counts only the units that can move or have a target (#436).
6. The windows: the cuts above, the turn report's scrim; the unit card one card at the bottom, a strip, a row or unfolded, in place of the unit info and the side card.

The rows marked "cut, not done in this round" and the ports with something missing wait for the next one.
