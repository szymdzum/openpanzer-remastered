The turn report. It opens at the start of each turn and from the button in the status bar. At the top are the objectives left, the turns left to a brilliant victory, the score, and the prestige with next turn's income. Below come the game's five reports as sections: unit combat, resupply, reinforcements, unit leaders and objectives.

- Each entry is a row with a sprite, a sentence with the numbers typed in bold, and the result on the right: a loss in `critical`, a prestige cost or gain in `accent-ink`.
- The resupply report lists only resupplies that happened: the automatic one at the start of a turn, for an idle unit in a city with no enemy next to it, and for idle aircraft at an airfield and ships in a port (`CombatLog.addResupply`, `src/combatlog.ts`, which keeps the unit's ammo and fuel after it, and whether it is core or auxiliary). A unit that couldn't resupply isn't logged, so the report never says why.
- A leader entry names the leader and its effect as `Leaders.description` has it (`leaders.ts`).
- Tapping an entry centers the map on its hex, as `logLine` does today.
- "All quiet on this front" fills an empty section.
- Keep `#combatLog` and `#combatLogButton`.
