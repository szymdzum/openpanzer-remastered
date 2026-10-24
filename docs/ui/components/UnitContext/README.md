The actions for the selected unit (`#unit-context`), in one row above its hex. These are the six the game has (`updateUnitContextWindow`): Supply, Reinforce, Overstrength, Mount or Unmount, Embark or Disembark, and Undo move. Upgrade and disband are in the equipment window, and there is no entrench action, so none of them is here.

**Every button says what it will do,** in a second line computed with the same functions the action uses:

- **Supply:** `getResupplyValue` gives "+5 ammo · +14 fuel". For a mounted unit, the transport's fuel is added in.
- **Reinforce:** `getReinforceValue` gives the points, capped by what the prestige buys (`reinforceUnit`). The cost is `calculateUnitCostPerStrength` times the points: "+2 · 56". When the prestige covers only part, it says "+1 of 2 · 28" in `low`.
- **Overstrength:** the same, up to 10 plus one per experience bar, at ×1.2 the cost (`OVERSTRENGTH_PENALTY`).
- **Mount:** names the transport. **Embark:** names the kind, naval or air.
- **Undo move:** names the hex the unit goes back to.

**Tooltip on hover or long-press** (`.pm-ctxtip`): the arithmetic behind the number. Missing points, each divisor that applied, what it gets, the cost, what it also refills, and the best case: "In a city with no enemy next to it: +4 for 112". Last comes the line every player needs and the game never says: **either action ends the unit's turn** (`Unit.resupply` sets `hasMoved` and `hasFired`).

**An action that isn't possible stays, disabled, with the reason as its second line.** Today it disappears. Supply, Reinforce and Undo are always there; Overstrength, Mount and Embark only appear where they could apply.

| Reason | When (code) |
| --- | --- |
| moved | `hasMoved`, `hasFired`, or `hasOverstrength` (set by moving or firing) |
| full | nothing missing |
| needs 28 | prestige below one point (today the button is hidden) |
| no airfield | aircraft without an airfield next to it |
| in port | ship in a port (#19) |
| revealed units / ambushed / after an attack | the undo slot was cleared (`lastMove`) |

Today resupply also adds 1 ammo and 1 fuel when nothing is missing (#95). The menu shows only what is missing, so it doesn't promise that extra point.

Keep `#unit-context`. Position it from the hex centre, clamped to the screen with `space-3` from the edges. `SupplyRules` has the divisors in one table.
