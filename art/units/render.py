# Render a unit model as a PG2 strip: 9 frames, frame i faces S turned i * 22.5 degrees towards E
# (0 comes at the viewer, 4 goes right, 8 goes away); the game mirrors them for the other 7 facings.
#
#   blender -b -P render.py -- pixel REFERENCE.png OUT.png   the strip in the PG2 manner, 1x and @2x
#   blender -b -P render.py -- strip OUT.png [ELEV] [PXM] [SCALE]   a smooth strip (SCALE 2 for @2x)
#   blender -b -P render.py -- fit REFERENCE.png             the camera angle and scale that match it
#   blender -b -P render.py -- side DRAWING.png OUT.png      the side laid over a scale drawing
#   blender -b -P render.py -- view OUT.png ELEV TURN        a large smooth render, to look at
#   blender -b -P render.py -- scene OUT.blend               a scene for the Blender app
import math
import os
import sys
import tempfile

import bpy
import numpy as np
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import panzer_iv  # noqa: E402

FRAME_W, FRAME_H = 80, 50
SUN_TILT = 32  # degrees from straight down
CENTRE = (39.0, 29.5)  # where the middle of the vehicle goes, in 1x pixels: its tracks end where the old strips' do


def reset():
	bpy.ops.wm.read_factory_settings(use_empty=True)


def node_material(name, base):
	m = bpy.data.materials.new(name)
	m.use_nodes = True
	bsdf = m.node_tree.nodes["Principled BSDF"]
	bsdf.inputs["Roughness"].default_value = 0.85
	bsdf.inputs["Base Color"].default_value = (*base, 1)
	return m


# Linear RGB. Dunkelgelb (RAL 7028) with Olivgrün (RAL 6003) and Rotbraun (RAL 8017) blotches, as on
# the H in 1944; "grey" is the Panzergrau with dark stripes of the old PG2 sprites
PALETTES = {
	"dunkelgelb": [(0.46, 0.36, 0.17), (0.085, 0.10, 0.045), (0.075, 0.037, 0.025)],
	"grey": [(0.24, 0.24, 0.23), (0.035, 0.037, 0.035), (0.035, 0.037, 0.035)],
}


def camo_material(colours):
	# Two noise fields cut into blotches, in the tank's own space: the pattern runs across the parts
	m = node_material("paint", colours[0])
	nt = m.node_tree
	bsdf = nt.nodes["Principled BSDF"]
	coord = nt.nodes.new("ShaderNodeTexCoord")
	colour = None
	for i, (c, seed) in enumerate(((colours[1], 0.0), (colours[2], 3.7))):
		mapping = nt.nodes.new("ShaderNodeMapping")
		mapping.inputs["Location"].default_value = (seed, seed * 0.5, 0)
		mapping.inputs["Scale"].default_value = (1, 1, 1.6)
		noise = nt.nodes.new("ShaderNodeTexNoise")
		noise.inputs["Scale"].default_value = 0.8
		noise.inputs["Detail"].default_value = 3
		noise.inputs["Distortion"].default_value = 0.8
		# A narrow band of the noise: wavy stripes sprayed over the base colour
		ramp = nt.nodes.new("ShaderNodeValToRGB")
		ramp.color_ramp.interpolation = "CONSTANT"
		els = ramp.color_ramp.elements
		els[0].color = (0, 0, 0, 1)
		els[1].position = 0.46
		els[1].color = (1, 1, 1, 1)
		band_end = els.new(0.53)
		band_end.color = (0, 0, 0, 1)
		mix = nt.nodes.new("ShaderNodeMix")
		mix.data_type = "RGBA"
		nt.links.new(coord.outputs["Object"], mapping.inputs["Vector"])
		nt.links.new(mapping.outputs["Vector"], noise.inputs["Vector"])
		nt.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
		nt.links.new(ramp.outputs["Color"], mix.inputs["Factor"])
		if colour is None:
			mix.inputs["A"].default_value = (*colours[0], 1)
		else:
			nt.links.new(colour, mix.inputs["A"])
		mix.inputs["B"].default_value = (*c, 1)
		colour = mix.outputs["Result"]
	nt.links.new(colour, bsdf.inputs["Base Color"])
	m["coord"] = coord.name
	return m


def stripe_material(colours):
	# Broad dark bands across a grey base, like the old PG2 sprites of German armour
	m = node_material("paint", colours[0])
	nt = m.node_tree
	coord = nt.nodes.new("ShaderNodeTexCoord")
	wave = nt.nodes.new("ShaderNodeTexWave")
	wave.wave_type = "BANDS"
	wave.bands_direction = "DIAGONAL"
	wave.inputs["Scale"].default_value = 0.3
	wave.inputs["Distortion"].default_value = 7
	wave.inputs["Detail"].default_value = 2
	ramp = nt.nodes.new("ShaderNodeValToRGB")
	ramp.color_ramp.interpolation = "CONSTANT"
	els = ramp.color_ramp.elements
	els[0].color = (*colours[0], 1)
	els[1].position = 0.8
	els[1].color = (*colours[1], 1)
	nt.links.new(coord.outputs["Object"], wave.inputs["Vector"])
	nt.links.new(wave.outputs["Fac"], ramp.inputs["Fac"])
	nt.links.new(ramp.outputs["Color"], nt.nodes["Principled BSDF"].inputs["Base Color"])
	m["coord"] = coord.name
	return m


def materials(palette="grey"):
	return {
		"paint": stripe_material(PALETTES[palette]) if palette == "grey" else camo_material(PALETTES[palette]),
		"track": node_material("track", (0.035, 0.03, 0.028)),
		"running": node_material("running", (0.07, 0.07, 0.065)),  # the wheels in the shade under the skirts
		"rubber": node_material("rubber", (0.02, 0.02, 0.02)),
		"rust": node_material("rust", (0.12, 0.05, 0.025)),
		"black": node_material("black", (0.01, 0.01, 0.01)),
		"white": node_material("white", (0.8, 0.8, 0.8)),
	}


def build():
	m = materials(os.environ.get("PALETTE", "grey"))
	root = panzer_iv.build(m)
	paint = m["paint"]
	paint.node_tree.nodes[paint["coord"]].object = root
	return root


def camera(elev, pxm, scale):
	cam_data = bpy.data.cameras.new("cam")
	cam_data.type = "ORTHO"
	cam_data.ortho_scale = FRAME_W / pxm
	cam = bpy.data.objects.new("cam", cam_data)
	bpy.context.collection.objects.link(cam)
	e = math.radians(elev)
	target = Vector((0, 0, 1.2))
	d = Vector((0, math.cos(e), -math.sin(e)))
	cam.location = target - d * 30
	cam.rotation_euler = (math.pi / 2 - e, 0, 0)
	# Shift the frame so the vehicle's middle lands where the original strips put it
	cam_data.shift_x = (FRAME_W / 2 - CENTRE[0]) / FRAME_W
	cam_data.shift_y = (CENTRE[1] - FRAME_H / 2) / FRAME_W
	bpy.context.scene.camera = cam
	r = bpy.context.scene.render
	r.resolution_x, r.resolution_y = FRAME_W * scale, FRAME_H * scale
	r.resolution_percentage = 100
	r.film_transparent = True
	return cam


def lights():
	sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
	sun.data.energy = 5
	sun.data.angle = math.radians(2)
	sun.rotation_euler = (math.radians(SUN_TILT), 0, math.radians(-35))  # from the upper left, behind the viewer
	bpy.context.collection.objects.link(sun)
	world = bpy.data.worlds.new("world")
	world.use_nodes = True
	world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.55, 0.57, 0.6, 1)
	world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.35
	bpy.context.scene.world = world


def ground():
	# Catches the shadow, renders transparent elsewhere
	bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, 0))
	plane = bpy.context.object
	plane.is_shadow_catcher = True
	return plane


def outline(sc, scale):
	# A thin dark edge, like the dark rim of the old sprites
	try:
		sc.render.use_freestyle = True
		sc.render.line_thickness_mode = "ABSOLUTE"
		sc.render.line_thickness = 0.5 * scale
		fs = sc.view_layers[0].freestyle_settings
		ls = fs.linesets[0] if len(fs.linesets) else fs.linesets.new("outline")
		if ls.linestyle is None:
			ls.linestyle = bpy.data.linestyles.new("outline")
		ls.select_by_visibility = True
		ls.select_silhouette, ls.select_border, ls.select_crease = True, True, False
		ls.linestyle.color = (0.02, 0.02, 0.02)
		ls.linestyle.alpha = 0.8
	except (AttributeError, IndexError) as e:
		print("no freestyle:", e)


def face(root, i):
	root.rotation_euler = (0, 0, math.radians(i * 22.5 - 90))


def render_frames(root, path_of):
	for i in range(9):
		face(root, i)
		bpy.context.scene.render.filepath = path_of(i)
		bpy.ops.render.render(write_still=True)


def load_rgba(path):
	img = bpy.data.images.load(path)
	w, h = img.size
	px = np.array(img.pixels[:]).reshape(h, w, 4)[::-1].copy()
	bpy.data.images.remove(img)
	return px


def pack(frames, out, scale):
	w, h = FRAME_W * scale, FRAME_H * scale
	strip = np.zeros((h, w * 9, 4))
	for i, f in enumerate(frames):
		strip[:, i * w:(i + 1) * w] = f
	img = bpy.data.images.new("strip", w * 9, h, alpha=True)
	img.pixels = strip[::-1].ravel()
	img.filepath_raw = out
	img.file_format = "PNG"
	img.save()


def fit(reference, elevs=range(0, 50, 5), scales=np.arange(7.0, 10.01, 0.5), squashes=(1.0,)):
	ref = load_rgba(reference)
	# The vehicle without its black shadow
	ref_mask = (ref[..., 3] > 0.5) & (ref[..., :3].max(axis=2) > 0.02)
	tmp = tempfile.mkdtemp()
	results = []
	for elev, pxm, squash in ((e, p, q) for e in elevs for p in scales for q in squashes):
		reset()
		root = build()
		root.scale = (1, 1, squash)
		camera(elev, pxm, 1)
		sc = bpy.context.scene
		sc.render.engine = "BLENDER_WORKBENCH"
		sc.display.shading.light = "FLAT"
		render_frames(root, lambda i: os.path.join(tmp, f"m{i}.png"))
		ious = []
		for i in range(9):
			m = load_rgba(os.path.join(tmp, f"m{i}.png"))[..., 3] > 0.5
			r = ref_mask[:, i * FRAME_W:(i + 1) * FRAME_W]
			ious.append((m & r).sum() / max((m | r).sum(), 1))
		results.append((float(np.mean(ious)), float(elev), float(pxm), float(squash), [round(float(x), 2) for x in ious]))
		print(f"elev {elev:4.1f} px/m {pxm:4.1f} squash {squash:4.2f} iou {np.mean(ious):.3f}", flush=True)
	results.sort(reverse=True)
	print("BEST", results[:5])


def cycles(sc, scale):
	sc.render.engine = "CYCLES"
	sc.cycles.samples = 64
	sc.cycles.use_denoising = True
	prefs = bpy.context.preferences.addons["cycles"].preferences
	prefs.compute_device_type = "METAL"
	prefs.get_devices()
	for d in prefs.devices:
		d.use = True
	sc.cycles.device = "GPU"
	sc.render.filter_size = 1.0
	sc.view_settings.view_transform = "Standard"
	sc.view_settings.look = "Medium High Contrast"
	outline(sc, scale)


def strip(out, elev, pxm, scale):
	reset()
	root = build()
	camera(elev, pxm, scale)
	lights()
	ground()
	sc = bpy.context.scene
	cycles(sc, scale)
	tmp = tempfile.mkdtemp()
	render_frames(root, lambda i: os.path.join(tmp, f"f{i}.png"))
	pack([load_rgba(os.path.join(tmp, f"f{i}.png")) for i in range(9)], out, scale)
	print("wrote", out)


def side(drawing, out, pxm=269, nose_px=248, ground_px=733):
	# Render the side at the drawing's own scale (the tank facing left, as drawn) and lay it over it
	reset()
	root = build()
	root.rotation_euler = (0, 0, math.pi)
	ref = load_rgba(drawing)
	h, w = ref.shape[:2]
	cam_data = bpy.data.cameras.new("cam")
	cam_data.type = "ORTHO"
	cam_data.ortho_scale = w / pxm
	cam = bpy.data.objects.new("cam", cam_data)
	bpy.context.collection.objects.link(cam)
	cam.location = (-panzer_iv.HULL / 2 + (w / 2 - nose_px) / pxm, -30, (ground_px - h / 2) / pxm)
	cam.rotation_euler = (math.pi / 2, 0, 0)
	sc = bpy.context.scene
	sc.camera = cam
	sc.render.resolution_x, sc.render.resolution_y = w, h
	sc.render.film_transparent = True
	sc.render.engine = "BLENDER_WORKBENCH"
	sc.display.shading.light = "FLAT"
	sc.display.shading.color_type = "SINGLE"
	tmp = os.path.join(tempfile.mkdtemp(), "side.png")
	sc.render.filepath = tmp
	bpy.ops.render.render(write_still=True)
	mine = load_rgba(tmp)[..., 3] > 0.5
	theirs = ref[..., 3] > 0.5
	out_px = np.ones((h, w, 4))
	out_px[..., :3] = 1
	out_px[theirs & ~mine, :3] = (0.2, 0.4, 1.0)   # only in the drawing: blue
	out_px[mine & ~theirs, :3] = (1.0, 0.25, 0.2)  # only in the model: red
	out_px[mine & theirs, :3] = (0.75, 0.75, 0.75)
	img = bpy.data.images.new("side", w, h)
	img.pixels = out_px[::-1].ravel()
	img.filepath_raw = out
	img.file_format = "PNG"
	img.save()
	print("iou", (mine & theirs).sum() / (mine | theirs).sum())


def view(out, elev, azimuth, size=900):
	# A big look at the model from any angle, for checking it by eye
	reset()
	root = build()
	root.rotation_euler = (0, 0, math.radians(azimuth))
	cam_data = bpy.data.cameras.new("cam")
	cam_data.type = "ORTHO"
	cam_data.ortho_scale = 8.5
	cam = bpy.data.objects.new("cam", cam_data)
	bpy.context.collection.objects.link(cam)
	e = math.radians(elev)
	cam.location = Vector((0, 0, 1.2)) - Vector((0, math.cos(e), -math.sin(e))) * 30
	cam.rotation_euler = (math.pi / 2 - e, 0, 0)
	sc = bpy.context.scene
	sc.camera = cam
	sc.render.resolution_x, sc.render.resolution_y = size, int(size * 0.6)
	lights()
	ground()
	cycles(sc, 2)
	sc.render.filepath = out
	bpy.ops.render.render(write_still=True)


def downsample(px, f):
	# Average f x f blocks, the colour weighted by its alpha
	h, w = px.shape[0] // f, px.shape[1] // f
	b = px[:h * f, :w * f].reshape(h, f, w, f, 4)
	a = b[..., 3].mean(axis=(1, 3))
	rgb = (b[..., :3] * b[..., 3:4]).sum(axis=(1, 3)) / np.maximum(b[..., 3].sum(axis=(1, 3)), 1e-6)[..., None]
	return rgb, a


def blur(c):
	p = np.pad(c, ((1, 1), (1, 1), (0, 0)), mode="edge")
	return sum(p[1 + dy:1 + dy + c.shape[0], 1 + dx:1 + dx + c.shape[1]] for dy in (-1, 0, 1) for dx in (-1, 0, 1)) / 9


def pixelate(tank, shadowed, palette, f):
	# One frame in the PG2 manner: hard pixels, the colours of the old sprite's palette, a dark
	# rim round the silhouette and a solid black shadow
	rgb, a = downsample(tank, f)
	_, sa = downsample(shadowed, f)
	# A low threshold, or the gun and the antenna (thinner than a pixel) break up
	mask = a > 0.2
	rgb = np.clip(rgb + 0.7 * (rgb - blur(rgb)), 0, 1)  # crisper detail, like the old photos
	inner = mask.copy()
	for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
		inner &= np.roll(np.roll(mask, dy, 0), dx, 1)
	rgb[mask & ~inner] *= 0.55
	# Nearest colour of the palette (the PNG renders are already sRGB, like the palette)
	d = ((rgb[:, :, None, :] - palette[None, None, :, :]) ** 2).sum(axis=3)
	out = np.zeros(rgb.shape[:2] + (4,))
	out[..., :3] = palette[d.argmin(axis=2)]
	out[..., 3] = mask
	shadow = (sa > 0.4) & ~mask
	out[shadow] = (0, 0, 0, 1)
	return out


def pixel(reference, out, elev=22.5, pxm=7.6, squash=0.85, render_scale=8):
	# Render big, then pixelate to the 1x strip and to the @2x strip, in the old strip's colours
	ref = load_rgba(reference)
	opaque = ref[..., 3] > 0.5
	palette = np.unique(np.round(ref[opaque][:, :3] * 255), axis=0) / 255
	reset()
	global SUN_TILT
	SUN_TILT = 25  # a high sun: a bright roof over darker sides, as on the old sprites
	panzer_iv.THICKEN.update(gun=1.6, antenna=5)
	root = build()
	# The PG2 sprites are squatter than the real vehicle: wider and longer for their height
	root.scale = (1, 1, squash)
	camera(elev, pxm, render_scale)
	lights()
	plane = ground()
	sc = bpy.context.scene
	cycles(sc, render_scale)
	sc.render.use_freestyle = False
	sc.cycles.samples = 48
	tmp = tempfile.mkdtemp()
	render_frames(root, lambda i: os.path.join(tmp, f"s{i}.png"))
	plane.hide_render = True
	render_frames(root, lambda i: os.path.join(tmp, f"t{i}.png"))
	for scale in (1, 2):
		frames = []
		for i in range(9):
			t = load_rgba(os.path.join(tmp, f"t{i}.png"))
			s_ = load_rgba(os.path.join(tmp, f"s{i}.png"))
			frames.append(pixelate(t, s_, palette, render_scale // scale))
		path = out.replace(".png", "@2x.png") if scale == 2 else out
		pack(frames, path, scale)
		print("wrote", path)


def scene(out, elev=22.5, pxm=7.2):
	# A .blend to look round in Blender: the model at sprite frame 2, the game's camera, the light,
	# the viewport in rendered shading. Numpad 0 looks through the game's camera.
	reset()
	root = build()
	face(root, 2)
	camera(elev, pxm, 8)
	lights()
	ground()
	sc = bpy.context.scene
	cycles(sc, 8)
	sc.cycles.samples = 32
	for screen in bpy.data.screens:
		for area in screen.areas:
			if area.type == "VIEW_3D":
				area.spaces[0].shading.type = "RENDERED"
	bpy.ops.wm.save_as_mainfile(filepath=out)
	print("saved", out)


args = sys.argv[sys.argv.index("--") + 1:]
if args[0] == "pixel":
	pixel(os.path.abspath(args[1]), os.path.abspath(args[2]))
elif args[0] == "scene":
	scene(os.path.abspath(args[1]))
elif args[0] == "side":
	side(os.path.abspath(args[1]), os.path.abspath(args[2]))
elif args[0] == "view":
	view(os.path.abspath(args[1]), float(args[2]), float(args[3]))
elif args[0] == "fit":
	if len(args) > 2:  # a finer search: fit REF ELEV0 ELEV1 ELEVSTEP PXM0 PXM1 PXMSTEP [SQ0 SQ1 SQSTEP]
		a = [float(x) for x in args[2:]]
		sq = np.arange(a[6], a[7] + 1e-6, a[8]) if len(a) >= 9 else (1.0,)
		fit(os.path.abspath(args[1]), np.arange(a[0], a[1] + 1e-6, a[2]), np.arange(a[3], a[4] + 1e-6, a[5]), sq)
	else:
		fit(os.path.abspath(args[1]))
else:
	strip(os.path.abspath(args[1]), float(args[2]) if len(args) > 2 else 20, float(args[3]) if len(args) > 3 else 8, int(args[4]) if len(args) > 4 else 2)
