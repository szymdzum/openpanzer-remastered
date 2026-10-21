#!/usr/bin/env bash
# Replay test: plays the same scenarios AI vs AI on the reference (harness/lib/reference.sh: the
# original game reconstructed in reference/, or this repo at BASELINE_REF) and on this remaster,
# then diffs the state traces and reports the coverage of src/. Any difference is a change of
# behavior against the reference.
# The items play in parallel, each in its own Chrome.
# Usage: harness/replay.sh [turns=3] [items...]
#   items: scenario files, campaign:<index> or scripted:<file>; default is a fixed sample
# Env: JOBS (Chromes at once, default 3/4 of the cores), BDG_SESSION (prefix of the sessions,
#   default "replay"), BASELINE_REF (compare with this repo at a git ref, e.g. origin/main),
#   REFERENCE_DIR (reference), REFERENCE_PORT (8643), PORT (8644),
#   SEED (1), FULL_FROM (keep full states from that action index on, for debugging)
set -euo pipefail
cd "$(dirname "$0")/.."

SEED=${SEED:-1}
export BDG_SESSION=${BDG_SESSION:-replay}
OUT=harness/out/replay-$BDG_SESSION

REFERENCE_PORT=${REFERENCE_PORT:-8643}
PORT=${PORT:-8644}
VARIANT_URL="http://127.0.0.1:$PORT/index.html?harness"
MODULES=$(cd src && ls *.ts | sed 's/\.ts$//' | paste -sd, -)
source harness/lib/servers.sh
source harness/lib/page.sh
source harness/lib/reference.sh
# file name of an item's outputs
item_file() { printf %s "$1" | tr -c 'A-Za-z0-9.-' '-'; }

# --job <item>: one item, the reference's trace from the cache or played, then the remaster's.
# Each item plays in a fresh page, so its trace doesn't depend on the other items.
if [ "${1:-}" = "--job" ]; then
	item=$2
	export BDG_SESSION=$(session_name "$BDG_SESSION" "$item")
	setup="window.__replay = { items: [$(node -e 'console.log(JSON.stringify(process.argv[1]))' "$item")], turns: $TURNS, seed: $SEED ${FULL_FROM:+, fullFrom: $FULL_FROM} }"
	files=(harness/lib/harness.js harness/replay.js)
	KEY=$( (reference_version; printf '%s|%s|%s|%s\n' "$item" "$TURNS" "$SEED" "${FULL_FROM:-}"; cat "${files[@]}" harness/lib/hooks.js harness/lib/page.sh) | shasum | cut -c1-16)
	BASELINE=harness/out/baseline/replay-$(item_file "$item")-$KEY.json
	if [ ! -s "$BASELINE" ]; then
		echo "reference: $item"
		run_page_retry "$REFERENCE_URL" "$BASELINE.$BDG_SESSION.tmp" "" __replayResult "$setup" "${files[@]}"
		mv "$BASELINE.$BDG_SESSION.tmp" "$BASELINE"
	fi
	ln -sf "$PWD/$BASELINE" "$OUT/$(item_file "$item").baseline.json"
	echo "remaster: $item"
	run_page_retry "$VARIANT_URL" "$OUT/$(item_file "$item").json" "$OUT/$(item_file "$item").coverage.json" __replayResult "$setup" "${files[@]}"
	exit
fi

export TURNS=${1:-3}
[ $# -gt 0 ] && shift
ITEMS=("$@")
if [ ${#ITEMS[@]} -eq 0 ]; then
	ITEMS=(drpzop01.xml drstu02.xml dr9fr03.xml campaign:0)
	# plus every 40th scenario of the list, so all eras and both equipment sets show up
	while read -r f; do ITEMS+=("$f"); done < <(node -e '
		global.window = global; eval(require("fs").readFileSync("game/resources/scenarios/scenariolist.js", "utf8").replace(/^var /m, "global."));
		scenariolist.filter(s => s.length > 1).forEach((s, i) => { if (i % 40 == 20) console.log(s[0]); });')
	ITEMS+=(campaign:10 scripted:tutorial.xml) # the tutorial keeps its scripted players (AIScripted)
fi
ITEMS_JSON=$(printf '%s\n' "${ITEMS[@]}" | node -e 'console.log(JSON.stringify(require("fs").readFileSync(0, "utf8").trim().split("\n")))')
rm -rf "$OUT"
mkdir -p "$OUT" harness/out/baseline
start_reference
serve_vite "$PORT"

echo "${#ITEMS[@]} items, $TURNS turns, $JOBS at once"
run_jobs "$0" "${ITEMS[@]}" >"$OUT/jobs.log" || { cat "$OUT/jobs.log"; echo "a job failed, logs in $OUT"; }

# One trace per side, in the order of the items (a missing variant trace counts as a difference)
node -e '
const fs = require("fs");
const [out, items] = [process.argv[1], JSON.parse(process.argv[2])];
const read = (f) => fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8"))[0] : null;
const file = (i) => out + "/" + i.replace(/[^A-Za-z0-9.-]/g, "-");
const base = items.map((i) => read(file(i) + ".baseline.json"));
if (base.some((b) => !b)) { console.error("no reference trace for " + items.filter((i, k) => !base[k]).join(", ")); process.exit(1); }
fs.writeFileSync(out + "/baseline.json", JSON.stringify(base));
fs.writeFileSync(out + "/variant.json", JSON.stringify(items.map((i) => read(file(i) + ".json"))));
' "$OUT" "$ITEMS_JSON"
COVERAGE=$(for i in "${ITEMS[@]}"; do printf '%s,' "$OUT/$(item_file "$i").coverage.json"; done)

save_served "$PORT" "$OUT/served" "$MODULES"
SERVED=$OUT/served node harness/diff-traces.js "$OUT/baseline.json" "$OUT/variant.json" "${COVERAGE%,}" "$MODULES"
