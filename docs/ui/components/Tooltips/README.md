**In the port (#441):** the hex tooltip is left out until after the switch (D8): nothing opens over the map when the pointer rests or a finger holds. What the old UI said of the hex under the pointer goes to the status bar's line, as its `#locmsg` did (`updateStatusBarLocation`, src/ui.ts:1350): the unit there that the side sees, the place's name, the current player's air or naval transports on an airfield or a port, the terrain with "/Road" and "(row,col)". The pins, the rail's tooltip and the AI indicator stay. The hex tooltip below is the design for later.

Three kinds of tooltip, plus the AI indicator.

- **Hex tooltip** (`#gameToolTip`): a panel with a pointer, shown on hover or long-press over a hex. It holds the place name and its flag, the terrain, whether it is a victory hex and who holds it, and what the terrain does, each value from the engine:
  - **Entrenchment:** the level a unit gets at once on the hex, `terrainEntrenchment[terrain]` (`src/legacy/prototypes.ts`; a city is 3). The unit digs deeper from there as turns pass (`entrench`, `src/core/turn.ts`).
  - **Defence:** a terrain step of the combat, only where there is one: +4 for a defender in a city (`src/core/combat.ts`), the river penalty in a river or stream without a road.
  - **Move cost:** for the selected unit, from the movement table of its movement type and the ground condition (`movTableDry` and the others), with a road's cost where there is one. "Stops" for 254, nothing for 255. Hidden with no unit selected.
  - **Resupply:** full in a city, divided by 1.3 elsewhere and again by the enemies next to it (`resupplyValue`, `src/core/supply.ts`); aircraft at their country's airfield, ships in a port.
  - **Deploys:** only on a deployment hex of a side (the scenario's `deploy`, or its `supply`, which deploys too: `loadHex` in `src/core/newgame.ts`), "German units" or "Polish units". There is no supply state of a hex: the game has no supply network yet.

  On touch it has an OK button (`#gameToolTipOk`). The tutorial uses the same panel for its messages.
- **Unit pins** (`.pm-pin`): small labels on the map above a unit of the side playing, for Low fuel and No ammo (`unitLowFuel`, `unitLowAmmo`, `src/core/units.ts`: the threshold is the UI's; the old UI pins only an empty tank or no ammo). Each has an icon and a word in `low` or `critical`. They replace `.smallToolTip`. These two are the only supply states a unit has.
- **Button tooltips** (`#uiToolTip`): the label and keyboard shortcut for rail buttons on desktop. On touch the rail shows labels instead.
- **AI indicator**: replaces "AI is thinking" with the nation, a blinking side-color dot, and progress counted in units. It stops blinking under `prefers-reduced-motion`.
