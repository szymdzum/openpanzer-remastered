The HUD on an iPad in portrait. The vertical rail would cover too much of the narrow map, so it becomes a command bar along the bottom.

- **Command bar:** the game menu's buttons with labels (Inspect, Buy, Grid, Air, Map, Options) and End turn at the end. There is no Menu fold here: all six fit.
- **Status bar:** it spans the width. Weather and ground become icons only, and tapping them shows the words. The unit list button (`#statusBarButton`) and the turn report button sit at its right end.
- **Unit card:** the hidden line of `UnitInfo` directly above the command bar, without its sprite to stay one line at 820px (`.uc-strip.narrow`); More opens the full sheet.

**Unit card:** the proposal in `UnitInfo` (2026-10-29), not built: the card's hidden line, docked, since the open card comes only on More. Everything else on this card is Ready.
- The unit list opens as a 3-row grid over the lower half of the map.
- The map, the markers and the odds card are those of `HudDesktop`: `MapOverlays` and `CombatOdds` (v2), with the touch inputs on its last line.
