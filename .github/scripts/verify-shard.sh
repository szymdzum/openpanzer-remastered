#!/usr/bin/env bash
# One shard of verify (verify.yml): the AI games (replay) or every Nth UI script (ui-K-of-N), played
# against the base (BASELINE_REF), its log in $1. Exits 0 when the shard played through, with or
# without differences (the log says which; verify's judge decides), 1 when it didn't finish: no
# summary line in the log. With BASELINE_ONLY=1 it plays the base's traces only (the cache).
# Usage: verify-shard.sh <log> replay|ui-<k>-of-<n>
set -uo pipefail
log=$1 shard=$2
case $shard in
	replay)
		harness/replay.sh 2>&1 | tee "$log"
		summary='^== Replay diff|items differ|same |reference.s traces only' ;;
	ui-*-of-*)
		k=${shard#ui-}; k=${k%%-of-*}; n=${shard##*-of-}
		mapfile -t scripts < <(cd harness/ui && ls -- *.js | sed 's/\.js$//' | LC_ALL=C sort | awk -v k="$k" -v n="$n" '(NR - 1) % n == k')
		harness/ui-replay.sh "${scripts[@]}" 2>&1 | tee "$log"
		summary='^== UI replay: [0-9]+ of [0-9]+ scripts identical|reference.s traces only' ;;
	*) echo "no shard $shard" >&2; exit 2 ;;
esac
if ! grep -qE "$summary" "$log"; then
	echo "The shard $shard didn't play through: no summary in its log." >&2
	exit 1
fi
