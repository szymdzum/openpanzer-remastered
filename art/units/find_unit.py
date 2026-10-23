# Where a unit's sprite is and where to see it: the equipment entries whose name matches, their
# strip, and the scenarios that start with one on the map (the hexes, as the game's top bar shows
# them when hovering). Plain Python, no Blender.
#
#   python3 art/units/find_unit.py "Pz IVH"        names containing the text (case-insensitive)
#   python3 art/units/find_unit.py --icon pa131    every unit drawn with that strip
import glob
import json
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "game", "resources")
# Positions in an equipment entry (game/resources/equipment/<pack>/equipment-country-N.json)
ICON, YEAR, NAME = 1, 21, 22


def equipment():
	units = {}
	for path in sorted(glob.glob(os.path.join(ROOT, "equipment", "*", "*.json"))):
		pack = os.path.basename(os.path.dirname(path))
		for uid, entry in json.load(open(path))["units"].items():
			units[(pack, uid)] = entry
	return units


def scenarios():
	# (file, name, equipment pack, the hex body before any reinforcements)
	names = {}
	listing = open(os.path.join(ROOT, "scenarios", "scenariolist.js"), encoding="latin-1").read()
	for m in re.finditer(r'\["([^"]+\.xml)",\s*"([^"]*)"', listing):
		names[m.group(1)] = m.group(2)
	for path in sorted(glob.glob(os.path.join(ROOT, "scenarios", "data", "*.xml"))):
		text = open(path, encoding="latin-1").read()
		pack = re.search(r'eqp="([^"]+)"', text)
		yield os.path.basename(path), names.get(os.path.basename(path), "?"), pack.group(1) if pack else "eqp-adlerkorps", text.split("<reinforce")[0]


def main(args):
	if not args:
		print(__doc__ if __doc__ else "usage: find_unit.py NAME | --icon STRIP")
		return 2
	units = equipment()
	if args[0] == "--icon":
		match = lambda e: os.path.basename(e[ICON]).split(".")[0] == args[1]
	else:
		match = lambda e: args[0].lower() in e[NAME].lower()
	found = {k: e for k, e in units.items() if match(e)}
	if not found:
		print(f"No unit matches {args!r}. Names look like 'Pz IVH', '10.5 leFH18', 'Infanterie'.")
		return 1
	print("Units (pack, id, name, year, strip):")
	for (pack, uid), e in sorted(found.items(), key=lambda kv: (kv[1][NAME], kv[0])):
		print(f"  {pack:16s} {uid:>5s}  {e[NAME]:28s} {e[YEAR]}  {e[ICON]}")
	print("\nScenarios with one on the map at the start (file, name in the menu, count, hexes row,col):")
	shown = 0
	for file, name, pack, body in scenarios():
		hexes = []
		for m in re.finditer(r'<hex row="(\d+)" col="(\d+)"[^>]*>(.*?)</hex>', body, re.S):
			for uid in re.findall(r'<unit id="(\d+)"', m.group(3)):
				if (pack, uid) in found:
					hexes.append(f"({m.group(1)},{m.group(2)})")
		if hexes:
			shown += 1
			print(f"  {file:16s} {name!r:28s} {len(hexes):2d}  {' '.join(hexes[:8])}{' ...' if len(hexes) > 8 else ''}")
	if not shown:
		print("  none: the unit only comes as a reinforcement or a purchase")
	# Menu names repeat ("Zitadelle" and "Operation Zitadelle"): say which file a name is
	print("\nThe scenario list shows names, not files: several scenarios can share a name; pick by the file above.")
	return 0


if __name__ == "__main__":
	sys.exit(main(sys.argv[1:]))
