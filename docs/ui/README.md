# The new UI: design system

The war room interface for stage D (#130): paper, typed orders and brass, in two themes (Paper
and Blackout), designed on the game's real rules and screens. This folder is the spec the new UI
is built from, and its source of truth.

![The HUD at 1920×1080](renders/HudDesktop.webp)

## Read first

- [principles.md](principles.md): the character, content, color, type, layout, touch, icons and
  motion rules, and **What the map has to show**: every rule the engine knows and where the player
  sees it.
- [PLAN.md](PLAN.md): how the build is split into phases, in what order, and when a piece is done.
- [handoff.md](handoff.md): files, theme switch, element map, performance and accessibility rules.
- [attack-preview.md](attack-preview.md): the UX study behind the attack preview.

## The files

| Path | What it is |
|---|---|
| `tokens.json` | colors per theme, spacing, radius, sizes, z-index and the font families |
| `tokens.css` | the same as custom properties, generated |
| `components/bundle.css` | every component's CSS, colors only through `var(--…)` |
| `components/bundle.js` | the icon sprite (66 icons and the nation marks) and `PM.mount()` |
| `components/<Name>/preview.html` | the card: an HTML fragment drawn with the files above |
| `components/<Name>/README.md` | what the card does, its rules, states and the ids to keep |
| `renders/<Name>.webp` | the card rendered in Paper, for reading here on GitHub |
| `assets/` | map, sprites and photograph used only to stage the cards (see its README) |
| `index.html` | a viewer for the cards, live, with the theme switch |

## Viewing and changing

- **On GitHub:** the gallery below links every render and README.
- **Live:** `npm run dev`, then open `/docs/ui/` on the dev server. Pick a card, switch Paper and
  Blackout, open its README.
- **After changing a card:** `node scripts/ui-design.mjs --render <Name>` refreshes its render
  (headless Chrome and `cwebp`). Without arguments it rewrites `tokens.css`, `components.json`
  and the gallery below.

## Gallery

<!-- gallery:start (written by scripts/ui-design.mjs) -->

### Screens · In game

| Card | What it shows |
|---|---|
| [AirLayer](components/AirLayer/README.md)<br>[render](renders/AirLayer.webp) | Air layer at 1920×1080: aircraft on top with their markers, ground units dimmed underneath, the air target picked |
| [AttackPreview](components/AttackPreview/README.md)<br>[render](renders/AttackPreview.webp) | The attack preview in four stages, from the target marks to the full breakdown, and the stage 1 cursor in each situation |
| [CombatLog](components/CombatLog/README.md)<br>[render](renders/CombatLog.webp) | Combat log and turn summary (#combatLog) at 1920×1080 |
| [CombatOdds](components/CombatOdds/README.md)<br>[render](renders/CombatOdds.webp) | Combat odds v2: overrun, rugged defense, a costly close combat and a safe bombardment, with the reasons and what happens next |
| [CombatResults](components/CombatResults/README.md)<br>[render](renders/CombatResults.webp) | After the combat: losses over each hex, one stamp for what happened, and the same line in the status bar |
| [Deployment](components/Deployment/README.md)<br>[render](renders/Deployment.webp) | Deployment at 1920×1080: the zone, units placed, the next one shown on the hovered hex, and the reserve tray |
| [Equipment](components/Equipment/README.md)<br>[render](renders/Equipment.webp) | Equipment window (#equipment) at 1366×768: class tabs, sorted grid, comparison, transport, prestige |
| [GameMenu](components/GameMenu/README.md)<br>[render](renders/GameMenu.webp) | Game menu (#menu): the game's own buttons, open and folded, and the labelled rail for touch |
| [HudDesktop](components/HudDesktop/README.md)<br>[render](renders/HudDesktop.webp) | The full HUD at 1920×1080 over the Ciechanów map: unit selected, context menu, odds preview |
| [HudLaptop](components/HudLaptop/README.md)<br>[render](renders/HudLaptop.webp) | The full HUD at 1366×768: the same elements, proving the map stays visible on a small laptop |
| [MapLayers](components/MapLayers/README.md)<br>[render](renders/MapLayers.webp) | The same hexes in the ground layer and the air layer: which unit is on top, which gets the marker, which is the target |
| [MapOverlays](components/MapOverlays/README.md)<br>[render](renders/MapOverlays.webp) | The map layer: selection, move area, enemy zones, move path, attack target, support fire, fog, entrenchment, objectives and towns |
| [MovePath](components/MovePath/README.md)<br>[render](renders/MovePath.webp) | Move path preview (#32): the route to the hovered hex, moves and fuel left, and where a move stops, captures, turns blind or ends firing |
| [StatusBar](components/StatusBar/README.md)<br>[render](renders/StatusBar.webp) | Status bar (#statusbar): side, turn, date, weather, ground, prestige, turn report and status message |
| [StrategicMap](components/StrategicMap/README.md)<br>[render](renders/StrategicMap.webp) | Strategic map at 1920×1080: the whole Ciechanow map, units as side chips, objectives as large plaques |
| [SupplyRules](components/SupplyRules/README.md)<br>[render](renders/SupplyRules.webp) | Where to resupply and reinforce: the divisors the engine applies, with real numbers for one tank |
| [Tooltips](components/Tooltips/README.md)<br>[render](renders/Tooltips.webp) | Hex tooltip, unit pins (low fuel, low ammo, out of supply), button tooltip and the AI status indicator |
| [TurnBanner](components/TurnBanner/README.md)<br>[render](renders/TurnBanner.webp) | The short turn report (#combatLog) through a scenario: early, late, last turn, Blackout |
| [TurnStart](components/TurnStart/README.md)<br>[render](renders/TurnStart.webp) | Start of a turn at 1920×1080: the short turn report under the status bar, the first unit selected |
| [UnitCard](components/UnitCard/README.md)<br>[render](renders/UnitCard.webp) | The full unit sheet: identity, experience, condition in words, every stat with what it is for, leader abilities and the next upgrade |
| [UnitContext](components/UnitContext/README.md)<br>[render](renders/UnitContext.webp) | Unit context menu (#unit-context) with the real amounts: what Supply and Reinforce will give, the cost, why an action is missing |
| [UnitInfo](components/UnitInfo/README.md)<br>[render](renders/UnitInfo.webp) | Unit info panel (#unit-info): identity, supply meters and the full stat sheet |
| [UnitList](components/UnitList/README.md)<br>[render](renders/UnitList.webp) | Unit list (#container-unitlist) as a strip under the status bar |
| [ZoomLevels](components/ZoomLevels/README.md)<br>[render](renders/ZoomLevels.webp) | Detail by zoom: what the map shows at the strategic fit, at 1×, and at the 2–3× map scale, and why markers keep their size |

### Controls

| Card | What it shows |
|---|---|
| [Button](components/Button/README.md)<br>[render](renders/Button.webp) | Primary, secondary, icon, ghost and danger, with hot, pressed, disabled and focus states |
| [ListRow](components/ListRow/README.md)<br>[render](renders/ListRow.webp) | Selectable rows with a group header, as in the campaign and scenario lists |
| [Meter](components/Meter/README.md)<br>[render](renders/Meter.webp) | Supply meters in ok, low and critical, experience stars and strength badges |
| [Panel](components/Panel/README.md)<br>[render](renders/Panel.webp) | The HUD panel and the modal window with header and footer |
| [SegmentedControl](components/SegmentedControl/README.md)<br>[render](renders/SegmentedControl.webp) | Sort, filter and transport choice |
| [Slider](components/Slider/README.md)<br>[render](renders/Slider.webp) | Interface width, interface scale and map scale |
| [Tabs](components/Tabs/README.md)<br>[render](renders/Tabs.webp) | Icon tabs with counts, as in the equipment class filter, and text tabs |
| [Toggle](components/Toggle/README.md)<br>[render](renders/Toggle.webp) | On, off and disabled, as used in the settings window |

### Screens · Menus

| Card | What it shows |
|---|---|
| [CampaignEnd](components/CampaignEnd/README.md)<br>[render](renders/CampaignEnd.webp) | End of campaign at 1920×1080: victory and defeat side by side |
| [CampaignSelect](components/CampaignSelect/README.md)<br>[render](renders/CampaignSelect.webp) | Campaign selection at 1920×1080: list grouped by side, description, country, difficulty, scenarios, starting prestige |
| [Dossier](components/Dossier/README.md)<br>[render](renders/Dossier.webp) | End-of-scenario dossier (#dossier) at 1920×1080 with medal, outcome stamp, casualties and campaign medal record |
| [MessageDialog](components/MessageDialog/README.md)<br>[render](renders/MessageDialog.webp) | Message dialog (#ui-message) as a scenario briefing over the map at 1366×768 |
| [NewGame](components/NewGame/README.md)<br>[render](renders/NewGame.webp) | Start menu on a first run: no Continue, the three new-game choices with what each one is, Campaign as the primary action |
| [SaveLoad](components/SaveLoad/README.md)<br>[render](renders/SaveLoad.webp) | Save and load (#smState) at 1920×1080: file and cloud, the last saves, and the error and empty states |
| [ScenarioSelect](components/ScenarioSelect/README.md)<br>[render](renders/ScenarioSelect.webp) | Scenario selection at 1920×1080: list, sides and countries, description and turns |
| [Settings](components/Settings/README.md)<br>[render](renders/Settings.webp) | Settings at 1920×1080: theme switch, interface sliders and gameplay toggles |
| [StartMenu](components/StartMenu/README.md)<br>[render](renders/StartMenu.webp) | Start menu at 1920×1080: wordmark, new game, continue, load, settings, credits, over a slowly panning photograph |

### Other

| Card | What it shows |
|---|---|
| Cover<br>[render](renders/Cover.webp) |  |

### Foundations

| Card | What it shows |
|---|---|
| [Icons](components/Icons/README.md)<br>[render](renders/Icons.webp) | The full stroked icon set and the filled nation marks |

### Screens · Tablet

| Card | What it shows |
|---|---|
| [TabletEquipmentLandscape](components/TabletEquipmentLandscape/README.md)<br>[render](renders/TabletEquipmentLandscape.webp) | iPad landscape: equipment full screen, 3-column grid and the comparison column |
| [TabletEquipmentPortrait](components/TabletEquipmentPortrait/README.md)<br>[render](renders/TabletEquipmentPortrait.webp) | iPad portrait: equipment full screen, grid on top and the comparison below |
| [TabletHudLandscape](components/TabletHudLandscape/README.md)<br>[render](renders/TabletHudLandscape.webp) | iPad landscape (1180×820): touch HUD with labelled rail, compact unit info and odds on first tap |
| [TabletHudPortrait](components/TabletHudPortrait/README.md)<br>[render](renders/TabletHudPortrait.webp) | iPad portrait (820×1180): bottom command bar, two-row status bar, unit card above the bar |
| [TabletUnitInfo](components/TabletUnitInfo/README.md)<br>[render](renders/TabletUnitInfo.webp) | iPad portrait: the unit sheet opened from Stats, with actions and the full stat sheet |

<!-- gallery:end -->
