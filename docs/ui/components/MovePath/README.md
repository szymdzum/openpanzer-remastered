The move path preview from #32. With a unit selected, hovering a hex in its move area draws the route `moveUnit` will take: `getShortestPath` over the same move range, so the preview and the move can't disagree. On touch, the first tap on a hex shows the path, and a second tap on the same hex moves, as with attacks.

**Drawn on the canvas** (hex layer, at screen-size line widths):

- The route is a dotted cream line over a dark under-stroke, with a dot on each hex passed.
- The end is a brass ring with the moves left (`moveLeft − pathCell.dist`). It is a light ring when the unit can move again from there (recon, which splits its moves).
- An end in an enemy zone is a red stop square instead of the ring.
- Past the edge of what the side sees, the route turns dashed over the hatched area.

**The tag under the ring** (DOM, placed like `#gameToolTip` and clamped to the screen). The first line is what happens, the second the cost:

| Case | First line | Second line |
| --- | --- | --- |
| plain move | 2 moves left | fuel 20 → 17 of 47 (units that use fuel) |
| ends in an enemy zone (cost 254) | stops: enemy zone | 3 moves unused |
| ends on a flag (`canCapture`) | takes Wieczfnia | +50 prestige |
| ends on a victory hex | takes Mlawa · objective | +150 prestige · 2 left to win |
| crosses unseen hexes | 6 moves left | unseen: ambush possible |
| mounted unit | can't fire after this move | truck fuel 55 → 52 |
| recon | 8 moves left | can move again |
| fuel under a third after the move | 1 move left | fuel 9 → 5 of 47 · low, in `low` |

A hex outside the area draws nothing; the area's edge is the answer. The path is recomputed only when the hovered hex changes, which `drawCursor` already tracks.
