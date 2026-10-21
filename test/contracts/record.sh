#!/usr/bin/env bash
# Records the contracts of a module on the reference (openpanzer-src): the expected results the
# Vitest contract tests compare this repo with. Every state plays in its own Chrome, in parallel.
# Usage: test/contracts/record.sh [module=gamerules]   (gamerules, unit or engine)
# Writes test/contracts/<module>/<scenario>-t<turns>.json.gz: the exported game state and the
# serialized result of every call. Record again when the reference changes, or when a bug is
# fixed on purpose here (then the contract changes with it, and the diff shows how).
set -euo pipefail
cd "$(dirname "$0")/../.."

MODULE=${MODULE:-${1:-gamerules}}
export MODULE
export BDG_SESSION=${BDG_SESSION:-record}
OUT=harness/out/record-$BDG_SESSION
REFERENCE_DIR=${REFERENCE_DIR:-../openpanzer-src}
REFERENCE_PORT=${REFERENCE_PORT:-8643}
REFERENCE_URL="http://127.0.0.1:$REFERENCE_PORT/index.html?harness&standalone"
source harness/lib/servers.sh
source harness/lib/page.sh

# The states: scenario files of every era and both equipment sets, at the start and after the
# AI played some turns (damage, experience, entrenchment, captured flags). <file>:<turns>
STATES=(drpzop01.xml:0 drpzop01.xml:2 drstu02.xml:0 dr9fr03.xml:2 ruscam09.xml:0 ruscam09.xml:2
	ant03.xml:2 it12baxe.xml:0 winter.xml:2 wdmillazzo.xml:0 dragrom02.xml:2 sb6buna.xml:0 rcampx06.xml:2)
FUZZ_ROUNDS=${FUZZ_ROUNDS:-1}
case $MODULE in
	gamerules) RUN=runGameRulesContract ;;
	unit) RUN=runUnitContract ;;
	engine) RUN=runEngineContract ;;
	*) echo "no contract for $MODULE"; exit 2 ;;
esac

if [ "${1:-}" = "--job" ]; then
	file=${2%:*} turns=${2#*:}
	export BDG_SESSION=$(session_name "$BDG_SESSION" "$2")
	echo "const runContract = $RUN;" > "$OUT/$2.run.js"
	run_page_retry "$REFERENCE_URL" "$OUT/$2.json" "" __recordResult \
		"window.__record = { file: \"$file\", turns: $turns, fuzzRounds: $FUZZ_ROUNDS }" \
		harness/lib/harness.js test/contracts/common.js "test/contracts/$MODULE.contract.js" "$OUT/$2.run.js" test/contracts/record.js
	gzip -9 -c "$OUT/$2.json" > "test/contracts/$MODULE/${file%.xml}-t$turns.json.gz"
	echo "recorded $MODULE ${file%.xml}-t$turns: $(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1])).results.length)' "$OUT/$2.json") calls"
	exit
fi

rm -rf "$OUT"
mkdir -p "$OUT" "test/contracts/$MODULE"
serve_static "$REFERENCE_DIR" "$REFERENCE_PORT"
echo "recording $MODULE on ${#STATES[@]} states, $JOBS at once"
run_jobs "$0" "${STATES[@]}"
