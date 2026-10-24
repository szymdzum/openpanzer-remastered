The same hexes (Ciechanow, turn 3: a Ju-87B-1 over Infanterie, an Me-109E-3 next to a PZL.23B over 39 Kawaleria) in both layers, at twice the map scale. It is the reference for `drawHexUnit` order and opacity:

| | Ground layer | Air layer |
| --- | --- | --- |
| Ground unit | on top, marker | underneath, 45%, no marker |
| Aircraft | underneath, 45%, no marker | on top, lifted with a shadow, dashed air ring, marker |
| A click selects | the ground unit | the aircraft |
| An attack hits | the ground unit | the aircraft |

An aircraft alone on a hex is still dimmed in the ground layer: you can see where the air units are without switching, but the layer tells you which ones you are dealing with.
