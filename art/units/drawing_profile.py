# The outline of a side drawing, to measure a model from: every STEP pixels across, the runs of
# solid pixels in that column (top-bottom). Scale them with one known length; the lowest solid
# row is the ground. A transparent PNG (a Commons SVG rendered with ?width=) works best; on an
# opaque image, pixels darker than LIGHT count as solid.
#
#   blender -b -P art/units/drawing_profile.py -- ref.png [STEP]
import sys

import bpy
import numpy as np

LIGHT = 0.9


def main(path, step=20):
	img = bpy.data.images.load(path)
	w, h = img.size
	px = np.array(img.pixels[:]).reshape(h, w, 4)[::-1]
	opaque = (px[..., 3] > 0.5).mean() > 0.95
	solid = px[..., :3].max(axis=2) < LIGHT if opaque else px[..., 3] > 0.5
	cols = np.nonzero(solid.any(axis=0))[0]
	rows = np.nonzero(solid.any(axis=1))[0]
	if len(cols) == 0:
		print("Nothing solid found: is the drawing on a transparent or white background?")
		return 1
	print(f"size {w}x{h}, drawing x {cols.min()}-{cols.max()}, y {rows.min()}-{rows.max()} (ground row {rows.max()})")
	for x in range(cols.min(), cols.max() + 1, step):
		ys = np.nonzero(solid[:, x])[0]
		if len(ys) == 0:
			continue
		runs, start, prev = [], ys[0], ys[0]
		for y in ys[1:]:
			if y != prev + 1:
				runs.append((start, prev))
				start = y
			prev = y
		runs.append((start, prev))
		print(x, " ".join(f"{a}-{b}" for a, b in runs))
	return 0


if __name__ == "__main__":
	args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
	if not args:
		print("usage: blender -b -P art/units/drawing_profile.py -- ref.png [STEP]")
		sys.exit(2)
	sys.exit(main(args[0], int(args[1]) if len(args) > 1 else 20))
