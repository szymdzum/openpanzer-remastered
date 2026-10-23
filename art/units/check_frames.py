# The gate between a new strip and the old one it replaces, frame by frame: the frame size, the
# outline's box and area, the line the feet or tracks end on, where the mass sits. The shadow (pure
# black) is left out. Exits 1 when a frame fails, so it can stop a script.
#
#   blender -b -P art/units/check_frames.py -- OLD.png NEW.png      both 1x strips of 9 frames
import sys

import bpy
import numpy as np

# Why these limits: the Panzer IV pilot ended with every frame's area within 5% of the old one and
# looked right next to the old units; a later version with 8-19% more area on the diagonals already
# read as bigger. A track or foot line 2 px off made the tank stand differently on its hex.
AREA_PASS, AREA_WARN = 0.10, 0.20
FOOT_PASS = 1
SHADOW = 0.03  # max channel value of the pure black shadow pixels
FOOT_ROW = 0.15


def load(path):
	img = bpy.data.images.load(path)
	w, h = img.size
	px = np.array(img.pixels[:]).reshape(h, w, 4)[::-1]
	return (px[..., 3] > 0.5) & (px[..., :3].max(axis=2) > SHADOW), w, h


def frame_stats(mask):
	ys, xs = np.nonzero(mask)
	if len(xs) == 0:
		return None
	rows = mask[ys.min():ys.max() + 1].sum(axis=1)
	height = ys.max() - ys.min() + 1
	# The foot line: the lowest row at least FOOT_ROW of the widest one, so that a gun or a bayonet
	# pointing down (a pixel or two wide) doesn't count as the ground
	solid = np.nonzero(rows >= rows.max() * FOOT_ROW)[0]
	return {
		"w": xs.max() - xs.min() + 1, "h": height, "area": int(mask.sum()), "foot": int(ys.min() + solid.max()),
		# 0 at the top of the outline, 1 at the bottom: where its widest row is
		"widest": rows.argmax() / max(height - 1, 1),
	}


def main(old_path, new_path):
	old, ow, oh = load(old_path)
	new, nw, nh = load(new_path)
	if (ow, oh) != (nw, nh):
		print(f"FAIL frame size: old strip {ow}x{oh}, new {nw}x{nh}. Render at the old size: render.FRAME_W, FRAME_H = width // 9, height")
		return 1
	fw = ow // 9
	worst = "PASS"
	print("frame  old w x h  new w x h  area new/old  foot old/new  widest old/new  verdict")
	for i in range(9):
		a, b = frame_stats(old[:, i * fw:(i + 1) * fw]), frame_stats(new[:, i * fw:(i + 1) * fw])
		if a is None or b is None:
			print(f"{i}      empty frame in the {'old' if a is None else 'new'} strip  FAIL")
			worst = "FAIL"
			continue
		ratio = b["area"] / a["area"]
		verdict = "PASS"
		if abs(ratio - 1) > AREA_WARN or abs(a["foot"] - b["foot"]) > FOOT_PASS:
			verdict = "FAIL"
		elif abs(ratio - 1) > AREA_PASS:
			verdict = "WARN"
		if verdict == "FAIL" or (verdict == "WARN" and worst == "PASS"):
			worst = verdict
		print(f"{i}      {a['w']:2d} x {a['h']:2d}    {b['w']:2d} x {b['h']:2d}    {ratio:5.2f}         {a['foot']:2d} / {b['foot']:2d}       {a['widest']:.2f} / {b['widest']:.2f}      {verdict}")
	print(f"\n{worst}: area within {AREA_PASS:.0%} passes, within {AREA_WARN:.0%} warns; the foot line within {FOOT_PASS} px.")
	print("widest: where the outline's widest row is (0 top, 1 bottom). The old units are heaviest at the bottom;")
	print("a new one widest near the top looks top-heavy even at the same area.")
	return 1 if worst == "FAIL" else 0


if __name__ == "__main__":
	args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
	if len(args) != 2:
		print("usage: blender -b -P art/units/check_frames.py -- OLD.png NEW.png")
		sys.exit(2)
	sys.exit(main(*args))
