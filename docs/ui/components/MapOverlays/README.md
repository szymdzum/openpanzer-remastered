The map layer: everything the renderer draws over the painted map and under the unit sprites, so a player can read the rules of the next move from the map itself.

All of it is canvas (`src/render.ts`), not HTML. Its colours are the `hex-*` tokens in `tokens.json`, the one set for the map: the same in Paper and Blackout, because they sit on the map's own olive and khaki, not on a panel. The canvas draws with these values, and the HTML cards that stage the map use the same custom properties. Every line has a dark under-stroke (`hex-shadow` at 55%) so it reads on grass, fields, snow and water alike.

**Draw order**, bottom to top: fog, the move area tint, the area outline, the enemy zone bars, attack targets, support fire lines, the selection, the move path, the plaques (#438), then the sprites and their markers, then tags.

| Overlay | How it looks | Where the engine has it |
| --- | --- | --- |
| Selected | 3px `hex-select` over a 5.5px `hex-shadow` outline | `map.currentUnit` |
| Move area | `hex-move` at 16% on each hex, one 2px `hex-move` outline round the whole area (edges whose neighbour is outside it) | `GameRules.getMoveRange`: `canMove` cells, `hex.isMoveSel` |
| Can move, can't see | for a ground unit, the same hexes hatched at 45° instead of tinted (`hex-hatch`, 0.8px lines 6px apart, light so the terrain still reads): a hidden enemy there is an ambush. An aircraft has no hatching: in the core only an enemy aircraft stops it (`canPassInto`), the side can't know where one hides, and an aircraft's range would hatch most of the map; its unseen hexes keep the fog wash | a move cell where `!hex.isSpotted(side)`, ground units only |
| Enemy zone | a 3px `hex-target` bar on the edge facing the enemy, on area hexes next to a spotted enemy: you can enter, the move ends there | cost 254 from the enemy's zone of control on a hex the side spots. A hidden enemy's zone ends the move too (#282, the original's rule), but has no bar: there is no enemy to face, the path's tag still says the move stops |
| Move path | a dotted `hex-move` route from hex centre to hex centre, a dot per step. It ends in a ring with "N left" in the moves left, or in a `hex-target` stop square with "stops: enemy zone" when the last hex is in a zone | the path the move would take; moves left from `getMovesLeft` and the cell's `cout` |
| Can attack | dashed 2.4px `hex-target` with a 12% `hex-target` fill. Hover or the first tap opens the odds preview | `hex.isAttackSel` |
| Support fire | a dashed `hex-target` arc with an arrowhead from each enemy gun to the attacker's hex, and "support fire" at the gun. The gun's hex gets a thin dotted outline | `GameRules.getSupportFireUnits(attacker, defender)`, spotted units only, as the estimate counts them |
| Fog of war | a flat, light `hex-fog` wash (22%) on every hex the local side doesn't see; the unseen terrain stays readable, and the move tint, the outline, the selection and the plaques are drawn on top of it | `!hex.isSpotted(game.spotSide)`. Today nothing marks it, `uiSettings.markFOW` is never read |
| Entrenched | one sandbag (5×3, khaki `#c8b27a`) per level, under the strength plate | `unit.entrenchment` |
| Hit this turn | a red tag after the plate with the defence lost, "−2" per hit | `unit.hits`; each hit is −2 defence for later attacks this turn (not artillery, forts or ships) |
| Objective | a paper plaque with a brass star, the name and "+150"; the bottom bar in the owner's side colour. At the foot of its hex, where the old map drew the hex's flag, beneath the units, at 70% so the terrain shows through it and the units read first (#438) | `hex.victorySide != -1`, owner from `hex.owner` |
| Town | a smaller, greyer plaque without a star, "+50"; placed and faded as an objective's | a flag hex that isn't a victory hex |

Rules for the move area and path come straight from the engine, not from distance: roads make it longer, rivers end it, mud and frozen ground change it, friends can be passed but not stopped on. Never draw a path the engine wouldn't take.

The consumer provides, per render: the selected unit, its move cells with their costs, the attack cells, the spotted set of the local side, the zone of each hex, the support fire units for the hovered target, and per hex the flag, owner and victory side.
