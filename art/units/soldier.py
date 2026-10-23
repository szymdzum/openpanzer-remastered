# One infantryman: an MPFB 2 human (CC0 base mesh, its "game_engine" rig), posed by script, with
# the parts that tell the nation built here: the helmet, the weapon, the colours. The pose is set
# by where the hands, knees and feet go; the bones are turned to reach them.
#
#   blender -b -P soldier.py -- view OUT.png NATION            a large smooth render, for checking the pose
#   blender -b -P soldier.py -- frame OUT.png NATION REF.png I   frame I of a pixel strip (1x and @2x)
import math
import os
import sys
import tempfile

import addon_utils
import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import render  # noqa: E402

# Linear RGB, taken from the old strips' own colours (jk467, le126) rather than from colour charts:
# they are darker and warmer than the real cloth, and the new figures stand next to the old ones
NATIONS = {
	"germany": {
		"uniform": (0.127, 0.107, 0.048),  # a brownish field grey
		"helmet_colour": (0.10, 0.107, 0.098),
		"helmet": "stahlhelm",
	},
	"ussr": {
		"uniform": (0.20, 0.15, 0.05),  # the khaki gymnastyorka
		"helmet_colour": (0.061, 0.09, 0.032),
		"helmet": "ssh40",
	},
}
# A stocky build: the old figures are broad, in thick uniforms, with big heads
BUILD = {"weight": 0.85, "muscle": 0.75}
HEAD_SCALE = 1.1  # with the helmet on it: about 7 px wide at 1x, the old figures' 5-6
CLOTH = 0.03  # the uniform puffs the body out this much: thick sleeves and trousers
SKIN = (0.55, 0.36, 0.26)
LEATHER = (0.03, 0.025, 0.02)
WOOD = (0.30, 0.16, 0.065)
# The helmet and the weapon are what tell the units apart at 25 px: larger than real
EXAGGERATE = {"helmet": 1.0, "weapon": 1.25}  # the head is already HEAD_SCALE larger


def enable_mpfb():
	addon_utils.enable("bl_ext.user_default.mpfb", default_set=True)


def material(name, colour):
	m = bpy.data.materials.new(name)
	m.use_nodes = True
	bsdf = m.node_tree.nodes["Principled BSDF"]
	bsdf.inputs["Base Color"].default_value = (*colour, 1)
	bsdf.inputs["Roughness"].default_value = 0.9
	return m


def make_human(nation):
	from bl_ext.user_default.mpfb.services.humanservice import HumanService
	from bl_ext.user_default.mpfb.services.targetservice import TargetService
	macro = TargetService.get_default_macro_info_dict()
	macro.update(BUILD)
	body = HumanService.create_human(scale=0.1, macro_detail_dict=macro)
	rig = HumanService.add_builtin_rig(body, "game_engine")
	# The colours by where the faces are in the rest pose (an A pose, facing -Y): skin on the head
	# and the hands, leather boots, the uniform elsewhere
	body.data.materials.clear()
	for m in (material("uniform", NATIONS[nation]["uniform"]), material("skin", SKIN), material("boots", LEATHER)):
		body.data.materials.append(m)
	for poly in body.data.polygons:
		c = poly.center
		poly.material_index = 1 if c.z > 1.45 or abs(c.x) > 0.47 else 2 if c.z < 0.36 else 0
	# Only the clothes puff out: the head stays its size under the helmet
	cloth = body.vertex_groups.new(name="cloth")
	cloth.add([v.index for v in body.data.vertices if 0.36 <= v.co.z <= 1.42 and abs(v.co.x) <= 0.47], 1.0, "REPLACE")
	puff = body.modifiers.new("cloth", "DISPLACE")
	puff.strength = CLOTH
	puff.mid_level = 0
	puff.vertex_group = "cloth"
	return body, rig


# Directions in the figure's own terms: forward, left, up. At rest the figure faces -Y, its left is +X
F, L, U = Vector((0, -1, 0)), Vector((1, 0, 0)), Vector((0, 0, 1))


def d(f, l, u):
	return (F * f + L * l + U * u).normalized()


def aim(rig, name, direction, twist=0.0):
	# Turn a bone, in place, so that it points along direction (armature space), then turn it
	# twist degrees about itself (the torso turned sideways to the target)
	pb = rig.pose.bones[name]
	rest = pb.bone.matrix_local
	turn = rest.col[1].xyz.normalized().rotation_difference(direction)
	rot = turn.to_matrix() @ rest.to_3x3()
	if twist:
		rot = Matrix.Rotation(math.radians(twist), 3, direction) @ rot
	pb.matrix = Matrix.Translation(pb.head) @ rot.to_4x4()
	bpy.context.view_layer.update()


def reach(rig, upper, lower, target, pole):
	# Two bones from the upper's head to target, the joint bent towards pole
	a = rig.pose.bones[upper].head.copy()
	l1, l2 = rig.pose.bones[upper].bone.length, rig.pose.bones[lower].bone.length
	to = target - a
	dist = min(to.length, (l1 + l2) * 0.999)
	axis = to.normalized()
	along = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist)
	up = (pole - axis * pole.dot(axis)).normalized()
	joint = a + axis * along + up * math.sqrt(max(l1 * l1 - along * along, 0))
	aim(rig, upper, (joint - a).normalized())
	aim(rig, lower, (a + axis * dist - joint).normalized())


def pose_kneel_aim(rig):
	# Low on the right knee, sitting back on the heel, the toes tucked, the left foot forward; the
	# torso turned a quarter to the right and leaning well in (the old figures' compact crouch); the butt in the right shoulder pocket at cheek height, the head tilted
	# to the stock, both hands on the rifle, the right elbow up
	for b in ("spine_01", "spine_02", "spine_03"):
		aim(rig, b, d(0.6, -0.04, 1), twist=-25 / 3)
	aim(rig, "neck_01", d(0.25, -0.08, 1))
	aim(rig, "head", d(0.08, -0.20, 1))
	aim(rig, "thigh_l", d(1, 0.12, 0.1))
	aim(rig, "calf_l", d(0.08, 0, -1))
	aim(rig, "foot_l", d(1, 0, -0.05))
	aim(rig, "thigh_r", d(0.55, -0.06, -1))
	aim(rig, "calf_r", d(-1, 0, 0.1))
	aim(rig, "foot_r", d(-0.25, 0, -1))
	shoulder = rig.pose.bones["upperarm_r"].head
	stock = shoulder + F * 0.04 + L * 0.05 + U * 0.07
	grip = stock + F * 0.30 - U * 0.02
	fore = stock + F * 0.48 - U * 0.04
	reach(rig, "upperarm_r", "lowerarm_r", grip, -L + U * 0.4)
	reach(rig, "upperarm_l", "lowerarm_l", fore, -U + L * 0.2)
	return stock, F


def revolve(name, profile, centre, mat, segments=28, depth=1.12, front_lift=None, front_pull=None):
	# A surface of revolution round the vertical through centre; profile [(r, z)...] from the top.
	# depth stretches it front to back; front_lift(i, fwd) raises a ring's point (fwd is 1 at the
	# front, -1 at the back), front_pull(i, fwd) scales its radius
	bm = bmesh.new()
	rings = []
	for i, (r, z) in enumerate(profile):
		ring = []
		for k in range(segments if r > 0 else 1):
			a = 2 * math.pi * k / segments
			fwd = -math.cos(a)  # 1 at the front (-Y)
			lift = front_lift(i, fwd) if front_lift else 0
			rr = r * (front_pull(i, fwd) if front_pull else 1)
			ring.append(bm.verts.new((centre.x + rr * math.sin(a), centre.y + rr * math.cos(a) * depth, centre.z + z + lift)))
		rings.append(ring)
	for i in range(len(rings) - 1):
		a, b = rings[i], rings[i + 1]
		if len(a) == 1:
			for k in range(segments):
				bm.faces.new((a[0], b[k], b[(k + 1) % segments]))
		else:
			for k in range(segments):
				bm.faces.new((a[k], b[k], b[(k + 1) % segments], a[(k + 1) % segments]))
	bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
	me = bpy.data.meshes.new(name)
	bm.to_mesh(me)
	bm.free()
	ob = bpy.data.objects.new(name, me)
	ob.data.materials.append(mat)
	bpy.context.collection.objects.link(ob)
	sol = ob.modifiers.new("solidify", "SOLIDIFY")
	sol.thickness = 0.01
	return ob


def helmet(kind, head_top, mat):
	s = EXAGGERATE["helmet"]
	if kind == "stahlhelm":
		# The M35: a deep dome, a step, then a nearly upright skirt flared 20-30 degrees over the
		# ears; the visor short and pulled in at the front, the neck guard hanging lower at the back
		# The flatter top and the wide edge dropped at the back are what tell it from the SSh-40 at
		# 1x: the flare shows as a pixel or two behind the head. The visor stays high off the face
		profile = [(0, 0.09), (0.06, 0.087), (0.10, 0.07), (0.118, 0.04), (0.123, 0.0), (0.125, -0.03), (0.133, -0.038), (0.140, -0.07), (0.165, -0.105)]
		def lift(i, fwd):
			return 0.05 * max(fwd, 0) - 0.04 * max(-fwd, 0) if i >= 6 else 0
		def pull(i, fwd):
			return 1 - 0.10 * max(fwd, 0) if i >= 6 else 1
		depth = 1.18
	else:
		# The SSh-40: a rounder, higher bowl, a small even rim
		profile = [(r * 0.9, z * 0.9) for r, z in ((0, 0.12), (0.06, 0.115), (0.10, 0.095), (0.125, 0.06), (0.135, 0.015), (0.138, -0.02), (0.148, -0.03))]
		def lift(i, fwd):
			return -0.015 * max(-fwd, 0) if i >= 5 else 0  # the back down over the nape
		pull = None
		depth = 1.12
	profile = [(r * s, z * s) for r, z in profile]
	return revolve(f"helmet_{kind}", profile, head_top, mat, depth=depth, front_lift=lift, front_pull=pull)


def rifle(stock, forward, mat_wood, mat_metal):
	# A Kar98k-sized rifle (1.11 m) along forward from the butt at the shoulder
	t = EXAGGERATE["weapon"]
	length = 1.11
	parts = []
	for name, (a, b), size, mat in (
			("stock", (-0.05, 0.40), (0.045, 0.075), mat_wood),
			("fore", (0.40, 0.80), (0.035, 0.045), mat_wood),
			("barrel", (0.80, length), (0.018, 0.018), mat_metal)):
		bpy.ops.mesh.primitive_cube_add(size=1)
		ob = bpy.context.object
		ob.name = name
		ob.scale = ((b - a), size[0] * t, size[1] * t)
		mid = stock + forward * ((a + b) / 2)
		ob.location = mid
		ob.rotation_euler = forward.to_track_quat("X", "Z").to_euler()
		ob.data.materials.append(mat)
		parts.append(ob)
	return parts


def head_top(body):
	vs = [v.co for v in body.data.vertices if v.co.z > 1.5 and abs(v.co.x) < 0.15]
	top = max(v.z for v in vs)
	# The middle of the head's extent: an average of its vertices sits forward, pulled by the face
	cx = (min(v.x for v in vs) + max(v.x for v in vs)) / 2
	cy = (min(v.y for v in vs) + max(v.y for v in vs)) / 2
	return Vector((cx, cy, top - 0.085))


def boots(rig, mat):
	# A boot over each foot: the MakeHuman toes read as bare feet. Built on the rest pose's foot
	# bones (their Y runs from the ankle to the toes), parented to them
	obs = []
	for side in ("l", "r"):
		bone = rig.data.bones[f"foot_{side}"]  # the box runs from 0.04 behind the ankle to the toes
		bpy.ops.mesh.primitive_cube_add(size=1)
		ob = bpy.context.object
		ob.name = f"boot_{side}"
		ob.data.materials.append(mat)
		ob.matrix_world = rig.matrix_world @ bone.matrix_local @ Matrix.Translation((0, 0.08, -0.03)) @ Matrix.Diagonal((0.085, 0.24, 0.065, 1))
		bev = ob.modifiers.new("bevel", "BEVEL")
		bev.width = 0.02
		bev.segments = 2
		parent_to_bone(ob, rig, f"foot_{side}")
		obs.append(ob)
	return obs


def parent_to_bone(ob, rig, bone):
	world = ob.matrix_world.copy()
	ob.parent = rig
	ob.parent_type = "BONE"
	ob.parent_bone = bone
	ob.matrix_world = world


def build(nation):
	n = NATIONS[nation]
	body, rig = make_human(nation)
	hm = material("helmet", n["helmet_colour"])
	h = helmet(n["helmet"], head_top(body), hm)
	bpy.context.view_layer.update()
	parent_to_bone(h, rig, "head")
	boots(rig, body.data.materials[2])
	stock, forward = pose_kneel_aim(rig)
	rig.pose.bones["head"].scale = (HEAD_SCALE,) * 3
	gun = rifle(stock, forward, material("wood", WOOD), material("metal", LEATHER))
	for ob in gun:
		ob["weapon"] = True
		ob.parent = rig
		ob.matrix_parent_inverse = rig.matrix_world.inverted()
	# Stand it on the ground: the lowest point of the posed body at z = 0
	bpy.context.view_layer.update()
	dg = bpy.context.evaluated_depsgraph_get()
	ev = body.evaluated_get(dg)
	low = min((ev.matrix_world @ v.co).z for v in ev.data.vertices)
	rig.location.z -= low
	bpy.context.view_layer.update()
	return rig, body


def view(out, nation):
	render.reset()
	enable_mpfb()
	rig, _ = build(nation)
	rig.rotation_euler = (0, 0, math.radians(90 - 20))
	cam_data = bpy.data.cameras.new("cam")
	cam_data.type = "ORTHO"
	cam_data.ortho_scale = 2.2
	cam = bpy.data.objects.new("cam", cam_data)
	bpy.context.collection.objects.link(cam)
	e = math.radians(15)
	cam.location = Vector((0, 0, 0.6)) - Vector((0, math.cos(e), -math.sin(e))) * 30
	cam.rotation_euler = (math.pi / 2 - e, 0, 0)
	sc = bpy.context.scene
	sc.camera = cam
	sc.render.resolution_x, sc.render.resolution_y = 700, 700
	render.lights()
	render.ground()
	render.cycles(sc, 2)
	sc.render.film_transparent = False
	sc.render.filepath = out
	bpy.ops.render.render(write_still=True)


def frame(out, nation, reference, i, pxm=21.0, render_scale=8):
	# One frame of a strip at the old strip's size, in its palette, the weapon drawn as a dark line
	ref = render.load_rgba(reference)
	h, w = ref.shape[:2]
	render.FRAME_W, render.FRAME_H = w // 9, h
	opaque = ref[..., 3] > 0.5
	palette = np.unique(np.round(ref[opaque][:, :3] * 255), axis=0) / 255
	render.reset()
	enable_mpfb()
	rig, _ = build(nation)
	rig.rotation_euler = (0, 0, math.radians(i * 22.5))
	render.CENTRE = (render.FRAME_W / 2, h * 0.62)
	render.camera(22.5, pxm, render_scale)
	cam = bpy.context.scene.camera
	cam.location.z += 0.6 - 1.2  # aim at a kneeling man's middle, not a tank's
	render.lights()
	plane = render.ground()
	sc = bpy.context.scene
	render.cycles(sc, render_scale)
	sc.render.use_freestyle = False
	sc.cycles.samples = 48
	paths = {k: os.path.join(tempfile.mkdtemp(), f"{k}.png") for k in "stg"}
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
	args = sys.argv[sys.argv.index("--") + 1:]
	if args[0] == "view":
		view(os.path.abspath(args[1]), args[2])
	elif args[0] == "frame":
		frame(os.path.abspath(args[1]), args[2], os.path.abspath(args[3]), int(args[4]))
