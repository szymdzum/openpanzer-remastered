The two containers that everything sits in.

- `.pm-panel` is a HUD panel that stays on screen over the map. It has an opaque `panel` fill, a 1px `line-strong` edge, an inset `line` rule 3px in (the double edge of a printed form) and `shadow-panel`.
- `.pm-window` is a modal window: equipment, combat log, dossier, messages and the start-menu windows. It adds a header (`.hd` with a `display` title, an optional stamp and a close button), a body (`.bd`) and a footer (`.ft`) separated by rules. It sits on `.pm-scrim`.
- `.pm-stamp` is the rubber stamp, `critical` and rotated -4°. Use at most one per window, for flavor words such as Requisition, Secret or Brilliant victory, never for information the player needs.
- Never put `backdrop-filter` or transparency on a panel over the canvas.
