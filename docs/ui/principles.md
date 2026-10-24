The interface around the battlefield of Panzer Marshal, a browser remake of Panzer General 2. The hex map is the hero. Every panel, window and HUD element is there to be read quickly over hours of play. The character is a 1940s war room: paper, typed orders, brass and a red rubber stamp. It stays a clean, modern game UI, not a costume.

There are two themes of the same character, switched in Settings:

| Theme | When | Feel |
| --- | --- | --- |
| `paper` | the default, daylight | Light paper panels with dark ink, brass actions and red stamps. Stands out clearly against the olive map. |
| `blackout` | long sessions, dark rooms | Olive-black panels with cream ink, amber brass and the same stamps. Quieter over the map. |

Set `data-theme="paper"` or `data-theme="blackout"` on the game root. The System option follows `prefers-color-scheme`. Every token below has a value in both themes, and every component works in both.

## Content

- Write like a staff officer: short, factual, no exclamation marks. "3 of 5 moves left", "Estimated losses: you 4, enemy 1", "Tanks move on their own tracks."
- Buttons and labels are written in sentence case ("End turn", "Buy new"). CSS sets buttons, labels and tab captions in uppercase. Titles, list items and body text stay as written.
- Unit and place names stay exactly as the game data has them: "Pz 38(t)A", "SdKfz 251", "Ciechanow", "Mława". Never re-case a name.
- Numbers use tabular figures. Prestige uses a thousands separator (3,056). Supply uses a slash (18/50). A strength change uses an arrow (10 → 6). A delta is signed (+4, −1).
- Dates are written "06 Sep 1939". The turn is written "3/17", or "Turn 3 of 17" where there is room.
- Stamps (Requisition, Secret, Brilliant victory) add flavor. Use at most one per window, and never put information in a stamp alone.

## Color

- Every panel over the map is opaque `panel` with a `line-strong` edge, an inner `line` rule and `shadow-panel`. The map redraws constantly, so never put translucency or `backdrop-filter` on anything over the canvas. Modal windows sit on `scrim`, a flat color.
- Text is `ink` or `ink-muted` on `panel`, `panel-raised` or `panel-sunken`. All six pairs hold 4.5:1 in both themes.
- Brass (`accent`) marks exactly one primary action per view: End turn, Buy new, Play, OK. It also marks the active tab and the active rail button. Text on it is `on-accent`. In Paper, brass on paper is only 2.4:1, so a brass fill always keeps its `line-strong` border. Brass as text is `accent-ink`, used for prestige.
- **Sides.** The Axis is `axis`, a field-grey blue. The Allies are `allied`, one rust for every Allied nation: Polish, Soviet, British, US and French. Neutral is `neutral-side`. Use side colors as fills (badges, chips, strength bars, side cards) with `on-side` text, and `axis-ink` or `allied-ink` for text. The nation is always named by its flag and name, never by a color per country. Blue against rust stays apart under every common color-vision deficiency.
- **States.** `ok`, `low` and `critical` cover fuel, ammo, supply and combat verdicts. Each always comes with its icon (`ok`, `low` or `critical`) or its word, so color is never the only signal.
- **Map overlays.** Use `hex-select` for the selected unit's hex (3px solid) and `hex-target` for the enemy hex under the odds preview (3px dashed).
- **Focus.** The keyboard focus ring is 2px of solid `focus` with a 2px offset: deep blue on Paper, pale yellow on Blackout. It never looks like selection.

## Type

- Zilla Slab (`display`) is for window titles, uppercase and slightly tracked, and for unit and campaign names. It is also the wordmark, which replaces the raster logo.
- Libre Franklin (`ui`) is for all interface text. Franklin Gothic, the face it revives, was on period posters and newspapers.
- Courier Prime (`mono`) is for every typed value (turn, date, costs, stats, prestige, the status line) and for briefings in `typed`, which read like an order sheet.
- Body text is 14/20. Labels are 11/14 at weight 600, uppercase, tracked 0.08em. The smallest text is `micro` at 10px, used only for badges and context-button captions.
- All three faces are open-licensed Google Fonts. Self-host the woff2 files in production. The game works offline.

## Layout and touch

- Design at 1366×768 first and confirm at 1920×1080. **Persistent chrome:** the status bar is centered at the top, the rail is centered on the right, unit info is centered at the bottom, and End turn sits bottom right. It covers about 21% of the screen at 1366 and 13% at 1920. The corners and the middle band stay map.
- **Hex-anchored elements:** the unit context menu sits above the selected hex, and the odds preview beside the target hex. Both are clamped to the screen with `space-3` from the edges.
- Everything tappable is at least `hit-target` (44px) on each side. Context buttons are 62×54, and rail buttons 48×46 (56×52 on tablet).
- Nothing relies on hover. Rail buttons have an `aria-label` and show text labels on touch. The odds preview opens on the first tap on an enemy hex, and the second tap attacks. Long-press opens the hex tooltip.
- **Tablet:** on iPad landscape the rail grows and unit info turns compact. In portrait the rail becomes a labelled command bar along the bottom. On both, the full unit sheet opens as a bottom sheet, and the equipment window is full screen.
- Spacing comes from `space-1` to `space-8`. Panels use `space-3` padding at 1366, and `space-4` at 1920 and on tablet.
- Corners are `radius-paper` (2px), near-square like cut paper. Only toggle knobs, slider thumbs and the AI dot are round.

## Iconography

- One stroked SVG icon set on a 24px grid, with square caps and miter joins, drawn in `currentColor` at stroke 2. It replaces the `openpanzer` and `openpanzer-menu` icon fonts and the raster button art. `components/bundle.js` injects it as an inline sprite, used as `<svg class="i"><use href="#pm-end-turn"/></svg>`. The Icons card shows all 66.
- Nation marks are filled symbols: `flag-de`, `flag-it`, `flag-pl`, `flag-su`, `flag-gb`, `flag-us` and `flag-fr`. The Axis is shown only by the Balkenkreuz, as in the original game. Never the swastika flag or SS runes, even where campaign data names SS formations.
- Medals are SVG on a generic ribbon with a star: gold for Brilliant, silver for Victory, bronze for Tactical. They are never a period German decoration.
- Unit sprites, terrain and the canvas map are not part of this system. The mockups use the game's own Ciechanów 1939 map, its 1939 sprites and a start-menu photograph (`assets/Mockup`).

## Motion

- Motion is functional only. The start-menu photographs pan over 60 seconds and cross-fade every 20, and the AI dot blinks. Under `prefers-reduced-motion` both stop.
- Panels appear without animation. A press moves a button down 1px.

## What the map has to show

The rules below decide a player's move, and the engine already knows each of them. Today most of them are invisible: a move range ends with no reason, an attack goes badly with no warning. Each line names the rule as the code has it (`src/gamerules.ts` is `gr`) and where the player sees it: the map layer (`MapOverlays`), the unit marker, the odds preview (`CombatOdds`) or the unit card (`UnitCard`).

### Moving

| Rule | Show | Where |
| --- | --- | --- |
| The move area comes from terrain, road and ground condition, capped by fuel (`getMoveRange`, `getUnitMoveRange` gr:208) | the area the engine returns, nothing drawn from distance | map |
| A spotted hex next to an enemy ground unit, ship or fort ends the move (cost 254, gr:173); a hidden enemy's zone doesn't | a red bar on the edge facing the enemy; the path ends in a stop with "stops: enemy zone" | map |
| Moving into a hidden enemy is an ambush that ends the move and forces a bad fight (map.ts:1180) | hatched area hexes the side doesn't see | map |
| Friends can be passed through, not ended on (`canPassInto`, `canMoveInto`) | the path crosses them; no area tint on their hexes | map |
| Recon can split its moves; an overrun gives +1 move and the tank can fire again | moves left in the path ring; the marker gets its arrow and crosshair back | map, marker |
| A unit moved in its transport can't fire that turn (unit.ts:300) | "can't fire after this move" on the path of a mounted unit | map |
| Undo exists only if the move revealed no unit and wasn't ambushed (map.ts:1233) | the Undo button says why it's gone | context menu |
| Only the destination hex is captured; aircraft and mounted guns don't capture (`canCapture` gr:1197) | the path ring shows the flag it would take, "+50" or "+150" | map |

### Attacking

The estimate (`calculateCombatResults(..., estimate = true)`) needs no dice, and several outcomes that feel random are decided by it. Show them before the attack, not after.

| Rule | Show | Where |
| --- | --- | --- |
| Losses on both sides (`kills`, `losses`) | strength before → after, as bars | odds |
| Rugged defense is a formula, not a roll (`isRuggedDefense` gr:845): entrenchment, experience and class rates | "Rugged defense: you lose your defence, half your attack" | odds |
| Overrun is decided by the estimate (gr:756): a tank, adjacent, ≤1 loss, destroys the target | "Overrun: no return fire, +1 move" | odds |
| The defender fires back only when adjacent and with ammo (`defcanfire`) | "no return fire" when it doesn't | odds |
| Spotted enemy artillery in range fires at an adjacent attacker; flak, air defence and fighters at aircraft (`getSupportFireUnits` gr:1235) | an arc from each gun to the attacker; "+ support fire" in the losses | map, odds |
| Close combat: infantry into city, forest, mountain or a fort | "close combat" and which defence each side uses | odds |
| City +4 defence; a side in a river without a road gives the other +4/+4; initiative +4 to the side that fires first | the one to three biggest reasons, e.g. "they fire first", "across a river" | odds |
| Entrenchment adds to defence and every hit takes one level | sandbags under the strength plate | marker |
| Every hit this turn is −2 defence for later attacks (`hits`, not from artillery, forts or ships) | a red "−2" tag after the plate | marker |
| A weak or badly hit defender retreats, or surrenders with no free hex behind it (gr:791) | "will retreat" or "no room: surrenders" from the estimate | odds |
| Support fire losses can stop an attack before it starts (ui.ts:580) | "attack may be stopped" when the support losses reach the retreat line | odds |

### Seeing

| Rule | Show | Where |
| --- | --- | --- |
| Each unit sees its spot range; the hexes stop being seen when it moves away | fog: a flat wash on hexes the side doesn't see | map |
| A unit that fires is revealed until the round ends (`tempSpotted`) | its plate with a dotted outline: you know it's there, not what's around it | marker |

### Supplying

| Rule | Show | Where |
| --- | --- | --- |
| Resupply and reinforcement are full in a city with no enemy next to it, /1.3 outside a city, /1.5 next to 1–2 enemies, /3 next to 3 or more (gr:923, gr:995) | the real amount and cost on the button: "+4 strength · 96" | context menu |
| Reinforcement buys only what the prestige covers (map.ts:293) | the cost of what will actually be bought | context menu |
| Units in a city with no adjacent enemy, and air and naval units, are resupplied at the start of the round if they were idle | the turn report | combat log |

### Winning

| Rule | Show | Where |
| --- | --- | --- |
| Victory hexes win the scenario and give +150; other flags give +50 (`captureHex` map.ts:1593) | objective plaques with a star and +150, smaller town plaques with +50 | map |
| A victory hex without a flag has no mark today unless `showHiddenVictoryHexes` is on | always show its plaque | map |
| A victory hex you take goes on the enemy's list to retake (`updateVictorySides`) | your captured objectives marked as contested | map |
| Fewer turns give a better outcome | "4 objectives left · 10 turns to brilliant" | status bar |

Not shown on purpose: the atmospheric weather (fair, overcast, rain, snow) changes nothing in the code, only the ground condition does, through the move area. Leader abilities whose description the code doesn't implement are left out of the unit card until they work.
