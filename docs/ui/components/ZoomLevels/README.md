What the map shows at each scale. The game has two scale controls today: the Game map scale slider in Settings (1× to 3×, `uiScaleMap`, which sets CSS `zoom` on the map canvases) and the strategic map (`uiToggleMapZoom`, fit to window).

**The rule:** the map and the unit sprites scale; everything the interface draws on top keeps its screen size. That covers strength markers, plaques, tags, the move area outline, zone bars, the path, the selection outline and the odds card. Today the markers are painted into the same canvas as the sprites, so at 2× the strength plate doubles, blurs and covers the unit. Drawing the overlay layer at `1 / zoomLevel` (or in a separate unscaled canvas) keeps it crisp. With HD on, the terrain and sprites use the @2x art at 2× and above.

| Element | Strategic | 1× | 2× to 3× |
| --- | --- | --- | --- |
| Terrain, sprites | scaled to fit | 1:1 | scaled, @2x art with HD on |
| Strength markers | side chips, no number | full marker | full marker at 1× size |
| Plaques | objectives only, large | all, small | all, at 1× size |
| Hex grid (setting) | off | 1px | 1px |
| Move area, path, zones, odds | none | as designed | 1× line widths and tag sizes |

The map scale stays in Settings, as today; the rail has no zoom buttons (see `GameMenu`).
