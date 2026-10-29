The in-game HUD at 1920×1080 with every persistent element and a unit selected. The map is the hero: the persistent chrome (status bar, rail, unit info, End turn) covers about 13% of the screen, and the corners and the middle band stay map.

- The status bar is centered at the top. The rail is centered vertically on the right edge. Unit info is centered at the bottom, and End turn sits bottom right.
- The context menu and odds preview are anchored to hexes and placed by the map code. The context menu sits above the selected hex. The odds preview sits beside the targeted hex, flipping to the left near the right edge.
- Panel padding grows from `space-3` to `space-4` at this size. Panel widths stay the same, so the map gains the space.
- **The map and the odds** are the newest designs: units carry `MapOverlays`' markers (the move arrow and the crosshair before the strength plate, only what the unit can still do: this Pz IIA has moved, so the crosshair alone), the target its dashed `hex-target` outline, and the odds preview is `CombatOdds` (v2), with the reasons and the advice. The unit info is the same unit as `UnitInfo`: 120 XP is one star. It has moved and can still fire, so its line says Moved and Can fire, and its entrenchment is 0.

**Unit card:** the proposal in `UnitInfo` (2026-10-29), not built: the card's hidden line, docked, since the open card comes only on More. Everything else on this card is Ready.
