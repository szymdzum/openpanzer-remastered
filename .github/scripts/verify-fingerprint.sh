#!/usr/bin/env bash
# The fingerprint of verify's differences (verify.yml): where the game differs from the base branch,
# not by how much. Each difference line of the log (harness/replay.sh), with
# what depends on the base's own play cut off: the values after ": baseline", the state hashes, the
# action and turn counts of an item; each line under its item, in a fixed order (the items finish in
# parallel). A pull request rebased on a newer main gives the same
# fingerprint when it changes the same games at the same steps in the same way.
# Usage: verify-fingerprint.sh verify.log  (prints the normalized lines with --lines)
set -euo pipefail
lines=$(grep -E '^DIFF |first different action|state differs|differs at|items differ' "$1" \
	| grep -vE '^\s*[0-9]+: ' \
	| sed -E 's/: baseline .*$//; s/ hash [0-9a-z]+//g; s/^(DIFF [^ ]+) \([0-9]+ actions, [0-9]+ turns(, TIMED OUT)?\)/\1/' \
	| sed -E 's/[[:space:]]+$//' \
	| awk '/^DIFF / { item = $2; print item; next } /^ / { print item " |" $0; next } { print }' \
	| LC_ALL=C sort || true)
if [ "${2:-}" = "--lines" ]; then printf '%s\n' "$lines"; exit 0; fi
printf '%s\n' "$lines" | shasum -a 256 | cut -c1-16
