**In the port (#441):** the one unit card. The side card that opened from Unit card (`UnitCard`) is gone because it repeated this panel. The card says what the old unit info window said and no more (the owner's call, 2026-10-26): no notes in words, no explanations of the stats, no leader's share under a figure, no XP to the next star.

Everything about the selected unit, docked at the bottom in the middle, in three sizes. The card opens as one row. More unfolds it: a band grows above the row, over the map, so the row stays where it was. Hide leaves only a strip.

**One row, in four columns:**

- **Identity:** the unit's own PG2 sprite (frame 3, at its own 80×50), nation mark, name, then the ordinal, class and country ("7th Tank · Germany", as the old window wrote it). Tags for what the rules care about: hard or soft target, movement type, core or auxiliary (core in `accent-ink`). The class is in the line above, so it has no tag. Then the experience stars, the leader, and Unit / Transport / Carrier when the unit has more than one view.
- **Condition:** strength, fuel, ammo and entrenchment as `.pm-meter`. Low and critical take the meter's state colour and its word.
- **Sheet:** the twelve short stats as `.pm-stats`: soft, hard, air and naval attack, ground, air, close and ranged defence, initiative, range, spotting and move. Range, spotting and move count the leaders in, as the rules do.
- **Buttons:** More, Hide, and Next unit (shown only on the side's own units).

**Unfolded:** the short sheet gives way to a band above the row, in four columns, so nothing is said twice.

- **Attack and defence:** every stat as `.ui-stat`, with a bar on a 0–15 scale and the value.
- **Move, range, spotting, value:** four figures in `.ui-four`. The value is in prestige.
- **Experience and leaders:** the XP, then each leader with its name and description, verbatim from `Leaders.description`.

Less or Esc folds it back to its row. On a short screen the band scrolls (it is held to half the screen's height).

**The strip:** one line with the name, then strength, fuel and ammo as icon and value (low and critical in their colour), and Show to bring the row back. It is for when the card would hide the map's last rows and their units (#453).

The size stays as it is when another unit is selected.

- **Experience:** one star per 100 XP, five in all, as the game counts its bars (`experience / 100`): this Pz IIA has 120 XP, one star.
- **Leader:** a unit with a leader shows its name in `accent-ink` (`.leader.has`); one without says "No leader yet". A unit wins a leader of its class's list, never the class leader itself, and with it the class leader too (`hasLeader`, `src/core/units.ts`; `Leaders.getUnitLeaderDescriptions`). Hover or tap shows both, as `Leaders.description` words them, in a tooltip above the card (`.pm-tip.above`) that never covers the unit's name.
- **Views:** a gun on its tractor opens on the tractor, as the old window did. Unit shows the gun itself, and Carrier shows the ship or plane that carries it, full and new.
- **Below 1280px wide** (`HudLaptop`): the row keeps identity, condition and buttons, and the sheet waits in the unfolded band, which goes two by two.
- Keep `#unit-info`, `#statsRowTop`, `#uSmallFlag`, `#uName`, `#statsRowContainer` and `#statsRow`; the band is `#unit-card`. Text glyphs and the `m04` pixel fonts are replaced by the icon set and Courier Prime.

The view model is `src/view/unitcard.ts` (`unitCardOf`), and the card is `src/view/infopanel.tsx` with `src/view/unitinfo.css`. The card reads the unit by its id, never a copy (#404).
