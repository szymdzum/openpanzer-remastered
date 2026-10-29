The HUD on an iPad in landscape. It is fully playable by touch, with no hover anywhere.

- The rail buttons are 56×52 with 24px icons, and End turn is 52px tall. Context buttons stay 62×54.
- Unit info is the hidden line of `UnitInfo` at the bottom left, its buttons full hit targets (`.uc-strip.touch`). More opens the full sheet as a bottom sheet (see `TabletUnitInfo`).

**Unit card:** the proposal in `UnitInfo` (2026-10-29), not built: the card's hidden line, docked, since the open card comes only on More. Everything else on this card is Ready.
- **Odds.** Tapping an enemy once shows the odds preview, and tapping it again attacks. Tapping anywhere else dismisses the preview.
- Long-pressing a hex opens the hex tooltip.
- The map, the markers and the odds card are those of `HudDesktop`: `MapOverlays` and `CombatOdds` (v2), whose last line says the touch inputs: tap again to attack, tap elsewhere to cancel.
