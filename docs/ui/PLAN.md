# Building the new UI

Stage D of docs/REFACTOR.md (#130): the war room interface, built on the core instead of ported
from the old UI. This page says how the work is split, in what order, and how a piece is judged
done. The designs it builds are in this folder (README.md).

## Shape

- **A new UI beside the old one.** The new UI lives in its own modules (`src/view/`), on the core:
  it draws a read-only view of the `World`, sends commands through `step`, shows a `Refusal` as the
  reason a button is disabled, and plays animations and sounds from the step's `GameEvent`s after
  the step (cosmetic random stream). It never reads the old `GameMap` objects or `game.ts`.
- **Behind a flag until it covers every screen.** `?ui=new` starts the game on the new UI; the old
  UI stays the default. Nothing the harness or verify drive changes until the switch (D8), so the
  contracts and verify stay identical through D1-D7.
- **The designs are the spec.** Each piece names the cards it builds (`components/<Name>/`): the
  README for the rules and ids, the render for the look. Where code and card disagree, the card
  is fixed first, then the code.
- **No new mechanics.** The UI shows what the core already knows (principles.md, "What the map has
  to show"). A number the core can't give yet (the hit chance for the attack preview's range) is a
  core change of its own, with its test, before the UI uses it.

## Phases

| Phase | Builds | Cards | Needs |
|---|---|---|---|
| D1 Foundations | `tokens.css`, the self-hosted fonts, the icon sprite, `data-theme` and the theme setting; `src/view/` with the view model, command dispatch and the event queue; the `?ui=new` switch | Icons, Button, Panel, Tabs, SegmentedControl, Toggle, Slider, ListRow, Meter | |
| D2 Map | the canvas: terrain, units with the markers, the overlays at screen size, the move area, enemy zones, the move path (#32), the attack targets, fog, the air layer, the strategic map, the deployment zone | MapOverlays, MovePath, MapLayers, AirLayer, StrategicMap, ZoomLevels | D1 |
| D3 HUD | status bar, game menu, End turn and its confirmation, unit info, the unit context menu with real amounts, tooltips, the AI indicator, the turn banner | HudDesktop, HudLaptop, StatusBar, GameMenu, UnitInfo, UnitContext, SupplyRules, Tooltips, TurnStart, TurnBanner | D1 |
| D4 Combat | the attack preview stages 0-2 (stage 3 after the core exposes the hit chance), the odds card, the results that replace the bouncing text | AttackPreview, CombatOdds, CombatResults, attack-preview.md | D2, D3 |
| D5 Windows | turn report, unit list, equipment, unit card, deployment tray, message dialog, dossier, campaign end | CombatLog, UnitList, Equipment, UnitCard, Deployment, MessageDialog, Dossier, CampaignEnd | D3 |
| D6 Menus | start menu and new game, campaign and scenario selection, settings, save and load | StartMenu, NewGame, CampaignSelect, ScenarioSelect, Settings, SaveLoad | D1 |
| D7 Tablet | the touch layouts and the two-tap rules (attack, deploy, move) | TabletHudLandscape, TabletHudPortrait, TabletUnitInfo, TabletEquipmentLandscape, TabletEquipmentPortrait | D3-D6 |
| D8 Switch | the new UI by default; the harness's UI replay and its surface moved to it (verify's UI part re-baselined once, with the `behavior-change` label); `ui.ts`, `uibuilder.ts`, `render.ts`, `uicombatlog.ts`, `animation.ts`, the icon fonts and the raster UI images deleted | all | D1-D7 |

D2, D3 and D6 can run side by side after D1. Open issues that land in a phase go with it: #7, #35
and #51 in D4; #62 and #32 in D2; #316 in D3.

## A piece of work

One issue per phase, split further when a phase is more than a pull request can review. Each
issue lists its cards, the element ids and events it uses, and these checks:

- **Looks like the card** in Paper and Blackout at 1366×768 and 1920×1080 (and the tablet sizes
  in D7): a screenshot of the game next to the render in the pull request.
- **Behaves as the README says:** inputs, states, refusals, keyboard and touch.
- **Accessible:** the checklist in handoff.md (contrast, labels, focus, reduced motion).
- **Tested:** view-model logic in unit tests on a hand-built world (`smallGame()`); the contracts
  and verify unchanged through D7.

## Keeping the designs in step

This folder is the source of truth from now on. A design change is made here (the card's
preview.html and README.md), then `node scripts/ui-design.mjs --render <Name>` refreshes its
render, in the same pull request as the code that needs it. The Design System artifact on
claude.ai is republished from here when a review needs it.
