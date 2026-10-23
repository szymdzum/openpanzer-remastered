---
name: making-unit-sprites
description: Makes a new sprite strip for an openpanzer-remastered unit from a Blender model (a tank, a gun, a vehicle, an infantry squad), in the style of the old PG2 strips, and shows it in the game. Use whenever the user wants a unit's graphics remade, upgraded, redrawn in 3D, sharper or @2x, asks for a sprite of a named unit (Panzer IV, leFH 18, T-34, Infanterie...), wants to continue the Panzer IV or infantry pilots, or mentions Blender, Mixamo, sprites or unit art in this repo, even without the word "skill".
---

# Making unit sprites

A unit's strip is 9 frames in one row (frame `i` faces S turned `i` × 22.5 degrees towards E; the
game mirrors them for the other 7 facings). A new strip is rendered from a model in Blender, cut
to hard pixels in the old strip's own palette, and shown in the game as the unit's @2x file.
Everything runs by script, headless: `blender -b -P script.py -- args`.

The pilots behind this skill are written up in `docs/ASSETS.md` ("Pilot: the Panzer IV H",
"Pilot: infantry", "How to make the next unit"). The tools are in `art/units/` (its README lists
every command).

## Why the process is strict

The Panzer IV worked because every number was measured against a scale drawing and every
version was checked against the old strip by numbers, then by the owner. The infantry failed
because a pose was made up from numbers and judged by looking at renders: round after round of
nudging. Your own reading of a render is not reliable here (the owner caught a too-tall tank,
lumpy hands and an upward rifle that the renders "looked fine" with). Trust the gates and the
owner's eye; say what a gate shows, not what you hope it shows.

## Workflow

Copy this checklist into your reply and keep it updated:

```
Unit sprite: <unit>
- [ ] 1. Find the unit: strip, frame size, a scenario to see it in
- [ ] 2. Notes file started (art/units/notes/<strip>.md)
- [ ] 3. Reference gathered: scale drawing + photos (vehicle) or whole animations (figure)
- [ ] 4. Model by script, every number measured or marked "# guess"
- [ ] 5. Shape gate: side view over the drawing (vehicles)
- [ ] 6. Pixel strip rendered at the old frame size
- [ ] 7. Frame gate: check_frames.py against the old strip
- [ ] 8. Owner's review: old against new at 4x, then on a map
- [ ] 9. In the game: public/hd/units/images/<strip>.webp
- [ ] 10. Docs, commit, pull request
```

### 1. Find the unit

```bash
python3 art/units/find_unit.py "leFH18"        # or --icon pa798
```

It lists the equipment entries, their strip, and the scenarios that start with the unit on the
map, with the hexes. Several strips can share a name (`pa796`-`pa798` are all leFH 18s): ask which
one if the user didn't say. Strips that are one drawing in other colours can come from one model,
each pixelated in its own palette. The entry's year hints at the variant (an early or a late
version looks different): ask when it matters. Read the old strip's size (`sips -g pixelWidth -g
pixelHeight`): not every strip is 720×50.

### 2. Notes file

Start `art/units/notes/<strip>.md` from [notes-template.md](notes-template.md) and update it at
the end of every step: what was measured, each gate's numbers per round, what failed and why, the
commands to rerun. A session can end at any time (the laptop has crashed mid-render); the notes
are how the next session continues. Keep scratch files in the worktree, not in `/tmp`, which a
restart wipes.

### 3-5. Reference and model

- **Vehicles and guns**: read [vehicles.md](vehicles.md). A side drawing in scale, measured into
  constants; `panzer_iv.py` is the worked example and its helpers carry over.
- **Infantry and other figures**: read [infantry.md](infantry.md) first. It is a parked pilot:
  tell the user what failed before starting, and never pose a body by numbers.

### 6. Pixel strip

`render.py pixel` renders 8× larger and cuts it down: the old strip's palette, a dark rim, a solid
black shadow, the gun from its own render pass as an unbroken line. Match the old strip, not the
real vehicle: the old sprites are squatter and heavier at the bottom. The knobs, in `pixel()` and
at the top of `render.py`:

| Knob | Panzer IV value | What it does |
|---|---|---|
| `elev` | 22.5 | camera degrees above the ground (from `render.py fit`) |
| `pxm` | 7.6 | pixels per metre at 1x |
| `squash`, `widen` | 0.85, 1.08 | the model's height and width in the projection only |
| `CENTRE` | (39, 29.5) | where the vehicle's middle lands in the 80×50 frame |
| `THICKEN` (model) | gun 1.6, antenna 5 | thin parts drawn thicker than real |

A new unit needs its own model module; `render.py` imports `panzer_iv` today, so generalise that
import (a `--model` argument) rather than copying `render.py`.

### 7. Frame gate

```bash
blender -b -P art/units/check_frames.py -- game/resources/units/images/<strip>.png out.png
```

Per frame: the area against the old one (within 10% passes, 20% warns), the foot or track line
(within 1 px), and where the outline is widest (old units are widest near the bottom). Fix what it
reports in the model or the knobs, render again, check again. **Three rounds on the same failure,
then change the approach** (the camera, the proportions, the source of the shape or pose) and
write down why in the notes. The old strips are not one consistent projection (56 px long from the
side, 43 px across at 45 degrees on `pa131`), so a perfect pass on every frame may not exist: say
which frames miss and by how much.

### 8. Owner's review

The gates don't judge readability. Show the owner:

```bash
blender -b -P art/units/compare.py -- OLD.png NEW.png sheet.png 3      # old over new, 3x
blender -b -P art/units/mockup.py -- game/resources/maps/images/map_0.png OLD.png NEW@2x.png map.png
```

For a second opinion before the owner, a fresh subagent asked for a read-only review against the
reference works well; give it the images, the old strip and the code, and ask for measured
findings and fixes with numbers.

### 9. In the game

```bash
cwebp -lossless out@2x.png -o public/hd/units/images/<strip>.webp
```

The renderer draws a unit from that file on screens of 1.5x or more (`src/render.ts`, `hdPath`),
with the game's Settings at their defaults ("High resolution map and units" on, "Zoom to full
device resolution" off). `public/hd/` is generated and not in Git, so the strip shows only where
it was copied; in a checkout where `scripts/upscale-assets.sh` has run, the old strip's upscaled
file is already there and copying over it replaces it (the script makes it again). Run the dev
server from the worktree (`npx vite --port <free port>`), open New Game, Scenarios, the scenario
from step 1 (by its menu name; names repeat, e.g. "Zitadelle" and "Operation Zitadelle"), and
hover the unit: the top bar names it. Stop the server afterwards.

### 10. Docs, commit, pull request

Add what was learnt to `docs/ASSETS.md` (a section per unit or a line in the pilot's section),
with old-against-new images in `docs/assets-pilot/`. Follow the repo's Git rules in `CLAUDE.md`: a
worktree in `../openpanzer-wt/`, staged by path, a pull request with auto-merge. Docs and
`art/` only: a sprite change touches nothing in `src/` or `game/`.

## Rules learnt the hard way

- **One Blender render at a time.** Four at once, on top of the test suites, crashed the laptop.
  Renders take about 4 minutes a strip (Cycles on the GPU); run them in the background and wait.
- **Assets and licences.** Mixamo FBX files go in `art/units/mixamo/` (ignored): their terms allow
  the characters in games but not sharing the raw files. They exist only on the machine they were
  downloaded to (`find ~/Developer/openpanzer-wt -path '*art/units/mixamo/*.fbx'`). Record the licence and credit of every
  outside model or drawing in the notes (the Panzer IV drawing is public domain). Hunyuan3D's
  licence excludes the EU. Never put an outside model file in Git without a licence that allows it.
- **Colours come from the old strip**, not from colour charts: real Feldgrau and khaki come out too
  light and too grey beside the old sprites. Sample them (`art/units/measure.py` prints a strip's
  main colours).
- **A thin part disappears at 1x**: a gun, an antenna, a rifle. Thicken it in the model or draw it
  from its own pass.
- **Turn the model, not the camera**, so the light stays where the old strips have it.
- **Blender 5.2** is installed in `~/Applications` (`brew install --cask --appdir=~/Applications
  blender`; `/Applications` needs a password). Extensions install from a downloaded zip
  (`blender -c extension install-file -r user_default -e file.zip`): its online sync fails on the
  company proxy's certificate.
