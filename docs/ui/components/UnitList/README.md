The player's units as a horizontal strip under the status bar, opened from the rail. Each card shows the sprite, strength badge, name and formation, plus warning icons for low fuel or ammo.

- The selected unit has a 2px `ink` border. Units that have already moved are dimmed and marked "moved".
- The filters (All, Can move, Low supply) are a segmented control. Tapping a card selects that unit and centers the map on it.
- It scrolls horizontally with momentum on touch. On tablet portrait it becomes a 3-row grid (see `TabletHudPortrait`).
- Keep `#container-unitlist`, `#hscroll-unitlist` and `#unitlist`.
