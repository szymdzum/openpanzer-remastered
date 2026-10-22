# The old and the new strip on a piece of a real map, both at 2x: the old one scaled up nearest,
# like the game without @2x files. blender -b -P mockup.py -- MAP.png OLD.png NEW@2x.png OUT.png
import sys
import bpy
import numpy as np

a = sys.argv[sys.argv.index("--") + 1:]

def load(p):
	img = bpy.data.images.load(p)
	w, h = img.size
	return np.array(img.pixels[:]).reshape(h, w, 4)[::-1]

m, old, new = load(a[0]), load(a[1]), load(a[2])
crop = m[700:900, 700:1100].repeat(2, 0).repeat(2, 1)[..., :3].copy()
old = old.repeat(2, 0).repeat(2, 1)

def paste(sprite, frame, x, y):
	f = sprite[:, frame * 160:(frame + 1) * 160]
	region = crop[y:y + 100, x:x + 160]
	region[:] = f[..., :3] * f[..., 3:4] + region * (1 - f[..., 3:4])

for n, frame in enumerate((1, 3, 6)):
	paste(old, frame, 40 + n * 250, 60)
	paste(new, frame, 40 + n * 250, 220)
out = np.concatenate([crop, np.ones(crop.shape[:2] + (1,))], axis=2)
h, w = out.shape[:2]
img = bpy.data.images.new("mock", w, h)
img.pixels = out[::-1].ravel()
img.filepath_raw = a[3]
img.file_format = "PNG"
img.save()
