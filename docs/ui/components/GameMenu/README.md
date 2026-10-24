The game menu (`#menu`) has the buttons the game builds in `UIBuilder.buildMainMenu`, and nothing else:

| Button | Id | Shortcut | Does |
| --- | --- | --- | --- |
| Inspect unit | `inspectunit` | I | shows or hides unit info |
| Buy and upgrade | `buy` | B | opens the unit list with the equipment window |
| Hex grid | `hex` | H | toggles the grid (pressed while on) |
| Air layer | `air` | A | toggles the air layer (pressed while on); selecting an aircraft turns it on |
| Strategic map | `zoom` | Z | toggles the fit-to-window map (pressed while on) |
| Options | `options` | Esc with no unit selected | opens the start menu: save and load, settings, new game |
| Menu | `mainmenu` | | folds and unfolds the five above (`#slidemenu`) |

- **Layout:** Inspect unit sits on its own at the top, the slide group in the middle, and the Menu toggle at the bottom. On desktop the slide group is open by default. Folded, the rail is two buttons.
- **End turn** (`endturn`) is a button of the same menu in the game. Here it is the brass button in the bottom-right corner, the only primary action on the HUD.
- **The unit list** without the equipment window opens from `#statusBarButton` in the status bar, as today.
- **Map scale** stays in Settings (Game map scale), as today. There are no zoom buttons on the rail.
- Toggles carry `aria-pressed` and use the `is-on` style: `panel-sunken`, a 3px `accent` edge and an `accent-ink` icon. Each button has an `aria-label` and a tooltip with its shortcut. On touch the rail shows labels (`.pm-rail.labels`).
