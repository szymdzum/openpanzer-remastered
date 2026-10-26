**In the port (#441):** where the card and the unit info at the bottom meet (below about 1656px wide, 1366×768 among them), the card stops above the dock and its sheet scrolls. Its extras went on the owner's call (2026-10-26): the notes in words, the stats' explanations, the leader's share under the figures and the XP to the next bar. The card shows what the old unit info window showed, laid out as below; the lines on those extras describe the design, not the game.

The full unit sheet: everything about one unit, written so a new player can read it without the manual.

Opens from the unit info panel, a long press on a unit, the unit list and the equipment window. On desktop it sits beside the map as a panel; on tablet it is the bottom sheet (`TabletUnitInfo`).

- **Header:** the unit's own PG2 sprite (facing 3) at 2x, name, formation and country, and tags for what the rules care about: class, hard or soft target, movement type, core or auxiliary.
- **Experience:** bars 1–5 in `accent`, with the XP to the next bar in words.
- **Condition:** strength, fuel, ammo and entrenchment as `.pm-meter`, each with a note in plain words (`.uc-note`: "enough for 3 moves", "1 attack left"). Low and critical take the meter's state colour; the words carry the meaning.
- **Attack and defence:** every stat as `.uc-stat`: a bar on a 0–15 scale, the value, and one line on what it is for ("tanks, armoured cars", "who fires first"). A leader bonus is drawn as an `accent` segment after the base and shown as `+N` next to the value.
- **Move, range, spotting, value:** four figures in `.uc-four`; a bonus is explained under the figure ("5 + 1 leader").
- **Leader:** each ability with its name and description, verbatim from `Leaders.description` in `leaders.ts`.
- **Footer:** the next upgrade and what it changes, with its prestige cost.

The consumer provides the unit's equipment entry, its current state (strength, fuel, ammo, entrenchment, experience) and leader abilities. Fuel notes divide the fuel left by the unit's movement; ammo notes count one attack per ammo point.
