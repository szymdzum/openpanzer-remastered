The first thing a player sees on their turn, after the AI indicator goes away (`uiEndTurnInfo`). Today the short combat log hangs under the status bar with a blue title, a paragraph of numbers and "Show Turn Summary", and the first ground unit is selected and centred (`uiMapRenderAndSelectUnit`).

The design keeps that order:

1. The map centres on the first ground unit of the side, selected, with its move area (`MapOverlays`).
2. The short turn report (`TurnBanner`) hangs under the status bar, clear of the centre, so the selected unit and its area are never under it.
3. The unit markers already show who is low on fuel or ammo, so the `.smallToolTip` labels that `addSmallToolTips` puts over every such unit at turn start are dropped. The markers carry it all turn, not just at the start.

The report closes on its × or Esc, or with the first click on the map. The `#combatLogButton` in the status bar opens it again, and Turn report opens the full window (`CombatLog`).
