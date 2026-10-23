# Unit sprites from 3D models

The way of working is the project skill `.claude/skills/making-unit-sprites/`; each unit's notes
are in `notes/`.

The infantry scripts (`soldier.py`, `mixamo_soldier.py`) are a parked pilot: docs/ASSETS.md.

Blender scripts that build a unit as a model and render it as a PG2 strip. docs/ASSETS.md says
why and what the Panzer IV H pilot showed. Blender 5.2 (`brew install --cask blender`), run from
this folder:

| Command | What it does |
|---|---|
| `blender -b -P render.py -- pixel ../../game/resources/units/images/pa131.png out.png` | the strip in the PG2 manner, `out.png` (1x) and `out@2x.png`, in the old strip's palette |
| `blender -b -P render.py -- side reference/Panzer_IV_G.png side.png` | the model's side laid over the drawing, and how much they overlap |
| `blender -b -P render.py -- fit ../../game/resources/units/images/pa131.png` | the camera angle and scale that match the old strip's outline |
| `blender -b -P render.py -- view view.png 14 200` | a large smooth render from any angle (elevation, turn) |
| `blender -b -P render.py -- scene panzer_iv.blend` | a scene to look round in the Blender app |
| `blender -b -P compare.py -- OLD.png NEW.png OUT.png [ZOOM]` | the old strip over the new one |
| `blender -b -P mockup.py -- MAP.png OLD.png NEW@2x.png OUT.png` | both on a piece of a map, at 2x |
| `blender -b -P measure.py -- STRIP.png` | the box, centre and main colours of each frame |
| `python3 find_unit.py "Pz IVH"` (or `--icon pa131`) | a unit's strip and the scenarios that start with it on the map |
| `blender -b -P drawing_profile.py -- ref.png` | a side drawing's outline, column by column, to measure from |
| `blender -b -P check_frames.py -- OLD.png NEW.png` | the gate: area, foot line, mass per frame against the old strip |
| `blender -b -P soldier.py -- frame OUT.png germany REF.png 4` | the built (MPFB 2) infantryman, one frame; needs the MPFB extension |
| `NATION=germany blender -b -P mixamo_soldier.py -- frame OUT.png mixamo/CHAR.fbx mixamo/ANIM.fbx 1 REF.png 4` | the Mixamo infantryman, one frame; the FBX files are downloaded by hand into `mixamo/` |
| `blender -b -P figure_sheet.py -- OLD NEW NEW@2x OLD NEW NEW@2x OUT.png` | old infantry frame 4 next to new figures |

`panzer_iv.py` is the model; `reference/Panzer_IV_G.png` the public-domain drawing it was measured
on (File:Panzer_IV_G.svg, Wikimedia Commons, by Marseille77). `PALETTE=dunkelgelb` paints the
1944 camouflage instead of the old grey.
