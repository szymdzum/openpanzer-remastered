#!/usr/bin/env bash
# PostToolUse hook (.claude/settings.json): after an agent edits a source file, lint that file and
# check its braces. Problems go back to the agent (exit 2), which fixes them right away.
f=$(jq -r '.tool_input.file_path // empty')
case "$f" in
	*/src/*.ts|*/src/*.tsx|*/test/*.ts|*/test/*.tsx|*/test/*.js|*/test/contracts/*.js) ;;
	*) exit 0 ;;
esac
[ -f "$f" ] || exit 0
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
export PATH="$(nvmrc-bin 2>/dev/null):$PATH"
out=$(npx --no-install oxlint --type-aware --deny-warnings "$f" 2>&1) || { echo "$out" | grep -v '^npm notice' >&2; exit 2; }
braces=$(grep -nE '^\s*\{\s*(//.*)?$' "$f")
[ -z "$braces" ] || { echo "$f: opening brace on a line of its own (put it on the line before):" >&2; echo "$braces" >&2; exit 2; }
exit 0
