The full unit sheet on tablet. It is a bottom sheet that rises over the map from Stats, or from a long press on a unit. It holds the open card of `UnitInfo` laid out for the sheet (`.uc-open.sheet`): identity, experience and leader across the top, then the condition with This turn beside what the unit hits and holds; and the unit's actions as 56px labelled buttons. A Next unit button moves through units that can still act. The card has no Resupply stamp here: it has moved, so it can't resupply (the Supply button says so).

**Unit card:** the proposal in `UnitInfo` (2026-10-29), not built: the sheet holds its open card. Everything else on this card is Ready.

- Drag the handle down or tap the scrim to close.
- The actions here duplicate the context menu, so a player who never finds the map menu can still act on the unit.
- **Experience and leaders** as the game has them, and as `UnitInfo` shows the same unit: one star per 100 XP (120 XP is one), and the leaders by name with their effect from `Leaders.description`, the unit's own and its class leader. A unit without one says "No leader yet". A unit may win a leader each time it gains an experience level, after a fight: the higher the level, the better the chance (`leaderRoll`, `src/core/fight.ts`), and at the experience cap it always gets one. The sheet doesn't promise a leader at a given number of stars.
