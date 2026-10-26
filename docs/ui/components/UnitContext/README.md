The actions for the selected unit (`#unit-context`), as the old UI's menu (`updateUnitContextWindow`, src/ui.ts:742): the same buttons, by the same rules, in the same place (#437, the 1:1 port rule of PLAN.md).

**Where:** docked at the bottom in the middle, just above the unit info (UnitInfo), as the old `#unit-context` stood (game/css/ui.css). It never covers the map around the selected unit, so every hex it can move to or attack stays clickable (#429).

**What:** one small icon button for each action the unit can take now, in the old menu's order. An action it can't take isn't there. No button, no menu.

| Action | Shown when (the old menu's rule) |
| --- | --- |
| Mount or Unmount | `canMount`: a ground unit with a transport, before it moves |
| Embark or Disembark | `canEmbark` or `canDisembark` |
| Supply | `canResupply`: it hasn't moved, fired or resupplied, misses ammo or fuel, and can be supplied where it stands |
| Reinforce | the prestige for one point at the unit's price (`calculateUnitCostPerStrength`), and `canReinforce` |
| Overstrength | the same, with `canReinforce(…, true)`: full strength and an experience bar |
| Undo move | its move is the last one the turn can take back |

**Tooltip and name:** what the action is, then what it gives, computed with the functions the action runs. It is the button's title on hover and its accessible name; the key that plays it (M, E, S, R, O, U) is its `aria-keyshortcuts`.

- Supply: "Supply: +5 ammo, +14 fuel" (`getResupplyValue`; a mounted unit's transport's share added in).
- Reinforce, Overstrength: "Reinforce: +2 for 56 prestige", or "+1 of 2 for 28 prestige" when the prestige pays for part of it (`getReinforceValue`, `reinforceUnit`; overstrength at ×1.2, `OVERSTRENGTH_PENALTY`).
- Mount: "Mount: on Opel Blitz". Embark: "Embark: naval transport".
- Undo move: "Undo move: back to 10,18".

**Size:** 32 px buttons in one row; under `(pointer: coarse)` the full hit target (`--hit-target`).

Left out, as the old menu had none of them (#437): a second line under each button, disabled actions with their reasons (#316), and the sum behind Supply and Reinforce in a tooltip. They may come back after the switch (D8), one at a time.
