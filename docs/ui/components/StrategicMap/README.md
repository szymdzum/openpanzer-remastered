The strategic map (`uiToggleMapZoom`): the whole map scaled to fit the window. Today every spotted unit becomes its nation's flag, units that have moved are drawn at 60%, and each victory hex gets a large flag. A click anywhere zooms back in, centred on that hex.

The design fits the map below the status bar instead of under it, so no objective hides behind it, and draws the same things so they read at this size:

- **Units** become side chips: `axis` squares with the Balkenkreuz for your side, `allied` lozenges with the nation's flag for the enemy. These are the same shapes as the strength plates on the normal map. A unit that has moved is at 55%, as today.
- Only spotted enemy units are drawn, as today (`hex.isSpotted`).
- **Objectives** (victory hexes) get large plaques with the star, the name, and the holder's bar and flag. Other towns are left out, as today.
- **Layer:** with the air layer on, the chips are the aircraft; otherwise the ground units (`uiSettings.airMode`, as today).
- **Key:** a panel at the bottom left explains the four marks, gives the counts, and says how to leave: a click on the map, or the Strategic map button again. It replaces nothing today; it takes the place of unit info, which is hidden at this zoom.
- **Rail:** the Strategic map button stays lit while the map is open (`toggleButton($("zoom"))`).

No hex grid, move area or cursor at this zoom, as today (`drawCursor` is skipped).
