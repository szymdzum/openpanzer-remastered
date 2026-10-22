# Put the original strip (scaled up, nearest neighbour) over the new one, on a grass-like background.
# blender -b -P compare.py -- ORIGINAL.png NEW.png OUT.png [ZOOM]   (ZOOM: nearest neighbour, for a close look)
import sys
import bpy
import numpy as np

a = sys.argv[sys.argv.index("--") + 1:]

def load(p):
	img = bpy.data.images.load(p)
	w, h = img.size
	return np.array(img.pixels[:]).reshape(h, w, 4)[::-1]

old, new = load(a[0]), load(a[1])
k = new.shape[1] // old.shape[1]
old = old.repeat(k, 0).repeat(k, 1)
bg = np.array([0.36, 0.42, 0.22])
def over(px):
	return px[..., :3] * px[..., 3:4] + bg * (1 - px[..., 3:4])
out = np.concatenate([over(old), over(new)], axis=0)
zoom = int(a[3]) if len(a) > 3 else 1
out = out.repeat(zoom, 0).repeat(zoom, 1)
out = np.concatenate([out, np.ones(out.shape[:2] + (1,))], axis=2)
h, w = out.shape[:2]
img = bpy.data.images.new("cmp", w, h)
img.pixels = out[::-1].ravel()
img.filepath_raw = a[2]
img.file_format = "PNG"
img.save()
