# Sourced by replay.sh and ui-replay.sh: one harness run in its own headless Chrome.

# Jobs at once: one Chrome each. 3/4 of the cores by default: on 8 cores the UI replay took
# 280s with 2, 148s with 4, 126s with 6 and 140s with 8 (Chrome and the dev server need some)
JOBS=${JOBS:-$(( $(sysctl -n hw.ncpu 2>/dev/null || nproc) * 3 / 4 ))}

# session_name <text>: a bdg session name for a job (its own browser)
session_name() { printf '%s-%s' "$1" "$2" | tr -c 'A-Za-z0-9-' '-'; }

# run_page <url> <out.json> <coverage.json or ""> <result global> <setup js> <files...>
# Opens url on clean storage in the session $BDG_SESSION, runs the files as the body of an async
# function (after the setup), waits for it and saves window[<result global>] as JSON.
run_page() {
	local url=$1 out=$2 coverage=$3 result=$4 setup=$5
	shift 5
	bdg stop >/dev/null 2>&1 || true
	# Canvas drawing on the CPU only: Chrome moves canvases between GPU and CPU rasterizing by
	# heuristics that carry over between sessions, and the two antialias edges differently
	bdg about:blank --headless --viewport 1280x800 --chrome-flags="--disable-gpu --disable-accelerated-2d-canvas --disable-gpu-compositing" >/dev/null
	# No HTTP cache: a cached module can be stale, and V8's code cache for it reports coverage
	# per function instead of per block
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
	# The game starts on window load. Under load navigate can return before it: a run started then
	# finds no start menu, and on the reference that broken trace would be cached as the baseline
	local loaded=0
	until bdg eval "document.readyState" --json 2>/dev/null | grep -q '"result":"complete"'; do
		loaded=$((loaded + 1))
		[ $loaded -lt 120 ] || { echo "the page didn't load in 120s"; bdg stop >/dev/null 2>&1; return 1; }
		sleep 1
	done
	# (no waiting for the start menu: with ?harness the game's loads complete once harness.js runs)
	# bdg eval waits at most 20s for a promise, so the run goes on in the page and we poll
	bdg eval "$setup; window.__harnessSummary = null;
		(async () => { $(cat "$@") })()
			.then(r => window.__harnessSummary = r, e => window.__harnessSummary = { error: e.message, stack: e.stack });
		'started'" >/dev/null
	# A session that died answers with an error: fail instead of waiting forever (and give up
	# after HARNESS_TIMEOUT seconds, 900 by default). A step that keeps the page busy for 20s
	# gets the run terminated by this eval (bdg exit 102): it has to yield, see yieldToPage
	local waited=0 answer
	while :; do
		answer=$(bdg eval "window.__harnessSummary !== null" --json 2>&1) || {
			echo "$answer" | tail -3
			case $answer in *'"exitCode":102'*) echo "(a step ran over 20s without yielding to the page: call yieldToPage in its loop)" ;; esac
			bdg stop >/dev/null 2>&1; return 1
		}
		case $answer in *'"result":true'*) break ;; esac
		waited=$((waited + 1))
		[ $waited -lt "${HARNESS_TIMEOUT:-900}" ] || { echo "no result after ${HARNESS_TIMEOUT:-900}s"; bdg stop >/dev/null 2>&1; return 1; }
		sleep 1
	done
	if bdg eval "window.__harnessSummary.error !== undefined" --json | grep -q '"result":true'; then
		bdg eval "window.__harnessSummary" --json; bdg stop >/dev/null; return 1
	fi
	bdg eval "JSON.stringify(window.$result)" --full --json \
		| node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0)).data.result)' > "$out"
	if [ -n "$coverage" ]; then bdg cdp Profiler.takePreciseCoverage --json > "$coverage"; fi
	bdg stop >/dev/null
}

# run_page_retry: run_page, once more when it fails. Under load a Chrome sometimes doesn't start
# or answer in time; an error of the game fails the second time too.
run_page_retry() {
	run_page "$@" || { echo "(the run failed, once more)"; run_page "$@"; }
}

# run_jobs <script> <name...>: runs "<script> --job <name>" for every name, $JOBS at once, each
# with its output in $OUT/<name>.log, then prints the logs in order. Fails when a job failed.
run_jobs() {
	local script=$1 status=0 name
	shift
	printf '%s\0' "$@" | xargs -0 -P "$JOBS" -I{} sh -c '"$0" --job "$1" > "$2/$(printf %s "$1" | tr -c "A-Za-z0-9.-" "-").log" 2>&1' "$script" {} "$OUT" || status=1
	for name in "$@"; do cat "$OUT/$(printf %s "$name" | tr -c 'A-Za-z0-9.-' '-').log"; done
	return $status
}
