Three kinds of tooltip, plus the AI indicator.

- **Hex tooltip** (`#gameToolTip`): a panel with a pointer, shown on hover or long-press over a hex. It holds the place name, terrain, whether it is a victory hex and who holds it, and terrain effects in type. On touch it has an OK button (`#gameToolTipOk`).
- **Unit pins** (`.pm-pin`): small labels on the map above a unit for Low fuel, No ammo or Out of supply. Each has an icon and a word in `low` or `critical`. They replace `.smallToolTip`.
- **Button tooltips** (`#uiToolTip`): the label and keyboard shortcut for rail buttons on desktop. On touch the rail shows labels instead.
- **AI indicator**: replaces "AI is thinking" with the nation, a blinking side-color dot, and progress counted in units. It stops blinking under `prefers-reduced-motion`.
