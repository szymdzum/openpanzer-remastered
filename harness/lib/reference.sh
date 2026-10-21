# Sourced by replay.sh and ui-replay.sh after servers.sh and page.sh: what the remaster is compared
# with, served on REFERENCE_PORT.
# - By default the original game: reference/ (the 3.2.14 source reconstructed from its bundle, on
#   the game's own assets), or REFERENCE_DIR. Any difference is a change against the original.
# - BASELINE_REF=<git ref> (e.g. origin/main): this repo at that commit, checked out in
#   harness/out/base-<commit> and run on its own Vite. Any difference is a change against that
#   commit: what a pull request checks, since main differs from the original on purpose.
if [ -n "${BASELINE_REF:-}" ]; then
	BASE_SHA=$(git rev-parse --verify "$BASELINE_REF^{commit}")
	BASE_DIR=$PWD/harness/out/base-$BASE_SHA
	if [ ! -d "$BASE_DIR" ]; then
		git worktree add --detach "$BASE_DIR" "$BASE_SHA" >/dev/null
		ln -s "$PWD/node_modules" "$BASE_DIR/node_modules"
	fi
	mkdir -p "$BASE_DIR/harness/out"
	REFERENCE_URL="http://127.0.0.1:$REFERENCE_PORT/index.html?harness"
	reference_version() { echo "remaster $BASE_SHA"; }
	start_reference() { (cd "$BASE_DIR" && serve_vite "$REFERENCE_PORT"); }
else
	REFERENCE_DIR=${REFERENCE_DIR:-reference}
	REFERENCE_URL="http://127.0.0.1:$REFERENCE_PORT/index.html?harness&standalone"
	# The reference's files, not its assets (game/, the same as this repo's)
	reference_version() { (cd "$REFERENCE_DIR" && find index.html src harness -type f | sort | xargs shasum) | shasum; }
	start_reference() { serve_static "$REFERENCE_DIR" "$REFERENCE_PORT"; }
fi
