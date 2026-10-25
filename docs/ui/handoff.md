# Implementing in HTML and CSS

How to bring this system into `openpanzer-remastered`. It was first written as a restyle of the old UI, without a framework; the new UI is built with Preact components (PLAN.md), which produce the classes and markup below. Under stage D the new UI is built on the core instead (PLAN.md), so read "keep the id" as "the new module renders this id": the ids keep the harness, the shortcuts and the tests pointing at the same things, and the classes and markup below are what the new modules produce. The migration order at the end is superseded by PLAN.md's phases.

## Files

| Add to the game | From this system | Notes |
| --- | --- | --- |
| `css/tokens.css` | `tokens.css` (generated from `tokens.json`) | Custom properties, with one block per theme: `:root, [data-theme="paper"]` and `[data-theme="blackout"]`. |
| `css/ui.css` | `src/view/library.css`, then `components/bundle.css` | The components' CSS (`src/view/*.css`), then the screens'. It replaces the current `dist/game/css/ui.css`. It contains no colors, only `var(--…)`. Drop the `.pm-stage` and `.pm-map` rules, which only frame the mockups. |
| `src/view/sprite.ts`, `icon.tsx` | `components/bundle.js` | The `PM.icons` and `PM.nationMarks` maps, ported (test/icons.test.tsx keeps them the card's). `<IconSprite />` mounts the sprite once at the root. |
| `src/view/fonts.css`, `src/view/fonts/` | Zilla Slab 500/700, Libre Franklin 400/600/700, Courier Prime 400/700 | Self-hosted woff2 files (all are under the OFL), in place. Remove `openpanzer.ttf`, `openpanzer-menu.ttf`, `m04.ttf` and `m04b.TTF` once no glyph uses them. |

Load order: `tokens.css`, then `ui.css`. Fonts use `font-display: swap`. Courier New, Arial and Georgia are the fallbacks in the font stacks.

## Theme switch

```ts
// uiSettings.theme: "paper" | "blackout" | "system"
function applyTheme(t: string) {
	const dark = t == "blackout" || (t == "system" && matchMedia("(prefers-color-scheme: dark)").matches);
	document.documentElement.dataset.theme = dark ? "blackout" : "paper";
}
```

Call it on load and from the Theme control in Settings. Store the value in `uiSettings` next to `uiScale`. Nothing else changes between themes, so the canvas never needs a redraw.

## Element map

Every existing ID stays. Add the class to the element and replace its inner markup.

| ID | Add class | Inner markup |
| --- | --- | --- |
| `#startmenu` | `pm` | The photograph layers `.pm-photo` and `.pm-photo-tint` behind `#smMain.pm-window`. |
| `#smCamp`, `#smScen`, `#smSettings`, `#smState` | `pm-window` | `.hd` / `.bd` / `.ft`. Lists are `.pm-list` with `.pm-row`. Facts are `.pm-facts`. |
| `#ui-message` | `pm-window` | `#title` in `.hd`, `#message.bd.pm-typed`, `#uiokbut.pm-btn.primary` in `.ft`. |
| `#statusbar` | `pm-panel pm-status` | `.row` (side, turn, date, weather, ground, prestige, report button) and `.msg`. `#weathermsg`, `#statusmsg` and `#locmsg` become cells. |
| `#menu` | `pm-rail` | Three `.group` blocks: `#inspectunit`; `#slidemenu` with `#buy`, `#hex`, `#air`, `#zoom`, `#options`; `#mainmenu` to fold it. `#endturn` is the corner button. Add `.labels` on touch. |
| `#statusBarButton` | `pm-btn` | In the status bar row, before `#combatLogButton`: opens the unit list. |
| `#unit-context` | `pm-panel pm-ctx` | `.pm-btn` holding an icon and a caption, with `.cost` where an action has one. |
| `#unit-info` | `pm-panel pm-info` | Three columns: identity, `.pm-meter` ×4, `.pm-stats`. |
| `#container-unitlist` | `pm-panel pm-unitlist` | `.hd` with the filters, then `#hscroll-unitlist.pm-strip` of `.pm-ucard`. |
| `#equipment` | `pm-window pm-eq` | `.hd`, `#eqSelClass.pm-tabs`, `.body` (`.list` with `#eqUnitList.pm-grid` of `.pm-card`, and `.detail` with `.pm-cmp` and `#eqTransportList`), and `#eqActionsContainer.ft`. |
| `#combatLog` | `pm-window pm-log` | `.summary`, then a `.sec` and `.pm-entry` rows per report. |
| `#smState` | `pm-window pm-save` | `.sec` for File and Cloud; `#cloudid.pm-input`; `#cloudid_lastsaves.pm-list` of `.pm-row`; `#diskloaderror.msg`. |
| `#smNewGame` | inside `#smMain` | `#smNewGameContent.pm-choices` of `.pm-choice` (icon, title, count, description). |
| `#combatLog` (short, at turn start) | `pm-panel pm-turn` | `.hd`, `.grid` of four `.cell` (objectives, turns to win with `.track`, prestige, ground), `.ft` with the enemy turn counts. `.last` on the last turn. |
| `#container-unitlist` (deploy mode) | `pm-panel pm-unitlist pm-deploy` | Docked at the bottom; `.hd` with the placed count and Upgrade. The ghost tag on the map is `.pm-placetag`. |
| `#dossier` | `pm-window` | Medal SVG, `.pm-stamp`, `.pm-facts`, `.pm-stats.cols6`. |
| `#gameToolTip` | `pm-tip`, or `pm-panel pm-odds` in odds mode | Odds mode is new (see below). |
| `.smallToolTip` | `pm-pin low`, or `pm-pin critical` | An icon plus a word. |

## Combat odds preview (new)

While a unit is selected, on `mousemove` over an enemy hex (or the first tap on touch), call `GameRules.calculateAttackResults(attacker, defender, true)`. The `estimate` flag already exists, and `ui.ts` calls it this way today. Read the losses and kills from the returned `combatResults`, then fill `#gameToolTip` in odds mode:

- Draw two strength bars of 10 segments each: kept segments in the side color, lost segments as `.loss`.
- Type the change: `10 → 6`.
- Set the verdict from the loss ratio: Favourable (`.good`) when the enemy loses at least twice as much, Unfavourable when you lose more, Even otherwise.
- Add a hint with the main factor, such as "Hard attack 3 against ground defence 7".

Outline the target hex with `hex-target` on the canvas. A second tap on the same hex commits the attack. A tap anywhere else, or Escape, dismisses the preview.

## Rules that keep it fast

- **No blur.** Never use `backdrop-filter`, `filter: blur` or translucent panels over the canvas. The flat `--scrim` is the only transparency allowed.
- **Shadows.** `box-shadow` on panels is static and cheap. Never animate it.
- **Showing panels.** Toggle panels with the `hidden` attribute, not by animating opacity.
- **Clamping.** Position hex-anchored elements with `left` and `top` from the map code. Clamp them with `space-3` from the screen edges.
- **Icons.** The sprite is injected once. Each `<use>` reference costs nothing.
- **Hi-DPI.** Everything is vector. `useRetina` only changes the canvas, and the CSS needs no `@2x` assets.

## Accessibility checklist

- Text pairs hold 4.5:1 in both themes, and borders and icons hold 3:1. The exception is brass fill on Paper (2.4:1 against panel), which always keeps its border.
- Every icon-only button has an `aria-label`. Toggles are `role="switch"` with `aria-checked`. Tabs, lists and segmented controls carry their ARIA roles.
- A state is never shown by color alone: low and critical carry a word or an icon, and sides carry a flag and a name.
- The focus ring is visible on every control. Esc closes the top window.
- `prefers-reduced-motion` stops the photo pan and the AI blink.

## Migration order

1. Add `tokens.css`, the fonts and the icon sprite, and set `data-theme`.
2. Restyle the HUD: `#statusbar`, `#menu`, `#unit-info`, `#unit-context`, `#gameToolTip`.
3. Restyle the windows: `#equipment`, `#combatLog`, `#ui-message`, `#dossier`.
4. Restyle the start menu, campaign, scenario and settings windows, and add the Theme control.
5. Add the combat odds preview.
6. Replace the `@media (max-device-width: 480px)` rules with the tablet layouts. Add `.labels` to the rail under `(pointer: coarse)`, and switch to the bottom command bar under `(orientation: portrait) and (max-width: 900px)`.
7. Delete the icon fonts, the `m04` fonts and the raster UI images (`ui/dialogs/**`, `ui/dossier/*.png`).
