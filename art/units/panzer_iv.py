# Pz.Kpfw. IV Ausf. H with its Schürzen, after the side drawing File:Panzer_IV_G.svg (Wikimedia
# Commons, scaled to the 5.89 m hull, the L/48 gun of the H added) and photographs of the H
# (Bundesarchiv Bild 101I-298-1759-25, the Thun and El Goloso museum vehicles).
#
# Lengths are measured from the nose backwards (d), heights from the ground (z), half widths (y),
# all in metres. The model has X forward, Y left, Z up, its origin under the middle of the hull.
import math
import bpy
import bmesh

HULL = 5.89
TRACK_Y, TRACK_W = 1.24, 0.40       # the track centres; 2.88 m over the tracks
FENDER_Y = 1.44
LOWER_Y = 0.98                      # the lower hull between the tracks
SUPER_Y = 1.13                      # the superstructure overhangs the tracks a little
SUPER_Z, ENGINE_Z = 1.66, 1.62
FRONT_PLATE = 0.80                  # the superstructure front plate, behind the nose
TURRET_D = (2.13, 3.99)             # the turret front plate and rear wall
TURRET_Z = (1.70, 2.32)
TURRET_Y = 0.93                     # half width at the base, behind the front cheeks
TURRET_OFF = 0.066                  # the turret sits that far left of the centre line
BUSTLE_D, BUSTLE_Y = 4.60, 0.70     # the stowage bin on the turret rear
GUN_Z = 1.97
MUZZLE_D = -1.13                    # the L/48 muzzle, ahead of the nose
WHEELS_D = (1.07, 1.58, 2.08, 2.59, 3.09, 3.61, 4.11, 4.62)  # four bogies of two
WHEEL_R = 0.235
ROLLERS_D = (1.46, 2.39, 3.41, 4.43)
SPROCKET = (0.56, 0.66, 0.36)       # d, z, r
IDLER = (5.45, 0.55, 0.30)
SKIRT_Y, SKIRT_Z, SKIRT_D = 1.62, (0.60, 1.68), (0.95, 5.45)
TURRET_SKIRT_Y, TURRET_SKIRT_D = 1.33, (2.05, 4.85)


def X(d):
	return HULL / 2 - d


def mesh_object(name, verts, faces, mat):
	me = bpy.data.meshes.new(name)
	me.from_pydata(verts, [], faces)
	me.update()
	ob = bpy.data.objects.new(name, me)
	ob.data.materials.append(mat)
	bpy.context.collection.objects.link(ob)
	bm = bmesh.new()
	bm.from_mesh(me)
	bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
	bm.to_mesh(me)
	bm.free()
	return ob


def box(name, d, y, z, mat):
	(d0, d1), (y0, y1), (z0, z1) = d, y, z
	x0, x1 = X(d1), X(d0)
	v = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
		(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
	f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
	return mesh_object(name, v, f, mat)


def side_prism(name, profile, y0, y1, mat):
	# A side profile [(d, z)...] extruded across from y0 to y1
	n = len(profile)
	v = [(X(d), y0, z) for d, z in profile] + [(X(d), y1, z) for d, z in profile]
	f = [tuple(range(n)), tuple(range(n, 2 * n))]
	f += [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
	return mesh_object(name, v, f, mat)


def plan_prism(name, outline, z0, z1, mat, inset=0.0):
	# A plan outline [(d, y)...] from z0 up to z1, shrunk by inset at the top (sloped sides)
	n = len(outline)
	cd = sum(d for d, _ in outline) / n
	cy = sum(y for _, y in outline) / n
	def shrink(d, y):
		dd, dy = d - cd, y - cy
		l = math.hypot(dd, dy) or 1
		return d - dd / l * inset, y - dy / l * inset
	v = [(X(d), y, z0) for d, y in outline] + [(X(sd), sy, z1) for sd, sy in (shrink(d, y) for d, y in outline)]
	f = [tuple(range(n)), tuple(range(n, 2 * n))]
	f += [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
	return mesh_object(name, v, f, mat)


def plate(name, a, b, z0, z1, mat, t=0.012):
	# A thin vertical plate along the plan segment a-b
	(da, ya), (db, yb) = a, b
	nd, ny = -(yb - ya), (db - da)
	l = math.hypot(nd, ny)
	nd, ny = nd / l * t, ny / l * t
	return plan_prism(name, [(da, ya), (db, yb), (db + nd, yb + ny), (da + nd, ya + ny)], z0, z1, mat)


def cylinder(name, r, length, centre, axis, mat, verts=16):
	d, y, z = centre
	bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=length, location=(X(d), y, z))
	ob = bpy.context.object
	ob.name = name
	if axis == "x":
		ob.rotation_euler = (0, math.pi / 2, 0)
	elif axis == "y":
		ob.rotation_euler = (math.pi / 2, 0, 0)
	ob.data.materials.append(mat)
	return ob


def bevel(ob, width):
	m = ob.modifiers.new("bevel", "BEVEL")
	m.width = width
	m.segments = 1
	m.limit_method = "ANGLE"


def circle(cd, cz, r, n=28):
	return [(cd + r * math.cos(2 * math.pi * i / n), cz + r * math.sin(2 * math.pi * i / n)) for i in range(n)]


def convex_hull(points):
	pts = sorted(set(points))
	def cross(o, a, b):
		return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
	lower, upper = [], []
	for p in pts:
		while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
			lower.pop()
		lower.append(p)
	for p in reversed(pts):
		while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
			upper.pop()
		upper.append(p)
	return lower[:-1] + upper[:-1]


def cross_marking(name, d, y, z, side, size, m):
	# A Balkenkreuz on a plate facing +Y (side 1) or -Y (side -1): black arms with white edges
	obs = []
	for layer, (mat, arm, thick) in enumerate(((m["white"], size, size * 0.42), (m["black"], size * 0.86, size * 0.2))):
		yy = y + side * (0.012 + 0.004 * layer)
		obs.append(box(f"{name}_{layer}_h", (d - arm / 2, d + arm / 2), (yy - 0.003, yy + 0.003), (z - thick / 2, z + thick / 2), mat))
		obs.append(box(f"{name}_{layer}_v", (d - thick / 2, d + thick / 2), (yy - 0.003, yy + 0.003), (z - arm / 2, z + arm / 2), mat))
	return obs


def hull(m):
	parts = []
	# The lower hull: the sloped nose plate, the belly, the rear plate under the engine
	parts.append(side_prism("lower_hull", [
		(0.0, 0.80), (0.30, 1.20), (5.62, 1.20), (5.89, 0.92), (5.75, 0.55), (5.30, 0.42), (0.55, 0.42), (0.10, 0.55)],
		-LOWER_Y, LOWER_Y, m["paint"]))
	# The fenders over the tracks, bent down at both ends
	for s in (-1, 1):
		y0, y1 = sorted((s * (LOWER_Y - 0.02), s * FENDER_Y))
		parts.append(side_prism(f"fender_{s}", [(0.05, 1.05), (0.30, 1.17), (5.62, 1.17), (5.80, 1.05), (5.80, 1.09), (5.62, 1.21), (0.30, 1.21), (0.05, 1.09)], y0, y1, m["paint"]))
	# The superstructure and the engine deck, one long box with a slightly lower rear
	parts.append(side_prism("superstructure", [
		(FRONT_PLATE, 1.20), (5.52, 1.20), (5.38, ENGINE_Z), (4.20, ENGINE_Z), (4.05, SUPER_Z), (FRONT_PLATE + 0.06, SUPER_Z), (FRONT_PLATE, SUPER_Z - 0.06)],
		-SUPER_Y, SUPER_Y, m["paint"]))
	# The glacis between the nose and the front plate
	parts.append(side_prism("glacis", [(0.30, 1.20), (FRONT_PLATE, 1.20), (FRONT_PLATE, 1.30)], -LOWER_Y, LOWER_Y, m["paint"]))
	# The driver's visor and the hull machine gun ball on the front plate
	parts.append(box("visor", (FRONT_PLATE - 0.06, FRONT_PLATE), (0.25, 0.65), (1.40, 1.55), m["paint"]))
	parts.append(box("visor_slit", (FRONT_PLATE - 0.07, FRONT_PLATE - 0.05), (0.30, 0.60), (1.46, 1.49), m["black"]))
	parts.append(cylinder("mg_ball", 0.13, 0.12, (FRONT_PLATE - 0.04, -0.55, 1.45), "x", m["paint"], 14))
	parts.append(cylinder("mg", 0.022, 0.30, (FRONT_PLATE - 0.22, -0.55, 1.45), "x", m["black"], 8))
	# Spare track links on the nose, the headlight
	for i in range(7):
		parts.append(box(f"spare_link_{i}", (0.18, 0.32), (-0.85 + i * 0.25, -0.85 + i * 0.25 + 0.2), (1.02, 1.22), m["track"]))
	parts.append(cylinder("headlight", 0.08, 0.14, (0.55, -0.75, 1.30), "x", m["paint"], 10))
	# The engine deck hatches, the exhaust mufflers on the rear plate, the antenna
	parts.append(box("hatch_l", (4.45, 5.25), (0.10, 0.85), (ENGINE_Z - 0.02, ENGINE_Z + 0.03), m["paint"]))
	parts.append(box("hatch_r", (4.45, 5.25), (-0.85, -0.10), (ENGINE_Z - 0.02, ENGINE_Z + 0.03), m["paint"]))
	parts.append(cylinder("muffler", 0.12, 0.80, (5.70, -0.40, 1.19), "y", m["rust"], 14))
	parts.append(cylinder("aux_muffler", 0.06, 0.45, (5.80, 0.45, 1.02), "y", m["rust"], 10))
	parts.append(cylinder("antenna", 0.012, 1.2, (5.30, -1.0, ENGINE_Z + 0.6), "z", m["black"], 6))
	return parts


def turret(m):
	parts = []
	o = TURRET_OFF
	d0, d1 = TURRET_D
	z0, z1 = TURRET_Z
	# The turret in plan: the narrow front plate, the angled cheeks, the straight sides, all sloped
	outline = [(d0, o - 0.62), (d0 + 0.45, o - TURRET_Y), (d1, o - TURRET_Y + 0.05), (d1, o + TURRET_Y - 0.05), (d0 + 0.45, o + TURRET_Y), (d0, o + 0.62)]
	parts.append(plan_prism("turret", outline, z0, z1, m["paint"], inset=0.2))
	# The roof's sloped front over the mantlet
	parts.append(side_prism("turret_brow", [(d0, z1 - 0.22), (d0 + 0.45, z1), (d0 + 0.45, z1 - 0.22)], o - 0.55, o + 0.55, m["paint"]))
	# The stowage bin on the rear, a little narrower and raised
	parts.append(box("bustle", (d1 - 0.05, BUSTLE_D), (o - BUSTLE_Y, o + BUSTLE_Y), (z0 + 0.05, z1 - 0.03), m["paint"]))
	# The commander's cupola at the back, its open hatch lid and the roof vent
	parts.append(cylinder("cupola", 0.38, 0.26, (3.53, o + 0.30, z1 + 0.13), "z", m["paint"], 24))
	parts.append(cylinder("cupola_lid", 0.30, 0.04, (3.53, o + 0.30, z1 + 0.28), "z", m["paint"], 24))
	parts.append(box("roof_vent", (2.70, 2.95), (o - 0.35, o - 0.10), (z1, z1 + 0.10), m["paint"]))
	# The mantlet, the coaxial machine gun, and the long 7.5 cm KwK 40 L/48: collar, sleeve, barrel, muzzle brake
	parts.append(box("mantlet", (1.95, d0 + 0.05), (o - 0.36, o + 0.36), (GUN_Z - 0.24, GUN_Z + 0.20), m["paint"]))
	parts.append(cylinder("gun_collar", 0.15, 0.40, (1.75, o, GUN_Z), "x", m["paint"], 16))
	parts.append(cylinder("gun_sleeve", 0.11, 0.50, (1.30, o, GUN_Z), "x", m["paint"], 16))
	barrel = 1.05 - (MUZZLE_D + 0.32)
	parts.append(cylinder("gun", 0.068, barrel, (1.05 - barrel / 2, o, GUN_Z), "x", m["paint"], 14))
	parts.append(cylinder("muzzle_brake", 0.13, 0.32, (MUZZLE_D + 0.16, o, GUN_Z), "x", m["paint"], 16))
	parts.append(cylinder("coax", 0.025, 0.25, (1.85, o + 0.25, GUN_Z + 0.05), "x", m["black"], 8))
	return parts


def skirts(m):
	parts = []
	o = TURRET_OFF
	# Hull Schürzen: six plates a side, hung from a rail away from the hull; the front one angled in
	sd0, sd1 = SKIRT_D
	width = (sd1 - sd0) / 6
	for s in (-1, 1):
		for i in range(6):
			y = s * (SKIRT_Y + (0.012 if i % 2 else 0))
			parts.append(plate(f"skirt_{s}_{i}", (sd0 + i * width - 0.02, y), (sd0 + (i + 1) * width + 0.02, y), *SKIRT_Z, m["paint"]))
		parts.append(plate(f"skirt_front_{s}", (sd0 - 0.32, s * (SKIRT_Y - 0.24)), (sd0, s * SKIRT_Y), *SKIRT_Z, m["paint"]))
		parts.append(box(f"skirt_rail_{s}", (sd0, sd1), sorted((s * (SKIRT_Y - 0.05), s * SKIRT_Y)), (SKIRT_Z[1] - 0.03, SKIRT_Z[1] + 0.01), m["paint"]))
	# Turret Schürzen: a box round the turret and its bin, open in front, the front corners angled in
	td0, td1 = TURRET_SKIRT_D
	tz0, tz1 = TURRET_Z[0] + 0.02, TURRET_Z[1] + 0.02
	ty = TURRET_SKIRT_Y
	ring = [(td0, o - 0.62), (td0 + 0.35, o - ty), (td1 - 0.25, o - ty), (td1, o - ty + 0.25), (td1, o + ty - 0.25), (td1 - 0.25, o + ty), (td0 + 0.35, o + ty), (td0, o + 0.62)]
	for i in range(len(ring) - 1):
		parts.append(plate(f"turret_skirt_{i}", ring[i], ring[i + 1], tz0, tz1, m["paint"]))
	return parts


def track_band(name, profile, y0, y1, mat, thickness=0.075):
	# The track as a band round the wheels, open on its sides: the wheels show through the loop
	n = len(profile)
	v = [(X(d), y0, z) for d, z in profile] + [(X(d), y1, z) for d, z in profile]
	f = [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
	ob = mesh_object(name, v, f, mat)
	sol = ob.modifiers.new("solidify", "SOLIDIFY")
	sol.thickness = thickness
	sol.offset = -1
	sol.use_even_offset = True
	return ob


def running_gear(m):
	parts = []
	pts = []
	for d in WHEELS_D:
		pts += circle(d, WHEEL_R + 0.075, WHEEL_R + 0.075)
	pts += circle(SPROCKET[0], SPROCKET[1], SPROCKET[2] + 0.06)
	pts += circle(IDLER[0], IDLER[1], IDLER[2] + 0.07)
	pts += [(d, 1.08) for d in ROLLERS_D]
	outer = convex_hull(pts)
	for s in (-1, 1):
		yc = s * TRACK_Y
		parts.append(track_band(f"track_{s}", outer, yc - TRACK_W / 2, yc + TRACK_W / 2, m["track"]))
		for i, d in enumerate(WHEELS_D):
			parts.append(cylinder(f"wheel_{s}_{i}", WHEEL_R, TRACK_W * 0.9, (d, yc, WHEEL_R + 0.075), "y", m["paint"], 18))
			parts.append(cylinder(f"tyre_{s}_{i}", WHEEL_R + 0.005, TRACK_W * 0.86, (d, yc, WHEEL_R + 0.075), "y", m["rubber"], 18))
			parts.append(cylinder(f"hub_{s}_{i}", 0.09, TRACK_W * 0.96, (d, yc, WHEEL_R + 0.075), "y", m["paint"], 10))
		for i, d in enumerate(ROLLERS_D):
			parts.append(cylinder(f"roller_{s}_{i}", 0.11, 0.18, (d, s * (TRACK_Y + 0.05), 0.92), "y", m["paint"], 12))
		parts.append(cylinder(f"sprocket_{s}", SPROCKET[2], TRACK_W + 0.04, (SPROCKET[0], yc, SPROCKET[1]), "y", m["paint"], 20))
		parts.append(cylinder(f"sprocket_hub_{s}", 0.16, TRACK_W + 0.14, (SPROCKET[0], yc, SPROCKET[1]), "y", m["paint"], 12))
		parts.append(cylinder(f"idler_{s}", IDLER[2], TRACK_W + 0.04, (IDLER[0], yc, IDLER[1]), "y", m["paint"], 20))
	return parts


def build(m):
	parts = hull(m) + turret(m) + skirts(m) + running_gear(m)
	# Balkenkreuze on the hull skirts and on the turret skirts
	for s in (-1, 1):
		parts += cross_marking(f"cross_skirt_{s}", 3.10, s * (SKIRT_Y + 0.012), 1.18, s, 0.55, m)
		parts += cross_marking(f"cross_turret_{s}", 4.25, s * TURRET_SKIRT_Y + TURRET_OFF, (TURRET_Z[0] + TURRET_Z[1]) / 2 + 0.02, s, 0.36, m)
	for ob in parts:
		if ob.name in ("lower_hull", "superstructure", "turret", "bustle", "mantlet", "glacis"):
			bevel(ob, 0.02)
	root = bpy.data.objects.new("panzer_iv", None)
	bpy.context.collection.objects.link(root)
	for ob in parts:
		ob.parent = root
	return root
