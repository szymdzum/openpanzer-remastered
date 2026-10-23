# Vehicles and guns

Rigid things with technical drawings: tanks, assault guns, trucks, towed guns. The Panzer IV H
(`art/units/panzer_iv.py`) is the worked example.

## Contents
- The reference
- Measuring a drawing
- The model script
- The shape gate and the camera
- What the old strips do that the real vehicle doesn't

## The reference

1. **A side drawing in scale**, the variant or a close one. Wikimedia Commons first (public domain
   and CC drawings), through its API with a generic user agent (never the user's address):

   ```bash
   curl -s -A "openpanzer-research/0.1" "https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=leFH%2018%20drawing&srnamespace=6&srlimit=30&format=json"
   curl -sL -A "openpanzer-research/0.1" -o ref.png "https://commons.wikimedia.org/wiki/Special:FilePath/<File name>?width=1600"
   ```

   Check the licence (`prop=imageinfo&iiprop=extmetadata`, `LicenseShortName`) and keep public
   domain or CC drawings in `art/units/reference/` with the author in the notes. Books such as
   *Panzer Tracts* have top views and exact plans, but can't go in the repo.
2. **Photographs of the exact variant** for what the drawing lacks (skirts, a longer gun, stowage),
   e.g. Bundesarchiv pictures on Commons and museum vehicles. Look at them: list the features that
   make the variant recognisable at 25-60 px (on the H: the hull and turret skirts, the long gun
   with its muzzle brake, the high front sprocket).
3. **Real dimensions** (length, width, height, wheel sizes) from at least two sources; they
   disagree, so note which one each constant uses.

## Measuring a drawing

```bash
blender -b -P art/units/drawing_profile.py -- ref.png
```

It prints, every 20 px across the drawing, the runs of solid pixels in that column: the outline's
top and bottom, gaps under the hull, the wheels. Scale it with one known length (the Panzer IV:
nose 248 to rear 1833 = 5.89 m, so 269 px a metre) and the ground line (the lowest solid row).
Every constant in the model gets a comment naming what it was measured from; anything inferred
(widths from photos, hidden parts) is marked `# guess`.

## The model script

Copy the helpers from `panzer_iv.py` into a new `art/units/<vehicle>.py` (or import them):
`X(d)` turns "metres back from the nose" into model coordinates; `box`, `side_prism` (a side profile
extruded across), `plan_prism` (a plan outline with sloped sides), `plate` (a thin plate along a
plan segment), `cylinder`, `track_band` (a track loop round the wheels, open at the sides),
`cross_marking`. The model faces +X, Y left, Z up, origin on the ground under the middle; `build(m)`
takes the materials dict and returns an empty parenting every part. Parts named `gun`,
`gun_sleeve`, `gun_collar`, `muzzle_brake` are drawn as the dark gun line in the pixel strip.

For a towed gun: the barrel, the shield, the carriage and the wheels; the trails spread behind
(the old strips show it unlimbered, firing). Check the old strip's frames to see which way it
faces and whether a crew or a tractor is drawn.

## The shape gate and the camera

```bash
blender -b -P art/units/render.py -- side ref.png side.png
```

It renders the model's side at the drawing's scale (the tank facing left, as drawn) and lays it
over the drawing: grey both, red only in the model, blue only in the drawing, with the overlap.
The pixel scale, nose column and ground row are parameters of `side()` (269, 248, 733 for the
Panzer IV drawing): set them for the new drawing. The Panzer IV reached 90%; what stays red should
be what the variant has and the drawing's variant hasn't. Fix the rest, three rounds at most per
problem, then rethink.

Then the camera that matches the old strip's outline:

```bash
blender -b -P art/units/render.py -- fit game/resources/units/images/<strip>.png 15 35 2.5 6.5 9 0.25 0.8 1.0 0.05
```

(elevation from-to-step, pixels per metre, squash). Use its best elevation; 22.5 degrees fitted
the Panzer IV and is a good start for any unit, since the old strips share a camera.

## What the old strips do that the real vehicle doesn't

- **Squatter**: the old Panzer IV is 10-15% wider and longer for its height than the real one.
  `squash` 0.85 and `widen` 1.08 matched it.
- **Heavier at the bottom**: from the side the old one is widest at the hull and tracks; a big
  turret box (the H's skirts) made the new one top-heavy until squashed.
- **Not one projection**: 56 px long from the side but 43 px across at 45 degrees. Choose the
  scale that keeps the unit the size of its neighbours; accept a few px off on the diagonals.
- **Thin parts drawn as lines**: the gun and the antenna are a clear pixel line, not a scaled-down
  cylinder (`THICKEN`, the gun pass).
- **The old camouflage and colours**: the Panzer IV's grey with dark bands; the real 1944
  Dunkelgelb blended into the yellow maps.
