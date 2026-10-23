# Infantry and other figures

A parked pilot: the owner judged the result "so-so" (docs/ASSETS.md, "Pilot: infantry"). Before
starting, tell the user it is parked and why, and agree on what would make a retry worth it (a
charge animation, a stylized model). Don't start rendering on your own.

## Contents
- The old figures
- What failed
- The route for a retry
- mixamo_soldier.py

## The old figures

Three figures in a triangle per frame, about 23-30 px tall each at 1x, drawn at about 21 px a
metre (nearly three times a tank's scale). They advance: leaning into a stride, the weapon low and
level in front, the German rifles with a bright bayonet tip (a bayonet charge, not a kneel). Dark,
warm colours (brightness 0.2-0.5); grey German helmets, olive Soviet ones; the weapon tells units
apart (rifle, PPSh, Panzerfaust). `jk467` is 82×53 a frame, not 80×50. The figures touch, so a
frame's outline is one blob: compare whole frames, not single figures.

## What failed

- **A body posed by numbers** (`soldier.py`, MPFB 2): lumpy hands (the fingers stay spread), a
  bare mannequin, a made-up pose with nothing to check it against. Two review rounds only moved
  the numbers.
- **Gluing two animations** (the legs of a run, the arms of an aim): the head sank into the chest,
  the rifle went through it. A Mixamo aim stands bladed (the rifle along the left side), so the
  arms only make sense on their own torso.
- **Judging renders by eye**: the owner spotted the hands, the boots and an upward rifle that the
  renders "looked fine" with.

## The route for a retry

1. **The reference is the old strip's frames**, at 8×, with their foot line and palette.
2. **The pose comes whole from motion capture**: a Mixamo character (Ch49 is a WW2 soldier with
   webbing and natural hands) and Mixamo animations, downloaded by the user (an Adobe login).
   Ask for: FBX Binary, Without Skin for animations (With Skin or T-pose for the character),
   30 fps, no keyframe reduction, "In Place" for walks and runs. The useful ones so far: `Idle`
   (rifle low and level in front, the closest to the old arms), `Rifle Aiming Idle`, `Rifle Run`
   (rifle across the chest: wrong). Still missing: a charge or fast walk with the rifle forward
   (search Mixamo's "Pro Rifle Pack").
3. **Pick the pose by numbers, not by eye**: for each frame of each animation and a range of turns
   and scales, render the outline and score it against the old frame (`check_frames.py`'s area
   and foot line, or the outline overlap `render.py fit` uses). Keep the best. This is not written
   yet; it is the next tool to build if the infantry is picked up.
4. **Proportions follow the old figures' pixels**: stocky, a big head and helmet.
5. **The owner's sign-off** on a 4× sheet before any full strip.

A stylized low-poly soldier ("World War Soldier" on Superhive, 9.99 $, rigged, with a rifle; check
its licence) may read better at 25 px than the realistic Ch49.

## mixamo_soldier.py

```bash
NATION=germany blender -b -P art/units/mixamo_soldier.py -- view out.png art/units/mixamo/Ch49_nonPBR.fbx art/units/mixamo/idle.fbx 1 90
NATION=germany blender -b -P art/units/mixamo_soldier.py -- frame out.png art/units/mixamo/Ch49_nonPBR.fbx art/units/mixamo/idle.fbx 1 game/resources/units/images/jk467.png 4
```

- `load()` puts the character in one frame of one animation, taken whole, re-centred on its hips,
  on a pivot at the origin (turn the pivot, not the rig).
- `aim_level()` levels the rifle by bowing the upper chest (`Spine2`: the shoulders, arms and rifle
  turn as one) and turns the figure so the rifle, not the body, points the frame's way: seen from
  22.5 degrees above, a level rifle angled away from the camera reads as pointing up.
- `add_rifle()` puts a rifle through both hands, the butt 0.30 m behind the right one, and a bright
  bayonet.
- `NATION=germany` (`dress()`): the tunic and trousers multiplied to the old strip's field grey,
  matt; the Mixamo M1 helmet pulled in under our Stahlhelm. Soviet dress (khaki, SSh-40, a PPSh) is
  not done.
- The figure is rendered at `pxm` 18, its middle at 55% of the frame height.
