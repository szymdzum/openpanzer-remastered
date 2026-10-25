The air layer (`uiSettings.airMode`), switched on from the rail or automatically when an aircraft is selected. Every hex has a ground slot and an air slot. The layer decides which unit is drawn on top with its strength, which one a click selects, and which one an attack hits (`hex.getAttackableUnit(…, airMode)`). Today the only sign of it is a blue hex fill under aircraft (`hexstyle.airunit`), and both units on a hex overlap at full strength. Aircraft also have no hatched hexes on their move area (see `MapOverlays`).

**In the air layer:**

- Aircraft are drawn on top, lifted 4px with a drop shadow, inside a dashed light ring that replaces the blue fill. They carry their markers.
- A ground unit alone on its hex keeps its marker and full opacity. One under an aircraft stays in place at 75% with a strength chip instead of its marker: you can read what is under the aircraft, but it doesn't compete with it.
- The target is the aircraft. Here the Me-109E-3 attacks the PZL.23B, not the 39 Kawaleria under it. The status line names the target when the pointer is over the hex.

**In the ground layer** it is the other way round: ground units on top with markers, an aircraft alone on a hex whole with its marker, one over a ground unit underneath at 75% with a chip (see `MapLayers`).

The Air layer button on the rail (`#air`, shortcut A) is pressed while the layer is on. The status line starts with "Air layer" while it is on. The canvas does the dimming (`globalAlpha`, `unit-under-alpha`); nothing new is drawn in the DOM.
