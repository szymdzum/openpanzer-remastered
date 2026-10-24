Shows a unit's state: strength, fuel, ammo and entrenchment as meters, experience as stars, and strength on the map as a badge.

- A meter has an icon, a label, a typed value `18/50` and a 5px track. Below 50% it is `low` and adds the word LOW. Below 25% it is `critical` and adds the word CRITICAL. The color is never the only signal.
- Stars use `accent-ink` when earned and `line` when not, five in all. They map to the game's experience levels at 100 XP per star.
- The strength badge uses the side fill (`axis`, `allied` or `neutral-side`) with `on-side` text in Courier Prime. It is the HTML form of the canvas counter.
- A tag (`.pm-tag`) names a state in words for lists and tooltips.
