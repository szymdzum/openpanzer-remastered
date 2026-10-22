#!/usr/bin/env bash
# UI replay: runs user step scripts (harness/ui/<script>.js) on the reference (see replay.sh)
# and on this remaster, diffs state, DOM and canvas after every step, and reports the coverage
# of src/ over all the scripts run. The scripts run in parallel, each in its own Chrome.
# Usage: harness/ui-replay.sh [script...]   (default: every script in harness/ui)
# Env: JOBS (Chromes at once, default 3/4 of the cores), BDG_SESSION (prefix of the sessions,
#   default "ui"), BASELINE_REF, REFERENCE_DIR, REFERENCE_PORT, PORT, SEED as in replay.sh, DUMP_STEP=<n>
#   (keep step n's canvases as PNGs in the trace), RENDER_LOG=1 (record render() calls per step)
set -euo pipefail
cd "$(dirname "$0")/.."

SEED=${SEED:-1}
export BDG_SESSION=${BDG_SESSION:-ui}
OUT=harness/out/ui-$BDG_SESSION
REFERENCE_PORT=${REFERENCE_PORT:-8643}
PORT=${PORT:-8644}
VARIANT_URL="http://127.0.0.1:$PORT/index.html?harness"
MODULES=$(cd src && ls *.ts | sed 's/\.ts$//' | paste -sd, -)
source harness/lib/servers.sh
source harness/lib/page.sh
source harness/lib/reference.sh

# --job <script>: one script, the reference's trace from the cache or played, then the remaster's
if [ "${1:-}" = "--job" ]; then
	script=$2
	export BDG_SESSION=$(session_name "$BDG_SESSION" "$script")
	setup="window.__uiReplay = { seed: $SEED ${DUMP_STEP:+, dumpStep: $DUMP_STEP}${RENDER_LOG:+, renderLog: true} }; window.__stateSnapshot = \"$STATE_SNAPSHOT\""
	files=(harness/lib/harness.js "harness/ui/$script.js" harness/ui-replay.js)
	KEY=$( (reference_version; echo "$STATE_SNAPSHOT") | cat - "${files[@]}" harness/lib/hooks.js harness/lib/page.sh | shasum | cut -c1-12)-$SEED
	BASELINE=harness/out/baseline/ui-$script-$KEY.json
	if [ ! -s "$BASELINE" ]; then
		echo "reference: $script"
		run_page_retry "$REFERENCE_URL" "$BASELINE.$BDG_SESSION.tmp" "" __uiResult "$setup" "${files[@]}"
		mv "$BASELINE.$BDG_SESSION.tmp" "$BASELINE"
	fi
	run_page_retry "$VARIANT_URL" "$OUT/$script.json" "$OUT/$script.coverage.json" __uiResult "$setup" "${files[@]}"
	node harness/ui-diff.js "$BASELINE" "$OUT/$script.json" "$script"
	exit
fi

SCRIPTS=("$@")
[ ${#SCRIPTS[@]} -gt 0 ] || SCRIPTS=($(cd harness/ui && ls *.js | sed 's/\.js$//'))
for script in "${SCRIPTS[@]}"; do [ -f "harness/ui/$script.js" ] || { echo "no harness/ui/$script.js"; exit 2; }; done
rm -rf "$OUT"
mkdir -p "$OUT" harness/out/baseline
start_reference
serve_vite "$PORT"

echo "${#SCRIPTS[@]} scripts, $JOBS at once, state snapshot: $STATE_SNAPSHOT"
STATUS=0
run_jobs "$0" "${SCRIPTS[@]}" || STATUS=1

save_served "$PORT" "$OUT/served" "$MODULES"
COVERAGE=()
for script in "${SCRIPTS[@]}"; do COVERAGE+=("$OUT/$script.coverage.json"); done
SERVED=$OUT/served node -e '
const { uncoveredLines, printUncovered } = require("./harness/coverage");
const [modules, ...files] = process.argv.slice(1);
for (const mod of modules.split(",").filter(Boolean)) {
	const file = "src/" + mod + ".ts";
	printUncovered(file + " (ui replay, all scripts)", require("fs").existsSync(file)
		? uncoveredLines(files, "/src/" + mod + ".ts", file, process.env.SERVED + "/" + mod + ".js") : null);
}' "$MODULES" "${COVERAGE[@]}"
# Summary: the scripts that differ or didn't finish
FAILED=0
for script in "${SCRIPTS[@]}"; do
	line=$(grep -h "^== UI replay" "$OUT/$script.log" || echo "== UI replay $script: didn't finish, see $OUT/$script.log")
	case $line in *"steps identical") ;; *) echo "$line"; FAILED=$((FAILED + 1)) ;; esac
done
echo "== UI replay: $(( ${#SCRIPTS[@]} - FAILED )) of ${#SCRIPTS[@]} scripts identical"
exit $STATUS
