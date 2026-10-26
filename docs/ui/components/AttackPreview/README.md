**In the port (#441):** only stage 1's crosshair and its two losses, the numbers the old cursor showed (`calculateCombatResults` with the support fire its side sees, `combatResult` in the core); no glyph. Stage 0's grey badges, stage 2's card and stage 3 are left out until after the switch (D8); a click or a tap on a target attacks at once, as the old UI did. The stages below are the design for then.

The attack preview as four stages, from marking the targets to the full arithmetic, each one adding to the last. The reasoning, the measurements and the rules behind it are in the "Attack preview: a UX study" section.

- **0 · Targets**, on selecting a unit: a dashed red outline and a small crosshair badge on every enemy the unit can attack (`MapOverlays`). An enemy in range it can't attack gets a grey badge with the reason.
- **1 · Glance**, on hover at once: the cursor becomes a brass crosshair with two loss chips at a fixed offset to its lower right. Your loss is on your side colour, theirs on theirs, so the chips say whose is whose. At most one glyph after them, for something certain:

  | Glyph | Fill | Means |
  | --- | --- | --- |
  | crossed circle | `critical` | rugged defense |
  | double chevron | `ok` | overrun: no return fire, +1 move |
  | shield | `ok` | no return fire (ranged attack, or the target can't fire back) |
  | gun | `low` | visible guns will give support fire |

  When nothing is the most likely result, the chip reads `0–1`. It replaces `generateAttackCursor`.
- **2 · Card**, after the pointer rests 400 ms, with Shift held, or on one tap: `CombatOdds`, placed beside the target away from the attacker. It never covers the attacker, the target or a support fire arc.
- **3 · Breakdown**, from "Why?", Alt, or a long press on the card: both directions as tables. For each side: the attack value and every modifier, the defence value and every modifier, kF, the hit chance per strength point, and a bar chart of 2000 rolls of the game's dice with the 8-in-10 range dark. In the tables, red is against the player and green is for them, in both directions.

A setting, Combat preview: Glance / Card / Detailed, chooses which stage opens on hover. The default is Glance on desktop and Card on touch.

The scene is the rugged defense case from `CombatOdds`: Pz IIA next to the 38 Piechota entrenched 4 in a city, with a Polish 75mm in support range and a 7TP as a second target. All numbers are the engine's, and the bars are its dice.
