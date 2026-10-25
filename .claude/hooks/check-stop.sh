#!/usr/bin/env bash
# Stop hook (.claude/settings.json): when an agent ends its turn with changed TypeScript, the
# types must check. A failure goes back to the agent once (stop_hook_active stops a loop).
[ "$(jq -r '.stop_hook_active // false')" = "true" ] && exit 0
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
git status --porcelain -- '*.ts' '*.tsx' '*.mts' | grep -q . || exit 0
export PATH="$(nvmrc-bin 2>/dev/null):$PATH"
out=$(npm run -s check 2>&1) || { echo "npm run check fails:" >&2; echo "$out" | grep -v '^npm notice' | head -30 >&2; exit 2; }
exit 0
