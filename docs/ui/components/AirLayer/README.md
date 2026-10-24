The air layer (`uiSettings.airMode`), switched on from the rail or automatically when an aircraft is selected. Every hex has a ground slot and an air slot. The layer decides which unit is drawn on top with its strength, which one a click selects, and which one an attack hits (`hex.getAttackableUnit(…, airMode)`). Today the only sign of it is a blue hex fill under aircraft (`hexstyle.airunit`), and both units on a hex overlap at full strength.

**In the air layer:**

- Aircraft are drawn on top, lifted 4px with a drop shadow, inside a dashed light ring that replaces the blue fill. They carry their markers.
- Ground units stay in place at 45% and lose their markers. You can still see what is under the aircraft, but it doesn't compete with them.
- The target is the aircraft. Here the Me-109E-3 attacks the PZL.23B, not the 39 Kawaleria under it. The status line names the target when the pointer is over the hex.

**In the ground layer** it is the other way round: ground units on top with markers, aircraft underneath at 45% with no marker (see `MapLayers`).

The Air layer button on the rail (`#air`, shortcut A) is pressed while the layer is on. The status line starts with "Air layer" while it is on. The canvas does the dimming (`globalAlpha`); nothing new is drawn in the DOM.
