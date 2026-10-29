Shows a unit's state: strength, fuel, ammo and entrenchment as meters, experience as stars, and strength on the map as a badge.

**The unit card's gauges** (`UnitInfo`, a proposal): each gauge has its value and, beside it, what it means; its rules and the core function behind each phrase are in the `UnitInfo` README.

- **Segments** (`.uc-segs`) where the unit counts whole things: ten for strength (one per point, those past ten in `accent-ink` with "+2 over"), one per round of ammo, one per entrenchment level up to the hex's limit (the terrain's own levels lighter). A bar (`.uc-bar`) for fuel, with the full moves it is enough for; aircraft show the fuel alone.
- **In the strip** (`.uc-g`) the meaning goes into the label: "Fuel 3 full moves", "Ammo 1 shot left".
- **This turn** (`.uc-chip`): what the unit can still do in `ok`, what it can't dashed and muted, riding plain. In the strip they are compact (`.uc-turn.mini`): the icon and a number, the words in their tooltip and for screen readers.

- A meter has an icon, a label, a typed value `18/50` and a 5px track. Below 50% it is `low` and adds the word LOW. Below 25% it is `critical` and adds the word CRITICAL. The color is never the only signal.
- Stars use `accent-ink` when earned and `line` when not, five in all. They map to the game's experience levels at 100 XP per star.
- The strength badge uses the side fill (`axis`, `allied` or `neutral-side`) with `on-side` text in Courier Prime. It is the HTML form of the canvas counter.
- A tag (`.pm-tag`) names a state in words for lists and tooltips.
