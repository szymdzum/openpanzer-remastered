# Sourced by replay.sh and ui-replay.sh: the two servers, left running for the next runs.
# serve_static <dir> <port>: the reference, a static server
serve_static() {
	if ! curl -s -o /dev/null "http://127.0.0.1:$2/index.html"; then
		(cd "$1" && nohup python3 -m http.server "$2" --bind 127.0.0.1 >/dev/null 2>&1 &)
		sleep 1
	fi
}
# serve_vite <port>: this repo on the Vite dev server (npm run dev), it serves src/ as it is now
serve_vite() {
	curl -sf -o /dev/null "http://127.0.0.1:$1/@vite/client" && return
	if curl -s -o /dev/null "http://127.0.0.1:$1/"; then
		echo "port $1 is taken by another server, stop it (the remaster runs on Vite)" >&2; exit 1
	fi
	nohup node node_modules/vite/bin/vite.js --port "$1" >harness/out/vite-$1.log 2>&1 &
	for _ in $(seq 50); do curl -sf -o /dev/null "http://127.0.0.1:$1/@vite/client" && return; sleep 0.2; done
	echo "Vite didn't start, see harness/out/vite-$1.log" >&2; exit 1
}
# save_served <port> <dir> <module,...>: the code Vite serves for each module, which the
# coverage offsets refer to (src/ with the types blanked out and the import paths rewritten:
# same lines, not the same columns)
save_served() {
	mkdir -p "$2"
	for m in ${3//,/ }; do curl -sf "http://127.0.0.1:$1/src/$m.ts" > "$2/$m.js"; done
}
