# Building the new UI

Stage D of docs/REFACTOR.md (#130): the war room interface, built on the core instead of ported
from the old UI. This page says how the work is split, in what order, and how a piece is judged
done. The designs it builds are in this folder (README.md). The order was decided on 2026-10-25.

## Shape

- **The game's flow out of the UI first (D0).** The core plays the rules, but the old UI still
  finishes moves and attacks in its animation callbacks, decides how a game ends and drives the
  AI's turn from a 1 s tick. D0 moves all of it into a game host behind one screen interface,
  which the old UI implements with a thin adapter. It needs no new UI and is worth it on its own:
  a whole game plays without the DOM, for the tests, the arena (#46), an LLM general (#45) and
  the CLI.
- **The old UI is frozen.** No fixes, no features: only the adapter D0 gives it. Its own bugs
  close when it goes (#112, #113).
- **The design system before the screens (D1).** Tokens, then a component library in TypeScript
  without a framework, seen in a live gallery (`docs/ui/index.html`); the screens are composed of
  its primitives and patterns, with no CSS of their own beyond layout.
- **A new UI as a second screen.** It lives in its own modules (`src/view/`), on the core: it
  draws a read-only view of the `World`, sends commands through the game host, shows a `Refusal`
  as the reason a control is disabled, and plays animations and sounds from the step's
  `GameEvent`s after the step (cosmetic random stream). It never reads the old `GameMap` objects
  or `game.ts`.
- **An early switch.** `?ui=new` starts the game on the new UI only until a whole game plays on
  it. Then it becomes the default and the old UI is deleted (D8). Tablets (D7) and the attack
  preview's breakdown come after, on the new UI only.
- **The designs are the spec.** Each piece names the cards it builds (`components/<Name>/`): the
  README for the rules and ids, the render for the look. Where code and card disagree, the card
  is fixed first, then the code. Cards that show what the game doesn't do are fixed before they
  are built (#379).
- **No new mechanics.** The UI shows what the core already knows (principles.md, "What the map has
  to show"). A number the core can't give yet (the hit chance for the attack preview's range) is a
  core change of its own, with its test, before the UI uses it.

## Phases

| Phase | Issue | Builds | Needs |
|---|---|---|---|
| D0.1 Game host | #373 | scenario start and load, the campaign chain, the outcome from the core's session, outside the UI | |
| D0.2 Screen interface | #374 | what the game asks of a screen, each request resolved when shown; the old UI implements it | D0.1 |
| D0.3 Whole steps | #375 | a move or an attack stepped to the end, then animated from its events; `waitUIAnimation`, the tick and the checkpoint hooks go (behavior-change) | D0.2 |
| D0.4 One-way mirror | #376 | the UI no longer writes into the game's objects | D0.3 |
| D0.5 Selection | #377 | the move and attack hexes out of the state and the save | D0.4 |
| D0.6 Harness and CLI | #378 | verify's replays and the CLI's live mode on the game host, not the old UI | D0.3 |
| Cards | #379 | the cards fixed where they show what the game doesn't do, or disagree | |
| D1a Tokens | #344 | the type scale in `tokens.css`, tokens for the canvas, fonts, `data-theme`, a check against written-in values | |
| D1b Library | #344 | primitives and patterns as TypeScript components, the live gallery (cards: Icons, Button, Panel, Tabs, SegmentedControl, Toggle, Slider, ListRow, Meter) | D1a |
| D1c View model | #380 | `src/view/`: the view model, command dispatch, the new UI as a screen, `?ui=new` | D1b, D0.2 |
| D2 Map | #345 | the canvas: terrain, markers, overlays at screen size, move area, zones, move path (#32), targets, fog, air layer, strategic map, deployment zone (cards: MapOverlays, MovePath, MapLayers, AirLayer, StrategicMap, ZoomLevels) | D1c |
| D3 HUD | #346 | status bar, game menu and every shortcut, End turn, unit info, context menu with real amounts, tooltips, AI indicator, turn banner (cards: HudDesktop, HudLaptop, StatusBar, GameMenu, UnitInfo, UnitContext, SupplyRules, Tooltips, TurnStart, TurnBanner) | D1c |
| D4 Combat | #347 | attack preview stages 0-2, odds card, combat results, the animations and sounds from the events (cards: AttackPreview, CombatOdds, CombatResults) | D2, D3 |
| D5 Windows | #348 | turn report, unit list, equipment, unit card, deployment, messages, dossier, campaign end (cards: CombatLog, UnitList, Equipment, UnitCard, Deployment, MessageDialog, Dossier, CampaignEnd) | D3 |
| D6 Menus | #349 | start menu, new game, campaign and scenario selection, settings with the rules choice, save and load (cards: StartMenu, NewGame, CampaignSelect, ScenarioSelect, Settings, SaveLoad) | D1c |
| D8 Switch | #351 | the new UI by default, the old one deleted, verify's UI part replaced by the new UI's tests | D0, D2-D6 |
| D7 Tablet | #350 | touch layouts and the two-tap rules (cards: TabletHudLandscape, TabletHudPortrait, TabletUnitInfo, TabletEquipmentLandscape, TabletEquipmentPortrait) | D8 |

Order: D0 and D1a-D1b side by side from the start, with the card fixes; D1c once both are far
enough; then D2, D3 and D6 side by side, D4 and D5; D8 as soon as a whole game plays on the new UI
(it doesn't wait for every detail of D4-D6); D7 and the rest after it.

Open issues that land in a phase go with it: #32, #62 and #31 in D2; #316, #8 and #317 in D3; #7,
#35 and #51 in D4; #37 and #66 in D5. The tutorial keeps running on the new UI through the
controllers' view events (D1c); a better tutorial is #38, after the switch.

## A piece of work

One issue per phase, split further when a phase is more than a pull request can review. Each
issue lists its cards, the element ids and events it uses, and these checks:

- **Looks like the card** in Paper and Blackout at 1366×768 and 1920×1080 (and the tablet sizes
  in D7): a screenshot of the game next to the render in the pull request.
- **Behaves as the README says:** inputs, states, refusals, keyboard and touch.
- **Accessible:** the checklist in handoff.md (contrast, labels, focus, reduced motion).
- **Tested:** view-model logic in unit tests on a hand-built world (`smallGame()`).
- **The contracts and verify unchanged,** except where a D0 step says it changes them (D0.3's
  in-between states, D0.5's hashes) and at the switch (D8).

## Keeping the designs in step

This folder is the source of truth from now on. A design change is made here (the card's
preview.html and README.md), then `node scripts/ui-design.mjs --render <Name>` refreshes its
render, in the same pull request as the code that needs it. The Design System artifact on
claude.ai is republished from here when a review needs it.
