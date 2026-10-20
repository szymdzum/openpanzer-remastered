#!/usr/bin/env bash
# Replay test: plays the same scenarios AI vs AI on the reference (openpanzer-src, the faithful
# reconstruction of the original) and on this remaster, then diffs the state traces and reports
# the coverage of src/. Any difference is a change of behavior against the original.
# Usage: harness/replay.sh [turns=3] [items...]
#   items: scenario files, campaign:<index> or scripted:<file>; default is a fixed sample
# Env: BDG_SESSION (own browser per parallel run, default "replay"), REFERENCE_DIR
#   (../openpanzer-src), REFERENCE_PORT (8643), PORT (8644), SEED (1),
#   FULL_FROM (keep full states from that action index on, for debugging)
set -euo pipefail
cd "$(dirname "$0")/.."

TURNS=${1:-3}
[ $# -gt 0 ] && shift
ITEMS=("$@")
SEED=${SEED:-1}
export BDG_SESSION=${BDG_SESSION:-replay}
OUT=harness/out/replay-$BDG_SESSION
mkdir -p "$OUT" harness/out/baseline

if [ ${#ITEMS[@]} -eq 0 ]; then
	ITEMS=(drpzop01.xml drstu02.xml dr9fr03.xml campaign:0)
	# plus every 40th scenario of the list, so all eras and both equipment sets show up
	while read -r f; do ITEMS+=("$f"); done < <(node -e '
		global.window = global; eval(require("fs").readFileSync("game/resources/scenarios/scenariolist.js", "utf8").replace(/^var /m, "global."));
		scenariolist.filter(s => s.length > 1).forEach((s, i) => { if (i % 40 == 20) console.log(s[0]); });')
	ITEMS+=(campaign:10 scripted:tutorial.xml) # the tutorial keeps its scripted players (AIScripted)
fi
ITEMS_JSON=$(printf '%s\n' "${ITEMS[@]}" | node -e 'console.log(JSON.stringify(require("fs").readFileSync(0, "utf8").trim().split("\n")))')

REFERENCE_DIR=${REFERENCE_DIR:-../openpanzer-src}
REFERENCE_PORT=${REFERENCE_PORT:-8643}
PORT=${PORT:-8644}
REFERENCE_URL="http://127.0.0.1:$REFERENCE_PORT/index.html?harness&standalone"
VARIANT_URL="http://127.0.0.1:$PORT/index.html?harness"
MODULES=$(node -e 'eval(require("fs").readFileSync("src/modules.ts", "utf8")); console.log(srcModules.join(","))')
# The remaster runs dist/, build it from src/ first
npm run --silent build >/dev/null

# serve <dir> <port>: a static server per repo, left running for the next runs
serve() {
	if ! curl -s -o /dev/null "http://127.0.0.1:$2/index.html"; then
		(cd "$1" && nohup python3 -m http.server "$2" --bind 127.0.0.1 >/dev/null 2>&1 &)
		sleep 1
	fi
}
serve "$REFERENCE_DIR" "$REFERENCE_PORT"
serve . "$PORT"

# run <url> <out.json> [coverage.json]
run() {
	local url=$1 out=$2 coverage=${3:-}
	bdg stop >/dev/null 2>&1 || true
	# Canvas drawing on the CPU only: Chrome moves canvases between GPU and CPU rasterizing by
	# heuristics that carry over between sessions, and the two antialias edges differently
	bdg about:blank --headless --viewport 1280x800 --chrome-flags="--disable-gpu --disable-accelerated-2d-canvas --disable-gpu-compositing" >/dev/null
	# No HTTP cache: a cached /src/<module>.js can be stale, and V8's code cache for it reports
	# coverage per function instead of per block
	bdg cdp Network.enable >/dev/null
	bdg cdp Network.setCacheDisabled --params '{"cacheDisabled":true}' >/dev/null
	if [ -n "$coverage" ]; then
		bdg cdp Profiler.enable >/dev/null
		bdg cdp Profiler.startPreciseCoverage --params '{"callCount":true,"detailed":true}' >/dev/null
	fi
	# The game restores its last save from localStorage at start, every run starts clean
	bdg page navigate "${url%%/index.html*}/harness/lib/hooks.js" >/dev/null
	bdg eval "localStorage.clear(); sessionStorage.clear(); 'ok'" >/dev/null
	bdg page navigate "$url" >/dev/null
	# (no waiting for the start menu: with ?harness the game's loads complete once harness.js runs)
	# bdg eval waits at most 20s for a promise, so the run goes on in the page and we poll
	bdg eval "window.__replay = { items: $ITEMS_JSON, turns: $TURNS, seed: $SEED ${FULL_FROM:+, fullFrom: $FULL_FROM} };
		window.__replaySummary = null;
		(async () => { $(cat harness/lib/harness.js harness/replay.js) })()
			.then(r => window.__replaySummary = r, e => window.__replaySummary = { error: e.message, stack: e.stack });
		'started'" >/dev/null
	until bdg eval "window.__replaySummary !== null" --json | grep -q '"result":true'; do sleep 2; done
	if bdg eval "window.__replaySummary.error !== undefined" --json | grep -q '"result":true'; then
		bdg eval "window.__replaySummary" --json; exit 1
	fi
	bdg eval "JSON.stringify(window.__replayResult)" --full --json \
		| node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0)).data.result)' > "$out"
	if [ -n "$coverage" ]; then bdg cdp Profiler.takePreciseCoverage --json > "$coverage"; fi
	bdg stop >/dev/null
}

# The baseline only depends on the bundle and the run parameters, cache it
# The reference only changes with its commit (uncommitted changes there count too)
REF_VERSION=$(git -C "$REFERENCE_DIR" rev-parse HEAD)$(git -C "$REFERENCE_DIR" status --porcelain | shasum | cut -c1-8)
KEY=$(printf '%s|%s|%s|%s|%s' "$ITEMS_JSON" "$TURNS" "$SEED" "$REF_VERSION" "$(cat harness/lib/harness.js harness/lib/hooks.js harness/replay.js harness/replay.sh | shasum | cut -c1-12)" | shasum | cut -c1-16)
BASELINE=harness/out/baseline/$KEY.json
if [ ! -s "$BASELINE" ]; then
	echo "reference: playing ${#ITEMS[@]} items on $REFERENCE_DIR"
	run "$REFERENCE_URL" "$BASELINE.$BDG_SESSION.tmp" && mv "$BASELINE.$BDG_SESSION.tmp" "$BASELINE"
fi

echo "remaster: playing ${#ITEMS[@]} items"
run "$VARIANT_URL" "$OUT/variant.json" "$OUT/coverage.json"

node harness/diff-traces.js "$BASELINE" "$OUT/variant.json" "$OUT/coverage.json" "$MODULES"
