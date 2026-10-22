# New unit and map graphics: research

How the unit sprites and the maps could get a new look: 3D models rendered as sprites, the maps
still hand painted. Nothing is built yet; this is the base for a pilot. Research from October
2026. The licences come partly from third-party blogs: check each one on the model's own page or
in the repository's LICENSE before using it.

## What we have

- Units: 3476 sprite sheets in `game/resources/units/images/`, 720×50 px each: 9 facings of 80 px
  in one strip. The other 7 facings are the same frames mirrored (`src/render.ts`,
  `drawUnitSprite`). The renderer already draws `@2x` images at half their pixel size
  (`imgScale`), so sharper sprites drop in without engine changes. Many sheets are variants of
  the same vehicle (countries, paint).
- Maps: 239 hand-painted images of 1920×1920 in `game/resources/maps/images/`, 247 MB. Each one
  has to line up exactly with its scenario's hex grid.
- New graphics change no game logic, but verify shows the canvas pixels differ, on purpose, as it
  already does for the unit markers.

## How PG2 made its graphics

The PG2 units were not 3D renders. SSI built and painted scale models, set them on a lazy Susan
in front of a blue screen and photographed them from several angles. The maps were painted by
hand from pencil schematics drawn by the scenario writers ([GameSpot preview][gs]).

So the style to aim for is a 3D render that looks like a painted miniature: matte light, a
contact shadow, a light outline. That stays true to the original rather than "going 3D".

## Units

### Rendering: Blender and our own script

There are paid Blender add-ons that turn a model into a sprite sheet: [Pre Render Creator][prc],
[Auto Spritesheet Pro][asp], [8 Directions Render Plugin][8d], [Sprite Render Kit][srk] (old
Blender). We don't need them. Our format is simple (9 facings in a strip, the rest mirrored), and
a `bpy` script run headless (`blender -b -P render_unit.py`) does it the same way every time:

- an orthographic camera at the PG2 angle, the model turned through the 9 facings;
- a fixed sun, a contact shadow, an outline (Freestyle or Line Art);
- rendered at `@2x` (160×100 per frame), packed into the strip;
- checked against the old sprite: size, anchor point, facing order.

[blender-mcp][bmcp] lets Claude drive a live Blender (it sees the viewport and can search
Sketchfab and Poly Haven), which is handy for trying things out. For production a script is
better: the output is deterministic.

At 80×50 px the model's detail hardly shows. What counts is the silhouette, the proportions and
the camouflage: a low-poly model with a good texture is enough.

### Where the models come from

Most free WW2 models are toy-like or stylized. Three sources are worth it, each of a different
kind.

**1. Spring: 1944 (the base).** A free WW2 RTS kept up by its community for years
([GitHub][s44]). Its `objects3d/` holds about 750 textured models by nation: Germany, the Soviet
Union, the US and Britain, but also Italy, Japan, Hungary, France and Sweden, close to the PG2
roster. The German folder alone has the Jagdpanther, Jagdpanzer IV, Bf 109, Fw 190, Ju 87G,
Kübelwagen, MG42 and FlaK guns. They are RTS models, seen from above, with a sensible polygon
count and historical paint: what an 80×50 sprite needs. The models are mostly `.s3o` (the Spring
engine's format), some already `.dae`; Blender needs an importer, which the Spring community has.

Licence: `docs/License.txt` puts the models and textures under CC-BY-NC 3.0 (the Lua code is
GPL): free to use with credit, non-commercial only. Fine while the game stays free; it rules out
selling it (Steam, say). The repo has no LICENSE yet: the Spring: 1944 graphics would get their
own licence and credits, apart from the code.

**2. Wargaming miniatures for 3D printing (15 mm, 28 mm).** The most accurate WW2 models today
come from the designers of Flames of War and Bolt Action miniatures, close in spirit to SSI's
photographed scale models. [Wargame3D][w3d] has hundreds of vehicles of every nation
([list by nation][w3dl]): about 7 € a model for personal use, about 22 € with a commercial
licence. Also [WW2 3D Models on Thangs][thangs] (a Tiger for 5 $), packs on
[MyMiniFactory][mmf], single free models on [MakerWorld][mw] and Printables. The STL files have
no textures, so we paint the camouflage and markings in Blender. Their licences speak of
printing: rendering them for a game has to be agreed with the author (Wargame3D gives an email).

**3. Paid game models (CGTrader, TurboSquid).** A royalty-free licence allows a model in a game,
and we only ship rendered images, the simplest case. A realistic tank is usually 10-60 $. For
the gaps.

The plan: Spring: 1944 as the base, the gaps filled with wargaming models we paint, or single
bought ones. If the game should stay sellable, the base is the wargaming models with a commercial
licence instead.

Also useful: [Mixamo][mixamo] for infantry poses (free for games). The free low-poly models that
turned up first are mostly stylized: the Sketchfab Shermans ([M4 early][m4e], [M4A3 (76)
HVSS][m4a3], [M4A1 (76)][m4a1], CC-BY, untextured), the [Lowpoly Tank Pack][ltp] and the CC0
[Low Poly Battle Pack][lpbp] on itch.io, a [King Tiger][kt] on BlendSwap, [OpenGameArt][oga1]
tanks.

To avoid: models ripped from World of Tanks, War Thunder and other games (copyright), files
licensed "for 3D printing" or personal display only, and the models of the
[PG2 mod for Panzer Corps 2][pc2mod], whose author forbids reuse.

### AI image-to-3D

- **TRELLIS.2** (Microsoft): ranked the best open-source model, MIT. There is an Apple Silicon
  port ([trellis-mac][tmac]): about 24 GB of unified memory, a few minutes per model. Good for a
  first draft from a reference (a photo or drawing of the tank); the mesh needs cleaning up.
- **Hunyuan3D** (Tencent): the best textures, but its community licence excludes the EU, the UK
  and South Korea ([LICENSE][hlic]). Not usable from Poland.
- **Tripo / Meshy**: convenient, hosted. Tripo's free tier is non-commercial; Meshy's free tier
  reportedly requires CC-BY (unconfirmed) ([comparison][cmp1], [another][cmp2]).

AI gives a draft, not a finished model. At this scale kitbashing pays off more: one hull,
swapped turrets, guns and paint for the variants.

### The scale of the job

Thousands of sheets can't be done by hand. A realistic plan:

1. Archetypes from the campaigns, about 30-50 models: the most common German, Soviet and US
   units first.
2. Variants from the same script: the country's texture, camouflage, a different gun.
3. The rest keeps its old graphic. In the matte miniature style old and new should sit together
   reasonably well.
4. Infantry is the hardest: a group of 3-4 figures in Mixamo poses, slightly varied.

## Maps

**A. Upscale 2× (the place to start).** The geometry stays, so the hexes stay where they are. The
Infinity Engine (Baldur's Gate) community tried this on similar painted backgrounds: ESRGAN did
far better than Waifu2x ([Beamdog thread][bd1]), and REAL-ESRGAN gave results players praised
([second thread][bd2]). Their trouble was seams from cutting the backgrounds into tiles; our maps
are one image each. Real-ESRGAN has an ncnn-vulkan build that runs on a Mac. The main risk is the
"plastic" look (too smooth, too saturated): slight desaturation and reinjected fine noise or
high-pass detail help ([Tripo blog][tripo]).

**B. img2img with ControlNet Tile at low strength.** More painterly detail than a plain upscale,
but it can move rivers and roads off their hexes. We'd need a check: lay the grid over the map
and compare what's under each hex with the scenario's terrain. No tested workflow for hex maps
turned up ([ControlNet Tile][cnt]).

**C. Maps generated from the terrain data, with a LoRA trained on the existing maps.**
[Scenario][scn] suggests 8-20 consistent samples, transitions between terrains included. The
biggest project of the three; worth it only for new scenarios.

Practical points:

- Size: 2× is about 1 GB. Move to WebP or AVIF and load only the maps a scenario needs.
- Rights: the maps and sprites are SSI/Ubisoft art inherited through Panzer Marshal. An upscale
  is still derived from that art. New renders of our own or CC models are cleaner.

## Plan

1. Unit pilot: a Spring: 1944 tank (the Jagdpanzer IV, say), the Blender script, a `@2x` strip,
   shown in the game next to the old sprites. Measure how long one unit takes.
2. Map pilot: one map through Real-ESRGAN with the "anti-plastic" pass, compared 1:1, the grid
   check.
3. After the pilots, before going on: a style guide (camera angle, light, outline, palette,
   saturation).
4. Batches of archetypes, each model's credit and licence recorded.

## Sources

- [GameSpot: Panzer General II preview][gs]
- Sprite tools: [Pre Render Creator][prc], [Auto Spritesheet Pro][asp],
  [8 Directions Render Plugin][8d], [Sprite Render Kit][srk],
  [OpenGameArt: 3D meshes to a sprite sheet][ogas], [blender-mcp][bmcp],
  [80.lv: the Dead Cells pipeline][dc], [Slitherine: unit icon tutorial][sli]
- Models: [Spring: 1944][s44], [Wargame3D][w3d], [Wargame3D by nation][w3dl], [Thangs][thangs],
  [MyMiniFactory][mmf], [MakerWorld][mw], [Mixamo][mixamo], [M4 early][m4e], [M4A3 HVSS][m4a3],
  [M4A1][m4a1], [Tiger][tiger], [TKS][tks], [Wehrmacht soldier][soldier], [King Tiger][kt],
  [Lowpoly Tank Pack][ltp],
  [Low Poly Battle Pack][lpbp], [OpenGameArt tank pack][oga1], [OpenGameArt low-poly tanks][oga2],
  [PG2 mod for Panzer Corps 2][pc2mod]
- AI 3D: [comparison][cmp1], [TRELLIS.2 vs others][cmp2], [trellis-mac test][tmac],
  [Hunyuan3D licence][hlic]
- Maps: [Beamdog: upscaling IE maps][bd1], [Beamdog: REAL-ESRGAN][bd2],
  [Tripo: texture upscaling][tripo], [Scenario: isometric tiles][scn], [ControlNet Tile][cnt]

[gs]: https://www.gamespot.com/articles/panzer-general-ii-preview/1100-2560272/
[prc]: https://viniguerrero.itch.io/pre-render-creator
[asp]: https://superhivemarket.com/products/auto-spritesheet-pro
[8d]: https://auteddy.gumroad.com/l/8d_blender_plugin
[srk]: https://blurymind.itch.io/sprite-render-kit-for-blender-3d
[ogas]: https://opengameart.org/node/18092
[bmcp]: https://glama.ai/mcp/servers/ahujasid/blender-mcp
[dc]: https://80.lv/articles/case-study-dead-cells-character-art-pipeline/
[sli]: https://forum.slitherine.com/viewtopic.php?p=253047
[m4e]: https://sketchfab.com/3d-models/low-poly-m4-early-19f4f2295b6044c88a716ca371f3e502
[m4a3]: https://sketchfab.com/3d-models/low-poly-m4a376-hvss-710e93ef16c84160a5e8b980ce07163a
[m4a1]: https://sketchfab.com/3d-models/low-poly-m4a176-41d46853195742eda8926566ce68cecf
[tiger]: https://sketchfab.com/3d-models/ww2-tank-93dc2f72f8374ae7a473c9c82eae48ad
[tks]: https://sketchfab.com/3d-models/tks-20mm-tankette-57b59c9962814cb1ac5e96e5cc650e9d
[soldier]: https://sketchfab.com/3d-models/ww2-german-wehrmacht-soldier-8f519608b01247fbb9d7bc119ce961ff
[s44]: https://github.com/spring1944/spring1944
[w3d]: https://www.wargaming3d.com/product/stl-pack-16-military-utility-vehicles-artillery-of-ww2-volume-1-156-28mm-personal-use
[w3dl]: https://teletype.in/@wargame3d/3D_models_BY_NATIONS
[thangs]: https://thangs.com/designer/WW2%203D%20Models/3d-model/German%20tanks%3A%20Tiger%20I%20%28Late%20Production%29-1537364
[mmf]: https://www.myminifactory.com/object/3d-print-german-army-full-pack-ww2-west-front-late-war-15mm-831974
[mw]: https://makerworld.com/en/models/2619724-panzer-iv
[mixamo]: https://www.mixamo.com
[kt]: https://blendswap.com/blend/16580
[ltp]: https://isolatedsoulstudio.itch.io/lowpoly-tank-pack-01
[lpbp]: https://lightning-poly.itch.io/low-poly-battle-pack
[oga1]: https://opengameart.org/content/tank-pack-80
[oga2]: https://opengameart.org/content/low-poly-tank-assets
[pc2mod]: https://michaelweinert.artstation.com/projects/lDzD3k
[cmp1]: https://app.cinevva.com/guides/ai-3d-model-generators
[cmp2]: https://trellis2.app/blog/best-ai-3d-model-generator
[tmac]: https://lilting.ch/en/articles/trellis2-m1-max-hands-on
[hlic]: https://huggingface.co/tencent/Hunyuan3D-2/blob/main/LICENSE
[bd1]: https://forums.beamdog.com/discussion/73868/upscaling-infinity-engine-maps-with-ai/p1
[bd2]: https://forums.beamdog.com/discussion/comment/1039185
[tripo]: https://www.tripo3d.ai/blog/explore/ai-3d-model-generator-texture-upscaling-pipelines
[scn]: https://www.scenario.com/blog/build-isometric-game-tiles-with-ai
[cnt]: https://runware.ai/docs/models/controlnet-preprocess-tile.md
