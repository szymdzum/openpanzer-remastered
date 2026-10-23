# An infantryman from Mixamo: the character (its uniform, webbing, boots, hands) in a pose from a
# Mixamo animation (motion capture), with our rifle put in its hands. The FBX files are not in
# Git (Mixamo's terms forbid sharing the raw files): download them into mixamo/.
#
#   blender -b -P mixamo_soldier.py -- view OUT.png CHARACTER.fbx ANIMATION.fbx FRAME TURN
#   blender -b -P mixamo_soldier.py -- frame OUT.png CHARACTER.fbx ANIMATION.fbx FRAME REF.png I [PXM]
# NATION=germany|ussr dresses the figure: the uniform colour, the nation's helmet (see dress)
import math
import os
import sys
import tempfile

import bpy
import numpy as np
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import render  # noqa: E402
import soldier  # noqa: E402


def pose_of(rig, animation, frame):
	# The bones' local transforms at frame of an animation (an FBX of the same Mixamo skeleton)
	before = set(bpy.data.objects)
	bpy.ops.import_scene.fbx(filepath=animation)
	imported = [o for o in bpy.data.objects if o not in before]
	action = next(o for o in imported if o.type == "ARMATURE").animation_data.action
	for o in imported:
		bpy.data.objects.remove(o, do_unlink=True)
	rig.animation_data_create()
	rig.animation_data.action = action
	if hasattr(rig.animation_data, "action_slot") and action.slots:
		rig.animation_data.action_slot = action.slots[0]
	bpy.context.scene.frame_set(frame)
	bpy.context.view_layer.update()
	return {pb.name: pb.matrix_basis.copy() for pb in rig.pose.bones}


def turn_bone(rig, name, axis_world, degrees):
	# Turn a pose bone and what hangs on it by degrees about a world axis through the bone's head
	pb = rig.pose.bones["mixamorig:" + name]
	axis = (rig.matrix_world.inverted().to_3x3() @ axis_world).normalized()
	head = pb.head.copy()
	pb.matrix = Matrix.Translation(head) @ Matrix.Rotation(math.radians(degrees), 4, axis) @ Matrix.Translation(-head) @ pb.matrix
	bpy.context.view_layer.update()


def rifle_direction(rig):
	return (hand(rig, "Left") - hand(rig, "Right")).normalized()


def mean_colour(material):
	# The average linear colour of a material's base colour texture, from a small copy of it
	tex = next(l.from_node for l in material.node_tree.links if l.to_socket.name == "Base Color" and l.from_node.type == "TEX_IMAGE")
	small = tex.image.copy()
	small.scale(64, 64)
	px = np.array(small.pixels[:]).reshape(-1, 4)
	bpy.data.images.remove(small)
	rgb = px[px[:, 3] > 0.5][:, :3]
	srgb_to_linear = lambda c: np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
	return srgb_to_linear(rgb).mean(axis=0) if tex.image.colorspace_settings.name == "sRGB" else rgb.mean(axis=0)


def tinted(material, target):
	# A copy of the material whose texture is multiplied so that its average comes out as target:
	# the cloth's folds, seams and webbing stay, the colour becomes the nation's
	m = material.copy()
	nt = m.node_tree
	link = next(l for l in nt.links if l.to_socket.name == "Base Color" and l.from_node.type == "TEX_IMAGE")
	tex, bsdf = link.from_node, link.to_node
	mean = mean_colour(material)
	mix = nt.nodes.new("ShaderNodeMix")
	mix.data_type = "RGBA"
	mix.blend_type = "MULTIPLY"
	mix.inputs["Factor"].default_value = 1
	mix.inputs["B"].default_value = (*[t / max(c, 1e-4) for t, c in zip(target, mean)], 1)
	nt.links.new(tex.outputs["Color"], mix.inputs["A"])
	nt.links.new(mix.outputs["Result"], bsdf.inputs["Base Color"])
	# Matt wool, not the texture's sheen: it turned the tinted cloth into shiny plastic
	for name in ("Roughness", "Specular IOR Level"):
		for l in list(bsdf.inputs[name].links):
			nt.links.remove(l)
	bsdf.inputs["Roughness"].default_value = 0.9
	bsdf.inputs["Specular IOR Level"].default_value = 0.2
	return m


# On the Mixamo cloth the MPFB colours come out too yellow: greyer ones, from the old strips too
# (jk467's (96, 96, 72) and (120, 120, 72)), and a lighter helmet so that it shows at 1x
MIXAMO_COLOURS = {"germany": {"uniform": (0.122, 0.122, 0.077), "helmet_colour": (0.16, 0.165, 0.155)}}


def dress(rig, nation):
	# The nation's uniform colour on the jacket and the trousers, the Mixamo M1 helmet pulled in under
	# the nation's own helmet (Ch49's rest pose: the head's top at 1.786, the M1 from 1.63 up)
	n = dict(soldier.NATIONS[nation], **MIXAMO_COLOURS.get(nation, {}))
	jacket, body = bpy.data.objects["Ch49_body2"], bpy.data.objects["Ch49_body1"]
	jacket.data.materials[0] = tinted(jacket.data.materials[0], n["uniform"])
	trousers = tinted(body.data.materials[0], n["uniform"])
	body.data.materials.append(trousers)
	for poly in body.data.polygons:
		if poly.material_index == 0 and 0.48 < (body.matrix_world @ poly.center).z < 1.05:
			poly.material_index = len(body.data.materials) - 1
	inv = body.matrix_world.inverted()
	centre = Vector((0, -0.03, 1.62))
	for v in body.data.vertices:
		w = body.matrix_world @ v.co
		if w.z > 1.625:
			v.co = inv @ (centre + (w - centre) * 0.82)
	h = soldier.helmet(n["helmet"], Vector((0, -0.03, 1.715)), soldier.material("helmet", n["helmet_colour"]))
	bpy.context.view_layer.update()
	soldier.parent_to_bone(h, rig, "mixamorig:Head")


def load(character, animation, frame):
	# The character in the pose at frame of animation, taken whole: gluing the legs of one
	# animation to the arms of another broke the body (docs/ASSETS.md). The pose is then fixed on the
	# rig (no action left) and the rig hangs on a pivot at the origin, so turning the pivot turns the
	# figure about its hips
	render.reset()
	bpy.ops.import_scene.fbx(filepath=character)
	rig = next(o for o in bpy.data.objects if o.type == "ARMATURE")
	if os.environ.get("NATION"):
		dress(rig, os.environ["NATION"])
	pose = pose_of(rig, animation, frame)
	rig.animation_data.action = None
	for pb in rig.pose.bones:
		pb.matrix_basis = pose[pb.name]
	bpy.context.view_layer.update()
	# A run moves the figure forward: put its hips back over the origin, its lowest point on the ground
	hips = rig.matrix_world @ rig.pose.bones["mixamorig:Hips"].head
	rig.location.x -= hips.x
	rig.location.y -= hips.y
	bpy.context.view_layer.update()
	dg = bpy.context.evaluated_depsgraph_get()
	low = min((o.evaluated_get(dg).matrix_world @ v.co).z for o in bpy.data.objects if o.type == "MESH" for v in o.evaluated_get(dg).data.vertices)
	rig.location.z -= low
	pivot = bpy.data.objects.new("pivot", None)
	bpy.context.collection.objects.link(pivot)
	rig.parent = pivot
	bpy.context.view_layer.update()
	return rig


def hand(rig, side):
	pb = rig.pose.bones[f"mixamorig:{side}Hand"]
	return rig.matrix_world @ pb.head


def add_rifle(rig, bayonet=True):
	# The rifle runs from the right hand (on the grip, the butt 0.30 m behind it) through the left;
	# the bayonet is the bright tip the old German strips show
	right, left = hand(rig, "Right"), hand(rig, "Left")
	forward = (left - right).normalized()
	stock = right - forward * 0.30
	parts = soldier.rifle(stock, forward, soldier.material("wood", soldier.WOOD), soldier.material("metal", soldier.LEATHER))
	if bayonet:
		bpy.ops.mesh.primitive_cube_add(size=1)
		blade = bpy.context.object
		blade.name = "bayonet"
		t = soldier.EXAGGERATE["weapon"]
		blade.scale = (0.30, 0.012 * t, 0.025 * t)
		blade.location = stock + forward * (1.11 + 0.15)
		blade.rotation_euler = forward.to_track_quat("X", "Z").to_euler()
		blade.data.materials.append(soldier.material("steel", (0.75, 0.75, 0.75)))
		parts.append(blade)
	bpy.context.view_layer.update()  # or the last part's matrix_world is still the identity
	for ob in parts:
		ob["weapon"] = True
		world = ob.matrix_world.copy()
		ob.parent = rig
		ob.matrix_world = world
	return parts


def bounds(objs):
	pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
	return Vector([min(p[i] for p in pts) for i in range(3)]), Vector([max(p[i] for p in pts) for i in range(3)])


def aim_level(rig, pitch=-2.0):
	# The rifle level, a touch down at the muzzle (a few degrees of the upper chest),
	# and the figure turned so that the rifle, not the body, points the frame's way: a ready stance
	# holds it across the body, and seen from above a rifle angled away from the camera reads as
	# pointing up. Returns the turn to add to the frame's heading
	# Bow the upper chest: the shoulders, the arms and the rifle turn as one, so the angle comes out
	# exact (turning each arm about its own shoulder does not)
	f = rifle_direction(rig)
	now = math.degrees(math.asin(f.z))
	turn_bone(rig, "Spine2", f.cross(Vector((0, 0, 1))), pitch - now)
	f = rifle_direction(rig)
	flat = Vector((f.x, f.y, 0)).normalized()
	return math.degrees(math.atan2(flat.cross(Vector((0, -1, 0))).z, flat.dot(Vector((0, -1, 0)))))


def view(out, character, animation, frame, turn):
	rig = load(character, animation, frame)
	offset = aim_level(rig)
	add_rifle(rig)
	rig.parent.rotation_euler.z = math.radians(turn + offset)
	bpy.context.view_layer.update()
	lo, hi = bounds([o for o in bpy.data.objects if o.type == "MESH"])
	cam_data = bpy.data.cameras.new("cam")
	cam_data.type = "ORTHO"
	cam_data.ortho_scale = (hi.z - lo.z) * 1.3
	cam = bpy.data.objects.new("cam", cam_data)
	bpy.context.collection.objects.link(cam)
	e = math.radians(15)
	cam.location = Vector((0, 0, (lo.z + hi.z) / 2)) - Vector((0, math.cos(e), -math.sin(e))) * 30
	cam.rotation_euler = (math.pi / 2 - e, 0, 0)
	sc = bpy.context.scene
	sc.camera = cam
	sc.render.resolution_x = sc.render.resolution_y = 700
	render.lights()
	render.ground()
	render.cycles(sc, 2)
	sc.render.film_transparent = False
	sc.render.filepath = out
	bpy.ops.render.render(write_still=True)


def frame(out, character, animation, frame_no, reference, i, pxm=18.0, render_scale=8):
	# Frame I of a strip at the old strip's size and palette, the rifle drawn in its own colour
	ref = render.load_rgba(reference)
	h, w = ref.shape[:2]
	render.FRAME_W, render.FRAME_H = w // 9, h
	palette = np.unique(np.round(ref[ref[..., 3] > 0.5][:, :3] * 255), axis=0) / 255
	rig = load(character, animation, frame_no)
	offset = aim_level(rig)
	add_rifle(rig)
	rig.parent.rotation_euler.z = math.radians(i * 22.5 + offset)
	render.CENTRE = (render.FRAME_W / 2, h * 0.55)
	render.camera(22.5, pxm, render_scale)
	bpy.context.scene.camera.location.z += 0.9 - 1.2  # aim at a standing man's middle
	render.lights()
	plane = render.ground()
	sc = bpy.context.scene
	render.cycles(sc, render_scale)
	sc.render.use_freestyle = False
	sc.cycles.samples = 48
	tmp = tempfile.mkdtemp()
	paths = {k: os.path.join(tmp, f"{k}.png") for k in "stg"}
	sc.render.filepath = paths["s"]
	bpy.ops.render.render(write_still=True)
	plane.hide_render = True
	sc.render.filepath = paths["t"]
	bpy.ops.render.render(write_still=True)
	for ob in bpy.data.objects:
		if ob.type == "MESH":
			ob.is_holdout = not ob.get("weapon")
	sc.render.filepath = paths["g"]
	bpy.ops.render.render(write_still=True)
	t, s, g = (render.load_rgba(paths[k]) for k in "tsg")
	for scale in (1, 2):
		f = render.pixelate(t, s, g, palette, render_scale // scale, line="rendered")
		img = bpy.data.images.new("f", f.shape[1], f.shape[0], alpha=True)
		img.pixels = f[::-1].ravel()
		img.filepath_raw = out.replace(".png", "@2x.png") if scale == 2 else out
		img.file_format = "PNG"
		img.save()
		print("wrote", img.filepath_raw)


if __name__ == "__main__":
	a = sys.argv[sys.argv.index("--") + 1:]
	if a[0] == "view":
		view(os.path.abspath(a[1]), os.path.abspath(a[2]), os.path.abspath(a[3]), int(a[4]), float(a[5]))
	elif a[0] == "frame":
		frame(os.path.abspath(a[1]), os.path.abspath(a[2]), os.path.abspath(a[3]), int(a[4]), os.path.abspath(a[5]), int(a[6]), float(a[7]) if len(a) > 7 else 18.0)
