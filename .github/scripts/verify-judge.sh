#!/usr/bin/env bash
# verify's judge (verify.yml): reads the shards' logs of a play of this commit, writes the summary and
# decides. No difference passes. A difference passes with the label behavior-change: the run the
# label accepts records the fingerprint of the differences in a comment (verify-fingerprint.sh);
# after a new push the label stays only for the same fingerprint, else it comes off and verify fails.
# Usage: verify-judge.sh <verify.log>
# Env: PR, REPO, NEW_PUSH (true on a push), PLAY_RUN (the run that played), GITHUB_STEP_SUMMARY,
# GITHUB_SERVER_URL, RUNNER_TEMP; gh with a token that may read and write the pull request
set -euo pipefail
log=$1
dir=$(dirname "$0")
{
	echo "### verify against the base"
	echo '```'
	grep -E 'items differ|identical|DIFF|TIMED OUT|merge commit is built' "$log" | head -80 || true
	echo '```'
} >> "$GITHUB_STEP_SUMMARY"
if ! grep -qE "^DIFF " "$log"; then
	echo "No difference with the base." >> "$GITHUB_STEP_SUMMARY"
	exit 0
fi
fingerprint=$("$dir/verify-fingerprint.sh" "$log")
echo "Fingerprint of the differences: \`$fingerprint\`" >> "$GITHUB_STEP_SUMMARY"
if [ -z "${PR:-}" ]; then
	echo "verify found differences: read the summary." >> "$GITHUB_STEP_SUMMARY"
	exit 1
fi
labelled=$(gh pr view "$PR" --repo "$REPO" --json labels -q '[.labels[].name] | index("behavior-change") != null')
accepted=$(gh api "repos/$REPO/issues/$PR/comments" --paginate -q '.[].body' \
	| grep -oE 'verify-accepted: [0-9a-f]+' | tail -1 | cut -d' ' -f2 || true)
if [ "$labelled" != "true" ]; then
	echo "verify found differences: read the summary; a deliberate change needs the label behavior-change." >> "$GITHUB_STEP_SUMMARY"
	exit 1
fi
if [ "${NEW_PUSH:-}" = "true" ]; then
	if [ "$fingerprint" = "$accepted" ]; then
		echo "The same differences as the ones accepted with behavior-change (fingerprint $accepted): the label stays." >> "$GITHUB_STEP_SUMMARY"
		exit 0
	fi
	gh pr edit "$PR" --repo "$REPO" --remove-label behavior-change
	echo "The differences changed since behavior-change accepted them (fingerprint ${accepted:-none}, now $fingerprint): the label is off, read them again." >> "$GITHUB_STEP_SUMMARY"
	exit 1
fi
echo "Differences accepted with the label behavior-change." >> "$GITHUB_STEP_SUMMARY"
if [ "$fingerprint" != "$accepted" ]; then
	{
		echo "<!-- verify-accepted: $fingerprint -->"
		echo "verify: the label \`behavior-change\` accepted these differences ([run]($GITHUB_SERVER_URL/$REPO/actions/runs/$PLAY_RUN)). A new push keeps the label only if verify finds the same ones."
		echo '```'
		"$dir/verify-fingerprint.sh" "$log" --lines | sed -n 1,60p
		echo '```'
	} > "$RUNNER_TEMP/accepted.md"
	gh pr comment "$PR" --repo "$REPO" --body-file "$RUNNER_TEMP/accepted.md"
fi
