// Harness hooks, loaded by index.html?harness after the game's modules ran and before the game
// starts (on window load). harness/lib/harness.js relies on them. The game's names are the
// globals src/main.ts defines with ?harness.
(function() {
	// The UI keeps its renderer private: keep a reference for hex <-> screen mapping. The UI's
	// import of Render can't be replaced, so the hook is on Render.prototype: the constructor's
	// this.getCursorCanvas = ... goes through this setter, which records the instance and then
	// makes the property the assignment would have made
	Object.defineProperty(Render.prototype, "getCursorCanvas", { configurable: true,
		set: function(f) {
			window.__harnessRender = this;
			Object.defineProperty(this, "getCursorCanvas", { value: f, writable: true, enumerable: true, configurable: true });
		} });

	// Async completions (image loads, async XHRs) are held back and delivered by harness.js
	// strictly in creation order: the network completes them in a random order, and the game
	// is sensitive to it (partial redraws per unit image, overlapping scenario loads).
	var ops = window.__harnessAsync = [];

	function hold(target, names) {
		var held = {};
		names.forEach(function(k) {
			Object.defineProperty(target, k, { configurable: true,
				get: function() { return held[k] || null; },
				set: function(f) { held[k] = f; } });
		});
		return held;
	}

	var RealImage = Image;
	var srcDesc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
	window.__harnessImages = [];
	Image = function(w, h) {
		var i = new RealImage(w, h);
		window.__harnessImages.push(i);
		var held = hold(i, ["onload", "onerror"]);
		var op = null;
		// Each src assignment is one operation, in assignment order: the renderer reuses its
		// Image objects across scenarios by giving them a new src
		Object.defineProperty(i, "src", { configurable: true,
			get: function() { return srcDesc.get.call(i); },
			set: function(v) {
				op = { kind: "image", target: i, held: held, done: null, delivered: false };
				ops.push(op);
				srcDesc.set.call(i, v);
			} });
		i.addEventListener("load", function() { if (op) op.done = "load"; });
		i.addEventListener("error", function() { if (op) op.done = "error"; });
		return i;
	};

	var RealXHR = XMLHttpRequest;
	XMLHttpRequest = function() {
		var x = new RealXHR(), async = true;
		var held = hold(x, ["onload", "onerror", "onloadend"]);
		var open = x.open, send = x.send;
		x.open = function(method, url, a) { async = a !== false; return open.apply(x, arguments); };
		x.send = function() {
			if (!async) {
				// synchronous: the events happen during send, deliver them right away
				var r = send.apply(x, arguments);
				if (held.onload) held.onload.call(x, { type: "load", target: x });
				if (held.onloadend) held.onloadend.call(x, { type: "loadend", target: x });
				return r;
			}
			var op = { kind: "xhr", target: x, held: held, done: null, delivered: false };
			ops.push(op);
			x.addEventListener("load", function() { op.done = "load"; });
			x.addEventListener("error", function() { op.done = "error"; });
			x.addEventListener("abort", function() { op.done = "error"; });
			return send.apply(x, arguments);
		};
		return x;
	};
	XMLHttpRequest.prototype = RealXHR.prototype;
})();
