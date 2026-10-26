# Building the new UI

Stage D of docs/REFACTOR.md (#130): the war room interface, built on the core rather than on the
old UI's objects, and showing what the old UI shows. This page says how the work is split, in what order, and how a piece is judged
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
- **The design system before the screens (D1).** Tokens, then a component library, seen in a live
  gallery (`docs/ui/index.html`); the screens are composed of its primitives and patterns, with no
  CSS of their own beyond layout.
- **Preact with signals (decided 2026-10-25).** Components are functions in `.tsx`, typed by the
  compiler, with no logic of their own: the view model (plain TypeScript, tested without the DOM)
  computes what they show, and signals carry it to them after each step, so only the parts that
  changed render again. The map stays a canvas the components only mount. Compared on the same
  day with Lit (the runner-up: plain `.ts`, used by OpenFront.io), Svelte 5 and Vue 3.6 (their
  type checkers don't run on TypeScript 7 yet) and Solid 2.0 (still a release candidate). D1a
  starts with a spike: one component through the types, oxlint, fallow, Stryker, the coverage
  and the build; if `.tsx` breaks one of them, Preact with `htm` templates in `.ts`, else Lit.
- **A new UI as a second screen.** It lives in its own modules (`src/view/`), on the core: it
  draws a read-only view of the `World`, sends commands through the game host, shows a `Refusal`
  as the reason a control is disabled, and plays animations and sounds from the step's
  `GameEvent`s after the step (cosmetic random stream). It never reads the old `GameMap` objects
  or `game.ts`.
- **An early switch.** `?ui=new` starts the game on the new UI only until a whole game plays on
  it. Then it becomes the default and the old UI is deleted (D8). Tablets (D7) and the attack
  preview's breakdown come after, on the new UI only.
- **A 1:1 port of the old UI (decided 2026-10-26).** The new UI shows and does what the old UI
  shows and does: the same information, the same actions, the same behaviour, built the new way
  (Preact, signals, the tokens and the CSS rules of handoff.md). The cards in this folder give the
  look: layout, type, colour, icons, accessibility. They are not the spec for content or behaviour.
  Where a card adds something the old UI doesn't have (a panel, a filter, a disabled state with its
  reason, extra numbers), the port leaves it out and the pull request lists it. Playing D3 and D4
  showed why: each card looked right alone, but together their extras covered the map (#437, #438,
  #441). Additions wait until after the switch (D8), one at a time, each played before the next.
  port-audit.md lists each piece of the game screen beside the old UI's, with what is ported and what is cut.
- **The map stays quiet; a window may be rich.** The rule bites hardest on the map during play:
  what floats over it (menus, cards, tooltips, labels) is the old UI's amount, one thing at a
  time. A window the person opens on purpose, with the game waiting (the after-action report, the
  unit list, the equipment), may lay out everything the old window had in a fuller, clearer way,
  as the Dossier does.
- **Played before the next piece.** The owner plays each piece for a few minutes before the next
  one builds on it; what they find becomes an issue.
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
| D1b Library | #344 | primitives and patterns as Preact components, the live gallery (cards: Icons, Button, Panel, Tabs, SegmentedControl, Toggle, Slider, ListRow, Meter) | D1a |
| D1c View model | #380 | `src/view/`: the view model and its signals, command dispatch, the new UI as a screen, `?ui=new` | D1b, D0.2 |
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

- **Shows and does what the old UI does:** the same content and actions, checked against the old
  code (`src/ui.ts`, `src/uibuilder.ts`...), with the left-out extras of the card listed.
- **Looks like the card** in Paper and Blackout at 1366×768 and 1920×1080 (and the tablet sizes
  in D7): a screenshot of the game next to the render in the pull request.
- **Accessible:** the checklist in handoff.md (contrast, labels, focus, reduced motion).
- **Tested:** view-model logic in unit tests on a hand-built world (`smallGame()`).
- **The contracts and verify unchanged,** except where a D0 step says it changes them (D0.3's
  in-between states, D0.5's hashes) and at the switch (D8).

## Keeping the designs in step

This folder is the source of truth for the look. A design change is made here (the card's
preview.html and README.md), then `node scripts/ui-design.mjs --render <Name>` refreshes its
render, in the same pull request as the code that needs it. The Design System artifact on
claude.ai is republished from here when a review needs it.
