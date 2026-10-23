# Frame 4 of the old strips next to the new figure, 1x and @2x, scaled up nearest on a grass colour.
# blender -b -P figure_sheet.py -- OLD_A.png NEW_A.png NEW_A@2x.png OLD_B.png NEW_B.png NEW_B@2x.png OUT.png
import sys
import bpy
import numpy as np

a = sys.argv[sys.argv.index("--") + 1:]
BG = np.array([0.36, 0.42, 0.22])
DARK = 0.13


def load(p):
	img = bpy.data.images.load(p)
	w, h = img.size
	return np.array(img.pixels[:]).reshape(h, w, 4)[::-1]


def over(px):
	return px[..., :3] * px[..., 3:4] + BG * (1 - px[..., 3:4])


rows = []
for old_p, new1, new2 in (a[0:3], a[3:6]):
	old = load(old_p)
	fw = old.shape[1] // 9
	cells = [over(old[:, 4 * fw:5 * fw]).repeat(4, 0).repeat(4, 1), over(load(new1)).repeat(4, 0).repeat(4, 1), over(load(new2)).repeat(2, 0).repeat(2, 1)]
	hh = max(c.shape[0] for c in cells)
	cells = [np.concatenate([c, np.full((hh - c.shape[0], c.shape[1], 3), DARK)], 0) for c in cells]
	gap = np.full((hh, 16, 3), DARK)
	rows.append(np.concatenate([cells[0], gap, cells[1], gap, cells[2]], 1))
w = max(r.shape[1] for r in rows)
rows = [np.concatenate([r, np.full((r.shape[0], w - r.shape[1], 3), DARK)], 1) for r in rows]
out = np.concatenate([rows[0], np.full((16, w, 3), DARK), rows[1]], 0)
out = np.concatenate([out, np.ones(out.shape[:2] + (1,))], 2)
img = bpy.data.images.new("sheet", out.shape[1], out.shape[0])
img.pixels = out[::-1].ravel()
img.filepath_raw = a[6]
img.file_format = "PNG"
img.save()
