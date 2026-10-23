#!/usr/bin/env bash
# The shards' logs of the play of a pull request's head commit (verify.yml), into <dir>: this run's when
# it played (a push), else the latest run that played the same commit (a label added or taken off
# changes nothing to play). Waits for a play still running. Prints the id of the run that played; fails
# when no play of the commit finished, or a shard of it didn't play through.
# Usage: verify-play-logs.sh <dir>
# Env: REPO, HEAD_SHA, RUN_ID (this run), PLAYED (true when this run played); gh with actions: read
set -euo pipefail
dir=$1
mkdir -p "$dir"
play_jobs() { gh api "repos/$REPO/actions/runs/$1/jobs" --paginate -q '.jobs[] | select(.name | startswith("play")) | .status + " " + (.conclusion // "")'; }
run=""
if [ "${PLAYED:-}" = "true" ]; then
	run=$RUN_ID
else
	for _ in $(seq 80); do
		for id in $(gh api "repos/$REPO/actions/workflows/verify.yml/runs?head_sha=$HEAD_SHA&per_page=20" -q '.workflow_runs[].id'); do
			[ "$id" = "$RUN_ID" ] && continue
			jobs=$(play_jobs "$id")
			[ -z "$jobs" ] && continue # a run that only judged, or one that played nothing (no code)
			if grep -qv '^completed' <<<"$jobs"; then run="wait"; break; fi
			if grep -qvE '^completed (success|failure)$' <<<"$jobs"; then continue; fi # cancelled by a newer push
			run=$id
			break
		done
		[ "$run" != wait ] && break
		run=""
		sleep 30
	done
	if [ -z "$run" ] || [ "$run" = wait ]; then
		echo "No finished play of $HEAD_SHA: push again, or re-run the push's verify." >&2
		exit 1
	fi
fi
if play_jobs "$run" | grep -q 'failure'; then
	echo "A shard of run $run didn't play through: re-run it." >&2
	exit 1
fi
gh run download "$run" --repo "$REPO" --pattern 'verify-log-*' --dir "$dir" >&2
echo "$run"
