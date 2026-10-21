#!/usr/bin/env bash
# UI replay: runs user step scripts (harness/ui/<script>.js) on the reference (openpanzer-src)
# and on this remaster, diffs state, DOM and canvas after every step, and reports the coverage
# of src/ over all the scripts run.
# Usage: harness/ui-replay.sh [script...]   (default: every script in harness/ui)
# Env: BDG_SESSION (own browser per parallel run, default "ui"), REFERENCE_DIR, REFERENCE_PORT,
#   PORT, SEED as in replay.sh, DUMP_STEP=<n> (keep step n's canvases as PNGs in the trace),
#   RENDER_LOG=1 (record render() calls per step)
set -euo pipefail
cd "$(dirname "$0")/.."

SCRIPTS=("$@")
[ ${#SCRIPTS[@]} -gt 0 ] || SCRIPTS=($(cd harness/ui && ls *.js | sed 's/\.js$//'))
SEED=${SEED:-1}
export BDG_SESSION=${BDG_SESSION:-ui}
OUT=harness/out/ui-$BDG_SESSION
mkdir -p "$OUT" harness/out/baseline

REFERENCE_DIR=${REFERENCE_DIR:-../openpanzer-src}
REFERENCE_PORT=${REFERENCE_PORT:-8643}
PORT=${PORT:-8644}
REFERENCE_URL="http://127.0.0.1:$REFERENCE_PORT/index.html?harness&standalone"
VARIANT_URL="http://127.0.0.1:$PORT/index.html?harness"
MODULES=$(cd src && ls *.ts | sed 's/\.ts$//' | paste -sd, -)

source harness/lib/servers.sh
serve_static "$REFERENCE_DIR" "$REFERENCE_PORT"
serve_vite "$PORT"

# run <url> <script> <out.json> [coverage.json]
run() {
	local url=$1 script=$2 out=$3 coverage=${4:-}
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
	bdg eval "window.__uiReplay = { seed: $SEED ${DUMP_STEP:+, dumpStep: $DUMP_STEP}${RENDER_LOG:+, renderLog: true} }; window.__uiSummary = null;
		(async () => { $(cat harness/lib/harness.js harness/ui/"$script".js harness/ui-replay.js) })()
			.then(r => window.__uiSummary = r, e => window.__uiSummary = { error: e.message, stack: e.stack });
		'started'" >/dev/null
	until bdg eval "window.__uiSummary !== null" --json | grep -q '"result":true'; do sleep 2; done
	if bdg eval "window.__uiSummary.error !== undefined" --json | grep -q '"result":true'; then
		bdg eval "window.__uiSummary" --json; exit 1
	fi
	bdg eval "JSON.stringify(window.__uiResult)" --full --json \
		| node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0)).data.result)' > "$out"
	if [ -n "$coverage" ]; then bdg cdp Profiler.takePreciseCoverage --json > "$coverage"; fi
	bdg stop >/dev/null
}

STATUS=0
COVERAGE=()
for script in "${SCRIPTS[@]}"; do
	[ -f "harness/ui/$script.js" ] || { echo "no harness/ui/$script.js"; exit 2; }
	REF_VERSION=$(git -C "$REFERENCE_DIR" rev-parse HEAD)$(git -C "$REFERENCE_DIR" status --porcelain | shasum | cut -c1-8)
	KEY=$(printf '%s' "$REF_VERSION" | cat - harness/lib/harness.js harness/lib/hooks.js harness/ui-replay.js harness/ui-replay.sh "harness/ui/$script.js" | shasum | cut -c1-12)-$SEED
	BASELINE=harness/out/baseline/ui-$script-$KEY.json
	if [ ! -s "$BASELINE" ]; then
		echo "reference: $script"
		run "$REFERENCE_URL" "$script" "$BASELINE.$BDG_SESSION.tmp" && mv "$BASELINE.$BDG_SESSION.tmp" "$BASELINE"
	fi
	echo "remaster: $script"
	run "$VARIANT_URL" "$script" "$OUT/$script.json" "$OUT/$script.coverage.json"
	COVERAGE+=("$OUT/$script.coverage.json")
	node harness/ui-diff.js "$BASELINE" "$OUT/$script.json" "$script" || STATUS=1
done

save_served "$PORT" "$OUT/served" "$MODULES"
SERVED=$OUT/served node -e '
const { uncoveredLines, printUncovered } = require("./harness/coverage");
const [modules, ...files] = process.argv.slice(1);
for (const mod of modules.split(",").filter(Boolean)) {
	const file = "src/" + mod + ".ts";
	printUncovered(file + " (ui replay, all scripts)", require("fs").existsSync(file)
		? uncoveredLines(files, "/src/" + mod + ".ts", file, process.env.SERVED + "/" + mod + ".js") : null);
}' "$MODULES" "${COVERAGE[@]}"
exit $STATUS
