The same hexes (Ciechanow, turn 3: a Ju-87B-1 over Infanterie, an Me-109E-3 next to a PZL.23B over 39 Kawaleria) in both layers, at twice the map scale. It is the reference for `drawHexUnit` order and opacity:

| | Ground layer | Air layer |
| --- | --- | --- |
| Ground unit | on top, marker | underneath at 75% (`unit-under-alpha`) with a strength chip, on a shared hex; whole when alone |
| Aircraft | whole with its marker when alone on its hex (not lifted); over a ground unit: underneath at 75% with a strength chip | on top, lifted with a shadow, dashed air ring, marker |
| A click selects | the ground unit | the aircraft |
| An attack hits | the ground unit | the aircraft |

A unit alone on its hex is always drawn whole, with its marker and full opacity, whatever the layer: its strength and state never wait for a layer switch. Only on a hex with both an aircraft and a ground unit does the layer matter: the one of the layer shown is on top with its marker, the other is drawn first at 75% with a small strength chip (its side's colour, up and right of the hex centre, at screen size), so both can be read. The layer still tells you which of the two a click selects and an attack hits.
