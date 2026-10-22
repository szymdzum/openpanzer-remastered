# Measure a PG2 unit strip: the box, the centre and the main colours of each of its 9 frames.
# blender -b -P measure.py -- path/to/strip.png
import sys
import bpy
import numpy as np

path = sys.argv[sys.argv.index("--") + 1]
img = bpy.data.images.load(path)
w, h = img.size
px = np.array(img.pixels[:]).reshape(h, w, 4)[::-1]  # top row first
fw = w // 9
for i in range(9):
	f = px[:, i*fw:(i+1)*fw]
	a = f[..., 3] > 0.5
	ys, xs = np.nonzero(a)
	if len(xs) == 0:
		print(i, "empty")
		continue
	print(f"frame {i}: x {xs.min()}-{xs.max()} ({xs.max()-xs.min()+1}) y {ys.min()}-{ys.max()} ({ys.max()-ys.min()+1}) centre {xs.mean():.1f},{ys.mean():.1f}")
rgb = (px[..., :3][px[..., 3] > 0.5] * 255).astype(int) // 16 * 16
cols, n = np.unique(rgb, axis=0, return_counts=True)
order = np.argsort(-n)[:12]
print("colours:", [(tuple(cols[j]), int(n[j])) for j in order])
